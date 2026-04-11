use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct AppState {
    pub token: Option<String>,
    pub email: Option<String>,
    pub processing: bool,
    pub recent_downloads: Vec<RecentDownload>,
    pub pair_token: String,
    pub cookie_count: usize,
    pub last_cookie_sync: Option<DateTime<Utc>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RecentDownload {
    pub title: String,
    pub status: String,
    pub completed_at: String,
}

#[derive(Serialize)]
pub struct Status {
    pub signed_in: bool,
    pub email: Option<String>,
    pub processing: bool,
    pub recent_downloads: Vec<RecentDownload>,
    pub pair_token: String,
    pub extension_connected: bool,
    pub last_cookie_sync: Option<String>,
    pub cookie_count: usize,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn to_status(&self) -> Status {
        // Extension is considered "connected" if we've received a cookie push
        // within the last 5 minutes.
        let extension_connected = self
            .last_cookie_sync
            .map(|t| (Utc::now() - t).num_seconds() < 300)
            .unwrap_or(false);
        Status {
            signed_in: self.token.is_some(),
            email: self.email.clone(),
            processing: self.processing,
            recent_downloads: self.recent_downloads.clone(),
            pair_token: self.pair_token.clone(),
            extension_connected,
            last_cookie_sync: self.last_cookie_sync.map(|t| t.to_rfc3339()),
            cookie_count: self.cookie_count,
        }
    }

    pub fn add_download(&mut self, title: String, status: String) {
        self.recent_downloads.insert(
            0,
            RecentDownload {
                title,
                status,
                completed_at: Utc::now().to_rfc3339(),
            },
        );
        if self.recent_downloads.len() > 10 {
            self.recent_downloads.truncate(10);
        }
    }
}
