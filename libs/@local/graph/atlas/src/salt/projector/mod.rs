//! A conditioned encoder from node representations to 2D map coordinates.
//!
//! The fitting pipeline trains this model and the serving pipeline applies it. A residual MLP reads
//! a node's normalized representation and role, modulated by a global condition vector, and
//! produces one 2D coordinate per node. Training minimizes a composite of semantic, relational, and
//! support objectives over the published fitting artifacts; inference projects whole corpora
//! batch-wise at a frozen condition.
//!
//! The map is parametric because it must extend to nodes the fit never saw. A trained checkpoint is
//! a pure function from representation to coordinate, so freshly ingested nodes project into the
//! existing frame without a refit. Rows project independently - the model reads one row's
//! representation, role, and the global condition, never its neighbours - which is what makes
//! placement idempotent and batch composition irrelevant to the result. Equal inputs therefore
//! place identically: rows sharing an exact representation and role are coincident in every
//! published map, at every lens. The condition input is the relation lens η ∈ [0, 1]: one model
//! covers the whole lens continuum, and the ladder publishes chosen steps of it instead of one
//! model per step.
//!
//! [`model`] defines the architecture and its initialization contracts; [`scale`] measures the
//! detached local radii the relation objective normalizes by; [`sample`] draws the seeded minibatch
//! populations; [`loss`] computes the composite objective and [`budget`] measures its relation
//! forces; [`miner`] finds 2D hard negatives; [`verdict`] reads the supplied human-review input;
//! [`train`] assembles minibatches and evaluates the step objective; [`artifact`] writes and
//! reopens the published checkpoint and the resume state. [`report`] observes the published
//! placement after the fact and participates in none of the above.

pub(crate) mod artifact;
pub(crate) mod band;
// Fully public: the root `bench` facade re-exports it; the private
// module chain above keeps it unreachable except through the facade.
#[cfg(feature = "bench")]
pub mod bench;
pub(crate) mod budget;
pub(crate) mod evidence;
pub(crate) mod gauge;
pub(crate) mod loss;
pub(crate) mod miner;
pub(crate) mod model;
pub(crate) mod report;
pub(crate) mod sample;
pub(crate) mod scale;
pub(crate) mod train;
pub(crate) mod verdict;
