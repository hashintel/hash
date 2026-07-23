//! Precedence resolution: every relation type gets one geometry policy.
//!
//! [`resolve`] folds the per-relation evidence into the certified policy table the relation indexes
//! consume. The source of truth follows a strict precedence:
//!
//! ```text
//! explicit human override
//! > human-reviewed soft label
//! > direct synthetic soft label
//! > calibrated classifier prediction
//! > Overlay fallback for unclassifiable relations
//! ```
//!
//! The classifier is the default operational source: no exhaustive policy table is required, and a
//! relation type minted after release receives a policy as soon as its card is embedded and
//! classified. Overrides are supplied as [`PolicyOverride`] records; where they come from is the
//! caller's concern.
//!
//! Each resolved policy carries two distributions. The **selected** distribution `p` is the winning
//! source's own answer; protection masses are computed from it. The **attraction** distribution
//! `p*` additionally passes the applicability mix and Coincident admission:
//!
//! ```text
//! p~ = a * p + (1 - a) * Overlay
//! g  = 1[p~_C >= tau_C and a >= tau_A]      (when admission is enforced)
//! p*_C = g * p~_C,   p*_P = p~_P,   p*_O = remainder
//! ```
//!
//! A Coincident prediction that fails admission becomes Overlay, never Proximal. Only the
//! Coincident and Proximal components are stored; Overlay is the remainder, so the mix reduces to
//! scaling both stored components by `a`. Overrides are asserted, not predicted, and carry
//! applicability 1; unclassifiable relations fall back to pure Overlay with applicability 0.
//! Strength is the unit multiplier while the strength head is disabled.
//!
//! Resolution is where policy values leave the solver's double precision and narrow to
//! working-precision data.

use core::{error::Error, fmt};

use super::{ClassProbabilities, Posterior, RelationPolicy};
use crate::{dataset::OntologyRowId, math::UnitFraction, salt::policy::classifier::Prediction};

#[cfg(test)]
mod tests;

/// A resolution input violated the table contract.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ResolveError {
    /// A relation appears more than once in the classifications.
    DuplicateRelation { relation: OntologyRowId },
    /// A relation carries two overrides of the same precedence.
    AmbiguousOverride {
        relation: OntologyRowId,
        source: PolicySource,
    },
    /// An override names a relation outside the classified universe.
    UnknownOverride { relation: OntologyRowId },
}

impl fmt::Display for ResolveError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::DuplicateRelation { relation } => write!(
                fmt,
                "relation row {} is classified more than once",
                relation.get(),
            ),
            Self::AmbiguousOverride { relation, source } => write!(
                fmt,
                "relation row {} carries two {source} overrides",
                relation.get(),
            ),
            Self::UnknownOverride { relation } => write!(
                fmt,
                "an override names relation row {}, which is not in the classified universe",
                relation.get(),
            ),
        }
    }
}

impl Error for ResolveError {}

/// The classifier's outcome for one relation's card.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum Classification {
    /// The card was classified.
    Predicted(Prediction),
    /// No card could be constructed; the relation falls back to Overlay for every channel.
    Unclassified,
}

/// A higher-precedence policy record, declared in descending precedence.
///
/// The lowest variant present wins.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum PolicySource {
    /// An explicit human override.
    Human,
    /// A human-reviewed soft label.
    Reviewed,
    /// A direct synthetic soft label.
    Synthetic,
}

impl fmt::Display for PolicySource {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Human => "human-override",
            Self::Reviewed => "reviewed-label",
            Self::Synthetic => "synthetic-label",
        })
    }
}

/// One supplied policy record above the classifier in precedence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PolicyOverride {
    /// The relation type the record covers.
    pub relation: OntologyRowId,
    /// The record's precedence tier.
    pub source: PolicySource,
    /// The asserted class distribution.
    pub distribution: Posterior,
}

/// The generation's global Coincident admission criteria.
///
/// Admission is enforced only in generations that enable Coincident geometry; unenforced, the
/// attraction distribution passes through the mix unchanged and the Coincident force coefficient
/// governs downstream. The default thresholds are maximally conservative placeholders: a generation
/// enforcing admission configures them from its precision release evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CoincidentAdmission {
    /// Whether admission is enforced. Defaults to unenforced.
    pub enforced: bool = false,
    /// Minimum mixed Coincident probability `tau_C`. Defaults to 1.
    pub class_probability_threshold: UnitFraction = UnitFraction::ONE,
    /// Minimum applicability `tau_A`. Defaults to 1.
    pub applicability_threshold: UnitFraction = UnitFraction::ONE,
}

