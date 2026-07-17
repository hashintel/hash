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
//! Link and endpoint confidence combine as
//!
//! ```text
//! c_eff = c_link * sqrt(c_left * c_right)
//! ```
//!
//! with a missing score represented by the neutral value one and a separate
//! provenance bit. Force pruning uses
//! `c_eff * (coincident_mass + proximal_mass)` before degree normalization and
//! strength; persisted edges retain all factors so training applies each one
//! exactly once.
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

#![expect(
    clippy::little_endian_bytes,
    reason = "relation identities require canonical cross-platform scalar encodings"
)]

use std::collections::{HashMap, HashSet};

use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};
use uuid::Uuid;

use crate::salt::{
    hash::{ContentHash, ContentHasher},
    identity::{ArtifactOrdinal, GenerationRowId, IdentityDirectory},
    policy::{PolicySource, Probability, ResolvedPolicy},
    snapshot::GeometryAuthorizedLink,
    strength::RelationStrength,
};

mod artifact;
mod error;

pub(crate) use self::{artifact::publish_relation_indexes, error::RelationIndexError};

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

    /// Returns the stable link/left/right score-presence bitset.
    #[must_use]
    #[inline]
    pub(crate) const fn provenance(self) -> u8 {
        self.scored
    }
}

/// A security-permitted, nonconflicting raw link instance.
#[derive(Debug, Copy, Clone)]
pub(crate) struct AdmittedRelationInstance {
    link_entity: EntityId,
    relation: ArtifactOrdinal,
    left: GenerationRowId,
    right: GenerationRowId,
    confidence: RelationConfidence,
}

impl AdmittedRelationInstance {
    /// Resolves a security-admitted link into generation row identities.
    ///
    /// # Errors
    ///
    /// This returns an error when either endpoint is absent from the frozen
    /// identity directory.
    pub(crate) fn from_authorized(
        link: &GeometryAuthorizedLink,
        relation: ArtifactOrdinal,
        identities: &IdentityDirectory,
        confidence: RelationConfidence,
    ) -> Result<Self, RelationIndexError> {
        let left_entity = link.left_entity();
        let right_entity = link.right_entity();
        let left =
            identities
                .row(&left_entity)
                .ok_or(RelationIndexError::MissingGeometryEndpoint {
                    entity: left_entity,
                })?;
        let right =
            identities
                .row(&right_entity)
                .ok_or(RelationIndexError::MissingGeometryEndpoint {
                    entity: right_entity,
                })?;
        Ok(Self {
            link_entity: link.link_entity(),
            relation,
            left,
            right,
            confidence,
        })
    }

    /// Returns the canonical identity of the resolved edge and confidence.
    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.admitted-relation-instance.v1");
        let (web_id, entity_uuid, draft_id) = entity_sort_key(self.link_entity);
        hasher.update(web_id.as_bytes());
        hasher.update(entity_uuid.as_bytes());
        if let Some(draft_id) = draft_id {
            hasher.update(&[1]);
            hasher.update(draft_id.as_bytes());
        } else {
            hasher.update(&[0]);
            hasher.update(&[0; 16]);
        }
        hasher.update(&self.relation.as_u32().to_le_bytes());
        hasher.update(&self.left.as_u32().to_le_bytes());
        hasher.update(&self.right.as_u32().to_le_bytes());
        for value in [
            self.confidence.link,
            self.confidence.left,
            self.confidence.right,
        ] {
            hasher.update(&[u8::from(value.is_some())]);
            if let Some(value) = value {
                hasher.update(&value.get().to_bits().to_le_bytes());
            }
        }
        hasher.finish()
    }
}

/// Frozen policy and strength for one dense relation-type ordinal.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationPolicy {
    pub relation: ArtifactOrdinal,
    pub policy: ResolvedPolicy,
    pub strength: RelationStrength,
}

