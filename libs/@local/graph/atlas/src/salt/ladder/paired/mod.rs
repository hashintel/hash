//! The paired-movement readout.
//!
//! The ladder's step evidence ([`measure_ladder`](super::measure_ladder)) reads the [relation
//! lens](crate::salt::projector) through the whole layout: alignment residual and relation loss per
//! step. This readout reads it where the lens acts. For a pseudo-random sample of
//! [force-bearing](crate::salt::relation::attraction::AttractionEdge)
//! [Proximal](crate::salt::policy::GeometryClass::Proximal) pairs it measures how each pair's
//! distance and [local neighbourhood rank](mod@movement) moved between the [zero-condition
//! step](super::Conditions) and the [canonical step](super::select_canonical), and for a control
//! sample bounded by the pair count, drawn from [nonparticipant rows](mod@census), it measures
//! displacement between the same steps, stratified by zero-step distance to the nearest sampled
//! endpoint. The control separates pair convergence from drift of the layout around it. The readout
//! persists as [ladder evidence](crate::file::salt::metadata::LadderEvidence) beside the step
//! measurements and blocks nothing.
//!
//! The draw is a pure function of the [generation](crate::file::generation::Generation)'s declared
//! inputs. Deriving the sample rather than storing it keeps the evidence body to its aggregates and
//! every sample replayable from its generation. [`identity`] names the rule and derives the salt,
//! [`census`] draws both samples, [`movement`] reads each drawn subject at both steps, [`evidence`]
//! aggregates the readings into the persisted body, and [`measure`](mod@measure) runs the whole
//! readout for one generation.

mod census;
mod evidence;
#[cfg(test)]
mod fixtures;
mod identity;
mod measure;
mod movement;

// The lib consumes the sibling modules inside this module only, so these re-exports are the
// module's whole production API. The test-only names are the inputs of the two external
// acceptance suites: the fit writer's replay assertions and the salt document's wire pins.
// The projector's evidence reading shares the aggregate family, so its gauge displacement
// quantiles keep the control evidence's exact shape by construction.
#[cfg(test)]
pub(crate) use self::{census::Draw, evidence::MovementOutcome, identity::RuleIdentity};
pub(crate) use self::{
    evidence::{MovementAggregate, PairedMovementEvidence},
    identity::EncodeError,
    measure::measure,
};
