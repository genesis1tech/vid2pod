use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent,
};
use tokio::sync::Mutex;

static QUITTING: AtomicBool = AtomicBool::new(false);

mod auth;
mod cookie_server;
mod downloader;
mod poller;
mod state;
mod uploader;

use state::AppState;

pub const SERVER_URL: &str = "https://vid2pod.g1tech.cloud";

#[tauri::command]
async fn get_status(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<state::Status, String> {
    let app_state = state.lock().await;
    Ok(app_state.to_status())
}

#[tauri::command]
async fn sign_out(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    app: AppHandle,
) -> Result<(), String> {
    auth::clear_token().map_err(|e| e.to_string())?;
    let mut app_state = state.lock().await;
    app_state.token = None;
    app_state.email = None;
    app.emit("status-updated", ()).ok();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let app_state = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Handle deep link from second instance
            let _ = app.get_webview_window("main").map(|w| {
                let _ = w.show();
                let _ = w.set_focus();
            });
            // Process any deep link URLs in args
            for arg in args {
                if arg.starts_with("viddypod://") {
                    let _ = handle_deep_link(app.clone(), arg);
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![get_status, sign_out])
        .setup(move |app| {
            // Try to load saved token
            if let Ok(token) = auth::load_token() {
                let state = app_state.clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let mut s = state.lock().await;
                    s.token = Some(token);
                    drop(s);
                    app_handle.emit("status-updated", ()).ok();
                });
            }

            // Resolve local data dir for the pair token + cookies.txt
            let data_dir = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let cookies_path = data_dir.join("cookies.txt");

            // Load or generate the pair token for the cookie-bridge server
            let pair_token = cookie_server::load_or_generate_pair_token(&data_dir)
                .unwrap_or_else(|e| {
                    log::error!("Failed to load/generate pair token: {}", e);
                    String::new()
                });

            // Stash the pair token in AppState so the UI can render it
            {
                let state = app_state.clone();
                let token_clone = pair_token.clone();
                tauri::async_runtime::spawn(async move {
                    let mut s = state.lock().await;
                    s.pair_token = token_clone;
                });
            }

            // Spawn the cookie-bridge HTTP server
            {
                let state = app_state.clone();
                let token_clone = pair_token.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = cookie_server::run_cookie_server(
                        state,
                        cookie_server::DEFAULT_PORT,
                        token_clone,
                        cookies_path,
                    )
                    .await
                    {
                        log::error!("Cookie server exited with error: {}", e);
                    }
                });
            }

            // Set up system tray
            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "Open ViddyPod", true, None::<&str>)?,
                    &MenuItem::with_id(app, "library", "Open Library", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "library" => {
                        let _ = tauri_plugin_shell::ShellExt::shell(app)
                            .open(SERVER_URL.to_string(), None);
                    }
                    "quit" => {
                        QUITTING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Register deep link handler
            use tauri_plugin_deep_link::DeepLinkExt;
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = handle_deep_link(app_handle.clone(), url.to_string());
                }
            });

            // Start the background poller
            let app_handle = app.handle().clone();
            let state = app_state.clone();
            tauri::async_runtime::spawn(async move {
                poller::run_poller(app_handle, state).await;
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Prevent app from exiting when window closed (we live in tray),
            // unless the user explicitly clicked Quit from the tray menu.
            if let RunEvent::ExitRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}

fn handle_deep_link(app: AppHandle, url: String) -> anyhow::Result<()> {
    log::info!("Deep link received: {}", url);
    let parsed = url::Url::parse(&url)?;
    if parsed.scheme() != "viddypod" {
        return Ok(());
    }
    if let Some(token) = parsed.query_pairs().find(|(k, _)| k == "token").map(|(_, v)| v.to_string()) {
        auth::save_token(&token)?;
        let state = app.state::<Arc<Mutex<AppState>>>().inner().clone();
        tauri::async_runtime::spawn(async move {
            let mut s = state.lock().await;
            s.token = Some(token);
            drop(s);
            app.emit("status-updated", ()).ok();
        });
    }
    Ok(())
}
