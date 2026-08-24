//! The target objective's wiring through the training run, from the boundary freeze to the
//! per-evaluation evidence.
//!
//! A target-configured run trains the declared estimand beside the released families. At the
//! phase boundary the run freezes every reference the estimand reads - the ruler's `σ₀` table
//! with its neighbour sets, the boundary field `Z_K`, the band constraint
//! reconstructed from the declared dimensionless radius, and the gauge population with its
//! frozen spread - and opens the enforcement record that accumulates through the run's final
//! evaluation. From the boundary on, every step enforces the band over the whole zero field
//! before any reading derives from it. The step then fits the live gauge alignment and folds
//! the batch estimator over its unit draws, depositing the hand-derived gradients - both
//! coordinate channels beside the fitted scale's fan into the gauge anchors - through one
//! surrogate scalar.
//!
//! The estimand exists at exactly two steps, zero and canonical, whatever step the step's
//! round-robin trains the released families at. The pass therefore forwards its own row set -
//! the drawn unit endpoints beside the whole gauge - at both steps, and never rides the released
//! batch frame. The estimand's zero-side calculus lives entirely inside that pass forward: the
//! pass's zero values project under the frozen constraint's own clip law, forces are evaluated
//! at the projected values, and the deposit composes them through the applied clip derivatives
//! into the same tensor's graph. One realization carries the value and both Jacobians, because
//! a backend whose kernels vary with the execution shape makes the whole-corpus slices a
//! different function than the padded pass, and the exact derivative belongs to exactly one of
//! them. The whole-field enforcement stays the constitutive constraint's application point and
//! the record's writer, and the evidence reads that field.
//!
//! The activation is a value, never structure. A zero-activation run draws the same units and
//! enforces the same band, then fits the same gauge and reads the same estimand - it adds
//! exactly zero force. The reference replicate is that run, not a build without the code path,
//! so absence and inertness stay distinguishable in the artifact record.

mod evidence;
mod inputs;
mod pass;
mod phase;

use core::num::NonZero;

use hashql_core::id::{Id, IdVec, bit_vec::DenseBitSet};

// Outside this module only the test fixture names the draw and split types directly.
#[cfg(test)]
pub(crate) use self::inputs::{GaugeDraw, TargetSplit};
pub(super) use self::phase::{ForwardContext, TargetPhase, TargetStep};
pub(crate) use self::{
    evidence::{RulerTables, TargetEvidence},
    inputs::{SplitPopulation, TargetInputs, TargetOptions},
};
use super::{
    super::{BatchPlan, STEPS, TrainingSchedule},
    TrainError,
};
use crate::{
    math::{DNonNegative, DPositive, NonNegative},
    salt::{
        projector::{
            gauge::GaugeRefusal,
            loss::{CappedDrawLaw, TargetUnit, UnitLaw, released_weight},
            sample::SampledRelationEdges,
            scale::frozen::{FrozenRuler, InvalidRuler},
        },
        relation::attraction::AttractionIndex,
    },
};

hashql_core::id::newtype! {
    /// A row position local to one step's target pass.
    ///
    /// The pass re-indexes the drawn unit endpoints and the gauge anchors into a dense local
    /// domain for its two-step forwards, exactly as batch assembly re-indexes the released
    /// families. The key is distinct by design from both the corpus row and the released
    /// batch position: the three frames never share a coordinate tensor, and confusing them is
    /// the wiring defect this type exists to prevent.
    pub(crate) struct TargetRowId(u32)
}

/// The loop-invariant target context, admitted once per session.
///
/// Everything here is a split-time fact - the declared constants and the borrowed draws, plus
/// the unit population's total weight and the draw law's pricing. The coordinate-bearing state
/// lives in [`TargetPhase`], which exists only from the boundary on.
#[derive(Debug)]
pub(super) struct TargetContext<'run, N> {
    options: TargetOptions,
    inputs: TargetInputs<'run, N>,
    canonical_eta: NonNegative,
    law: CappedDrawLaw,
    population_weight: DPositive,
}

