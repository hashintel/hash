use core::{num::NonZeroUsize, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use burn::backend::{Autodiff, NdArray, ndarray::NdArrayDevice};
use camino::Utf8Path;
use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId, EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    activation::FileActivationStore,
    analytic::{MergeTreeConfig, RasterConfig, RegionConfig},
    evaluation::{ConditionDomain, ConditionMeasurementConfig},
    format::CLASSIFIER_FORMAT,
    generation::{
        CanonicalMaterializationConfig, ConditionQuality, ConditionQualityEvaluationError,
        ConditionQualityEvaluator, FrozenCanonicalSignals, GenerationFreezeSource,
        GenerationManifestContract, PersistedCondition, PersistedConditionQuality,
        PersistenceDiagnostics, PersistenceEvaluationError, PersistenceEvaluationSubject,
        PersistenceGatePolicy, PersistenceQualityEvaluator, ProjectedCondition,
        RelationModelSources, RelationPolicyInput, RelationPolicyRecords, activate_generation,
    },
    graph::{SemanticGraphConfig, USearchConfig},
    hash::ContentHash,
    identity::{ArtifactOrdinal, GenerationRowId, IdentityDirectory},
    landmark::{LandmarkCandidate, LandmarkConfig, LandmarkFitConfig},
    manifest::{ArtifactRole, RelationSecurityMode, tests::fixture_manifest},
    materialize::{CoordinateBounds, ImportanceConfig},
    policy::{PlacementPosterior, Probability},
    projector::{
        EntityRole, GradientBudget, HardNegativeConfig, LossWeights, ProjectorBatchPlanConfig,
        ProjectorConfig, ProjectorLossConfig, ProjectorOptimizerConfig, RelationEnergy,
        SemanticAffinity, SupportEnergy,
    },
    relation::{AttractionConfig, ProtectionConfig, RelationConfidence},
    release::test_support::signer,
    representation::{
        AUDITED_PREFIX_DIMENSIONS, CanonicalEmbedding, OwnedCanonicalEmbedding,
        PROJECTOR_DIMENSIONS, RepresentationAuditReport, canonical_corpus_hash, prefix_corpus_hash,
        projector_corpus_hash,
    },
    revision::AuthorizationRevision,
    snapshot::{
        AuthorizedSnapshot, EntityAtEdition, LinkCandidate, RelationSecurityPolicy, authorize_link,
        authorize_relation_geometry,
    },
    storage::mmap::{ArtifactSection, SectionId, publish_artifact},
    strength::RelationStrength,
};

const ROWS: usize = 32;

type TrainBackend = Autodiff<NdArray>;

#[test]
fn durable_directory_creates_and_reaccepts_a_missing_parent_chain() {
    let temporary = tempfile::tempdir().expect("temporary directory should create");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let nested = root.join("first/second/third");

    super::run::ensure_durable_directory(&nested)
        .expect("missing parent chain should be durably created");
    super::run::ensure_durable_directory(&nested)
        .expect("an existing directory should be durably re-synchronized");

    assert!(nested.is_dir());
}

#[test]
fn durable_directory_rejects_a_file_component() {
    let temporary = tempfile::tempdir().expect("temporary directory should create");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let file = root.join("not-a-directory");
    std::fs::write(&file, b"fixture").expect("fixture file should write");

    let error = super::run::ensure_durable_directory(&file.join("child"))
        .expect_err("a file component must fail closed");

    assert_matches!(
        error.kind(),
        std::io::ErrorKind::AlreadyExists | std::io::ErrorKind::NotADirectory
    ));
}

#[derive(Debug)]
struct FixtureConditionQualityEvaluator;

impl ConditionQualityEvaluator for FixtureConditionQualityEvaluator {
    fn suite_version(&self) -> &str {
        "fixture-condition-quality-v1"
    }

    fn contract_hash(&self) -> crate::salt::hash::ContentHash {
        crate::salt::hash::ContentHash::digest(b"fixture-condition-quality-evaluator-v1")
    }

    fn evaluate(
        &self,
        fields: &[ProjectedCondition],
    ) -> Result<Vec<ConditionQuality>, ConditionQualityEvaluationError> {
        Ok(fields
            .iter()
            .map(|field| {
                let mut semantic =
                    crate::salt::hash::ContentHasher::new(b"fixture-semantic-fidelity-report-v1");
                semantic.update(field.content_hash().as_bytes());
                let mut task = crate::salt::hash::ContentHasher::new(b"fixture-task-report-v1");
                task.update(field.content_hash().as_bytes());
                ConditionQuality::new(
                    field.content_hash(),
                    semantic.finish(),
                    task.finish(),
                    0.99,
                    1.0,
                )
            })
            .collect())
    }

