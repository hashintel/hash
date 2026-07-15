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
    format::CLASSIFIER_FORMAT,
    graph::ProjectorEmbeddings,
    hash::{ContentHash, ContentHasher},
    identity::{ArtifactOrdinal, IdentityDirectory},
    landmark::{LandmarkCandidate, SubgroupMinimum},
    manifest::{GENERATION_MANIFEST_FORMAT_VERSION, GenerationManifest},
    policy::{CoincidentGate, PlacementPosterior, PolicyEvidence, Probability, resolve},
    projector::{CoordinateSupportRow, EntityRole, ProjectorInferenceError, ProjectorTypeContext},
    relation::{AdmittedRelationInstance, RelationConfidence, RelationPolicy},
    representation::{
        CANONICAL_DIMENSIONS, CanonicalEmbedding, OwnedCanonicalEmbedding, PROJECTOR_DIMENSIONS,
        RepresentationError, canonical_corpus_hash, projector_corpus_hash,
    },
    revision::{MAX_PUBLISHED_VARIANTS, VariantId},
    snapshot::{GeometrySnapshot, SnapshotTemporalAxes},
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

/// Externally sourced provenance and governance used to begin a manifest.
///
/// Generated artifact claims are forbidden. Numerical stages populate those
/// claims only after producing and verifying the corresponding bytes.
#[derive(Debug, Clone)]
pub(crate) struct GenerationManifestContract(GenerationManifest);

impl GenerationManifestContract {
    /// Validates a manifest contract before it enters the frozen input.
    ///
    /// # Errors
    ///
    /// Returns an error when the contract contains caller-authored artifact
    /// claims.
    pub(crate) fn new(manifest: GenerationManifest) -> Result<Self, CanonicalGenerationError> {
        if manifest.format_version != GENERATION_MANIFEST_FORMAT_VERSION {
            return Err(CanonicalGenerationError::ManifestContractVersion {
                actual: manifest.format_version,
            });
        }
        if !manifest.artifacts.is_empty() {
            return Err(CanonicalGenerationError::ManifestContractArtifacts {
                actual: manifest.artifacts.len(),
            });
        }
        let variants = &manifest.variants;
        if variants.published_variant_count != variants.entries.len()
            || variants.entries.len() != 1
            || variants.maximum_published_variants != usize::from(MAX_PUBLISHED_VARIANTS)
        {
            return Err(CanonicalGenerationError::ManifestContractVariantCount {
                declared: variants.published_variant_count,
                entries: variants.entries.len(),
                maximum: variants.maximum_published_variants,
            });
        }
        if variants.canonical_variant != VariantId::CANONICAL
            || variants
                .entries
                .first()
                .is_none_or(|entry| entry.id != VariantId::CANONICAL)
        {
            return Err(CanonicalGenerationError::ManifestContractCanonical);
        }
        Ok(Self(manifest))
    }

    #[inline]
    fn begin_manifest(&self) -> GenerationManifest {
        self.0.clone()
    }
}

/// Higher-precedence policy records supplied independently of model inference.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct RelationPolicyRecords {
    human_override: Option<PlacementPosterior>,
    human_reviewed: Option<PlacementPosterior>,
    synthetic: Option<PlacementPosterior>,
}

impl RelationPolicyRecords {
    /// Creates the ordered explicit, reviewed, and synthetic policy records.
    #[must_use]
    pub(crate) const fn new(
        human_override: Option<PlacementPosterior>,
        human_reviewed: Option<PlacementPosterior>,
        synthetic: Option<PlacementPosterior>,
    ) -> Self {
        Self {
            human_override,
            human_reviewed,
            synthetic,
        }
    }

    #[inline]
    fn with_prediction(self, policy: crate::salt::classifier::ClassifierOutput) -> PolicyEvidence {
        PolicyEvidence {
            human_override: self.human_override,
            human_reviewed: self.human_reviewed,
            synthetic: self.synthetic,
            classifier: Some(policy),
        }
    }
}

/// Relation-card evidence from which the freezer derives one resolved policy.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RelationPolicyInput {
    relation: ArtifactOrdinal,
    records: RelationPolicyRecords,
    embedding: OwnedCanonicalEmbedding,
    strength: crate::salt::strength::RelationStrength,
}

impl RelationPolicyInput {
    /// Creates one dense policy input with a validated full relation-card embedding.
    #[must_use]
    pub(crate) const fn new(
        relation: ArtifactOrdinal,
        records: RelationPolicyRecords,
        embedding: OwnedCanonicalEmbedding,
        strength: crate::salt::strength::RelationStrength,
    ) -> Self {
        Self {
            relation,
            records,
            embedding,
            strength,
        }
    }
}

