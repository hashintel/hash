//! Relation attraction and independent no-repel protection indexes.
//!
//! Every admitted link instance remains an attraction record, including
//! parallel links and pairs absent from semantic k-nearest neighbors. For
//! relation type `r`, endpoint degrees are computed over the complete admitted
//! instance set and each edge receives
//!
//! ```text
//! ν(i, j, r) = 1 / sqrt((1 + degree_r(i)) * (1 + degree_r(j))).
//! ```
//!
//! Attraction retains confidence, degree normalization, frozen strength and
//! Coincident/Proximal policy factors separately. This prevents class
//! probabilities or strength from being applied twice.
//!
//! Hard- and ordinary-negative protection are derived before the Coincident
//! attraction gate. For channel `X`, relation evidence is
//!
//! ```text
//! confidence * max(applicability, floor_X) * (p_C + p_P).
//! ```
//!
//! Parallel links aggregate by maximum independently in each channel.
//! Attraction coefficients, degree normalization and strength never enter
//! protection.

use std::collections::HashMap;

use type_system::knowledge::entity::id::EntityId;

use crate::salt::{
    identity::{ArtifactOrdinal, GenerationRowId},
    policy::{Probability, ResolvedPolicy},
    strength::RelationStrength,
};

mod error;

pub(crate) use self::error::RelationIndexError;

const LINK_SCORED: u8 = 1 << 0;
const LEFT_SCORED: u8 = 1 << 1;
const RIGHT_SCORED: u8 = 1 << 2;

/// Confidence values attached to one link and its endpoints.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct RelationConfidence {
    pub link: Option<Probability>,
    pub left: Option<Probability>,
    pub right: Option<Probability>,
}

impl RelationConfidence {
    /// Computes the neutral-default effective confidence and score provenance.
    #[must_use]
    pub(crate) fn effective(self) -> EffectiveConfidence {
        let mut scored = 0;
        if self.link.is_some() {
            scored |= LINK_SCORED;
        }
        if self.left.is_some() {
            scored |= LEFT_SCORED;
        }
        if self.right.is_some() {
            scored |= RIGHT_SCORED;
        }
        let link = self.link.unwrap_or(Probability::ONE).get();
        let left = self.left.unwrap_or(Probability::ONE).get();
        let right = self.right.unwrap_or(Probability::ONE).get();
        EffectiveConfidence {
            value: link * (left * right).sqrt(),
            scored,
        }
    }
}

/// Effective confidence and the presence bits of its three source values.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct EffectiveConfidence {
    value: f64,
    scored: u8,
}

impl EffectiveConfidence {
    #[must_use]
    #[inline]
    pub(crate) const fn value(self) -> f64 {
        self.value
    }

    #[must_use]
    #[inline]
    pub(crate) const fn link_was_scored(self) -> bool {
        self.scored & LINK_SCORED != 0
    }

    #[must_use]
    #[inline]
    pub(crate) const fn left_was_scored(self) -> bool {
        self.scored & LEFT_SCORED != 0
    }

    #[must_use]
    #[inline]
    pub(crate) const fn right_was_scored(self) -> bool {
        self.scored & RIGHT_SCORED != 0
    }
}

/// A security-permitted, nonconflicting raw link instance.
#[derive(Debug, Copy, Clone)]
pub(crate) struct AdmittedRelationInstance {
    pub link_entity: EntityId,
    pub relation: ArtifactOrdinal,
    pub left: GenerationRowId,
    pub right: GenerationRowId,
    pub confidence: RelationConfidence,
}

/// Frozen policy and strength for one dense relation-type ordinal.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationPolicy {
    pub relation: ArtifactOrdinal,
    pub policy: ResolvedPolicy,
    pub strength: RelationStrength,
}

/// Shared generation-level attraction coefficients.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionCoefficients {
    pub coincident: f64,
    pub proximal: f64,
}

impl AttractionCoefficients {
    /// Validates shared class coefficients.
    ///
    /// # Errors
    ///
    /// Returns an error unless Coincident is finite and non-negative and
    /// Proximal is exactly the unit coefficient.
    pub(crate) fn new(coincident: f64, proximal: f64) -> Result<Self, RelationIndexError> {
        if !coincident.is_finite() || coincident < 0.0 || proximal != 1.0 {
            return Err(RelationIndexError::InvalidAttractionCoefficient {
                coincident,
                proximal,
            });
        }
        Ok(Self {
            coincident,
            proximal,
        })
    }
}

impl Default for AttractionCoefficients {
    #[inline]
    fn default() -> Self {
        Self {
            coincident: 0.0,
            proximal: 1.0,
        }
    }
}

/// Independent applicability floors and admission thresholds for protection.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProtectionConfig {
    pub hard_floor: Probability,
    pub ordinary_floor: Probability,
    pub hard_threshold: Probability,
    pub ordinary_threshold: Probability,
}

impl ProtectionConfig {
    /// Validates channel ordering.
    ///
    /// # Errors
    ///
    /// Returns an error unless the ordinary floor is at most the hard floor
    /// and the hard threshold is at most the ordinary threshold.
    pub(crate) fn new(
        hard_floor: Probability,
        ordinary_floor: Probability,
        hard_threshold: Probability,
        ordinary_threshold: Probability,
    ) -> Result<Self, RelationIndexError> {
        if ordinary_floor > hard_floor || hard_threshold > ordinary_threshold {
            return Err(RelationIndexError::InvalidProtectionOrdering);
        }
        Ok(Self {
            hard_floor,
            ordinary_floor,
            hard_threshold,
            ordinary_threshold,
        })
    }
}