/// Computes the canonical identity of the dense relation-policy sidecar.
#[must_use]
pub(crate) fn relation_policy_hash(
    ordinals: &HashMap<VersionedUrl, ArtifactOrdinal>,
    policies: &[RelationPolicy],
) -> ContentHash {
    let mut relation_types = ordinals
        .iter()
        .map(|(relation_type, ordinal)| (*ordinal, relation_type.to_string()))
        .collect::<Vec<_>>();
    relation_types.sort_unstable_by_key(|(ordinal, _)| *ordinal);
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.resolved-relation-policy.v1");
    for (ordinal, relation_type) in relation_types {
        hasher.update(&ordinal.as_u32().to_le_bytes());
        hasher.update(relation_type.as_bytes());
        if let Some(policy) = policies.get(ordinal.as_usize()) {
            hasher.update(&[policy_source(policy.policy.source)]);
            for value in policy_values(policy) {
                hasher.update(&value.to_bits().to_le_bytes());
            }
            hasher.update(&[u8::from(policy.policy.coincident_admitted)]);
        }
    }
    hasher.finish()
}

#[inline]
pub(super) const fn policy_source(source: PolicySource) -> u8 {
    match source {
        PolicySource::HumanOverride => 0,
        PolicySource::HumanReviewed => 1,
        PolicySource::Synthetic => 2,
        PolicySource::Classifier => 3,
        PolicySource::OverlayFallback => 4,
    }
}

