//! The parametric projector: a conditioned encoder from node representations to 2D map coordinates.
//!
//! The projector is the model the fitting pipeline trains and the serving pipeline applies: a
//! residual MLP taking a node's normalized representation and role, modulated by a global condition
//! vector, producing one 2D coordinate per node. Training minimizes a composite of semantic,
//! relational, and support objectives over the published fitting artifacts; inference projects
//! whole corpora batch-wise at a frozen condition.
//!
//! The map is parametric for one load-bearing reason: it must extend to nodes the fit never saw.
//! A trained checkpoint is a pure function from representation to coordinate, so freshly ingested
//! nodes project into the existing frame without a refit. Rows project independently - the model
//! reads one row's representation, role, and the global condition, never its neighbours - which
//! is what makes placement idempotent and batch composition irrelevant to the result. The
//! condition input is the relation lens η ∈ [0, 1]: one model covers the whole lens continuum,
//! and the ladder publishes chosen rungs of it instead of one model per rung.
//!
//! [`model`] defines the architecture and its initialization contracts; [`scale`] measures the
//! detached local radii the relation objective normalizes by; [`sample`] draws the seeded minibatch
//! populations; [`loss`] and [`budget`] compute the composite objective and its clipped relation
//! forces; [`miner`] finds 2D hard negatives; [`verdict`] reads the supplied human-review input;
//! [`train`] assembles minibatches and evaluates the budgeted step objective; [`artifact`] writes
//! and reopens the published checkpoint and the resume state.

pub(crate) mod artifact;
// Fully public: the root `bench` facade re-exports it; the private
// module chain above keeps it unreachable except through the facade.
#[cfg(feature = "bench")]
pub mod bench;
pub(crate) mod budget;
pub(crate) mod loss;
pub(crate) mod miner;
pub(crate) mod model;
pub(crate) mod sample;
pub(crate) mod scale;
pub(crate) mod train;
pub(crate) mod verdict;
