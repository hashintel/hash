use core::num::NonZeroUsize;

use camino::Utf8PathBuf;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::AtlasComputeConfiguration;

/// Version of the public fit worker and request documents.
pub const FIT_SCHEMA_VERSION: u32 = 1;
/// Smallest corpus that can support the required exact 50-neighbor audit.
pub const MINIMUM_FIT_ENTITIES: usize = 51;
/// Process ceiling for complete 3,072-dimensional entity rows.
pub const MAXIMUM_FIT_ENTITIES: usize = 1_250_000;
/// Process ceiling for induced current-snapshot links.
pub const MAXIMUM_FIT_LINKS: usize = 5_000_000;
/// Process ceiling for distinct relation-policy domains.
pub const MAXIMUM_FIT_RELATION_TYPES: usize = 4_096;
/// Process ceiling for one link's authorization type closure.
pub const MAXIMUM_FIT_REQUIRED_TYPES_PER_LINK: usize = 1_024;
/// Process ceiling for all extracted primary labels.
pub const MAXIMUM_FIT_LABEL_BYTES: usize = 0x4000_0000;
/// Process ceiling for explicit web scopes in one request.
pub const MAXIMUM_FIT_WEB_IDS: usize = 1_024;
/// Process ceiling for the global Rayon fitting pool.
pub const MAXIMUM_FIT_CPU_THREADS: usize = 128;

/// Explicit assurance level of the first operational fitter.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FitAssuranceMode {
    /// Independent gate issuers with documented authorization/snapshot gaps.
    M0LocalAttestation,
    /// Local provisional attestations with evidence suites explicitly deferred.
    EvidenceDeferredLocal,
}

/// Immutable numerical profile selected by a fit request.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
pub enum FitNumericalProfile {
    /// Recommended current-snapshot M0 profile.
    #[serde(rename = "m0-local-v1")]
    M0LocalV1,
}

/// PostgreSQL connection settings for the dedicated fit worker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitPostgresConfigurationV1 {
    /// PostgreSQL host. M0 permits loopback hosts only.
    pub host: String,
    /// PostgreSQL TCP port.
    #[schemars(range(min = 1))]
    pub port: u16,
    /// PostgreSQL role used by extraction and permission reads.
    pub user: String,
    /// HASH Graph database name.
    pub database: String,
    /// UTF-8 file containing only the PostgreSQL password.
    #[schemars(with = "String")]
    pub password_file: Utf8PathBuf,
}

/// Disk budget enforced before allocating a complete corpus.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitResourcePreflightV1 {
    /// Maximum permitted estimate for primary and reproduction artifacts.
    #[schemars(range(min = 1))]
    pub maximum_working_disk_bytes: u64,
}

/// Release authority whose private key is loaded by the fit worker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitSigningAuthorityV1 {
    /// Stable non-placeholder authority name.
    #[schemars(length(min = 1))]
    pub authority: String,
    /// File containing a 32-byte secret as 64 lowercase hexadecimal characters.
    #[schemars(with = "String")]
    pub secret_key_file: Utf8PathBuf,
    /// Expected 32-byte public key as 64 lowercase hexadecimal characters.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub expected_public_key: String,
}

/// Independent gate authority invoked as a separate process.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitExternalAuthorityV1 {
    /// Stable non-placeholder authority name.
    #[schemars(length(min = 1))]
    pub authority: String,
    /// Executable implementing the version-1 external grant protocol.
    #[schemars(with = "String")]
    pub issuer_command: Utf8PathBuf,
    /// Pinned 32-byte public key as 64 lowercase hexadecimal characters.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub expected_public_key: String,
}

/// Local release signer and eight out-of-process gate authorities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitAuthoritiesV1 {
    pub release: FitSigningAuthorityV1,
    pub representation: FitExternalAuthorityV1,
    pub semantic_fidelity: FitExternalAuthorityV1,
    pub relation_policy: FitExternalAuthorityV1,
    pub merge_tree_persistence: FitExternalAuthorityV1,
    pub subgroup_behavior: FitExternalAuthorityV1,
    pub authorization_noninterference: FitExternalAuthorityV1,
    pub security_approval: FitExternalAuthorityV1,
    pub companion_pin: FitExternalAuthorityV1,
}

