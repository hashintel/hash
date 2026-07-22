//! The parametric projector: a conditioned encoder from node representations to 2D map coordinates.
//!
//! The projector is the model the fitting pipeline trains and the serving pipeline applies: a
//! residual MLP taking a node's normalized representation and role, modulated by a global condition
//! vector, producing one 2D coordinate per node. Training minimizes a composite of semantic,
//! relational, and support objectives over the published fitting artifacts; inference projects
//! whole corpora batch-wise at a frozen condition.
//!
//! [`model`] defines the architecture and its initialization contracts; [`scale`] measures the
//! detached local radii the relation objective normalizes by; [`sample`] draws the seeded minibatch
//! populations; [`loss`] and [`budget`] compute the composite objective and its clipped relation
//! forces; [`miner`] finds 2D hard negatives; [`verdict`] reads the supplied human-review input;
//! [`train`] assembles minibatches and evaluates the budgeted step objective. The training loop and
//! checkpoint artifact land as siblings.

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
