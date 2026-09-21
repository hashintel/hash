//! Request-coherent serving over fitted generations and live deltas.
//!
//! The runtime manager opens fitted generations and owns any configured feed execution, retirement
//! and removal. Without feed options or temporal axes, a generation instead exposes a static
//! publication. An active feed can lag or fail. Each scene-backed delivery request
//! captures a coherent world-and-delta epoch and obtains a cached or newly resolved visibility
//! scope before constructing a [`scene::Scene`]. A cached mask and schedule may predate the
//! request's epoch within the same delta lifetime. Scene geometry, identity and topology lookups
//! still use only the request's captured publication.
//!
//! Authority validation binds the generation and [`delta::DeltaId`], not a
//! [`delta::DeltaRevision`]. A [`runtime::registry::Observation`] captures the immutable revision
//! used for data reads. Authority-token expiry, visibility-cache age and
//! retained-generation admission are distinct checks even when the host derives them from one
//! maximum duration. Issuing or renewing a token does not force a permission-store refresh. A
//! request using the new token may therefore reuse a soft-stale scope while its detached refresh
//! runs.

pub(crate) mod authorization;
pub(crate) mod codec;
pub(crate) mod delta;
pub(crate) mod density;
pub(crate) mod document;
pub(crate) mod hydrate;
mod intern;
pub(crate) mod membership;
mod neighbourhood;
pub(crate) mod runtime;
pub(crate) mod scene;
mod schedule;
pub(crate) mod secret;
#[cfg(any(test, feature = "test-utils"))]
pub(crate) mod tests;
pub(crate) mod visibility;
mod walk;
mod world;
