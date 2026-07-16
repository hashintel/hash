//! Conversion from bounded operational inputs to SALT's frozen source boundary.

#![expect(
    clippy::std_instead_of_alloc,
    reason = "the fit worker is std-only and uses the standard collection paths"
)]

use core::{error::Error, fmt, str::FromStr as _};
use std::collections::{BTreeMap, HashMap, HashSet};

use serde::Deserialize;
use type_system::ontology::VersionedUrl;

mod deferred;
#[path = "input/stratification.rs"]
mod stratification;

use deferred::{apply_mock_manifest_claims, generate_mock_inputs};
use stratification::{landmark_candidates, quality_subgroups};

use super::{
    configuration::{
        LoadedFitWorkerConfiguration, content_addressed_path, read_content_addressed,
        read_content_addressed_document,
    },
    postgres::{PostgresExtraction, SnapshotEnvelope},
    quality_evaluation::{
        DeferredConditionQualityEvaluator, FitQualityError, LocalConditionQualityEvaluator,
        LocalPersistenceQualityEvaluator, audit_representations, deferred_representations,
    },
    schema::{FitAssuranceMode, FitInputBundleV1, FitInputReferenceV1, FitManifestContractV1},
};
use crate::salt::{
    ContentHash, ContentHasher,
    salt_fit_boundary::{
        ArtifactOrdinal, CARD_FORMAT_VERSION, ConditionQualityEvaluator, EntityRole,
        ExternalGateReportDocuments, FrozenCanonicalSignals, GenerationAssuranceMode,
        GenerationManifest, GenerationManifestContract, IdentityDirectory,
        KnowledgeDecisionTimePolicy, LinkCandidate, OwnedCanonicalEmbedding, PlacementPosterior,
        RelationModelSources, RelationPolicyInput, RelationPolicyRecords, RelationSecurityMode,
        RelationSecurityPolicy, RelationStrength, SnapshotTemporalAxes,
        StoreBackedGenerationSource, StoreExtractionReceipt, TRANSFORM_VERSION, VariantId,
        canonical_corpus_hash, transform_contract_hash, transform_golden_vectors_hash,
    },
};

const LINK_ROOT_VERSIONED_URL: &str =
    "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";

/// Fully owned SALT input and permission context prepared before numerical work.
pub(in crate::salt_fit) struct PreparedFitSource {
    pub source: StoreBackedGenerationSource,
    pub link_candidates: Box<[LinkCandidate]>,
    pub temporal_axes: SnapshotTemporalAxes,
    pub relation_security_policy: RelationSecurityPolicy,
    pub extraction_receipt: StoreExtractionReceipt,
    pub authorization_report_hash: ContentHash,
    pub condition_evaluator: Box<dyn ConditionQualityEvaluator>,
    pub persistence_evaluator: LocalPersistenceQualityEvaluator,
}

/// Failure to bind operational inputs into one immutable SALT source.
#[derive(Debug)]
pub(in crate::salt_fit) enum FitInputError {
    Configuration(super::FitConfigurationError),
    Json {
        name: &'static str,
        source: serde_json::Error,
    },
    Invalid(String),
    Quality(FitQualityError),
}

impl fmt::Display for FitInputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Configuration(error) => error.fmt(formatter),
            Self::Json { name, source } => write!(formatter, "{name} is invalid JSON: {source}"),
            Self::Invalid(message) => formatter.write_str(message),
            Self::Quality(error) => error.fmt(formatter),
        }
    }
}

impl Error for FitInputError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Configuration(error) => Some(error),
            Self::Json { source, .. } => Some(source),
            Self::Quality(error) => Some(error),
            Self::Invalid(_) => None,
        }
    }
}