    fn evaluate_persisted(
        &self,
        field: PersistedCondition<'_>,
    ) -> Result<PersistedConditionQuality, ConditionQualityEvaluationError> {
        if field.coordinates().len() != ROWS || !field.condition().is_finite() {
            return Err(ConditionQualityEvaluationError::new(
                "fixture received an invalid persisted field",
            ));
        }
        let semantic = gate_report(self.suite_version());
        let subgroup = gate_report(self.suite_version());
        let measurement = ConditionQuality::new(
            field.content_hash(),
            ContentHash::digest(&semantic),
            ContentHash::digest(&subgroup),
            0.99,
            1.0,
        );
        PersistedConditionQuality::new(measurement, semantic, subgroup)
    }
}

static CONDITION_QUALITY_EVALUATOR: FixtureConditionQualityEvaluator =
    FixtureConditionQualityEvaluator;

#[derive(Debug)]
struct FixturePersistenceQualityEvaluator;

impl PersistenceQualityEvaluator for FixturePersistenceQualityEvaluator {
    fn suite_version(&self) -> &str {
        "fixture-persistence-quality-v1"
    }

    fn contract_hash(&self) -> crate::salt::hash::ContentHash {
        crate::salt::hash::ContentHash::digest(b"fixture-persistence-evaluator-v1")
    }

    fn evaluate(
        &self,
        subject: PersistenceEvaluationSubject<'_>,
    ) -> Result<PersistenceDiagnostics, PersistenceEvaluationError> {
        let report_hash = |domain: &[u8]| {
            let mut hasher = crate::salt::hash::ContentHasher::new(domain);
            hasher.update(subject.checkpoint_hash.as_bytes());
            hasher.update(subject.field_hash.as_bytes());
            hasher.update(subject.candidate_tree.content_hash().as_bytes());
            hasher.update(subject.reference_tree.content_hash().as_bytes());
            hasher.update(subject.reference_source_hash.as_bytes());
            hasher.finish()
        };
        Ok(PersistenceDiagnostics {
            candidate_low_persistence_mass: 0.0,
            reference_low_persistence_mass: 0.0,
            candidate_noise_persistence: 0.0,
            reference_noise_persistence: 0.0,
            planted_shape_cases: 6,
            planted_shape_failures: 0,
            distribution_report_hash: report_hash(b"fixture-persistence-distributions-v1"),
            planted_shape_report_hash: report_hash(b"fixture-persistence-planted-v1"),
            noise_report_hash: report_hash(b"fixture-persistence-noise-v1"),
        })
    }
}

static PERSISTENCE_QUALITY_EVALUATOR: FixturePersistenceQualityEvaluator =
    FixturePersistenceQualityEvaluator;
const PERSISTENCE_THRESHOLDS: &[f64] = &[1.0e-6];

#[test]
fn external_authority_rejects_runner_derived_gates() {
    let issuer = crate::salt::release::test_support::TestExternalGateGrantIssuer::new();
    let result = crate::salt::release::TrustedExternalGateAuthority::new(
        crate::salt::release::GateId::AnnRecall,
        &issuer,
        signer().verifier(),
    );

    assert_matches!(
        result,
        Err(crate::salt::release::GateEvidenceError::Failed {
            gate: crate::salt::release::GateId::AnnRecall,
            ..
        })
    ));
}

#[test]
fn release_authority_requires_an_independent_authorization_suite() {
    let release_signer = signer();
    let issuer = crate::salt::release::test_support::TestExternalGateGrantIssuer::new();
    let mut authorities = crate::salt::release::test_support::external_authorities(&issuer);
    authorities.retain(|authority| {
        authority.gate() != crate::salt::release::GateId::AuthorizationNoninterference
    });

    assert_matches!(
        CanonicalReleaseAuthority::new(&release_signer, authorities),
        Err(crate::salt::release::GateEvidenceError::Missing {
            gate: crate::salt::release::GateId::AuthorizationNoninterference,
        })
    ));
}

