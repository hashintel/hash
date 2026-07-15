//! Frozen inputs for one canonical generation transaction.
//!
//! Authorization and relation-security decisions enter this module only as
//! opaque snapshot capabilities. Freezing resolves every admitted relation to
//! dense generation rows, validates every row-aligned matrix, and pins model
//! artifacts through retained read-only mappings. The generation runner
//! therefore consumes one owned value rather than a bag of independently
//! mutable borrows.

use std::collections::{HashMap, HashSet};

use camino::Utf8PathBuf;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use super::{
    CanonicalGenerationError,
    artifact::{ModelArtifact, inspect_model},
};
use crate::salt::{
    format::{CLASSIFIER_FORMAT, STRENGTH_CLASSIFIER_FORMAT},
    graph::ProjectorEmbeddings,
    hash::{ContentHash, ContentHasher},
    identity::{ArtifactOrdinal, IdentityDirectory},
    landmark::{LandmarkCandidate, SubgroupMinimum},
    projector::{CoordinateSupportRow, EntityRole, ProjectorInferenceError, ProjectorTypeContext},
    relation::{AdmittedRelationInstance, RelationConfidence, RelationPolicy},
    snapshot::GeometrySnapshot,
};

/// Source paths for classifier artifacts pinned while inputs are frozen.
#[derive(Debug, Clone)]
pub(crate) struct RelationModelSources {
    pub classifier: Utf8PathBuf,
    pub strength_head: Option<Utf8PathBuf>,
}

/// Owned optional type-context matrix in generation-row order.
#[derive(Debug, Clone)]
pub(crate) struct FrozenProjectorTypeContext {
    values: Box<[f32]>,
    rows: usize,
    dimensions: usize,
}

impl FrozenProjectorTypeContext {
    /// Validates and owns one row-major type-context matrix.
    ///
    /// # Errors
    ///
    /// This returns an error when shape arithmetic overflows, the values do
    /// not match the declared shape, or a component is non-finite.
    pub(crate) fn new(
        values: Box<[f32]>,
        rows: usize,
        dimensions: usize,
    ) -> Result<Self, ProjectorInferenceError> {
        ProjectorTypeContext::new(&values, rows, dimensions)?;
        Ok(Self {
            values,
            rows,
            dimensions,
        })
    }

    #[inline]
    fn view(&self) -> ProjectorTypeContext<'_> {
        ProjectorTypeContext::new(&self.values, self.rows, self.dimensions)
            .expect("frozen type context should remain valid")
    }
}

/// Owned row-aligned signals used by canonical materialization.
#[derive(Debug, Clone)]
pub(crate) struct FrozenCanonicalSignals {
    pub(super) importance: Box<[f64]>,
    pub(super) semantic_priority: Box<[f64]>,
    pub(super) density_mass: Box<[f64]>,
    pub(super) labels: Box<[Option<Box<str>>]>,
}

impl FrozenCanonicalSignals {
    /// Owns the four row-aligned materialization signal columns.
    #[must_use]
    pub(crate) const fn new(
        importance: Box<[f64]>,
        semantic_priority: Box<[f64]>,
        density_mass: Box<[f64]>,
        labels: Box<[Option<Box<str>>]>,
    ) -> Self {
        Self {
            importance,
            semantic_priority,
            density_mass,
            labels,
        }
    }
}

/// Owned extraction result accepted by the generation freezer.
///
/// The geometry snapshot cannot be constructed from raw identifiers outside
/// the snapshot boundary. All remaining fields are numerical or
/// presentation inputs whose shape and identity are fixed by
/// [`freeze_generation_input`].
#[derive(Debug)]
pub(crate) struct GenerationFreezeSource {
    pub geometry: GeometrySnapshot,
    pub identities: IdentityDirectory,
    pub representations: Box<[f32]>,
    pub roles: Box<[EntityRole]>,
    pub type_context: Option<FrozenProjectorTypeContext>,
    pub relation_ordinals: HashMap<VersionedUrl, ArtifactOrdinal>,
    pub relation_policies: Box<[RelationPolicy]>,
    pub relation_confidence: HashMap<EntityId, RelationConfidence>,
    pub landmark_candidates: Box<[LandmarkCandidate]>,
    pub subgroup_minimums: Box<[SubgroupMinimum]>,
    pub anchors: Box<[CoordinateSupportRow]>,
    pub signals: FrozenCanonicalSignals,
    pub models: RelationModelSources,
}

/// Opaque, owned, and fully validated input to canonical generation.
#[derive(Debug)]
pub(crate) struct FrozenGenerationInput {
    pub(super) geometry: GeometrySnapshot,
    pub(super) identities: IdentityDirectory,
    pub(super) representation_values: Box<[f32]>,
    pub(super) roles: Box<[EntityRole]>,
    pub(super) type_context: Option<FrozenProjectorTypeContext>,
    pub(super) relation_ordinals: HashMap<VersionedUrl, ArtifactOrdinal>,
    pub(super) relation_policies: Box<[RelationPolicy]>,
    pub(super) relation_confidence: HashMap<EntityId, RelationConfidence>,
    pub(super) relation_instances: Box<[AdmittedRelationInstance]>,
    pub(super) relation_snapshot_hash: ContentHash,
    pub(super) landmark_candidates: Box<[LandmarkCandidate]>,
    pub(super) subgroup_minimums: Box<[SubgroupMinimum]>,
    pub(super) anchors: Box<[CoordinateSupportRow]>,
    pub(super) signals: FrozenCanonicalSignals,
    pub(super) classifier: ModelArtifact,
    pub(super) strength_head: Option<ModelArtifact>,
}