/// Assembles a source only after every content-addressed report and model input
/// has been read and cross-bound to its declared subject.
#[expect(
    clippy::too_many_lines,
    reason = "the assembly keeps every cross-bound input visible in one fail-closed transaction"
)]
pub(in crate::salt_fit) fn prepare_fit_source(
    worker: &LoadedFitWorkerConfiguration,
    bundle: &FitInputBundleV1,
    extraction: PostgresExtraction,
    assurance: FitAssuranceMode,
) -> Result<PreparedFitSource, FitInputError> {
    let mut manifest: GenerationManifest = serde_json::from_slice(include_bytes!(
        "m0_local_manifest_template.json"
    ))
    .map_err(|source| FitInputError::Json {
        name: "compiled M0 manifest template",
        source,
    })?;
    manifest.assurance_mode = match assurance {
        FitAssuranceMode::M0LocalAttestation => GenerationAssuranceMode::IndependentAuthorities,
        FitAssuranceMode::EvidenceDeferredLocal => GenerationAssuranceMode::EvidenceDeferredLocal,
    };
    apply_manifest_contract(&mut manifest, &bundle.manifest)?;
    if assurance == FitAssuranceMode::EvidenceDeferredLocal {
        apply_mock_manifest_claims(&mut manifest);
    }
    let policy_bytes = input(worker, &bundle.relation_policy_inputs)?;
    let policy_document: RelationPolicyDocumentV1 =
        serde_json::from_slice(&policy_bytes).map_err(|source| FitInputError::Json {
            name: "relation policy inputs",
            source,
        })?;
    validate_policy_document(&policy_document)?;

    let classifier_path =
        content_addressed_path(&worker.input_root, "classifier", &bundle.classifier)
            .map_err(FitInputError::Configuration)?;
    if bundle.strength_head.is_some() {
        return Err(FitInputError::Invalid(
            "m0-local-v1 does not support a relation strength head".to_owned(),
        ));
    }
    let assurance_inputs = assurance_inputs(worker, bundle, &manifest, assurance)?;

    let mut identity_values = try_vec("identity directory", extraction.entities.len())?;
    identity_values.extend(
        extraction
            .entities
            .iter()
            .map(|entity| entity.selected.entity_id),
    );
    let identities = IdentityDirectory::new(identity_values).map_err(invalid)?;
    let link_root = VersionedUrl::from_str(LINK_ROOT_VERSIONED_URL)
        .expect("the pinned link root should be a valid versioned URL");
    let mut roles = try_vec("entity roles", extraction.entities.len())?;
    roles.extend(
        extraction
            .entities
            .iter()
            .map(|entity| point_role(&entity.entity_types, &link_root)),
    );
    let landmark_candidates = landmark_candidates(&extraction, &roles)?;
    let representations = match assurance {
        FitAssuranceMode::M0LocalAttestation => audit_representations(
            &extraction.canonical_embeddings,
            &identities,
            &landmark_candidates,
            &roles,
        ),
        FitAssuranceMode::EvidenceDeferredLocal => deferred_representations(
            &extraction.canonical_embeddings,
            &identities,
            &landmark_candidates,
            &roles,
        ),
    }
    .map_err(FitInputError::Quality)?;
    let condition_evaluator: Box<dyn ConditionQualityEvaluator> = match assurance {
        FitAssuranceMode::M0LocalAttestation => {
            let quality_subgroups = quality_subgroups(&landmark_candidates)?;
            Box::new(
                LocalConditionQualityEvaluator::new(
                    &extraction.canonical_embeddings,
                    &quality_subgroups,
                )
                .map_err(FitInputError::Quality)?,
            )
        }
        FitAssuranceMode::EvidenceDeferredLocal => {
            Box::new(DeferredConditionQualityEvaluator::new(identities.len()))
        }
    };
    let relation_ordinals = relation_ordinals(&extraction)?;
    let relation_policy_inputs = relation_policy_inputs(&policy_document, &relation_ordinals)?;
    let mut relation_confidence = HashMap::new();
    relation_confidence
        .try_reserve(extraction.links.len())
        .map_err(|error| {
            FitInputError::Invalid(format!("relation-confidence allocation failed: {error}"))
        })?;
    relation_confidence.extend(
        extraction
            .links
            .iter()
            .map(|link| (link.link.entity_id, link.confidence)),
    );

    let artifact_bindings = ArtifactBindings {
        classifier: parse_content_hash("classifier.sha256", &bundle.classifier.sha256)?,
        relation_report: ContentHash::digest(&assurance_inputs.relation_report),
        security_report: ContentHash::digest(&assurance_inputs.security_report),
        companion: assurance_inputs.companion,
        companion_report: ContentHash::digest(&assurance_inputs.companion_report),
    };
    bind_manifest(
        &mut manifest,
        &extraction.envelope,
        &extraction,
        &representations.audit,
        artifact_bindings,
    );
    let authorization_report_hash =
        authorization_report_hash(worker, &extraction.envelope, extraction.provenance_hash);
    manifest.relations.authorization_noninterference_report_hash = authorization_report_hash;
    let manifest_contract = GenerationManifestContract::new(manifest).map_err(invalid)?;

    let temporal_axes = SnapshotTemporalAxes::new(
        extraction.envelope.transaction_time,
        extraction.envelope.transaction_time,
        KnowledgeDecisionTimePolicy::LatestAtTransaction,
        extraction.envelope.store_snapshot_identity,
    );
    let relation_security_policy = RelationSecurityPolicy::new(
        RelationSecurityMode::AllSnapshotLinks,
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
    );
    let extraction_receipt =
        StoreExtractionReceipt::new(extraction.provenance_hash.as_bytes().to_vec())
            .map_err(invalid)?;
    let row_count = identities.len();
    let mut selected_editions = try_vec("selected editions", row_count)?;
    let mut labels = try_vec("entity labels", row_count)?;
    for entity in extraction.entities.into_vec() {
        selected_editions.push(entity.selected);
        labels.push(entity.label);
    }
    let mut link_candidates = try_vec("link candidates", extraction.links.len())?;
    for link in extraction.links.into_vec() {
        link_candidates.push(LinkCandidate::new(
            link.link,
            link.left,
            link.right,
            link.relation_type.selected,
            link.required_entity_types,
        ));
    }
    let importance = constant_signal("importance", row_count)?;
    let semantic_priority = constant_signal("semantic priority", row_count)?;
    let density_mass = constant_signal("density mass", row_count)?;

    Ok(PreparedFitSource {
        source: StoreBackedGenerationSource {
            manifest_contract,
            identities,
            selected_editions: selected_editions.into_boxed_slice(),
            canonical_embeddings: extraction.canonical_embeddings,
            representation_values: representations.projector,
            roles: roles.into_boxed_slice(),
            type_context: None,
            relation_ordinals,
            relation_policy_inputs: relation_policy_inputs.into_boxed_slice(),
            relation_confidence,
            landmark_candidates: landmark_candidates.into_boxed_slice(),
            subgroup_minimums: Box::new([]),
            anchors: Box::new([]),
            signals: FrozenCanonicalSignals::new(
                importance,
                semantic_priority,
                density_mass,
                labels.into_boxed_slice(),
            ),
            models: RelationModelSources {
                classifier: classifier_path,
                strength_head: None,
            },
            external_gate_reports: ExternalGateReportDocuments::new(
                representations.report,
                assurance_inputs.relation_report,
                assurance_inputs.security_report,
                assurance_inputs.companion_report,
            ),
        },
        link_candidates: link_candidates.into_boxed_slice(),
        temporal_axes,
        relation_security_policy,
        extraction_receipt,
        authorization_report_hash,
        condition_evaluator,
        persistence_evaluator: LocalPersistenceQualityEvaluator::new(),
    })
}