impl FitAuthoritiesV1 {
    pub(crate) const fn external_entries(&self) -> [(&'static str, &FitExternalAuthorityV1); 8] {
        [
            ("representation", &self.representation),
            ("semanticFidelity", &self.semantic_fidelity),
            ("relationPolicy", &self.relation_policy),
            ("mergeTreePersistence", &self.merge_tree_persistence),
            ("subgroupBehavior", &self.subgroup_behavior),
            (
                "authorizationNoninterference",
                &self.authorization_noninterference,
            ),
            ("securityApproval", &self.security_approval),
            ("companionPin", &self.companion_pin),
        ]
    }
}

/// Complete process configuration for one dedicated fit worker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitWorkerConfigurationV1 {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    #[schemars(with = "String")]
    pub atlas_root: Utf8PathBuf,
    #[schemars(with = "String")]
    pub input_root: Utf8PathBuf,
    #[schemars(with = "String")]
    pub serving_config_output: Utf8PathBuf,
    /// Required GPU backend shared with the generated serving process.
    pub compute: AtlasComputeConfiguration,
    pub postgres: FitPostgresConfigurationV1,
    pub resources: FitResourcePreflightV1,
    /// Actor whose visibility defines this atlas.
    pub actor_id: Uuid,
    #[schemars(range(min = 1, max = 128))]
    pub cpu_threads: NonZeroUsize,
    pub profile: FitNumericalProfile,
    pub authorities: FitAuthoritiesV1,
}

/// Hard resource limits checked before large extraction allocations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[expect(
    clippy::struct_field_names,
    reason = "the public JSON schema keeps every resource bound visibly explicit"
)]
pub struct FitResourceLimitsV1 {
    #[schemars(range(min = 1, max = 1_250_000))]
    pub maximum_entities: usize,
    #[schemars(range(min = 1, max = 5_000_000))]
    pub maximum_links: usize,
    #[schemars(range(min = 1, max = 4_096))]
    pub maximum_relation_types: usize,
    #[schemars(range(min = 1, max = 1_024))]
    pub maximum_required_types_per_link: usize,
    #[schemars(range(min = 1, max = 0x4000_0000))]
    pub maximum_label_bytes: usize,
}

/// Content-addressed path beneath the configured input root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitInputReferenceV1 {
    #[schemars(with = "String")]
    pub path: Utf8PathBuf,
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub sha256: String,
}

/// Embedding-producer provenance that cannot be inferred from pgvector rows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitEmbeddingContractV1 {
    /// Stable provider/model identity for all selected entity embeddings.
    #[schemars(length(min = 1))]
    pub model: String,
    /// Content identity of the producer's dimensional and normalization contract.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub producer_contract_hash: String,
}

/// Externally governed relation-classifier and annotation provenance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitRelationContractV1 {
    /// Content identity of the relation-card corpus used for fitting.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub relation_card_corpus_hash: String,
    /// Content identity of the classifier annotation corpus.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub annotation_corpus_hash: String,
    /// Version of the prompt family used to collect annotations.
    #[schemars(length(min = 1))]
    pub annotation_prompt_family_version: String,
    /// Human-readable identity of the independent-vote schedule.
    #[schemars(length(min = 1))]
    pub annotation_vote_schedule: String,
    /// Content identity of the independently reviewed holdout.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub reviewed_holdout_hash: String,
    /// Rule version governing policy/classifier precedence.
    #[schemars(length(min = 1))]
    pub policy_precedence_version: String,
    /// Stable relation-classifier family version.
    #[schemars(length(min = 1))]
    pub classifier_version: String,
    /// Optional coincident/proximal/overlay class prior.
    pub class_prior: Option<[f64; 3]>,
    /// Stable version of the applicability computation.
    #[schemars(length(min = 1))]
    pub applicability_method_version: String,
    /// Content identity of the applicability configuration.
    #[schemars(regex(pattern = "^[0-9a-f]{64}$"))]
    pub applicability_config_hash: String,
    /// Fraction of relation-edge volume classified out of distribution.
    #[schemars(range(min = 0.0, max = 1.0))]
    pub classifier_ood_edge_volume_fraction: f64,
    /// Fraction of relation-edge volume covered by reviewed examples.
    #[schemars(range(min = 0.0, max = 1.0))]
    pub reviewed_edge_volume_fraction: f64,
}