/// Owned extraction result accepted by the generation freezer.
///
/// The geometry snapshot cannot be constructed from raw identifiers outside
/// the snapshot boundary. All remaining fields are numerical or
/// presentation inputs whose shape and identity are fixed by
/// [`freeze_generation_input`].
#[derive(Debug, Clone)]
pub(crate) struct GenerationFreezeSource {
    pub manifest_contract: GenerationManifestContract,
    pub geometry: GeometrySnapshot,
    pub identities: IdentityDirectory,
    pub canonical_embeddings: Box<[f32]>,
    pub roles: Box<[EntityRole]>,
    pub type_context: Option<FrozenProjectorTypeContext>,
    pub relation_ordinals: HashMap<VersionedUrl, ArtifactOrdinal>,
    pub relation_policy_inputs: Box<[RelationPolicyInput]>,
    pub relation_confidence: HashMap<EntityId, RelationConfidence>,
    pub landmark_candidates: Box<[LandmarkCandidate]>,
    pub subgroup_minimums: Box<[SubgroupMinimum]>,
    pub anchors: Box<[CoordinateSupportRow]>,
    pub signals: FrozenCanonicalSignals,
    pub models: RelationModelSources,
}

/// Extracted generation data awaiting permission and relation-security admission.
#[derive(Debug, Clone)]
pub(crate) struct StoreBackedGenerationSource {
    pub manifest_contract: GenerationManifestContract,
    pub identities: IdentityDirectory,
    pub canonical_embeddings: Box<[f32]>,
    pub roles: Box<[EntityRole]>,
    pub type_context: Option<FrozenProjectorTypeContext>,
    pub relation_ordinals: HashMap<VersionedUrl, ArtifactOrdinal>,
    pub relation_policy_inputs: Box<[RelationPolicyInput]>,
    pub relation_confidence: HashMap<EntityId, RelationConfidence>,
    pub landmark_candidates: Box<[LandmarkCandidate]>,
    pub subgroup_minimums: Box<[SubgroupMinimum]>,
    pub anchors: Box<[CoordinateSupportRow]>,
    pub signals: FrozenCanonicalSignals,
    pub models: RelationModelSources,
}

impl StoreBackedGenerationSource {
    #[must_use]
    pub(super) fn matches_temporal_axes(&self, temporal_axes: &SnapshotTemporalAxes) -> bool {
        temporal_axes.matches(&self.manifest_contract.0.input_snapshot)
    }

    pub(super) fn authorize(self, geometry: GeometrySnapshot) -> GenerationFreezeSource {
        GenerationFreezeSource {
            manifest_contract: self.manifest_contract,
            geometry,
            identities: self.identities,
            canonical_embeddings: self.canonical_embeddings,
            roles: self.roles,
            type_context: self.type_context,
            relation_ordinals: self.relation_ordinals,
            relation_policy_inputs: self.relation_policy_inputs,
            relation_confidence: self.relation_confidence,
            landmark_candidates: self.landmark_candidates,
            subgroup_minimums: self.subgroup_minimums,
            anchors: self.anchors,
            signals: self.signals,
            models: self.models,
        }
    }
}

/// Opaque, owned, and fully validated input to canonical generation.
#[derive(Debug)]
pub(crate) struct FrozenGenerationInput {
    pub(super) manifest_contract: GenerationManifestContract,
    pub(super) geometry: GeometrySnapshot,
    pub(super) identities: IdentityDirectory,
    pub(super) canonical_embedding_hash: ContentHash,
    pub(super) projector_representation_hash: ContentHash,
    pub(super) canonical_embedding_values: Box<[f32]>,
    pub(super) representation_values: Box<[f32]>,
    pub(super) roles: Box<[EntityRole]>,
    pub(super) type_context: Option<FrozenProjectorTypeContext>,
    pub(super) relation_ordinals: HashMap<VersionedUrl, ArtifactOrdinal>,
    pub(super) relation_policy_input_hash: ContentHash,
    pub(super) relation_policies: Box<[RelationPolicy]>,
    pub(super) relation_confidence: HashMap<EntityId, RelationConfidence>,
    pub(super) relation_instances: Box<[AdmittedRelationInstance]>,
    pub(super) relation_snapshot_hash: ContentHash,
    pub(super) landmark_candidates: Box<[LandmarkCandidate]>,
    pub(super) subgroup_minimums: Box<[SubgroupMinimum]>,
    pub(super) anchors: Box<[CoordinateSupportRow]>,
    pub(super) signals: FrozenCanonicalSignals,
    pub(super) classifier: ModelArtifact,
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

