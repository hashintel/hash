//! Pair convergence and control displacement between ladder conditions.
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
//! endpoint. These populations show pair convergence beside surrounding displacement, without
//! isolating a causal effect. The readout persists as [ladder
//! evidence](crate::file::salt::metadata::LadderEvidence) beside the step measurements. Census and
//! frame-count failures become typed evidence outcomes. Salt-encoding failure remains an error.
//!
//! Deriving the sample from metadata and the attraction index avoids persisting selected
//! identities. Replay requires the recorded rule's serialization conventions and the same index and
//! corpus row identities. [`identity`] derives the salt and subject order, and [`census`] selects
//! both samples. [`movement`] reads each drawn subject at both steps. [`evidence`] aggregates those
//! readings, and [`measure`](mod@measure) runs the readout for one generation.

mod census;
mod evidence;
#[cfg(test)]
mod fixtures;
mod identity;
mod measure;
mod movement;

#[cfg(test)]
pub(crate) use self::{census::Draw, evidence::MovementOutcome, identity::RuleIdentity};
pub(crate) use self::{
    evidence::{MovementAggregate, PairedMovementEvidence},
    identity::EncodeError,
    measure::measure,
};