/// One raw attraction instance with factorized immutable weights.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionEdge {
    pub link_entity: EntityId,
    pub relation: ArtifactOrdinal,
    pub left: GenerationRowId,
    pub right: GenerationRowId,
    pub confidence: EffectiveConfidence,
    pub degree_normalization: f64,
    pub strength: RelationStrength,
    pub coincident: f64,
    pub proximal: f64,
}

/// Canonically ordered generation-row pair.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct RelationPair {
    pub first: GenerationRowId,
    pub second: GenerationRowId,
}

impl RelationPair {
    #[must_use]
    #[inline]
    pub(crate) fn new(left: GenerationRowId, right: GenerationRowId) -> Self {
        Self {
            first: left.min(right),
            second: left.max(right),
        }
    }
}

/// Maximum pre-gate protection evidence for one endpoint pair.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PairProtection {
    pub pair: RelationPair,
    pub hard_mass: f64,
    pub ordinary_mass: f64,
    pub hard: bool,
    pub ordinary: bool,
}

/// Relation-force and protection views built from the same admitted instances.
#[derive(Debug, Clone)]
pub(crate) struct RelationIndexes {
    pub attraction: Vec<AttractionEdge>,
    pub protection: Vec<PairProtection>,
}

/// Builds complete attraction instances and pair-aggregated protection.
///
/// # Errors
///
/// Returns an error for sparse policy ordinals, unavailable policies,
/// out-of-range endpoints, or relation-degree overflow.
pub(crate) fn build_relation_indexes(
    generation_rows: usize,
    policies: &[RelationPolicy],
    instances: &[AdmittedRelationInstance],
    attraction: AttractionCoefficients,
    protection: ProtectionConfig,
) -> Result<RelationIndexes, RelationIndexError> {
    if generation_rows == 0 {
        return Err(RelationIndexError::EmptyGeneration);
    }
    for (position, policy) in policies.iter().enumerate() {
        if policy.relation.as_usize() != position {
            return Err(RelationIndexError::PolicyOrder {
                position,
                ordinal: policy.relation,
            });
        }
    }

    let mut degrees = HashMap::<(ArtifactOrdinal, GenerationRowId), u32>::new();
    for instance in instances {
        validate_instance(instance, generation_rows, policies)?;
        increment_degree(&mut degrees, instance.relation, instance.left)?;
        increment_degree(&mut degrees, instance.relation, instance.right)?;
    }

    let mut attraction_edges = Vec::with_capacity(instances.len());
    let mut pair_masses = HashMap::<RelationPair, (f64, f64)>::new();
    for instance in instances {
        let policy = policies[instance.relation.as_usize()];
        let confidence = instance.confidence.effective();
        let left_degree = degrees[&(instance.relation, instance.left)];
        let right_degree = degrees[&(instance.relation, instance.right)];
        let degree_normalization =
            1.0 / ((1.0 + f64::from(left_degree)) * (1.0 + f64::from(right_degree))).sqrt();
        attraction_edges.push(AttractionEdge {
            link_entity: instance.link_entity,
            relation: instance.relation,
            left: instance.left,
            right: instance.right,
            confidence,
            degree_normalization,
            strength: policy.strength,
            coincident: attraction.coincident * policy.policy.effective_attraction.coincident.get(),
            proximal: attraction.proximal * policy.policy.effective_attraction.proximal.get(),
        });

        let raw_positive =
            policy.policy.selected.coincident.get() + policy.policy.selected.proximal.get();
        let hard_applicability = policy
            .policy
            .applicability
            .get()
            .max(protection.hard_floor.get());
        let ordinary_applicability = policy
            .policy
            .applicability
            .get()
            .max(protection.ordinary_floor.get());
        let hard_mass = confidence.value() * hard_applicability * raw_positive;
        let ordinary_mass = confidence.value() * ordinary_applicability * raw_positive;
        let pair = RelationPair::new(instance.left, instance.right);
        let masses = pair_masses.entry(pair).or_default();
        masses.0 = masses.0.max(hard_mass);
        masses.1 = masses.1.max(ordinary_mass);
    }

    let mut pair_masses: Vec<_> = pair_masses
        .into_iter()
        .map(|(pair, (hard_mass, ordinary_mass))| PairProtection {
            pair,
            hard_mass,
            ordinary_mass,
            hard: hard_mass >= protection.hard_threshold.get(),
            ordinary: ordinary_mass >= protection.ordinary_threshold.get(),
        })
        .collect();
    pair_masses.sort_unstable_by_key(|entry| entry.pair);

    Ok(RelationIndexes {
        attraction: attraction_edges,
        protection: pair_masses,
    })
}

fn validate_instance(
    instance: &AdmittedRelationInstance,
    generation_rows: usize,
    policies: &[RelationPolicy],
) -> Result<(), RelationIndexError> {
    if policies.get(instance.relation.as_usize()).is_none() {
        return Err(RelationIndexError::UnknownPolicy {
            ordinal: instance.relation,
        });
    }
    for row in [instance.left, instance.right] {
        if row.as_usize() >= generation_rows {
            return Err(RelationIndexError::RowOutOfBounds {
                row,
                rows: generation_rows,
            });
        }
    }
    Ok(())
}

fn increment_degree(
    degrees: &mut HashMap<(ArtifactOrdinal, GenerationRowId), u32>,
    relation: ArtifactOrdinal,
    row: GenerationRowId,
) -> Result<(), RelationIndexError> {
    let degree = degrees.entry((relation, row)).or_default();
    *degree = degree
        .checked_add(1)
        .ok_or(RelationIndexError::DegreeOverflow { relation, row })?;
    Ok(())
}

#[cfg(test)]
mod tests;
