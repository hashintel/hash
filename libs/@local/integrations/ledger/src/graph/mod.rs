//! The Graph as Send sees it: two atomic bulk endpoints.

mod client;
#[cfg(any(test, feature = "test-utils"))]
mod fake;

use core::future::Future;

use serde_json::value::RawValue;
use type_system::principal::actor::ActorEntityUuid;

pub use self::client::{GraphClient, GraphError};
#[cfg(any(test, feature = "test-utils"))]
pub use self::fake::{FakeGraph, Recorded};

/// An atomic Graph request result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphResponse {
    Applied,
    Status(u16),
    Unreachable,
}

/// Sends request bodies as one atomic bulk operation.
pub trait Graph: Send + Sync {
    fn create(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
    fn patch(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
}

/// The Graph bulk endpoint operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestKind {
    /// POST /entities/bulk.
    Create,
    /// PATCH /entities/bulk.
    Patch,
}
