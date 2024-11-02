use alloc::borrow::Cow;
use core::{error::Error, fmt::Display};

use harpc_types::{error_code::ErrorCode, procedure::ProcedureId, service::ServiceDescriptor};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
#[display("service {service} not found")]
pub struct ServiceNotFound {
    pub service: ServiceDescriptor,
}

impl Error for ServiceNotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::SERVICE_NOT_FOUND);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
#[display("procedure {procedure} not found in service {service}")]
pub struct ProcedureNotFound {
    pub service: ServiceDescriptor,

    pub procedure: ProcedureId,
}

impl Error for ProcedureNotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::PROCEDURE_NOT_FOUND);
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Forbidden {
    pub service: ServiceDescriptor,
    pub procedure: ProcedureId,

    pub reason: Cow<'static, str>,
}

impl Display for Forbidden {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "forbidden to call {}::{}", self.service, self.procedure)?;

        if !self.reason.is_empty() {
            write!(f, ", reason: {}", self.reason)?;
        }

        Ok(())
    }
}

impl Error for Forbidden {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::FORBIDDEN);
    }
}