impl FrozenGenerationInput {
    #[inline]
    pub(super) fn representations(&self) -> ProjectorEmbeddings<'_> {
        ProjectorEmbeddings::new(&self.representation_values)
            .expect("frozen projector representations should remain valid")
    }

    #[inline]
    pub(super) fn type_context(&self) -> Option<ProjectorTypeContext<'_>> {
        self.type_context
            .as_ref()
            .map(FrozenProjectorTypeContext::view)
    }
}

/// Freezes one authorized extraction into the runner's sole input capability.
///
/// Model files are opened, locked, mapped, format-checked, and retained here.
/// Relation instances are resolved only from the security-filtered geometry
/// snapshot, so later generation stages cannot accidentally consume the
/// broader visibility-authorized snapshot.
///
/// # Errors
///
/// This returns an error when a row-aligned input has the wrong length, a
/// relation policy domain is not dense, an admitted link lacks a policy or
/// confidence, an endpoint is absent, or a model artifact is invalid.
pub(crate) fn freeze_generation_input(
    source: GenerationFreezeSource,
) -> Result<FrozenGenerationInput, CanonicalGenerationError> {
    let representations = ProjectorEmbeddings::new(&source.representations)?;
    let rows = source.identities.len();
    require_rows("representations", rows, representations.len())?;
    require_rows("roles", rows, source.roles.len())?;
    if let Some(context) = &source.type_context {
        require_rows("type context", rows, context.rows)?;
    }
    require_rows("importance", rows, source.signals.importance.len())?;
    require_rows(
        "semantic priority",
        rows,
        source.signals.semantic_priority.len(),
    )?;
    require_rows("density mass", rows, source.signals.density_mass.len())?;
    require_rows("labels", rows, source.signals.labels.len())?;
    validate_relation_domain(&source.relation_ordinals, &source.relation_policies)?;

    let mut relation_confidence = HashMap::with_capacity(source.geometry.links().len());
    let relation_instances = source
        .geometry
        .links()
        .iter()
        .map(|link| {
            let relation_type = link.relation_type();
            let relation = source
                .relation_ordinals
                .get(relation_type)
                .copied()
                .ok_or_else(|| CanonicalGenerationError::RelationType {
                    relation_type: relation_type.clone(),
                })?;
            let confidence = source
                .relation_confidence
                .get(&link.link_entity())
                .copied()
                .ok_or(CanonicalGenerationError::RelationConfidence {
                    link: link.link_entity(),
                })?;
            relation_confidence.insert(link.link_entity(), confidence);
            AdmittedRelationInstance::from_authorized(
                link,
                relation,
                &source.identities,
                confidence,
            )
            .map_err(Into::into)
        })
        .collect::<Result<Box<[_]>, CanonicalGenerationError>>()?;
    let mut relation_snapshot =
        ContentHasher::new(b"hash.graph.atlas.salt.resolved-relation-snapshot.v1");
    relation_snapshot.update(source.geometry.content_hash().as_bytes());
    for instance in &relation_instances {
        relation_snapshot.update(instance.content_hash().as_bytes());
    }
    let relation_snapshot_hash = relation_snapshot.finish();

    let classifier = inspect_model(&source.models.classifier, CLASSIFIER_FORMAT)?;
    let strength_head = source
        .models
        .strength_head
        .as_deref()
        .map(|path| inspect_model(path, STRENGTH_CLASSIFIER_FORMAT))
        .transpose()?;

    Ok(FrozenGenerationInput {
        geometry: source.geometry,
        identities: source.identities,
        representation_values: source.representations,
        roles: source.roles,
        type_context: source.type_context,
        relation_ordinals: source.relation_ordinals,
        relation_policies: source.relation_policies,
        relation_confidence,
        relation_instances,
        relation_snapshot_hash,
        landmark_candidates: source.landmark_candidates,
        subgroup_minimums: source.subgroup_minimums,
        anchors: source.anchors,
        signals: source.signals,
        classifier,
        strength_head,
    })
}

fn require_rows(
    input: &'static str,
    expected: usize,
    actual: usize,
) -> Result<(), CanonicalGenerationError> {
    if actual != expected {
        return Err(CanonicalGenerationError::InputRows {
            input,
            expected,
            actual,
        });
    }
    Ok(())
}

fn validate_relation_domain(
    ordinals: &HashMap<VersionedUrl, ArtifactOrdinal>,
    policies: &[RelationPolicy],
) -> Result<(), CanonicalGenerationError> {
    if policies.len() != ordinals.len() {
        return Err(CanonicalGenerationError::RelationPolicyCount {
            expected: ordinals.len(),
            actual: policies.len(),
        });
    }
    let mut seen = HashSet::with_capacity(ordinals.len());
    for (&ordinal, relation_type) in ordinals
        .iter()
        .map(|(relation_type, ordinal)| (ordinal, relation_type))
    {
        if ordinal.as_usize() >= policies.len() {
            return Err(CanonicalGenerationError::RelationOrdinal {
                relation_type: relation_type.clone(),
                ordinal,
                policies: policies.len(),
            });
        }
        if !seen.insert(ordinal) {
            return Err(CanonicalGenerationError::DuplicateRelationOrdinal { ordinal });
        }
    }
    for (index, policy) in policies.iter().enumerate() {
        let expected = ArtifactOrdinal::try_from(index)
            .expect("validated relation policy count should fit the packed domain");
        if policy.relation != expected {
            return Err(CanonicalGenerationError::RelationPolicyOrdinal {
                index,
                actual: policy.relation,
            });
        }
    }
    Ok(())
}