/// Wire and companion contracts required by verified readers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitServingContractV1 {
    /// Version of the authorization adapter expected by external reports.
    #[schemars(length(min = 1))]
    pub authorization_adapter_version: String,
    /// Sorted, unique wire versions accepted by serving clients.
    #[schemars(length(min = 1, max = 16))]
    pub wire_versions: Vec<u16>,
    /// Stable style contract version.
    #[schemars(length(min = 1))]
    pub style_version: String,
    /// Version of the pinned legacy-canvas companion.
    #[schemars(length(min = 1))]
    pub canvas_companion_version: String,
    /// Stable shader input/output contract version.
    #[schemars(length(min = 1))]
    pub shader_contract_version: String,
}

/// Non-generated manifest claims supplied by the fit input bundle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitManifestContractV1 {
    /// Embedding producer claims supplied by the embedding pipeline.
    pub embedding: FitEmbeddingContractV1,
    /// Relation governance claims supplied by classifier evaluation.
    pub relations: FitRelationContractV1,
    /// Reader and companion compatibility claims.
    pub serving: FitServingContractV1,
}

/// Externally maintained classifier, policy, governance, and companion inputs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitInputBundleV1 {
    /// Public bundle schema version.
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    /// Non-generated claims that SALT cannot infer from artifacts.
    pub manifest: FitManifestContractV1,
    /// Per-relation policy matrix and card embeddings.
    pub relation_policy_inputs: FitInputReferenceV1,
    /// Complete serialized SALT relation classifier.
    pub classifier: FitInputReferenceV1,
    /// Optional fitted strength head; unsupported by `m0-local-v1`.
    pub strength_head: Option<FitInputReferenceV1>,
    /// Independent relation-policy evaluation report, required for attested assurance only.
    pub relation_policy_report: Option<FitInputReferenceV1>,
    /// Operator-owned security approval report, required for attested assurance only.
    pub security_approval_report: Option<FitInputReferenceV1>,
    /// Pinned legacy-canvas companion bytes, required for attested assurance only.
    pub companion: Option<FitInputReferenceV1>,
    /// Independent compatibility report, required for attested assurance only.
    pub companion_compatibility_report: Option<FitInputReferenceV1>,
}

/// One current-snapshot generation requested from PostgreSQL.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitRequestV1 {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub request_id: Uuid,
    /// Explicit web scope. The M0 profile rejects an empty list because
    /// authorization-aware cross-web sampling is not yet implemented.
    #[schemars(length(min = 1, max = 1_024))]
    pub web_ids: Vec<Uuid>,
    pub limits: FitResourceLimitsV1,
    pub input_bundle: FitInputReferenceV1,
    pub assurance: FitAssuranceMode,
}

impl Default for FitPostgresConfigurationV1 {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_owned(),
            port: 5432,
            user: "graph".to_owned(),
            database: "graph".to_owned(),
            password_file: Utf8PathBuf::from("secrets/postgres.password"),
        }
    }
}

impl Default for FitWorkerConfigurationV1 {
    fn default() -> Self {
        Self {
            schema_version: FIT_SCHEMA_VERSION,
            atlas_root: Utf8PathBuf::from("var/atlas"),
            input_root: Utf8PathBuf::from("inputs"),
            serving_config_output: Utf8PathBuf::from("var/atlas-api.json"),
            compute: AtlasComputeConfiguration::default(),
            postgres: FitPostgresConfigurationV1::default(),
            resources: FitResourcePreflightV1 {
                maximum_working_disk_bytes: 64 * 1_024 * 1_024 * 1_024,
            },
            actor_id: Uuid::nil(),
            cpu_threads: NonZeroUsize::new(8).expect("eight is non-zero"),
            profile: FitNumericalProfile::M0LocalV1,
            authorities: default_authorities(),
        }
    }
}