    #[inline]
    pub(super) fn begin_manifest(&self) -> GenerationManifest {
        self.manifest_contract.begin_manifest()
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
#[expect(
    clippy::too_many_lines,
    reason = "freezing validates every owned input before constructing the opaque generation \
              capability"
)]
pub(crate) fn freeze_generation_input(
    mut source: GenerationFreezeSource,
) -> Result<FrozenGenerationInput, CanonicalGenerationError> {
    let (canonical_embeddings, remainder) = source
        .canonical_embeddings
        .as_chunks::<CANONICAL_DIMENSIONS>();
    if !remainder.is_empty() {
        return Err(
            crate::salt::representation::RepresentationError::Dimensions {
                expected: CANONICAL_DIMENSIONS,
                actual: remainder.len(),
            }
            .into(),
        );
    }
    let rows = source.identities.len();
    validate_and_sort_anchors(&mut source.anchors, rows)?;
    let classifier = inspect_model(&source.models.classifier, CLASSIFIER_FORMAT)?;
    if source.manifest_contract.0.relations.security_mode != source.geometry.mode() {
        return Err(CanonicalGenerationError::SecurityPolicy);
    }
    source
        .manifest_contract
        .0
        .input_snapshot
        .authorization_revision = source.geometry.authorization_revision();
    require_rows("canonical embeddings", rows, canonical_embeddings.len())?;
    let (canonical_embedding_hash, projector_representation_hash, representation_values) =
        derive_representations(canonical_embeddings)?;
    let representations = ProjectorEmbeddings::new(&representation_values)?;
    require_rows("representations", rows, representations.len())?;
    require_rows("roles", rows, source.roles.len())?;
    require_rows(
        "landmark candidates",
        rows,
        source.landmark_candidates.len(),
    )?;
    let stratification_input_hash =
        representation_stratification_hash(&source.landmark_candidates, &source.roles)?;
    source
        .manifest_contract
        .0
        .embedding
        .representation_audit
        .validate(
            &source.canonical_embeddings,
            &representation_values,
            source.identities.content_hash(),
            stratification_input_hash,
        )?;
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
    let coincident_gate = coincident_gate(&source.manifest_contract.0)?;
    let (relation_policies, relation_policy_input_hash) = derive_relation_policies(
        &source.relation_policy_inputs,
        classifier.classifier(),
        coincident_gate,
    )?;
    validate_relation_domain(&source.relation_ordinals, &relation_policies)?;
    validate_strength_control(&source.models, &relation_policies)?;

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

    Ok(FrozenGenerationInput {
        manifest_contract: source.manifest_contract,
        geometry: source.geometry,
        identities: source.identities,
        canonical_embedding_hash,
        projector_representation_hash,
        canonical_embedding_values: source.canonical_embeddings,
        representation_values,
        roles: source.roles,
        type_context: source.type_context,
        relation_ordinals: source.relation_ordinals,
        relation_policy_input_hash,
        relation_policies,
        relation_confidence,
        relation_instances,
        relation_snapshot_hash,
        landmark_candidates: source.landmark_candidates,
        subgroup_minimums: source.subgroup_minimums,
        anchors: source.anchors,
        signals: source.signals,
        classifier,
    })
}

fn validate_and_sort_anchors(
    anchors: &mut [CoordinateSupportRow],
    rows: usize,
) -> Result<(), CanonicalGenerationError> {
    anchors.sort_unstable_by(|left, right| {
        left.row
            .cmp(&right.row)
            .then_with(|| left.target[0].total_cmp(&right.target[0]))
            .then_with(|| left.target[1].total_cmp(&right.target[1]))
            .then_with(|| left.radius.total_cmp(&right.radius))
            .then_with(|| left.weight.total_cmp(&right.weight))
    });
    for anchor in anchors {
        if anchor.row.as_usize() >= rows {
            return Err(CanonicalGenerationError::AnchorRow {
                row: anchor.row.as_u32(),
                rows,
            });
        }
        for (field, value, nonnegative) in [
            ("target-x", anchor.target[0], false),
            ("target-y", anchor.target[1], false),
            ("radius", anchor.radius, true),
            ("weight", anchor.weight, true),
        ] {
            if !value.is_finite()
                || value.abs() > f64::from(f32::MAX)
                || (nonnegative && value.is_sign_negative())
            {
                return Err(CanonicalGenerationError::AnchorScalar {
                    row: anchor.row.as_u32(),
                    field,
                    value,
                });
            }
        }
    }
    Ok(())
}

fn derive_representations(
    rows: &[[f32; CANONICAL_DIMENSIONS]],
) -> Result<(ContentHash, ContentHash, Box<[f32]>), RepresentationError> {
    let mut representations = Vec::with_capacity(rows.len() * PROJECTOR_DIMENSIONS);
    for row in rows {
        let embedding = CanonicalEmbedding::new(row)?;
        let mut prefix = [0.0_f32; PROJECTOR_DIMENSIONS];
        let _normalization = embedding.normalize_prefix(&mut prefix);
        representations.extend_from_slice(&prefix);
    }
    let canonical_hash = canonical_corpus_hash(rows.as_flattened());
    let projector_hash = projector_corpus_hash(&representations);
    Ok((
        canonical_hash,
        projector_hash,
        representations.into_boxed_slice(),
    ))
}

