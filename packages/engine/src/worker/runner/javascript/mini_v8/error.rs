use std::{error::Error as StdError, fmt, result::Result as StdResult};

use super::{MiniV8, Value};

/// `std::result::Result` specialized for this mini_v8's `Error` type.
pub type Result<'mv8, T> = StdResult<T, Error<'mv8>>;

/// An error originating from `MiniV8` usage.
#[derive(Debug)]
pub enum Error<'mv8> {
    /// A Rust value could not be converted to a JavaScript value.
    ToJsConversionError {
        /// Name of the Rust type that could not be converted.
        from: &'static str,
        /// Name of the JavaScript type that could not be created.
        to: &'static str,
    },
    /// A JavaScript value could not be converted to the expected Rust type.
    FromJsConversionError {
        /// Name of the JavaScript type that could not be converted.
        from: &'static str,
        /// Name of the Rust type that could not be created.
        to: &'static str,
    },
    /// A mutable callback has triggered JavaScript code that has called the same mutable callback
    /// again.
    ///
    /// This is an error because a mutable callback can only be borrowed mutably once.
    RecursiveMutCallback,
    /// An evaluation timeout was specified from within a Rust function embedded in V8.
    InvalidTimeout,
    /// A custom error that occurs during runtime.
    ///
    /// This can be used for returning user-defined errors from callbacks.
    ExternalError(Box<dyn StdError + 'static>),
    /// An exception that occurred within the JavaScript environment.
    Value(Value<'mv8>),
}

impl<'mv8> Error<'mv8> {
    pub fn from_js_conversion(from: &'static str, to: &'static str) -> Error<'mv8> {
        Error::FromJsConversionError { from, to }
    }

    pub fn to_js_conversion(from: &'static str, to: &'static str) -> Error<'mv8> {
        Error::ToJsConversionError { from, to }
    }

    pub fn recursive_mut_callback() -> Error<'mv8> {
        Error::RecursiveMutCallback
    }

    pub fn invalid_timeout() -> Error<'mv8> {
        Error::InvalidTimeout
    }

    /// Normalizes an error into a JavaScript value.
    pub fn to_value(self, mv8: &'mv8 MiniV8) -> Value<'mv8> {
        match self {
            Error::Value(value) => value,
            Error::ToJsConversionError { .. } | Error::FromJsConversionError { .. } => {
                let object = mv8.create_object();
                let _ = object.set("name", "TypeError");
                let _ = object.set("message", self.to_string());
                Value::Object(object)
            }
            _ => {
                let object = mv8.create_object();
                let _ = object.set("name", "Error");
                let _ = object.set("message", self.to_string());
                Value::Object(object)
            }
        }
    }
}

impl StdError for Error<'_> {
    fn description(&self) -> &'static str {
        "JavaScript execution error"
    }
}

impl fmt::Display for Error<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::ToJsConversionError { from, to } => {
                write!(fmt, "error converting {} to JavaScript {}", from, to)
            }
            Error::FromJsConversionError { from, to } => {
                write!(fmt, "error converting JavaScript {} to {}", from, to)
            }
            Error::RecursiveMutCallback => write!(fmt, "mutable callback called recursively"),
            Error::InvalidTimeout => write!(fmt, "invalid request for evaluation timeout"),
            Error::ExternalError(ref err) => err.fmt(fmt),
            Error::Value(v) => write!(fmt, "JavaScript runtime error ({:?})", v),
        }
    }
}

impl From<Error<'_>> for String {
    fn from(e: Error<'_>) -> Self {
        format!("{}", e)
    }
}