fn input(
    worker: &LoadedFitWorkerConfiguration,
    reference: &FitInputReferenceV1,
) -> Result<Vec<u8>, FitInputError> {
    read_content_addressed(&worker.input_root, "fit input", reference)
        .map_err(FitInputError::Configuration)
}

fn document(
    worker: &LoadedFitWorkerConfiguration,
    reference: &FitInputReferenceV1,
) -> Result<Vec<u8>, FitInputError> {
    read_content_addressed_document(&worker.input_root, "fit document", reference)
        .map_err(FitInputError::Configuration)
}

#[inline]
fn point_role(entity_types: &[VersionedUrl], link_root: &VersionedUrl) -> EntityRole {
    if entity_types.contains(link_root) {
        EntityRole::Other
    } else {
        EntityRole::KnowledgeEntity
    }
}

fn try_vec<T>(name: &'static str, capacity: usize) -> Result<Vec<T>, FitInputError> {
    let mut values = Vec::new();
    values.try_reserve_exact(capacity).map_err(|error| {
        FitInputError::Invalid(format!(
            "could not reserve {capacity} elements for {name}: {error}"
        ))
    })?;
    Ok(values)
}

fn constant_signal(name: &'static str, row_count: usize) -> Result<Box<[f64]>, FitInputError> {
    let mut values = try_vec(name, row_count)?;
    values.resize(row_count, 1.0);
    Ok(values.into_boxed_slice())
}

