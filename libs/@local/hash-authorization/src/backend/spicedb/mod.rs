mod api;
mod model;
pub(crate) mod serde;

use std::fmt;

use error_stack::Result;

pub use self::model::RpcError;

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
    /// Creates a new `OpenAPI` client for `SpiceDB`.
    ///
    /// # Panics
    ///
    /// - Panics if `key` is not a valid value for the token
    ///
    /// # Errors
    ///
    /// - Errors if the client could not be built
    pub fn new(base_path: impl Into<String>, key: Option<&str>) -> Result<Self, reqwest::Error> {
        Ok(Self {
            base_path: base_path.into(),
            client: reqwest::Client::builder()
                .default_headers({
                    let mut headers = reqwest::header::HeaderMap::new();
                    if let Some(key) = key {
                        headers.insert(
                            reqwest::header::AUTHORIZATION,
                            reqwest::header::HeaderValue::from_str(&format!("Bearer {key}"))
                                .expect("failed to create header value"),
                        );
                    }
                    headers
                })
                .build()?,
        })
    }
}