#[test]
fn model_copy_uses_the_exact_frozen_mapping_after_path_replacement() {
    let temporary = tempfile::tempdir().expect("temporary directory should exist");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let source = root.join("source.salt");
    let destination = root.join("published.salt");
    publish_classifier_fixture(&source);
    let frozen = super::artifact::inspect_model(&source, CLASSIFIER_FORMAT)
        .expect("source model should freeze");
    let expected_hash = frozen.content_hash;
    std::fs::remove_file(&source).expect("frozen source path should be replaceable");
    std::fs::write(&source, b"replacement path contents")
        .expect("source path should be replaceable");

    let published = super::artifact::copy_model(&frozen, &destination, CLASSIFIER_FORMAT)
        .expect("copy should use the retained mapping");

    assert_eq!(published.content_hash, expected_hash);
    assert_eq!(
        super::artifact::inspect_model(&destination, CLASSIFIER_FORMAT)
            .expect("published model should remain valid")
            .content_hash,
        expected_hash
    );
}

#[test]
fn generation_contract_is_order_canonical_and_excludes_derived_outputs() {
    let manifest = fixture_manifest();
    let expected = super::identity::manifest_contract_hash(&manifest);

    let mut reordered = manifest.clone();
    reordered.serving.wire_versions.reverse();
    assert_eq!(
        super::identity::manifest_contract_hash(&reordered),
        expected
    );

    let mut derived_output = manifest.clone();
    derived_output.semantic_graph.graph_hash =
        crate::salt::hash::ContentHash::digest(b"different generated graph");
    assert_eq!(
        super::identity::manifest_contract_hash(&derived_output),
        expected
    );

    let mut governance = manifest.clone();
    governance.relations.annotation_corpus_hash =
        crate::salt::hash::ContentHash::digest(b"different annotation corpus");
    assert_ne!(
        super::identity::manifest_contract_hash(&governance),
        expected
    );

    let mut timestamped = manifest;
    timestamped.created_at = "2026-07-15T12:00:00Z"
        .parse()
        .expect("fixture timestamp should parse");
    assert_ne!(
        super::identity::manifest_contract_hash(&timestamped),
        expected,
    );
}

