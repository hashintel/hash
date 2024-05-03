use error_stack::Report;
use libp2p::StreamProtocol;
use libp2p_stream as stream;

/// Errors while opening a new stream.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub(crate) enum OpenStreamError {
    /// The remote does not support the requested protocol.
    #[error("failed to open stream: remote peer does not support {0}")]
    UnsupportedProtocol(StreamProtocol),
    /// IO Error that occurred during the protocol handshake.
    #[error("failed to open stream")]
    Io,
    /// Unknown error.
    #[error("failed to open stream: unknown error")]
    Unknown,
}

impl OpenStreamError {
    #[track_caller]
    pub(super) fn new(error: stream::OpenStreamError) -> Report<Self> {
        match error {
            stream::OpenStreamError::UnsupportedProtocol(protocol) => {
                Report::new(Self::UnsupportedProtocol(protocol))
            }
            stream::OpenStreamError::Io(io) => Report::new(io).change_context(Self::Io),
            _ => Report::new(Self::Unknown).attach_printable(error),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transport layer")]
pub(crate) struct TransportError;