fn relation_ordinals(
    extraction: &PostgresExtraction,
) -> Result<HashMap<VersionedUrl, ArtifactOrdinal>, FitInputError> {
    let mut types = extraction
        .links
        .iter()
        .map(|link| link.relation_type.selected.clone())
        .collect::<Vec<_>>();
    types.sort_unstable();
    types.dedup();
    if types.is_empty() {
        return Err(FitInputError::Invalid(
            "the extracted corpus contains no relation candidates".to_owned(),
        ));
    }
    types
        .into_iter()
        .enumerate()
        .map(|(index, relation_type)| {
            Ok((
                relation_type,
                ArtifactOrdinal::try_from(index).map_err(invalid)?,
            ))
        })
        .collect()
}

fn relation_policy_inputs(
    document: &RelationPolicyDocumentV1,
    ordinals: &HashMap<VersionedUrl, ArtifactOrdinal>,
) -> Result<Vec<RelationPolicyInput>, FitInputError> {
    let mut output = Vec::new();
    output.try_reserve_exact(ordinals.len()).map_err(|error| {
        FitInputError::Invalid(format!("relation policy allocation failed: {error}"))
    })?;
    let mut relation_types = ordinals.keys().collect::<Vec<_>>();
    relation_types.sort_unstable();
    for relation_type in relation_types {
        let ordinal = ordinals
            .get(relation_type)
            .copied()
            .expect("an iterated relation type should retain its ordinal");
        let input = document.relations.get(relation_type).ok_or_else(|| {
            FitInputError::Invalid(format!(
                "relation policy document omits extracted type {relation_type}"
            ))
        })?;
        output.push(RelationPolicyInput::new(
            ordinal,
            RelationPolicyRecords::new(
                input
                    .human_override
                    .as_ref()
                    .map(PosteriorV1::build)
                    .transpose()?,
                input
                    .human_reviewed
                    .as_ref()
                    .map(PosteriorV1::build)
                    .transpose()?,
                input
                    .synthetic
                    .as_ref()
                    .map(PosteriorV1::build)
                    .transpose()?,
            ),
            OwnedCanonicalEmbedding::from_vec(input.embedding.clone()).map_err(invalid)?,
            RelationStrength::new(input.strength).map_err(invalid)?,
        ));
    }
    Ok(output)
}

#[derive(Debug, Copy, Clone)]
struct ArtifactBindings {
    classifier: ContentHash,
    relation_report: ContentHash,
    security_report: ContentHash,
    companion: ContentHash,
    companion_report: ContentHash,
}

struct AssuranceInputs {
    relation_report: Vec<u8>,
    security_report: Vec<u8>,
    companion: ContentHash,
    companion_report: Vec<u8>,
}

fn assurance_inputs(
    worker: &LoadedFitWorkerConfiguration,
    bundle: &FitInputBundleV1,
    manifest: &GenerationManifest,
    assurance: FitAssuranceMode,
) -> Result<AssuranceInputs, FitInputError> {
    let (relation_report, security_report, companion, companion_report, mock) = match assurance {
        FitAssuranceMode::M0LocalAttestation => {
            let relation_reference = required_attested_input(
                "relationPolicyReport",
                bundle.relation_policy_report.as_ref(),
            )?;
            let security_reference = required_attested_input(
                "securityApprovalReport",
                bundle.security_approval_report.as_ref(),
            )?;
            let companion_reference =
                required_attested_input("companion", bundle.companion.as_ref())?;
            let companion_report_reference = required_attested_input(
                "companionCompatibilityReport",
                bundle.companion_compatibility_report.as_ref(),
            )?;
            let relation_report = document(worker, relation_reference)?;
            let security_report = document(worker, security_reference)?;
            content_addressed_path(&worker.input_root, "companion", companion_reference)
                .map_err(FitInputError::Configuration)?;
            let companion_report = document(worker, companion_report_reference)?;
            (
                relation_report,
                security_report,
                parse_content_hash("companion.sha256", &companion_reference.sha256)?,
                companion_report,
                false,
            )
        }
        FitAssuranceMode::EvidenceDeferredLocal => {
            reject_attestation_inputs(bundle)?;
            let generated = generate_mock_inputs(
                manifest,
                &bundle.classifier.sha256,
                &bundle.relation_policy_inputs.sha256,
            )
            .map_err(|source| FitInputError::Json {
                name: "deferred mock report",
                source,
            })?;
            (
                generated.relation_report,
                generated.security_report,
                generated.companion,
                generated.companion_report,
                true,
            )
        }
    };

    validate_report(
        "relation-policy report",
        &relation_report,
        &manifest.relations.policy_precedence_version,
        [
            ("classifier", bundle.classifier.sha256.as_str()),
            (
                "relationPolicyInputs",
                bundle.relation_policy_inputs.sha256.as_str(),
            ),
        ],
        mock,
    )?;
    validate_report(
        "security-approval report",
        &security_report,
        &manifest.serving.authorization_adapter_version,
        [
            ("classifier", bundle.classifier.sha256.as_str()),
            (
                "relationPolicyInputs",
                bundle.relation_policy_inputs.sha256.as_str(),
            ),
        ],
        mock,
    )?;
    let companion_hash = companion.to_string();
    validate_report(
        "companion-compatibility report",
        &companion_report,
        &manifest.serving.canvas_companion_version,
        [("companion", companion_hash.as_str())],
        mock,
    )?;
    Ok(AssuranceInputs {
        relation_report,
        security_report,
        companion,
        companion_report,
    })
}

