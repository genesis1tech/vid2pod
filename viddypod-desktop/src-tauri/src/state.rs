use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct AppState {
    pub token: Option<String>,
    pub email: Option<String>,
    pub processing: bool,
    pub recent_downloads: Vec<RecentDownload>,
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
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn to_status(&self) -> Status {
        Status {
            signed_in: self.token.is_some(),
            email: self.email.clone(),
            processing: self.processing,
            recent_downloads: self.recent_downloads.clone(),
        }
    }

    pub fn add_download(&mut self, title: String, status: String) {
        self.recent_downloads.insert(
            0,
            RecentDownload {
                title,
                status,
                completed_at: chrono::Utc::now().to_rfc3339(),
            },
        );
        if self.recent_downloads.len() > 10 {
            self.recent_downloads.truncate(10);
        }
    }
}
