use harpc_net::codec::WireError;
use harpc_types::{service::ServiceId, version::Version};
use harpc_wire_protocol::response::kind::ErrorCode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("service by id {service:?} and version {version:?} not found")]
pub struct NotFound {
    pub service: ServiceId,
    pub version: Version,
}

impl WireError for NotFound {
    fn code(&self) -> ErrorCode {
        ErrorCode::NOT_FOUND
    }
}