const impl Default for CoincidentAdmission {
    fn default() -> Self {
        Self { .. }
    }
}

/// Resolves every relation's geometry policy.
///
/// `classifications` is the relation universe: one entry per relation type in scope, in any order.
/// `overrides` supersede classifier outcomes by precedence. The result is strictly ascending by
/// relation row, ready for the relation indexes' certified table.
///
/// # Errors
///
/// Returns a [`ResolveError`] for a duplicated relation, two overrides at the same precedence for
/// one relation, or an override naming an unknown relation.
pub(crate) fn resolve(
    classifications: &[(OntologyRowId, Classification)],
    overrides: &[PolicyOverride],
    admission: CoincidentAdmission,
) -> Result<Vec<RelationPolicy>, ResolveError> {
    let mut ordered = classifications.to_vec();
    ordered.sort_unstable_by_key(|(relation, _)| relation.get());

    if let Some([(duplicate, _), _]) = ordered
        .array_windows::<2>()
        .find(|[(left, _), (right, _)]| left.get() == right.get())
    {
        return Err(ResolveError::DuplicateRelation {
            relation: *duplicate,
        });
    }

    let winners = winning_overrides(&ordered, overrides)?;

    Ok(ordered
        .iter()
        .zip(winners)
        .map(|(&(relation, classification), winner)| {
            let (selected, applicability) = match (winner, classification) {
                (Some(record), _) => (
                    ClassProbabilities::from_posterior(&record.distribution),
                    1.0,
                ),
                (None, Classification::Predicted(prediction)) => (
                    ClassProbabilities::from_posterior(&prediction.calibrated),
                    prediction.applicability,
                ),
                (None, Classification::Unclassified) => (
                    ClassProbabilities {
                        coincident: 0.0,
                        proximal: 0.0,
                    },
                    0.0,
                ),
            };
            RelationPolicy {
                relation,
                attraction: attraction(selected, applicability, admission),
                selected,
                applicability: narrow(applicability),
                strength: 1.0,
            }
        })
        .collect())
}

/// Applies the applicability mix and Coincident admission.
///
/// Overlay is the unstored remainder, so mixing toward it scales the stored components by `a`;
/// admission then reroutes a failing mixed Coincident mass to that remainder.
fn attraction(
    selected: ClassProbabilities,
    applicability: f64,
    admission: CoincidentAdmission,
) -> ClassProbabilities {
    let mixed_coincident = applicability * f64::from(selected.coincident);
    let mixed_proximal = applicability * f64::from(selected.proximal);

    let admitted = !admission.enforced
        || (mixed_coincident >= admission.class_probability_threshold.get()
            && applicability >= admission.applicability_threshold.get());

    ClassProbabilities {
        coincident: if admitted {
            narrow(mixed_coincident)
        } else {
            0.0
        },
        proximal: narrow(mixed_proximal),
    }
}

/// Selects the winning override per ordered relation.
fn winning_overrides<'over>(
    ordered: &[(OntologyRowId, Classification)],
    overrides: &'over [PolicyOverride],
) -> Result<Vec<Option<&'over PolicyOverride>>, ResolveError> {
    let mut winners = vec![None::<&PolicyOverride>; ordered.len()];
    for record in overrides {
        let position = ordered
            .binary_search_by_key(&record.relation.get(), |(relation, _)| relation.get())
            .ok()
            .ok_or(ResolveError::UnknownOverride {
                relation: record.relation,
            })?;

        let winner = &mut winners[position];
        match *winner {
            Some(current) if current.source == record.source => {
                return Err(ResolveError::AmbiguousOverride {
                    relation: record.relation,
                    source: record.source,
                });
            }
            Some(current) if current.source < record.source => {}
            _ => *winner = Some(record),
        }
    }

    Ok(winners)
}

/// Narrows a resolved probability to working precision.
#[expect(
    clippy::cast_possible_truncation,
    reason = "probabilities lie in [0, 1], far inside f32 range"
)]
#[inline]
const fn narrow(value: f64) -> f32 {
    value as f32
}
