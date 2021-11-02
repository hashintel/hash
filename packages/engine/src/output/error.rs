pub type Result<T, E = Error> = std::result::Result<T, E>;

// TODO OS - Add custom error types beyond unique
#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Output error: {0}")]
    Unique(String),
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