fn required_attested_input<'a>(
    field: &'static str,
    reference: Option<&'a FitInputReferenceV1>,
) -> Result<&'a FitInputReferenceV1, FitInputError> {
    reference.ok_or_else(|| {
        FitInputError::Invalid(format!(
            "{field} is required for m0_local_attestation assurance"
        ))
    })
}

fn reject_attestation_inputs(bundle: &FitInputBundleV1) -> Result<(), FitInputError> {
    if bundle.relation_policy_report.is_some()
        || bundle.security_approval_report.is_some()
        || bundle.companion.is_some()
        || bundle.companion_compatibility_report.is_some()
    {
        return Err(FitInputError::Invalid(
            "evidence_deferred_local generates deterministic mock reports and companion bytes; \
             external attestation inputs must be omitted"
                .to_owned(),
        ));
    }
    Ok(())
}

fn apply_manifest_contract(
    manifest: &mut GenerationManifest,
    contract: &FitManifestContractV1,
) -> Result<(), FitInputError> {
    contract
        .embedding
        .model
        .clone_into(&mut manifest.embedding.model);
    manifest.embedding.producer_contract_hash = parse_content_hash(
        "manifest.embedding.producerContractHash",
        &contract.embedding.producer_contract_hash,
    )?;
    manifest.embedding.golden_vectors_hash = transform_golden_vectors_hash();

    manifest.relations.relation_card_format_version = CARD_FORMAT_VERSION;
    manifest.relations.relation_card_corpus_hash = parse_content_hash(
        "manifest.relations.relationCardCorpusHash",
        &contract.relations.relation_card_corpus_hash,
    )?;
    manifest.relations.annotation_corpus_hash = parse_content_hash(
        "manifest.relations.annotationCorpusHash",
        &contract.relations.annotation_corpus_hash,
    )?;
    contract
        .relations
        .annotation_prompt_family_version
        .clone_into(&mut manifest.relations.annotation_prompt_family_version);
    contract
        .relations
        .annotation_vote_schedule
        .clone_into(&mut manifest.relations.annotation_vote_schedule);
    manifest.relations.reviewed_holdout_hash = parse_content_hash(
        "manifest.relations.reviewedHoldoutHash",
        &contract.relations.reviewed_holdout_hash,
    )?;
    contract
        .relations
        .policy_precedence_version
        .clone_into(&mut manifest.relations.policy_precedence_version);
    contract
        .relations
        .classifier_version
        .clone_into(&mut manifest.relations.classifier_version);
    manifest.relations.class_prior = contract.relations.class_prior;
    contract
        .relations
        .applicability_method_version
        .clone_into(&mut manifest.relations.applicability_method_version);
    manifest.relations.applicability_config_hash = parse_content_hash(
        "manifest.relations.applicabilityConfigHash",
        &contract.relations.applicability_config_hash,
    )?;
    manifest.relations.classifier_ood_edge_volume_fraction =
        contract.relations.classifier_ood_edge_volume_fraction;
    manifest.relations.reviewed_edge_volume_fraction =
        contract.relations.reviewed_edge_volume_fraction;

    // Unit-strength and zero-floor protection are properties of m0-local-v1,
    // not caller-authored evidence. Their identities are therefore fixed here.
    manifest.relations.strength_head.band_vote_corpus_hash =
        ContentHash::digest(b"hash.graph.atlas.fit.unit-strength-no-band-votes.v1");
    manifest.relations.strength_head.calibration_hash =
        ContentHash::digest(b"hash.graph.atlas.fit.unit-strength-no-calibration.v1");
    manifest
        .relations
        .negative_admission
        .protection_applicability
        .selection_experiment_hash =
        ContentHash::digest(b"hash.graph.atlas.fit.zero-protection-floor-contract.v1");

    contract
        .serving
        .authorization_adapter_version
        .clone_into(&mut manifest.serving.authorization_adapter_version);
    manifest
        .serving
        .wire_versions
        .clone_from(&contract.serving.wire_versions);
    contract
        .serving
        .style_version
        .clone_into(&mut manifest.serving.style_version);
    contract
        .serving
        .canvas_companion_version
        .clone_into(&mut manifest.serving.canvas_companion_version);
    contract
        .serving
        .shader_contract_version
        .clone_into(&mut manifest.serving.shader_contract_version);
    Ok(())
}

