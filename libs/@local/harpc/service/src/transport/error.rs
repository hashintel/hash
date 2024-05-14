use core::fmt::{self, Debug, Display, Formatter};

use libp2p_stream as stream;

/// Errors while opening a new stream.
pub(crate) struct OpenStreamError(stream::OpenStreamError);

impl Debug for OpenStreamError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.0, f)
    }
}

impl Display for OpenStreamError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl std::error::Error for OpenStreamError {}

impl From<stream::OpenStreamError> for OpenStreamError {
    fn from(err: stream::OpenStreamError) -> Self {
        Self(err)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transport layer")]
pub struct TransportError;