#[test]
fn runner_publishes_inactive_candidate_then_activation_survives_restart() {
    let temporary = tempfile::tempdir().expect("temporary generation root should create");
    let temporary_root =
        Utf8Path::from_path(temporary.path()).expect("temporary root should be UTF-8");
    let generation_root = temporary_root.join("nested/generation/root");
    let root = generation_root.as_path();
    let entities = (0..ROWS)
        .map(|row| entity(100 + u128::try_from(row).expect("row should fit u128") * 10))
        .collect::<Vec<_>>();
    let identities =
        IdentityDirectory::new(entities.clone()).expect("generation entities should be unique");
    let selected_editions = entities
        .iter()
        .enumerate()
        .map(|(row, &entity)| {
            edition(
                entity,
                30_000 + u128::try_from(row).expect("row should fit u128"),
            )
        })
        .collect::<Vec<_>>();
    let representation_values = representations();
    let mut canonical_embeddings =
        Vec::with_capacity(ROWS * crate::salt::representation::CANONICAL_DIMENSIONS);
    for row in representation_values.chunks_exact(crate::salt::representation::PROJECTOR_DIMENSIONS)
    {
        canonical_embeddings.extend_from_slice(row);
        canonical_embeddings.resize(
            canonical_embeddings.len() + crate::salt::representation::CANONICAL_DIMENSIONS
                - crate::salt::representation::PROJECTOR_DIMENSIONS,
            0.0,
        );
    }
    let roles = [EntityRole::KnowledgeEntity; ROWS];

    let relation_type =
        VersionedUrl::from_str("https://hash.ai/@example/types/entity-type/related-to/v/1")
            .expect("relation type should parse");
    let link_entity = entity(10_000);
    let link = edition(link_entity, 20_000);
    let left = edition(entities[0], 20_001);
    let right = edition(entities[ROWS - 1], 20_002);
    let required_types = [relation_type.clone()];
    let candidate = LinkCandidate::for_test(link, left, right, &relation_type, &required_types);
    let permissions = [link, left, right]
        .into_iter()
        .map(|value| (value.entity_id, vec![value.edition_id]))
        .collect::<HashMap<_, _>>();
    let authorized = authorize_link(
        candidate,
        &permissions,
        &HashSet::from([relation_type.clone()]),
    )
    .expect("fixture link should be visible");
    let snapshot = AuthorizedSnapshot::from_authorized_links(
        vec![authorized],
        AuthorizationRevision::new(ContentHash::digest(b"fixture-authorization-revision")),
    );
    let relation_security = RelationSecurityPolicy::for_test(
        RelationSecurityMode::AllSnapshotLinks,
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
    );
    let ordinal = ArtifactOrdinal::try_from(0_u32).expect("zero ordinal should validate");
    let unauthorized_relation_type =
        VersionedUrl::from_str("https://hash.ai/@secret/types/entity-type/private-link/v/1")
            .expect("unauthorized relation type should parse");
    let unauthorized_ordinal =
        ArtifactOrdinal::try_from(1_u32).expect("one ordinal should validate");
    let relation_ordinals = HashMap::from([
        (relation_type.clone(), ordinal),
        (unauthorized_relation_type.clone(), unauthorized_ordinal),
    ]);
    let relation_policy_inputs = [
        RelationPolicyInput::new(
            ordinal,
            RelationPolicyRecords::new(
                Some(
                    PlacementPosterior::new(0.0, 1.0, 0.0)
                        .expect("proximal posterior should validate"),
                ),
                None,
                None,
            ),
            OwnedCanonicalEmbedding::from_vec(
                canonical_embeddings[..crate::salt::representation::CANONICAL_DIMENSIONS].to_vec(),
            )
            .expect("relation-card embedding should validate"),
            RelationStrength::UNIT,
        ),
        RelationPolicyInput::new(
            unauthorized_ordinal,
            RelationPolicyRecords::new(
                Some(
                    PlacementPosterior::new(0.0, 0.0, 1.0)
                        .expect("overlay posterior should validate"),
                ),
                None,
                None,
            ),
            OwnedCanonicalEmbedding::from_vec(
                canonical_embeddings[..crate::salt::representation::CANONICAL_DIMENSIONS].to_vec(),
            )
            .expect("private relation-card embedding should validate"),
            RelationStrength::UNIT,
        ),
    ];
    let relation_confidence = HashMap::from([(link_entity, RelationConfidence::default())]);
    let landmark_candidates = landmark_candidates();
    let importance = vec![1.0; ROWS];
    let semantic_priority = vec![1.0; ROWS];
    let density_mass = vec![1.0; ROWS];
    let labels = vec![None::<Box<str>>; ROWS];
    let classifier = temporary_root.join("input-classifier.salt");
    publish_classifier_fixture(&classifier);

    let mut manifest = fixture_manifest();
    manifest.relations.classifier_model_hash =
        super::artifact::inspect_model(&classifier, CLASSIFIER_FORMAT)
            .expect("classifier fixture should freeze")
            .content_hash;
    let mut projector_values = Vec::with_capacity(ROWS * PROJECTOR_DIMENSIONS);
    for row in canonical_embeddings.chunks_exact(crate::salt::representation::CANONICAL_DIMENSIONS)
    {
        let mut prefix = [0.0_f32; PROJECTOR_DIMENSIONS];
        let _normalization = CanonicalEmbedding::new(row)
            .expect("fixture canonical embedding should validate")
            .normalize_prefix(&mut prefix);
        projector_values.extend_from_slice(&prefix);
    }
    let canonical_hash = canonical_corpus_hash(&canonical_embeddings);
    let projector_hash = projector_corpus_hash(&projector_values);
    manifest.embedding.canonical_corpus_hash = canonical_hash;
    manifest.embedding.projector_corpus_hash = projector_hash;
    manifest.embedding.representation_audit = RepresentationAuditReport {
        suite_version: "representation-audit-v1".to_owned(),
        canonical_corpus_hash: canonical_hash,
        projector_corpus_hash: projector_hash,
        identity_directory_hash: identities.content_hash(),
        stratification_input_hash: super::input::representation_stratification_hash(
            &landmark_candidates,
            &roles,
        )
        .expect("fixture stratification inputs should validate"),
        prefix_corpus_hashes: AUDITED_PREFIX_DIMENSIONS
            .map(|dimensions| prefix_corpus_hash(&canonical_embeddings, dimensions)),
        query_sample_hash: crate::salt::hash::ContentHash::digest(b"runner-audit-sample"),
        sample_rows: ROWS,
        overall_recall: [[0.9; 3]; 4],
        stratified_report_hash: crate::salt::hash::ContentHash::digest(b"runner-audit-strata"),
        diagnostic_report_hash: crate::salt::hash::ContentHash::digest(b"runner-audit-diagnostics"),
        clump_report_hash: crate::salt::hash::ContentHash::digest(b"runner-audit-clumps"),
    };
    manifest.relations.security_mode = RelationSecurityMode::AllSnapshotLinks;
    manifest.relations.strength_head.enabled = false;
    manifest.artifacts.clear();
    let representation_report = gate_report(&manifest.embedding.representation_audit.suite_version);
    let relation_report = gate_report(&manifest.relations.policy_precedence_version);
    let security_report = gate_report(&manifest.serving.authorization_adapter_version);
    let companion_report = gate_report(&manifest.serving.canvas_companion_version);
    let gate_signer = signer();
    let external_issuer = crate::salt::release::test_support::TestExternalGateGrantIssuer::new();
    let conditions = [0.0_f32, 0.1];
    let grid_depths = [2_u8, 4, 8];
    let mut source = GenerationFreezeSource {
        manifest_contract: GenerationManifestContract::new(manifest)
            .expect("fixture contract should not contain generated artifacts"),
        geometry: authorize_relation_geometry(&snapshot, &relation_security),
        identities,
        selected_editions: selected_editions.into_boxed_slice(),
        canonical_embeddings: canonical_embeddings.into_boxed_slice(),
        representation_values: projector_values.into_boxed_slice(),
        roles: roles.into(),
        type_context: None,
        relation_ordinals,
        relation_policy_inputs: relation_policy_inputs.into(),
        relation_confidence,
        landmark_candidates: landmark_candidates.into_boxed_slice(),
        subgroup_minimums: Box::new([]),
        anchors: Box::new([]),
        signals: FrozenCanonicalSignals::new(
            importance.into_boxed_slice(),
            semantic_priority.into_boxed_slice(),
            density_mass.into_boxed_slice(),
            labels.into_boxed_slice(),
        ),
        models: RelationModelSources {
            classifier,
            strength_head: None,
        },
        external_gate_reports: ExternalGateReportDocuments::new(
            representation_report,
            relation_report,
            security_report,
            companion_report,
        ),
    };
    source.bind_local_authorization_attestation(snapshot.rejection_counts());
    let mut reproduction_source = source.clone();
    let placeholder = &mut reproduction_source
        .manifest_contract
        .manifest_mut()
        .relations
        .negative_admission
        .protect_ordinary_negatives;
    *placeholder = !*placeholder;
    let release_authority = CanonicalReleaseAuthority::new(
        &gate_signer,
        crate::salt::release::test_support::external_authorities(&external_issuer),
    )
    .expect("external authorities should be scoped");
    let outcome = run_canonical_generation::<TrainBackend>(
        source,
        &generation_config(root, &conditions, &grid_depths),
        &release_authority,
        &NdArrayDevice::Cpu,
    )
    .expect("complete canonical generation should publish");
    let relation_artifact = std::fs::read(outcome.directory.join("relations.salt"))
        .expect("relation artifact should be readable");
    let unauthorized_relation_type = unauthorized_relation_type.to_string();
    assert!(
        !relation_artifact
            .windows(unauthorized_relation_type.len())
            .any(|window| window == unauthorized_relation_type.as_bytes()),
        "authorization-rejected relation types must not enter published policy artifacts"
    );
    let stored_manifest = std::fs::read(outcome.directory.join("manifest.json"))
        .expect("manifest should be readable");
    let decoded: crate::salt::manifest::GenerationManifest =
        serde_json::from_slice(&stored_manifest).expect("published manifest should decode");
    let canonical_manifest = decoded
        .canonical_bytes()
        .expect("decoded manifest should serialize");
    if stored_manifest != canonical_manifest {
        let mismatch = stored_manifest
            .iter()
            .zip(&canonical_manifest)
            .position(|(stored, canonical)| stored != canonical)
            .unwrap_or(stored_manifest.len().min(canonical_manifest.len()));
        let start = mismatch.saturating_sub(48);
        let stored_end = (mismatch + 96).min(stored_manifest.len());
        let canonical_end = (mismatch + 96).min(canonical_manifest.len());
        panic!(
            "manifest changed after decoding at byte {mismatch}: stored={:?}, canonical={:?}",
            String::from_utf8_lossy(&stored_manifest[start..stored_end]),
            String::from_utf8_lossy(&canonical_manifest[start..canonical_end]),
        );
    }
    let reproduction_root = root.join("independent-reproduction");
    let reproduced = run_canonical_generation::<TrainBackend>(
        reproduction_source,
        &generation_config(&reproduction_root, &conditions, &grid_depths),
        &release_authority,
        &NdArrayDevice::Cpu,
    )
    .expect("independent reproduction should publish");
    assert_eq!(outcome.manifest, reproduced.manifest);
    assert_ne!(
        outcome.manifest.reproducibility.binary_fingerprint,
        crate::salt::hash::ContentHash::digest(b"generation-binary"),
        "the runner must replace the caller's executable placeholder"
    );
    assert_eq!(
        outcome
            .manifest
            .reproducibility
            .execution_contract
            .training_backend,
        "autodiff<ndarray>"
    );
    assert_eq!(
        outcome
            .manifest
            .reproducibility
            .execution_contract
            .accelerator_device_ordinal,
        0,
        "test-device ordinal should be bound into the execution contract"
    );
    assert_eq!(
        outcome
            .manifest
            .reproducibility
            .execution_contract
            .contract_hash,
        outcome
            .manifest
            .reproducibility
            .execution_contract
            .content_hash()
    );
    assert_ne!(
        outcome.manifest.reproducibility.config_hash,
        crate::salt::hash::ContentHash::digest(b"config"),
        "the runner must replace the caller's runtime configuration placeholder"
    );
    assert!(
        outcome
            .manifest
            .reproducibility
            .seeds
            .iter()
            .all(|seed| seed.name != "projector" && seed.name != "landmarks"),
        "the runner must replace caller-authored seed entries"
    );
    assert!(!outcome.manifest.relations.strength_head.enabled);
    assert_eq!(
        outcome.manifest.relations.strength_head.model_hash,
        crate::salt::hash::ContentHash::digest(b"hash.graph.atlas.salt.unit-strength.v1"),
    );
    let canonical = outcome
        .manifest
        .variants
        .entries
        .iter()
        .find(|variant| variant.id == outcome.manifest.variants.canonical_variant)
        .expect("canonical variant should exist");
    assert_eq!(
        canonical.projected_field_hash, canonical.canonical_field_hash,
        "quality evidence must measure the exact persisted coordinate field"
    );
    for artifact in &outcome.manifest.artifacts {
        let original = std::fs::read(outcome.directory.join(&artifact.relative_path))
            .expect("original artifact should remain readable");
        let reproduction = std::fs::read(reproduced.directory.join(&artifact.relative_path))
            .expect("reproduced artifact should remain readable");
        assert_eq!(
            original, reproduction,
            "{} should reproduce byte-for-byte",
            artifact.role
        );
    }

    let external_verifiers = release_authority.external_verifiers().clone();
    let store = FileActivationStore::<TrainBackend>::new(
        root,
        gate_signer.verifier(),
        external_verifiers.clone(),
        NdArrayDevice::Cpu,
    );
    assert!(
        store
            .current()
            .expect("inactive state should read")
            .is_none(),
        "candidate publication must not activate"
    );
    activate_generation::<TrainBackend>(
        root,
        gate_signer.verifier(),
        external_verifiers.clone(),
        NdArrayDevice::Cpu,
        None,
        outcome.candidate,
    )
    .expect("explicit activation should succeed");

    let restarted = FileActivationStore::<TrainBackend>::new(
        root,
        gate_signer.verifier(),
        external_verifiers.clone(),
        NdArrayDevice::Cpu,
    )
    .load_active()
    .expect("active generation should verify after restart")
    .expect("active generation should exist");
    assert_eq!(
        restarted.release().head(),
        outcome.candidate.release().head()
    );
    for role in [
        ArtifactRole::Representations,
        ArtifactRole::RelationClassifier,
        ArtifactRole::SemanticGraph,
        ArtifactRole::RelationIndexes,
        ArtifactRole::LandmarkSkeleton,
        ArtifactRole::LandmarkReferencePersistence,
        ArtifactRole::CanonicalBase,
        ArtifactRole::CanonicalAnalytics,
    ] {
        assert!(restarted.artifact(role).is_some(), "{role} should map");
    }
    for role in [
        ArtifactRole::LegacyLayout,
        ArtifactRole::LegacyIdentities,
        ArtifactRole::LegacyExportManifest,
    ] {
        assert!(
            restarted
                .manifest()
                .artifacts
                .iter()
                .any(|artifact| artifact.role == role),
            "{role} should be manifest-pinned"
        );
    }
    std::fs::write(&outcome.legacy.layout.path, b"tampered")
        .expect("legacy layout should be corruptible in the fixture");
    assert!(
        FileActivationStore::<TrainBackend>::new(
            root,
            gate_signer.verifier(),
            external_verifiers,
            NdArrayDevice::Cpu,
        )
        .load_active()
        .is_err(),
        "restart loading must verify opaque legacy exports"
    );
}