impl Default for FitRequestV1 {
    fn default() -> Self {
        Self {
            schema_version: FIT_SCHEMA_VERSION,
            request_id: Uuid::nil(),
            web_ids: vec![Uuid::from_u128(1)],
            limits: FitResourceLimitsV1 {
                maximum_entities: MAXIMUM_FIT_ENTITIES,
                maximum_links: MAXIMUM_FIT_LINKS,
                maximum_relation_types: MAXIMUM_FIT_RELATION_TYPES,
                maximum_required_types_per_link: MAXIMUM_FIT_REQUIRED_TYPES_PER_LINK,
                maximum_label_bytes: MAXIMUM_FIT_LABEL_BYTES,
            },
            input_bundle: FitInputReferenceV1 {
                path: Utf8PathBuf::from("m0-local-input-bundle.json"),
                sha256: "0".repeat(64),
            },
            assurance: FitAssuranceMode::EvidenceDeferredLocal,
        }
    }
}

fn default_authorities() -> FitAuthoritiesV1 {
    let release = FitSigningAuthorityV1 {
        authority: "local-m0-release-v1".to_owned(),
        secret_key_file: Utf8PathBuf::from("secrets/release.key"),
        expected_public_key: "0".repeat(64),
    };
    let authority = |gate: &str| FitExternalAuthorityV1 {
        authority: format!("local-m0-{gate}-v1"),
        issuer_command: Utf8PathBuf::from(format!("issuers/{gate}")),
        expected_public_key: "0".repeat(64),
    };
    FitAuthoritiesV1 {
        release,
        representation: authority("representation"),
        semantic_fidelity: authority("semantic-fidelity"),
        relation_policy: authority("relation-policy"),
        merge_tree_persistence: authority("merge-tree-persistence"),
        subgroup_behavior: authority("subgroup-behavior"),
        authorization_noninterference: authority("authorization-noninterference"),
        security_approval: authority("security-approval"),
        companion_pin: authority("companion-pin"),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use camino::Utf8Path;
    use schemars::schema_for;

    use super::*;

    const WORKER_DEFAULT: &str = include_str!("../../config/m0-local-worker.default.json");
    const REQUEST_DEFAULT: &str = include_str!("../../config/m0-local-request.default.json");
    const BUNDLE_DEFAULT: &str = include_str!("../../config/m0-local-input-bundle.default.json");

    #[test]
    fn checked_in_defaults_match_the_typed_v1_documents() {
        let worker: FitWorkerConfigurationV1 =
            serde_json::from_str(WORKER_DEFAULT).expect("worker default should match its schema");
        let request: FitRequestV1 =
            serde_json::from_str(REQUEST_DEFAULT).expect("request default should match its schema");
        let bundle: FitInputBundleV1 =
            serde_json::from_str(BUNDLE_DEFAULT).expect("bundle default should match its schema");

        assert_eq!(worker, FitWorkerConfigurationV1::default());
        assert_eq!(request, FitRequestV1::default());
        assert_eq!(bundle.schema_version, FIT_SCHEMA_VERSION);
    }

    #[test]
    fn checked_in_json_schemas_are_current() {
        let documents = [
            (
                "schemas/fit-worker-v1.schema.json",
                pretty(&schema_for!(FitWorkerConfigurationV1)),
                include_str!("../../schemas/fit-worker-v1.schema.json"),
            ),
            (
                "schemas/fit-request-v1.schema.json",
                pretty(&schema_for!(FitRequestV1)),
                include_str!("../../schemas/fit-request-v1.schema.json"),
            ),
            (
                "schemas/fit-input-bundle-v1.schema.json",
                pretty(&schema_for!(FitInputBundleV1)),
                include_str!("../../schemas/fit-input-bundle-v1.schema.json"),
            ),
        ];
        if std::env::var_os("UPDATE_FIT_SCHEMAS").is_some() {
            for (relative_path, generated, _checked_in) in &documents {
                fs::write(
                    Utf8Path::new(env!("CARGO_MANIFEST_DIR")).join(relative_path),
                    generated,
                )
                .expect("schema should be writable");
            }
        } else {
            for (relative_path, generated, checked_in) in documents {
                assert_eq!(
                    generated, checked_in,
                    "{relative_path} is stale; run UPDATE_FIT_SCHEMAS=1 cargo test -p \
                     hash-graph-atlas checked_in_json_schemas_are_current"
                );
            }
        }
    }

    fn pretty(schema: &schemars::Schema) -> String {
        format!(
            "{}\n",
            serde_json::to_string_pretty(&schema).expect("schema should serialize")
        )
    }
}
