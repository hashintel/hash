use thiserror::Error as ThisError;
pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Output error: {0}")]
    Unique(String),

    #[error("Deserialization error: {0}")]
    FromSerde(#[from] serde_json::Error),

    #[error("IO error: {0:?}")]
    IO(#[from] std::io::Error),
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Unique(s.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Unique(s)
    }
}
