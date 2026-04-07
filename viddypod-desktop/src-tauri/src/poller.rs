use crate::downloader;
use crate::state::AppState;
use crate::uploader;
use crate::SERVER_URL;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(Deserialize, Debug)]
struct PendingAsset {
    id: String,
    #[serde(rename = "youtubeVideoId")]
    youtube_video_id: Option<String>,
}

const POLL_INTERVAL: Duration = Duration::from_secs(15);

pub async fn run_poller(app: AppHandle, state: Arc<Mutex<AppState>>) {
    log::info!("Poller started");

    loop {
        let token = {
            let s = state.lock().await;
            s.token.clone()
        };

        let Some(token) = token else {
            // No token yet — wait briefly before checking again so a fresh
            // sign-in is picked up within 1 second instead of 30.
            tokio::time::sleep(Duration::from_secs(1)).await;
            continue;
        };

        match fetch_pending(&token).await {
            Ok(pending) => {
                if !pending.is_empty() {
                    log::info!("Found {} pending download(s)", pending.len());
                    for asset in pending {
                        if let Some(video_id) = asset.youtube_video_id.clone() {
                            // Mark as processing
                            {
                                let mut s = state.lock().await;
                                s.processing = true;
                            }
                            app.emit("status-updated", ()).ok();

                            match process_one(&app, &token, &asset.id, &video_id).await {
                                Ok(title) => {
                                    let mut s = state.lock().await;
                                    s.add_download(title, "Uploaded".to_string());
                                    s.processing = false;
                                }
                                Err(e) => {
                                    log::error!("Failed to process {}: {}", video_id, e);
                                    let mut s = state.lock().await;
                                    s.add_download(video_id.clone(), format!("Failed: {}", e));
                                    s.processing = false;
                                }
                            }
                            app.emit("status-updated", ()).ok();
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Poll failed: {}", e);
            }
        }

        // Sleep until the next poll interval
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn fetch_pending(token: &str) -> anyhow::Result<Vec<PendingAsset>> {
    let url = format!("{}/api/v1/agent/pending", SERVER_URL);
    let client = reqwest::Client::new();
    let res = client.get(&url).bearer_auth(token).send().await?;
    if !res.status().is_success() {
        anyhow::bail!("HTTP {}", res.status());
    }
    let assets: Vec<PendingAsset> = res.json().await?;
    Ok(assets)
}

async fn process_one(
    app: &AppHandle,
    token: &str,
    asset_id: &str,
    video_id: &str,
) -> anyhow::Result<String> {
    let download = downloader::download_audio(app, video_id).await?;
    let title = download
        .metadata
        .title
        .clone()
        .unwrap_or_else(|| video_id.to_string());

    uploader::upload_audio(SERVER_URL, token, asset_id, &download).await?;

    // Cleanup temp dir
    let _ = std::fs::remove_dir_all(&download.work_dir);

    Ok(title)
}
