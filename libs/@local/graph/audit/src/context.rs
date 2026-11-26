//! Who acts and from where.

use core::net::IpAddr;

use type_system::provenance::UserAgent;

use crate::actor::AuditActor;

/// The ID of the trace a request belongs to.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TraceId([u8; 16]);

impl TraceId {
    #[must_use]
    pub const fn new(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub const fn to_bytes(self) -> [u8; 16] {
        self.0
    }
}

/// Who acts and from where, captured where a request enters the Graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditContext {
    pub actor: AuditActor,
    /// The address of the client the request came from, not of a proxy in front of the Graph.
    pub client_ip: Option<IpAddr>,
    pub user_agent: Option<UserAgent>,
    pub trace_id: Option<TraceId>,
}
