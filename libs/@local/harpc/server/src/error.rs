use core::error::Error;

use harpc_types::{
    error_code::ErrorCode, procedure::ProcedureId, service::ServiceId, version::Version,
};

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
pub struct ServiceNotFound {
    pub service: ServiceId,
    pub version: Version,
}

impl Error for ServiceNotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::SERVICE_NOT_FOUND);
    }
}

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
#[display(
    "procedure by id {procedure:?} not found in service by id {service:?} and version {version:?}"
)]
pub struct ProcedureNotFound {
    pub service: ServiceId,
    pub version: Version,

    pub procedure: ProcedureId,
}

impl Error for ProcedureNotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::PROCEDURE_NOT_FOUND);
    }
}
