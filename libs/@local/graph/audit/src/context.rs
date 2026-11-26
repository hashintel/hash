//! Who acts and from where.

use alloc::string::String;
use core::net::IpAddr;

use type_system::provenance::validation::MAX_SHORT_TEXT_LENGTH;

use crate::actor::AuditActor;

/// The user agent of a client, cut to at most [`UserAgent::MAX_LENGTH`] characters.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserAgent(String);

impl UserAgent {
    /// The most characters a user agent keeps. The origin of an entity edition keeps as many.
    pub const MAX_LENGTH: usize = MAX_SHORT_TEXT_LENGTH;

    #[must_use]
    pub fn new(user_agent: &str) -> Self {
        Self(user_agent.chars().take(Self::MAX_LENGTH).collect())
    }

    #[must_use]
    pub const fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

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