fn derive_relation_policies(
    inputs: &[RelationPolicyInput],
    classifier: crate::salt::classifier::ClassifierView<'_>,
    gate: CoincidentGate,
) -> Result<(Box<[RelationPolicy]>, ContentHash), CanonicalGenerationError> {
    let mut input_hash = ContentHasher::new(b"hash.graph.atlas.salt.relation-policy-input.v1");
    let policies = inputs
        .iter()
        .map(|input| {
            input_hash.update(&input.relation.as_u32().to_le_bytes());
            for posterior in [
                input.records.human_override,
                input.records.human_reviewed,
                input.records.synthetic,
            ] {
                input_hash.update(&[u8::from(posterior.is_some())]);
                if let Some(posterior) = posterior {
                    for value in [
                        posterior.coincident.get(),
                        posterior.proximal.get(),
                        posterior.overlay.get(),
                    ] {
                        input_hash.update(&value.to_bits().to_le_bytes());
                    }
                }
            }
            for value in input.embedding.as_array() {
                input_hash.update(&value.to_bits().to_le_bytes());
            }
            input_hash.update(&input.strength.get().to_bits().to_le_bytes());
            let prediction = classifier.predict(input.embedding.as_borrowed())?;
            let policy = resolve(input.records.with_prediction(prediction), gate);
            Ok(RelationPolicy {
                relation: input.relation,
                policy,
                strength: input.strength,
            })
        })
        .collect::<Result<Box<[_]>, CanonicalGenerationError>>()?;
    Ok((policies, input_hash.finish()))
}

fn coincident_gate(
    manifest: &GenerationManifest,
) -> Result<CoincidentGate, CanonicalGenerationError> {
    let gate = manifest.relations.coincident_gate;
    let minimum_probability =
        Probability::new(gate.class_probability_threshold).map_err(|_error| {
            CanonicalGenerationError::CoincidentGateThreshold {
                field: "class-probability",
                value: gate.class_probability_threshold,
            }
        })?;
    let minimum_applicability =
        Probability::new(gate.applicability_threshold).map_err(|_error| {
            CanonicalGenerationError::CoincidentGateThreshold {
                field: "applicability",
                value: gate.applicability_threshold,
            }
        })?;
    Ok(CoincidentGate {
        enabled: gate.enabled,
        minimum_probability,
        minimum_applicability,
    })
}

#[expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform stratification identities require little-endian scalars"
)]
pub(super) fn representation_stratification_hash(
    candidates: &[LandmarkCandidate],
    roles: &[EntityRole],
) -> Result<ContentHash, CanonicalGenerationError> {
    let mut ordered = candidates.iter().collect::<Vec<_>>();
    ordered.sort_unstable_by_key(|candidate| candidate.row);
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.representation-stratification.v1");
    for (position, candidate) in ordered.into_iter().enumerate() {
        if candidate.row.as_usize() != position {
            return Err(CanonicalGenerationError::StratificationRow {
                position,
                row: candidate.row.as_u32(),
            });
        }
        let role = roles[position].index();
        if candidate.entity_role != role {
            return Err(CanonicalGenerationError::StratificationRole {
                row: candidate.row.as_u32(),
                expected: role,
                actual: candidate.entity_role,
            });
        }
        hasher.update(&candidate.row.as_u32().to_le_bytes());
        hasher.update(&candidate.sampling_weight.to_bits().to_le_bytes());
        for value in [
            candidate.density,
            candidate.language,
            candidate.source,
            candidate.entity_role,
            candidate.type_family,
            candidate.community,
            candidate.temporal_cohort,
        ] {
            hasher.update(&value.to_le_bytes());
        }
        hasher.update(&[u8::from(candidate.prior_landmark)]);
    }
    Ok(hasher.finish())
}

const fn require_rows(
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
        let expected = ArtifactOrdinal::try_from(index).map_err(|_error| {
            CanonicalGenerationError::RelationPolicyCapacity {
                count: policies.len(),
            }
        })?;
        if policy.relation != expected {
            return Err(CanonicalGenerationError::RelationPolicyOrdinal {
                index,
                actual: policy.relation,
            });
        }
    }
    Ok(())
}

fn validate_strength_control(
    models: &RelationModelSources,
    policies: &[RelationPolicy],
) -> Result<(), CanonicalGenerationError> {
    if models.strength_head.is_some() {
        return Err(CanonicalGenerationError::StrengthHeadUnsupported);
    }
    if let Some(policy) = policies
        .iter()
        .find(|policy| policy.strength != crate::salt::strength::RelationStrength::UNIT)
    {
        return Err(CanonicalGenerationError::NonUnitStrengthWithoutHead {
            relation: policy.relation,
            strength: policy.strength.get(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests;
