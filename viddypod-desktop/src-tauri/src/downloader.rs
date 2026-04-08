use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[derive(Deserialize, Debug)]
pub struct VideoMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
}

pub struct DownloadResult {
    pub audio_path: PathBuf,
    pub work_dir: PathBuf,
    pub metadata: VideoMetadata,
}

/// Detect which browser the user has installed for cookie extraction.
fn detect_browser() -> &'static str {
    if cfg!(target_os = "macos") {
        if std::path::Path::new("/Applications/Google Chrome.app").exists() {
            return "chrome";
        }
        if std::path::Path::new("/Applications/Brave Browser.app").exists() {
            return "brave";
        }
        if std::path::Path::new("/Applications/Firefox.app").exists() {
            return "firefox";
        }
        return "chrome";
    }
    if cfg!(target_os = "windows") {
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("PROGRAMFILES").unwrap_or_default();
        if !local_app_data.is_empty() {
            if std::path::Path::new(&format!("{}\\Google\\Chrome\\User Data", local_app_data)).exists() {
                return "chrome";
            }
            if std::path::Path::new(&format!("{}\\BraveSoftware\\Brave-Browser\\User Data", local_app_data)).exists() {
                return "brave";
            }
            if std::path::Path::new(&format!("{}\\Microsoft\\Edge\\User Data", local_app_data)).exists() {
                return "edge";
            }
        }
        if !program_files.is_empty()
            && std::path::Path::new(&format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files)).exists()
        {
            return "chrome";
        }
        return "chrome";
    }
    "chrome"
}

/// On Windows, locate the bundled node.exe inside the app's resource directory.
/// Returns the directory containing node.exe so it can be added to PATH.
#[cfg(target_os = "windows")]
fn get_bundled_node_dir(app: &AppHandle) -> Option<String> {
    use tauri::Manager;
    app.path()
        .resolve("node.exe", tauri::path::BaseDirectory::Resource)
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_string_lossy().to_string()))
}

#[cfg(not(target_os = "windows"))]
fn get_bundled_node_dir(_: &AppHandle) -> Option<String> {
    None
}

/// Build a PATH env value with platform-appropriate locations prepended.
fn build_enriched_path(app: &AppHandle) -> String {
    let mut components: Vec<String> = Vec::new();

    // Bundled node.exe directory (Windows only)
    if let Some(p) = get_bundled_node_dir(app) {
        components.push(p);
    }

    // Common Unix locations for node (macOS Homebrew + system)
    if cfg!(unix) {
        components.push("/opt/homebrew/bin".to_string());
        components.push("/usr/local/bin".to_string());
        components.push("/usr/bin".to_string());
        components.push("/bin".to_string());
    }

    // Existing PATH at the end
    if let Ok(p) = std::env::var("PATH") {
        components.push(p);
    }

    let separator = if cfg!(windows) { ";" } else { ":" };
    components.join(separator)
}

/// Translate yt-dlp's cryptic Chrome-locked stderr into a friendlier message.
fn humanize_yt_dlp_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("could not copy chrome cookie")
        || lower.contains("appbound")
        || (lower.contains("permission denied") && lower.contains("chrome"))
    {
        return "Chrome must be fully closed for cookie extraction on Windows. Please quit Chrome (including any background processes from the system tray) and try again.".to_string();
    }
    if lower.contains("sign in to confirm you're not a bot") {
        return "YouTube blocked the request. Make sure you're signed into YouTube in your browser, then retry.".to_string();
    }
    if lower.contains("n challenge solving failed") || lower.contains("requested format is not available") {
        return "YouTube's JavaScript challenge could not be solved. Make sure node is installed and accessible.".to_string();
    }
    format!("yt-dlp failed: {}", stderr.trim())
}

pub async fn download_audio(app: &AppHandle, video_id: &str) -> Result<DownloadResult> {
    let work_dir = std::env::temp_dir().join(format!("viddypod-{}", uuid_v4()));
    std::fs::create_dir_all(&work_dir)?;

    let output_template = work_dir.join("%(id)s.%(ext)s").to_string_lossy().to_string();
    let browser = detect_browser();
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    log::info!("Downloading {} via {}", video_id, browser);

    let enriched_path = build_enriched_path(app);
    log::debug!("yt-dlp PATH: {}", enriched_path);

    let shell = app.shell();
    let (mut rx, _child) = shell
        .sidecar("yt-dlp")?
        .env("PATH", enriched_path)
        .args([
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--output", &output_template,
            "--write-info-json",
            "--no-playlist",
            "--no-overwrites",
            "--js-runtimes", "node",
            "--remote-components", "ejs:github",
            "--cookies-from-browser", browser,
            &url,
        ])
        .spawn()?;

    let mut stderr_buf = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                log::debug!("[yt-dlp stdout] {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Stderr(line) => {
                let s = String::from_utf8_lossy(&line);
                log::debug!("[yt-dlp stderr] {}", s);
                stderr_buf.push_str(&s);
                stderr_buf.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                if payload.code.unwrap_or(-1) != 0 {
                    return Err(anyhow!("{}", humanize_yt_dlp_error(&stderr_buf)));
                }
                break;
            }
            _ => {}
        }
    }

    // Find the output mp3 and info json
    let mut audio_path = None;
    let mut info_path = None;
    for entry in std::fs::read_dir(&work_dir)? {
        let entry = entry?;
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext == "mp3" {
                audio_path = Some(path.clone());
            } else if path.to_string_lossy().ends_with(".info.json") {
                info_path = Some(path.clone());
            }
        }
    }

    let audio_path = audio_path.ok_or_else(|| anyhow!("yt-dlp did not produce an mp3 file"))?;

    let metadata = if let Some(info_path) = info_path {
        let raw = std::fs::read_to_string(&info_path)?;
        let json: serde_json::Value = serde_json::from_str(&raw)?;
        VideoMetadata {
            title: json.get("title").and_then(|v| v.as_str()).map(String::from),
            description: json.get("description").and_then(|v| v.as_str()).map(String::from),
            duration: json.get("duration").and_then(|v| v.as_f64()),
            thumbnail: json.get("thumbnail").and_then(|v| v.as_str()).map(String::from),
        }
    } else {
        VideoMetadata {
            title: Some(video_id.to_string()),
            description: None,
            duration: None,
            thumbnail: None,
        }
    };

    log::info!("Download complete: {:?}", metadata.title);

    Ok(DownloadResult {
        audio_path,
        work_dir,
        metadata,
    })
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", nanos)
}
