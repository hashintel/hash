use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

    #[error("{0}")]
    Unique(String),

    #[error("NNG error: {0}")]
    Nng(#[from] nng::Error),

    #[error("NNG Recv error: {err}")]
    NngRecv { err: nng::Error },

    #[error("Tokio oneshot recv: {0}")]
    TokioOneshotRecv(#[from] tokio::sync::oneshot::error::RecvError),
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