fn parse_content_hash(field: &'static str, value: &str) -> Result<ContentHash, FitInputError> {
    ContentHash::from_str(value)
        .map_err(|error| FitInputError::Invalid(format!("{field} is invalid: {error}")))
}

fn bind_manifest(
    manifest: &mut GenerationManifest,
    envelope: &SnapshotEnvelope,
    extraction: &PostgresExtraction,
    audit: &crate::salt::salt_fit_boundary::RepresentationAuditReport,
    artifacts: ArtifactBindings,
) {
    manifest.created_at = jiff::Timestamp::now();
    manifest.input_snapshot.ontology_transaction_time = envelope.transaction_time;
    manifest.input_snapshot.knowledge_transaction_time = envelope.transaction_time;
    manifest.input_snapshot.knowledge_decision_time_policy =
        KnowledgeDecisionTimePolicy::LatestAtTransaction;
    manifest.input_snapshot.store_snapshot_identity = envelope.store_snapshot_identity;
    manifest.input_snapshot.ontology_hash = envelope.ontology_hash;
    manifest.input_snapshot.knowledge_hash = envelope.knowledge_hash;
    manifest.input_snapshot.extraction_receipt_hash = extraction.provenance_hash;
    manifest.input_snapshot.frozen_input_hash = ContentHash::from_bytes([0; 32]);
    manifest.input_snapshot.authorization_revision =
        crate::salt::salt_fit_boundary::AuthorizationRevision::new(envelope.authorization_revision);
    manifest.embedding.canonical_dimensions = crate::salt::CANONICAL_DIMENSIONS;
    manifest.embedding.canonical_corpus_hash =
        canonical_corpus_hash(&extraction.canonical_embeddings);
    manifest.embedding.projector_dimensions = crate::salt::salt_fit_boundary::PROJECTOR_DIMENSIONS;
    manifest.embedding.projector_corpus_hash = audit.projector_corpus_hash;
    TRANSFORM_VERSION.clone_into(&mut manifest.embedding.transform_version);
    manifest.embedding.transform_hash = transform_contract_hash();
    manifest.embedding.representation_audit = audit.clone();
    manifest.relations.security_mode = RelationSecurityMode::AllSnapshotLinks;
    manifest.relations.classifier_model_hash = artifacts.classifier;
    manifest.relations.policy_evaluation_report_hash = artifacts.relation_report;
    manifest.relations.security_approval_report_hash = artifacts.security_report;
    manifest.serving.canvas_companion_sha256 = artifacts.companion;
    manifest.serving.companion_compatibility_report_hash = artifacts.companion_report;
    manifest.artifacts.clear();
    manifest.variants.canonical_variant = VariantId::CANONICAL;
}

