use std::error::Error as StdError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug)]
pub enum Error {
    Thread,
    Message(String),
    Inner(Box<dyn StdError + Send + Sync + 'static>),
    UnknownBehavior(String),
}

use Error::{Inner, Message, Thread, UnknownBehavior};

impl Error {
    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn new(message: &str) -> Error {
        Message(message.to_string())
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Thread => write!(f, "Thread error"),
            Message(msg) => write!(f, "Simulation error: {}", msg),
            UnknownBehavior(behavior_name) => write!(f, "Unknown behavior '{}'", behavior_name),
            Inner(err) => write!(f, "Simulation error: {}", err),
        }
    }
}

impl StdError for Error {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            Thread | Message(_) | UnknownBehavior(_) => None,
            // dereference twice because err is a reference to a box
            Inner(err) => Some(&**err),
        }
    }
}

impl From<&str> for Error {
    fn from(t: &str) -> Error {
        Message(t.to_string())
    }
}

impl From<String> for Error {
    fn from(t: String) -> Error {
        Message(t)
    }
}

impl From<serde_json::Error> for Error {
    fn from(inner: serde_json::Error) -> Error {
        Inner(Box::new(inner))
    }
}

impl From<std::convert::Infallible> for Error {
    fn from(inner: std::convert::Infallible) -> Error {
        Inner(Box::new(inner))
    }
}
