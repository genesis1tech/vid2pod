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
    "chrome"
}

pub async fn download_audio(app: &AppHandle, video_id: &str) -> Result<DownloadResult> {
    let work_dir = std::env::temp_dir().join(format!("viddypod-{}", uuid_v4()));
    std::fs::create_dir_all(&work_dir)?;

    let output_template = work_dir.join("%(id)s.%(ext)s").to_string_lossy().to_string();
    let browser = detect_browser();
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    log::info!("Downloading {} via {}", video_id, browser);

    let shell = app.shell();
    let (mut rx, _child) = shell
        .sidecar("yt-dlp")?
        .args([
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--output", &output_template,
            "--write-info-json",
            "--no-playlist",
            "--no-overwrites",
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
                    return Err(anyhow!("yt-dlp failed: {}", stderr_buf));
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