fn authorization_report_hash(
    worker: &LoadedFitWorkerConfiguration,
    envelope: &SnapshotEnvelope,
    provenance: ContentHash,
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.optimistic-authorization-report.v1");
    hasher.update(worker.document.actor_id.as_bytes());
    hasher.update(envelope.authorization_revision.as_bytes());
    hasher.update(envelope.store_snapshot_identity.as_bytes());
    hasher.update(provenance.as_bytes());
    hasher.update(
        b"authorization and extraction were checked sequentially, not under mutation exclusion",
    );
    hasher.finish()
}

fn validate_policy_document(document: &RelationPolicyDocumentV1) -> Result<(), FitInputError> {
    if document.schema_version != 1 {
        return Err(FitInputError::Invalid(format!(
            "relation policy schema version {} is unsupported",
            document.schema_version
        )));
    }
    if document.relations.is_empty() {
        return Err(FitInputError::Invalid(
            "relation policy corpus must not be empty".to_owned(),
        ));
    }
    for (relation_type, entry) in &document.relations {
        if entry.embedding.len() != crate::salt::CANONICAL_DIMENSIONS
            || entry.embedding.iter().any(|value| !value.is_finite())
        {
            return Err(FitInputError::Invalid(format!(
                "relation policy embedding for {relation_type} is not a finite 3,072-component \
                 card vector"
            )));
        }
        RelationStrength::new(entry.strength).map_err(invalid)?;
        for posterior in [
            entry.human_override.as_ref(),
            entry.human_reviewed.as_ref(),
            entry.synthetic.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            posterior.build()?;
        }
    }
    Ok(())
}

fn validate_report<const N: usize>(
    name: &'static str,
    bytes: &[u8],
    expected_suite: &str,
    expected_subjects: [(&str, &str); N],
    expect_mock: bool,
) -> Result<(), FitInputError> {
    let report: ExternalReportV1 =
        serde_json::from_slice(bytes).map_err(|source| FitInputError::Json { name, source })?;
    if report.schema_version != 1 || report.outcome != ReportOutcome::Pass {
        return Err(FitInputError::Invalid(format!(
            "{name} is not a passing version-1 report"
        )));
    }
    if expect_mock
        && (report.attestation != Some(ReportAttestation::MockNonAttesting)
            || report
                .warning
                .as_deref()
                .is_none_or(|warning| !warning.contains("no provenance")))
    {
        return Err(FitInputError::Invalid(format!(
            "{name} is not plainly marked as a non-attesting mock"
        )));
    }
    if !expect_mock && (report.attestation.is_some() || report.warning.is_some()) {
        return Err(FitInputError::Invalid(format!(
            "{name} contains deferred-mock markers under attested assurance"
        )));
    }
    if report.suite_version != expected_suite {
        return Err(FitInputError::Invalid(format!(
            "{name} declares suite {}, expected {expected_suite}",
            report.suite_version
        )));
    }
    if report.subjects.len() != N {
        return Err(FitInputError::Invalid(format!(
            "{name} declares {} subjects, expected {N}",
            report.subjects.len()
        )));
    }
    for (subject, expected) in expected_subjects {
        if report.subjects.get(subject).map(String::as_str) != Some(expected) {
            return Err(FitInputError::Invalid(format!(
                "{name} does not bind subject {subject} to {expected}"
            )));
        }
    }
    Ok(())
}

fn invalid(error: impl fmt::Display) -> FitInputError {
    FitInputError::Invalid(error.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RelationPolicyDocumentV1 {
    schema_version: u32,
    relations: BTreeMap<VersionedUrl, RelationPolicyEntryV1>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RelationPolicyEntryV1 {
    embedding: Vec<f32>,
    strength: f64,
    human_override: Option<PosteriorV1>,
    human_reviewed: Option<PosteriorV1>,
    synthetic: Option<PosteriorV1>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PosteriorV1 {
    coincident: f64,
    proximal: f64,
    overlay: f64,
}

impl PosteriorV1 {
    fn build(&self) -> Result<PlacementPosterior, FitInputError> {
        PlacementPosterior::new(self.coincident, self.proximal, self.overlay).map_err(invalid)
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ExternalReportV1 {
    schema_version: u32,
    suite_version: String,
    outcome: ReportOutcome,
    subjects: BTreeMap<String, String>,
    attestation: Option<ReportAttestation>,
    warning: Option<String>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ReportOutcome {
    Pass,
    Fail,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ReportAttestation {
    MockNonAttesting,
}

#[cfg(test)]
#[path = "input/tests.rs"]
mod tests;
