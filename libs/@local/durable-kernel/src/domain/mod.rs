//! Defines application events, state, and external operations.
//!
//! Implement [`DomainEvent`] for events, [`Fold`] for state updates, and [`Executor`] for
//! external work. [`SimpleDomain`] connects the event and state types. The [`crate::runtime`]
//! runs the executor. [`Hosted`] adapts these types to the lower-level [`crate::port`] API.
//!
//! The kernel handles event IDs, duplicate detection, journal sequencing, snapshots, and
//! recovery. Submit events through [`crate::runtime::RunningKernel::submit`].

mod error;
mod hosted;
mod partition;
mod query;
mod record;
mod snapshot;
#[cfg(test)]
mod tests;

use core::error::Error;

use error_stack::Report;
use serde::{Serialize, de::DeserializeOwned};

pub use self::{
    error::{FoldError, RecoveryError},
    hosted::{Hosted, KernelProjection, PreparedEvent, register},
    partition::{InvalidPartitionKey, MAX_PARTITION_KEY_BYTES, PartitionKey, shard_of},
    query::{HostedQuery, ProjectionQuery},
    record::{EventRecord, EventRecordV1},
    snapshot::{ProjectionSnapshot, ProjectionSnapshotPayload, ProjectionSnapshotV1},
};
use crate::ids::{EffectId, content_digest_bytes};

/// An application event stored in the journal.
///
/// Event IDs are computed from serialized contents. An event's contents and partition must stay
/// the same each time it is submitted.
///
/// Repeated submissions of the same event are deduplicated. Give distinct actions with
/// identical payloads a request ID or another distinguishing field.
///
/// Keep decoding all stored event versions when changing this type. A versioned serde enum is
/// one way to retain that compatibility.
pub trait DomainEvent {
    /// Returns the event name stored in journal records. Keep it stable so existing records
    /// remain readable.
    fn name() -> &'static str;

    /// Returns the partition used for shard routing, state-change notifications, and startup
    /// key discovery.
    fn partition(&self) -> PartitionKey;
}

/// Maintains application state for all partitions on one shard.
///
/// [`validate`](Self::validate) checks new submissions before they are appended.
/// [`apply`](Self::apply) consumes the prepared change after a durable append.
/// [`replay`](Self::replay) must produce the same state change from the accepted event,
/// without rerunning admission rules. Both paths must be deterministic.
///
/// State is serialized into snapshots. Its serialization must also be deterministic.
pub trait Fold<E>: Clone + Send + Sync + Serialize + DeserializeOwned + 'static {
    /// The application error reported when validation rejects an event.
    type Error: Error + Send + Sync + 'static;

    /// The state change prepared by validation and consumed after the event is durable.
    type Validated: Send;

    /// # Errors
    ///
    /// Returns a rejection when the event violates the domain’s validation rules.
    fn validate(&self, event: &E) -> Result<Self::Validated, Report<Self::Error>>;
    fn apply(&mut self, validated: Self::Validated);
    /// Applies an accepted historical event without rerunning admission rules.
    fn replay(&mut self, event: &E);
}

/// Connects an application’s event and state types.
///
/// Pass an [`Executor`] to [`Kernel::start`](crate::runtime::Kernel::start) to run external
/// operations.
pub trait SimpleDomain: Send + Sync + 'static {
    type Event: DomainEvent + Serialize + DeserializeOwned + Send + 'static;
    type Projection: Fold<Self::Event>;

    /// Creates the application state for an empty journal.
    fn empty_projection() -> Self::Projection;
}

/// Delays another attempt at this effect while the driver processes other work.
/// The delay is held in memory, so a restart can retry the effect immediately.
#[derive(Debug)]
pub struct Retry<E> {
    pub reason: Report<E>,
    /// Uses the runtime polling interval when `None`.
    pub after: Option<core::time::Duration>,
}

/// Plans and executes external operations from application state.
///
/// [`plan`](Self::plan) must be a pure function of the state. [`execute`](Self::execute)
/// returns completion events. After those events are applied, the next plan must exclude the
/// completed effect.
///
/// A crash after an external write but before its completion event is saved can cause the
/// effect to run again. Pass [`effect_id`] as an idempotency key to a system that stores the
/// result and returns it for repeated requests.
pub trait Executor<S: SimpleDomain>: Send + Sync + 'static {
    type Effect: Serialize + Clone + Send + Sync + 'static;
    type Error: Error + Send + Sync + 'static;

    fn plan<'a>(
        &'a self,
        projection: &'a S::Projection,
    ) -> impl IntoIterator<Item = Self::Effect> + 'a;

    /// Runs one external operation and returns the events that record its result.
    ///
    /// Completion events are saved individually. They must pass validation against state that
    /// may have changed during execution. Retries can repeat the external operation.
    ///
    /// # Errors
    ///
    /// Returns [`Retry`] with the failure report and an optional delay before another attempt.
    fn execute(
        &self,
        effect: &Self::Effect,
    ) -> impl core::future::Future<Output = Result<Vec<S::Event>, Retry<Self::Error>>> + Send;
}

/// Computes an idempotency key from an effect’s serialized contents.
///
/// # Errors
///
/// Returns an error if the effect cannot be serialized as JSON.
pub fn effect_id<T: Serialize>(effect: &T) -> Result<EffectId, serde_json::Error> {
    content_digest_bytes("domain-effect:v1", effect).map(EffectId::from_bytes)
}
