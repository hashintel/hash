use core::error::Error;

use harpc_codec::error::ErrorCode;
use harpc_types::{service::ServiceId, version::Version};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display("service by id {service:?} and version {version:?} not found")]
pub struct NotFound {
    pub service: ServiceId,
    pub version: Version,
}

impl Error for NotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::NOT_FOUND);
    }
}
