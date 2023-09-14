mod api;
mod model;

use std::fmt;

#[derive(Clone)]
pub struct SpiceDbOpenApi {
    base_path: String,
    client: reqwest::Client,
}

impl fmt::Debug for SpiceDbOpenApi {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SpiceDBOpenApi")
            .field("base_path", &self.base_path)
            .finish_non_exhaustive()
    }
}

impl SpiceDbOpenApi {
    pub fn new(base_path: impl Into<String>, key: &str) -> Result<Self, reqwest::Error> {
        Ok(Self {
            base_path: base_path.into(),
            client: reqwest::Client::builder()
                .default_headers({
                    let mut headers = reqwest::header::HeaderMap::new();
                    headers.insert(
                        reqwest::header::AUTHORIZATION,
                        reqwest::header::HeaderValue::from_str(&format!("Bearer {key}"))
                            .expect("failed to create header value"),
                    );
                    headers
                })
                .build()?,
        })
    }
}
