use core::fmt;

#[derive(Debug)]
pub enum VisibilityCacheError {
    Panic,
}

impl fmt::Display for VisibilityCacheError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Panic => write!(fmt, "visibility cache panicked"),
        }
    }
}

impl core::error::Error for VisibilityCacheError {}
