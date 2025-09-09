use core::mem;
use std::{
    io::{self, Write},
    time::{SystemTime, UNIX_EPOCH},
};

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
}

impl Write for ProfileUploader {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.buffer.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
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
                    .map_err(io::Error::other)
            };

            let response = if let Some(handle) = &self.runtime_handle {
                handle.block_on(request)?
            } else if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.block_on(request)?
            } else {
                tracing::warn!(
                    "No Tokio runtime found, spawning a new one for Pyroscope upload. Consider \
                     initializing a Tokio runtime earlier to avoid this overhead."
                );

                // If we're not in a Tokio runtime, spawn a new one for this blocking task.
                tokio::runtime::Runtime::new()
                    .map_err(io::Error::other)?
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