fn gate_report(suite_version: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "suiteVersion": suite_version,
        "outcome": "pass",
        "subjects": {"fixture": "fixture-subject"}
    }))
    .expect("fixture gate report should serialize")
}

fn generation_config<'config>(
    root: &'config Utf8Path,
    conditions: &'config [f32],
    grid_depths: &'config [u8],
) -> CanonicalGenerationConfig<'config> {
    let small = NonZeroUsize::new(4).expect("four should be non-zero");
    CanonicalGenerationConfig {
        root,
        semantic_index: USearchConfig::default(),
        semantic_graph: SemanticGraphConfig {
            neighbors: NonZeroUsize::new(30).expect("thirty should be non-zero"),
        },
        audit_sample_size: NonZeroUsize::new(ROWS).expect("row count should be non-zero"),
        audit_seed: 40,
        attraction: AttractionConfig::default(),
        protection: ProtectionConfig::new(
            Probability::ZERO,
            Probability::ZERO,
            Probability::ZERO,
            Probability::ZERO,
            true,
        )
        .expect("zero protection should validate"),
        landmarks: LandmarkConfig {
            maximum_count: small,
            retained_fraction: 0.0,
            seed: 41,
        },
        landmark_assignment: USearchConfig::default(),
        landmark_fit: LandmarkFitConfig {
            maximum_neighbors: NonZeroUsize::new(3).expect("three should be non-zero"),
            epochs: NonZeroUsize::new(2).expect("two should be non-zero"),
            initial_learning_rate: 0.5,
            repulsion_strength: 1.0,
            negative_sample_rate: NonZeroUsize::new(1).expect("one should be non-zero"),
            spread: 1.0,
            minimum_distance: 0.1,
            seed: 42,
        },
        landmark_radius: 1.0,
        landmark_weight: 1.0,
        projector: ProjectorConfig {
            width: 8,
            residual_blocks: 1,
            role_dimensions: 2,
            ..ProjectorConfig::default()
        },
        projector_batches: ProjectorBatchPlanConfig {
            conditions: conditions
                .iter()
                .map(|&condition| f64::from(condition))
                .collect(),
            semantic_positive_count: small,
            ordinary_negative_count: 2,
            ordinary_negative_weight: 1.0,
            relation_type_count: NonZeroUsize::new(1).expect("one should be non-zero"),
            relation_per_type_cap: NonZeroUsize::new(1).expect("one should be non-zero"),
            anchor_count: 0,
            landmark_count: small.get(),
            hard_query_count: 0,
            hard_negative: HardNegativeConfig {
                neighbors: NonZeroUsize::new(1).expect("one should be non-zero"),
                candidate_multiplier: NonZeroUsize::new(32).expect("thirty-two should be non-zero"),
                connectivity: small,
                expansion_add: NonZeroUsize::new(16).expect("sixteen should be non-zero"),
                expansion_search: NonZeroUsize::new(16).expect("sixteen should be non-zero"),
                maximum_weight: 1.0,
                rank_exponent: 1.0,
            },
            refresh_interval: NonZeroUsize::new(1).expect("one should be non-zero"),
            refresh_condition: 0.1,
            inference_batch_size: NonZeroUsize::new(16).expect("sixteen should be non-zero"),
            type_context_dropout_probability: 0.0,
            seed: 43,
        },
        projector_loss: projector_loss(),
        projector_optimizer: ProjectorOptimizerConfig {
            initial_learning_rate: 1.0e-3,
            minimum_learning_rate: 1.0e-4,
            steps: NonZeroUsize::new(2).expect("two should be non-zero"),
            seed: 44,
        },
        conditions,
        condition_domain: ConditionDomain::new(
            0.0,
            f64::from(conditions[1]),
            crate::salt::hash::ContentHash::digest(b"runner-condition-domain"),
        )
        .expect("condition domain should validate"),
        condition_quality_evaluator: &CONDITION_QUALITY_EVALUATOR,
        condition_quality_policy: crate::salt::generation::ConditionQualityPolicy {
            minimum_semantic_fidelity: 0.95,
            maximum_subgroup_degradation: 2.0,
        },
        condition_measurement: ConditionMeasurementConfig {
            distinguishability_floor: f64::MIN_POSITIVE,
            monotonicity_tolerance: 1.0e12,
        },
        canonical_condition: 0.0,
        variant_quantization_step: 1.0e-3,
        inference_batch_size: NonZeroUsize::new(16).expect("sixteen should be non-zero"),
        materialization: CanonicalMaterializationConfig {
            importance: ImportanceConfig {
                grid_depths,
                hash_seed: 45,
                bounds: CoordinateBounds::new([-100.0; 2], [100.0; 2])
                    .expect("materialization bounds should validate"),
            },
            raster: RasterConfig {
                grid_size: 16,
                bandwidth_pixels: 1.0,
            },
            merge_tree: MergeTreeConfig::default(),
            regions: RegionConfig {
                density_floor_fraction: 0.005,
                minimum_peak_fraction: 0.05,
                maximum_regions: 8,
            },
            analytic_configuration: crate::salt::hash::ContentHash::digest(
                b"runner-analytic-config",
            ),
        },
        persistence_policy: PersistenceGatePolicy {
            fixed_thresholds: PERSISTENCE_THRESHOLDS,
            minimum_ratio: f64::EPSILON,
            maximum_ratio: 1.0e6,
            maximum_low_persistence_ratio: 1.0e6,
            maximum_noise_ratio: 1.0e6,
        },
        persistence_evaluator: &PERSISTENCE_QUALITY_EVALUATOR,
        legacy_tag: 0,
    }
}