#[inline]
pub(super) fn policy_values(policy: &RelationPolicy) -> [f64; 8] {
    [
        policy.policy.selected.coincident.get(),
        policy.policy.selected.proximal.get(),
        policy.policy.selected.overlay.get(),
        policy.policy.applicability.get(),
        policy.policy.effective_attraction.coincident.get(),
        policy.policy.effective_attraction.proximal.get(),
        policy.policy.effective_attraction.overlay.get(),
        policy.strength.get(),
    ]
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
        if !coincident.is_finite() || coincident.is_sign_negative() || proximal != 1.0 {
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

/// Shared attraction coefficients and an optional hard force-pruning threshold.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionConfig {
    pub coefficients: AttractionCoefficients,
    pub force_pruning_threshold: f64,
}

impl AttractionConfig {
    /// Validates a generation-level attraction configuration.
    ///
    /// # Errors
    ///
    /// This returns an error when the pruning threshold is negative or
    /// non-finite.
    pub(crate) fn new(
        coefficients: AttractionCoefficients,
        force_pruning_threshold: f64,
    ) -> Result<Self, RelationIndexError> {
        if !force_pruning_threshold.is_finite() || force_pruning_threshold.is_sign_negative() {
            return Err(RelationIndexError::InvalidForcePruningThreshold {
                value: force_pruning_threshold,
            });
        }
        Ok(Self {
            coefficients,
            force_pruning_threshold,
        })
    }
}

impl Default for AttractionConfig {
    #[inline]
    fn default() -> Self {
        Self {
            coefficients: AttractionCoefficients::default(),
            force_pruning_threshold: 0.0,
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
    pub protect_ordinary_negatives: bool,
}

impl ProtectionConfig {
    /// Validates channel ordering.
    ///
    /// # Errors
    ///
    /// Returns an error unless the ordinary floor is at most the hard floor
    /// and the hard threshold is at most the ordinary threshold.
    ///
    /// # Arguments
    ///
    /// * `hard_floor` - Minimum applicability used for hard-negative protection
    /// * `ordinary_floor` - Minimum applicability used for ordinary negatives
    /// * `hard_threshold` - Pair mass required to protect hard negatives
    /// * `ordinary_threshold` - Pair mass required to protect ordinary negatives
    /// * `protect_ordinary_negatives` - Whether ordinary protection is enforced
    pub(crate) fn new(
        hard_floor: Probability,
        ordinary_floor: Probability,
        hard_threshold: Probability,
        ordinary_threshold: Probability,
        protect_ordinary_negatives: bool,
    ) -> Result<Self, RelationIndexError> {
        if ordinary_floor > hard_floor || hard_threshold > ordinary_threshold {
            return Err(RelationIndexError::InvalidProtectionOrdering);
        }
        Ok(Self {
            hard_floor,
            ordinary_floor,
            hard_threshold,
            ordinary_threshold,
            protect_ordinary_negatives,
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

impl RelationIndexes {
    /// Returns the canonical identity of attraction and no-repel state.
    #[must_use]
    pub(crate) fn edge_snapshot_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.relation-edge-snapshot.v2");
        hasher.update(
            &u64::try_from(self.attraction.len())
                .expect("attraction count should fit u64")
                .to_le_bytes(),
        );
        hasher.update(
            &u64::try_from(self.protection.len())
                .expect("protection count should fit u64")
                .to_le_bytes(),
        );
        for edge in &self.attraction {
            let (web_id, entity_uuid, draft_id) = entity_sort_key(edge.link_entity);
            hasher.update(web_id.as_bytes());
            hasher.update(entity_uuid.as_bytes());
            if let Some(draft_id) = draft_id {
                hasher.update(&[1]);
                hasher.update(draft_id.as_bytes());
            } else {
                hasher.update(&[0]);
                hasher.update(&[0; 16]);
            }
            hasher.update(&edge.relation.as_u32().to_le_bytes());
            hasher.update(&edge.left.as_u32().to_le_bytes());
            hasher.update(&edge.right.as_u32().to_le_bytes());
            hasher.update(&edge.confidence.value().to_bits().to_le_bytes());
            hasher.update(&[edge.confidence.provenance()]);
            for value in [
                edge.degree_normalization,
                edge.strength.get(),
                edge.coincident,
                edge.proximal,
            ] {
                hasher.update(&value.to_bits().to_le_bytes());
            }
        }
        for protection in &self.protection {
            hasher.update(&protection.pair.first.as_u32().to_le_bytes());
            hasher.update(&protection.pair.second.as_u32().to_le_bytes());
            hasher.update(&protection.hard_mass.to_bits().to_le_bytes());
            hasher.update(&protection.ordinary_mass.to_bits().to_le_bytes());
            hasher.update(&[u8::from(protection.hard) | (u8::from(protection.ordinary) << 1)]);
        }
        hasher.finish()
    }
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
    attraction: AttractionConfig,
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

    let mut link_entities = HashSet::with_capacity(instances.len());
    let mut degrees = HashMap::<(ArtifactOrdinal, GenerationRowId), u32>::new();
    for instance in instances {
        validate_instance(instance, generation_rows, policies)?;
        if !link_entities.insert(instance.link_entity) {
            return Err(RelationIndexError::DuplicateLinkEntity {
                link_entity: instance.link_entity,
            });
        }
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
        let coincident = attraction.coefficients.coincident
            * policy.policy.effective_attraction.coincident.get();
        let proximal =
            attraction.coefficients.proximal * policy.policy.effective_attraction.proximal.get();
        let edge = AttractionEdge {
            link_entity: instance.link_entity,
            relation: instance.relation,
            left: instance.left,
            right: instance.right,
            confidence,
            degree_normalization,
            strength: policy.strength,
            coincident,
            proximal,
        };
        let force_mass = confidence.value() * (coincident + proximal);
        if force_mass >= attraction.force_pruning_threshold {
            attraction_edges.push(edge);
        }

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
    attraction_edges.sort_unstable_by(|left, right| {
        left.relation
            .cmp(&right.relation)
            .then_with(|| left.left.cmp(&right.left))
            .then_with(|| left.right.cmp(&right.right))
            .then_with(|| {
                entity_sort_key(left.link_entity).cmp(&entity_sort_key(right.link_entity))
            })
    });

    let mut pair_masses: Vec<_> = pair_masses
        .into_iter()
        .map(|(pair, (hard_mass, ordinary_mass))| PairProtection {
            pair,
            hard_mass,
            ordinary_mass,
            hard: hard_mass >= protection.hard_threshold.get(),
            ordinary: protection.protect_ordinary_negatives
                && ordinary_mass >= protection.ordinary_threshold.get(),
        })
        .collect();
    pair_masses.sort_unstable_by_key(|entry| entry.pair);

    Ok(RelationIndexes {
        attraction: attraction_edges,
        protection: pair_masses,
    })
}

#[inline]
fn entity_sort_key(entity: EntityId) -> (Uuid, Uuid, Option<Uuid>) {
    (
        entity.web_id.into(),
        entity.entity_uuid.into(),
        entity.draft_id.map(Into::into),
    )
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