impl<'run, N> TargetContext<'run, N>
where
    N: Id,
{
    /// Admits the target configuration against the run's structure.
    ///
    /// Every check here is coordinate-free and runs at session construction, so an impossible
    /// target run fails before its opening segment. The schedule must open the ladder, and the
    /// canonical step must exist within it. The plan must draw unit types, and the corpus must
    /// carry a weighted unit population under the declared unit law. The declared split
    /// populations must be pairwise-disjoint - the membership law that keeps the optimizer
    /// from owning its own ruler or reaching a reference population.
    ///
    /// The strata cover the corpus rows, and the gauge rows and classes come from one draw -
    /// wiring contracts checked in debug builds, since draws and corpus come from one
    /// generation.
    ///
    /// # Errors
    ///
    /// The first failed admission is the refusal. A schedule with no boundary refuses as the
    /// ruler's missing reference. A canonical step outside the schedule and a plan without
    /// unit draws each refuse by name, and so does a hinge-dead penalty declared with a zero
    /// margin. An undersized gauge draw refuses before the freeze. A
    /// forceless corpus and a weightless unit population both resolve into the
    /// empty-population refusal. An overlap between split populations names the pair and the
    /// shared row.
    pub(super) fn admit<E>(
        inputs: TargetInputs<'run, N>,
        attraction: &AttractionIndex<N, E>,
        plan: BatchPlan,
        schedule: TrainingSchedule,
        rows: usize,
        vacuous: bool,
    ) -> Result<Self, TrainError<N>>
    where
        E: Id,
    {
        let options = inputs.options;
        // The gauge draw's own pairing is a construction fact of `GaugeDraw`. A short strata
        // table panics at its first out-of-domain index, and this check merely moves that
        // failure to admission in debug builds.
        debug_assert_eq!(
            inputs.strata.len(),
            rows,
            "the strata and the corpus should cover the same rows"
        );

        if schedule.boundary() == schedule.steps().get() {
            // The ladder never opens, so no zero-condition reference exists to freeze.
            return Err(TrainError::Ruler(InvalidRuler::MissingReference));
        }
        let Some(&canonical_eta) = STEPS.get(options.canonical_step.get()) else {
            return Err(TrainError::CanonicalStepOutOfSchedule {
                step: options.canonical_step.get(),
            });
        };
        // Distance equality must carry corrective force under the ruled shape constraint, so
        // a penalty whose slope dies at a zero violation pairs only with a positive margin.
        if options.penalty.dead_at_equality() && options.margin.is_zero() {
            return Err(TrainError::PenaltyWithoutForceAtEquality);
        }
        if plan.relation_types == 0 {
            return Err(TrainError::TargetWithoutUnitDraws);
        }
        // The gauge freeze itself carries a two-anchor floor, and the evidence obligation
        // raises it here: every evaluation must fit the affine component over the gauge, and
        // an affine solve needs three anchors. Admitting fewer would spend the whole opening
        // segment before the first evaluation refuses.
        if inputs.gauge.rows().len() < 3 {
            return Err(TrainError::Gauge(GaugeRefusal::InsufficientAnchors {
                count: inputs.gauge.rows().len(),
            }));
        }

        // A forceless corpus declares no unit population: the run resolves into the released
        // vacuous taxonomy instead of reading an estimand over nothing.
        if vacuous {
            return Err(TrainError::EmptyTargetPopulation);
        }

        // The declared populations are pairwise-disjoint under the one split rule the digest
        // names - E5's membership law. One scan covers every pair because each row records
        // the population that claimed it, and the first double claim names the overlap. The
        // movement participants are the force-bearing endpoints, where relation gradients
        // reach coordinates directly.
        let mut bears_force = DenseBitSet::new_empty(rows);
        for group in attraction.groups() {
            if group.edges().is_empty() || group.weights().strength.is_zero() {
                continue;
            }
            for edge in group.edges() {
                bears_force.insert(edge.source);
                bears_force.insert(edge.target);
            }
        }

        let mut claims: IdVec<_, Option<SplitPopulation>> = IdVec::new();
        let mut claim = |population: SplitPopulation, members: &[N]| {
            for &row in members {
                if bears_force.contains(row) {
                    return Err(TrainError::SplitPopulationsOverlap {
                        first: SplitPopulation::MovementParticipants,
                        second: population,
                        row,
                    });
                }

                if let Some(&first) = claims.lookup(row) {
                    return Err(TrainError::SplitPopulationsOverlap {
                        first,
                        second: population,
                        row,
                    });
                }

                claims.insert(row, population);
            }
            Ok(())
        };
        claim(SplitPopulation::GaugeAnchors, inputs.gauge.rows())?;
        claim(SplitPopulation::HeldOutEndpoints, inputs.split.held_out)?;
        claim(
            SplitPopulation::MatchedControls,
            inputs.split.matched_controls,
        )?;

        // `W`: the split-time total unit weight over the whole declared population, derived
        // under the declared unit law - the match closes nothing the ledger keeps open. Under
        // the per-instance law every admitted instance of every group is one unit, and
        // zero-weight units stay members with zero mass.
        let mut weight = DNonNegative::ZERO;
        match options.unit_law {
            UnitLaw::PerLinkInstance => {
                for group in attraction.groups() {
                    let strength = group.weights().strength;
                    for edge in group.edges() {
                        weight +=
                            released_weight(edge.confidence.value(), edge.normalization, strength);
                    }
                }
            }
        }

        let population_weight =
            DPositive::try_from(weight).map_err(|_error| TrainError::EmptyTargetPopulation)?;

        // The law prices the released draw conditional on the declared unit. Under the
        // per-instance law: types uniform without replacement, then capped distinct edges
        // uniform without replacement inside each selected type. A positive population weight
        // implies at least one group, and the plan check above guarantees a positive type
        // count.
        let groups = NonZero::new(attraction.groups().len())
            .expect("a weighted unit population lives in at least one group");
        let drawn = NonZero::new(plan.relation_types.min(groups.get()))
            .expect("the plan draws at least one relation type");

        let law = match options.unit_law {
            UnitLaw::PerLinkInstance => CappedDrawLaw::new(drawn, groups, plan.relation_cap),
        };

        Ok(Self {
            options,
            inputs,
            canonical_eta,
            law,
            population_weight,
        })
    }

    /// Returns the canonical condition's step value.
    #[inline]
    pub(super) const fn canonical_eta(&self) -> NonNegative {
        self.canonical_eta
    }

    /// Returns the declared constants the context was admitted with.
    #[inline]
    pub(super) const fn options(&self) -> TargetOptions {
        self.options
    }

    /// Borrows the admitted run inputs.
    #[inline]
    pub(super) const fn inputs(&self) -> &TargetInputs<'run, N> {
        &self.inputs
    }

    /// Returns the admitted population weight `W`.
    #[inline]
    pub(super) const fn population_weight(&self) -> DPositive {
        self.population_weight
    }

    /// Converts one step's unit draws into priced units, in the corpus row domain.
    ///
    /// The construction conditions on the declared unit law - under the per-instance law each
    /// drawn edge is one unit. The ruler is gathered from the frozen table here, before any
    /// re-indexing, so the term stays decoupled from the live scale machinery. The weight is
    /// the released factor census, and the inclusion probability is the draw law's full
    /// per-unit product over the unit's group size.
    pub(super) fn units<E>(
        &self,
        ruler: &FrozenRuler<N>,
        draws: &[SampledRelationEdges<'_, N, E>],
    ) -> Vec<TargetUnit<N>>
    where
        E: Id,
    {
        let mut units = Vec::with_capacity(draws.iter().map(|drawn| drawn.edges.len()).sum());

        match self.options.unit_law {
            UnitLaw::PerLinkInstance => {
                for drawn in draws {
                    let size = NonZero::new(drawn.group.edges().len())
                        .expect("the index stores no empty groups");

                    let inclusion = self.law.inclusion(size);
                    let strength = drawn.group.weights().strength;

                    for edge in &drawn.edges {
                        units.push(TargetUnit {
                            source: edge.source,
                            target: edge.target,
                            ruler: ruler.denominator(edge.source, edge.target),
                            weight: released_weight(
                                edge.confidence.value(),
                                edge.normalization,
                                strength,
                            ),
                            inclusion,
                        });
                    }
                }
            }
        }

        units
    }
}