fn projector_loss() -> ProjectorLossConfig {
    ProjectorLossConfig::new(
        SemanticAffinity::new(1.0, 1.0, 1.0e-8, 2.0, 2.0)
            .expect("semantic affinity should validate"),
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).expect("relation energy should validate"),
        GradientBudget::new(0.25, 0.5, 1.0e-6, 1.0e-12).expect("gradient budget should validate"),
        SupportEnergy {
            huber_delta: 1.0,
            epsilon: 1.0e-8,
        },
        LossWeights {
            semantic_positive: 1.0,
            ordinary_negative: 1.0,
            hard_negative: 0.0,
            relation: 1.0,
            anchor: 0.0,
            landmark: 1.0,
        },
    )
    .expect("projector loss should validate")
}

fn representations() -> Vec<f32> {
    let mut values = (0..ROWS * crate::salt::representation::PROJECTOR_DIMENSIONS)
        .map(|index| {
            let row = index / crate::salt::representation::PROJECTOR_DIMENSIONS;
            let column = index % crate::salt::representation::PROJECTOR_DIMENSIONS;
            f32::from(
                u16::try_from((row * 31 + column * 7) % 251)
                    .expect("fixture remainder should fit u16"),
            ) / 251.0
                - 0.5
        })
        .collect::<Vec<_>>();
    for row in values.chunks_exact_mut(crate::salt::representation::PROJECTOR_DIMENSIONS) {
        let inverse_norm = row
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt()
            .recip();
        for value in row {
            *value *= inverse_norm;
        }
    }
    values
}

