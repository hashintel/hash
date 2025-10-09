use core::{error::Error, fmt, mem};
use std::time::{SystemTime, UNIX_EPOCH};

use error_stack::{Report, ResultExt as _};

#[derive(Debug, derive_more::Display)]
pub(crate) enum UploaderError {
    #[display("Failed to send profile data")]
    Send,
    #[display("Failed to create runtime")]
    Runtime,
}

impl Error for UploaderError {}

#[derive(Debug)]
pub(crate) struct ProfileUploader {
    client: reqwest::Client,
    buffer: Vec<u8>,
    endpoint: String,
    service_name: String,
    last_upload_seconds: u64,
    runtime_handle: Option<tokio::runtime::Handle>,
}

impl ProfileUploader {
    pub(crate) fn new(endpoint: String, service_name: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            buffer: Vec::with_capacity(1024 * 1024), // 1MB initial capacity
            endpoint,
            service_name,
            last_upload_seconds: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("Time went backwards")
                .as_secs(),
            runtime_handle: tokio::runtime::Handle::try_current().ok(),
        }
    }

    pub(crate) fn write(&mut self, buf: &[u8]) {
        self.buffer.extend_from_slice(buf);
    }

    pub(crate) fn write_fmt(&mut self, fmt: fmt::Arguments) {
        self.write(fmt.to_string().as_bytes());
    }

    pub(crate) fn flush(&mut self) -> Result<(), Report<UploaderError>> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs();

        if !self.buffer.is_empty() {
            let request = async {
                self.client
                    .post(&self.endpoint)
                    .query(&[
                        ("format", "folded"),
                        ("units", "nanoseconds"),
                        ("sampleRate", "1000000000"), // nanosecond precision
                        ("name", &self.service_name),
                        ("from", &self.last_upload_seconds.to_string()),
                        ("until", &now.to_string()),
                    ])
                    .header("Content-Type", "text/plain")
                    .body(mem::take(&mut self.buffer))
                    .send()
                    .await
                    .change_context(UploaderError::Send)
            };

            let response = if let Some(handle) = &self.runtime_handle {
                handle.block_on(request)?
            } else {
                tokio::runtime::Handle::try_current()
                    .change_context(UploaderError::Runtime)?
                    .block_on(request)?
            };

            if !response.status().is_success() {
                tracing::warn!(
                    status = %response.status(),
                    from = self.last_upload_seconds,
                    until = now,
                    "Pyroscope upload failed"
                );
                return Ok(());
            }
        }

        self.last_upload_seconds = now;

        Ok(())
    }
}
