use anyhow::{anyhow, Result};
use reqwest::multipart;

use crate::downloader::DownloadResult;

pub async fn upload_audio(
    server: &str,
    token: &str,
    asset_id: &str,
    download: &DownloadResult,
) -> Result<()> {
    let bytes = std::fs::read(&download.audio_path)?;
    let filename = download
        .audio_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "audio.mp3".to_string());

    let mut form = multipart::Form::new()
        .text("title", download.metadata.title.clone().unwrap_or_default())
        .text("description", download.metadata.description.clone().unwrap_or_default())
        .text("duration", download.metadata.duration.map(|d| d.to_string()).unwrap_or_default());

    if let Some(thumb) = &download.metadata.thumbnail {
        form = form.text("thumbnail", thumb.clone());
    }

    let file_part = multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str("audio/mpeg")?;
    form = form.part("file", file_part);

    let url = format!("{}/api/v1/agent/upload/{}", server, asset_id);
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .bearer_auth(token)
        .multipart(form)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(anyhow!("Upload failed: {} {}", status, body));
    }

    log::info!("Uploaded asset {} to server", asset_id);
    Ok(())
}