fn landmark_candidates() -> Vec<LandmarkCandidate> {
    (0..ROWS)
        .map(|row| LandmarkCandidate {
            row: GenerationRowId::try_from(u32::try_from(row).expect("row should fit u32"))
                .expect("row should validate"),
            sampling_weight: 1.0,
            density: u32::try_from(row % 4).expect("density should fit u32"),
            language: 0,
            source: 0,
            entity_role: 0,
            type_family: 0,
            community: u32::try_from(row % 2).expect("community should fit u32"),
            temporal_cohort: 0,
            prior_landmark: false,
        })
        .collect()
}

fn publish_classifier_fixture(path: &Utf8Path) {
    let dimensions = crate::salt::representation::CANONICAL_DIMENSIONS;
    let class_order = [0_u8, 1, 2];
    let coefficients = vec![0.0_f64; 3 * dimensions];
    let intercepts = [0.0_f64; 3];
    let temperature = [1.0_f64];
    let mean = vec![0.0_f64; dimensions];
    let scales = vec![1.0_f64; dimensions];
    let distances = [0.0_f64];
    let sections = [
        ArtifactSection::new(SectionId::new(1), &[3], &class_order)
            .expect("class order should validate"),
        ArtifactSection::new(SectionId::new(2), &[3, dimensions], &coefficients)
            .expect("coefficients should validate"),
        ArtifactSection::new(SectionId::new(3), &[3], &intercepts)
            .expect("intercepts should validate"),
        ArtifactSection::new(SectionId::new(4), &[1], &temperature)
            .expect("temperature should validate"),
        ArtifactSection::new(SectionId::new(5), &[dimensions], &mean)
            .expect("mean should validate"),
        ArtifactSection::new(SectionId::new(6), &[dimensions], &scales)
            .expect("scales should validate"),
        ArtifactSection::new(SectionId::new(7), &[1], &distances)
            .expect("distances should validate"),
    ];
    publish_artifact(path, CLASSIFIER_FORMAT, &sections)
        .expect("classifier fixture should publish");
}

fn edition(entity_id: EntityId, seed: u128) -> EntityAtEdition {
    EntityAtEdition {
        entity_id,
        edition_id: EntityEditionId::new(Uuid::from_u128(seed)),
    }
}

fn entity(seed: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(seed)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(seed + 1)),
        draft_id: None,
    }
}
