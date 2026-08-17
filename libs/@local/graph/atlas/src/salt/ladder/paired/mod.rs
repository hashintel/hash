//! The paired-movement readout.
//!
//! A direct counterfactual reading of the relation lens over the measured ladder. For a
//! pseudo-random sample of force-bearing Proximal pairs, the readout measures how each pair's
//! distance and local neighbourhood rank moved between the zero-condition rung and the
//! canonical rung, against a matched control population of nonparticipant rows. It persists as
//! ladder evidence beside the rung measurements. It is warn-only and gates nothing.
//!
//! The sample must be replayable without persisting pair identities, so the draw is a pure
//! function of the generation's declared inputs under a versioned rule. [`identity`] carries
//! that rule: the rule identity, the salt derived from the metadata document's input sections,
//! and the keyed order keys the sampler sorts by. [`census`] takes the draw itself: it walks
//! the attraction index's two candidate domains and selects each bounded sample in keyed order.
//! [`movement`] reads each drawn subject between the aligned zero and canonical rungs: pair
//! distance and union-domain local rank, control displacement and anchor proximity.
//! [`evidence`] aggregates the readings into the persisted body the metadata document embeds
//! beside the rungs, with nearest-rank quantiles over per-pair differences, collateral strata
//! over the candidate census, and a tri-state outcome that cannot carry a partial family.
//! [`measure`](mod@measure) runs the whole readout for one generation, salt to evidence body,
//! as one pure function the fit's writer wraps around the staged artifacts.

mod census;
mod evidence;
#[cfg(test)]
mod fixtures;
mod identity;
mod measure;
mod movement;

// The lib consumes the sibling modules inside this module only, so these re-exports are the
// module's whole production API. The test-gated names are the inputs of the two external
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
