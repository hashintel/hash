use thiserror::Error as ThisError;

use crate::field::RootFieldKey;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error(
        "Attempting to insert a new field under key:{0:?} which clashes. New field: {1} Existing \
         field: {2}"
    )]
    FieldKeyClash(RootFieldKey, String, String),
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
