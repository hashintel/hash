//! Command-line envelope for fitting and serving Atlas generations.
//!
//! `fit` loads one versioned worker configuration and one versioned request,
//! then delegates their bounded bytes to an [`AtlasTrainer`]. `serve` starts
//! the Axum 0.8 router over cryptographically verified active state.
//!
//! # Fitting boundary
//!
//! `fit --config <worker.json> --request <request.json>` reads each document
//! at most 16 MiB and gives the exact bytes plus source paths to the trainer.
//! [`crate::salt_fit::ProductionAtlasTrainer`] implements the checked-in v1 schemas,
//! direct current-snapshot PostgreSQL extraction, strict or explicitly
//! evidence-deferred gate issuance, activation, and independent restart
//! loading.
//!
//! A successful trainer is expected to freeze authorized inputs, generate and
//! verify every artifact, publish an inactive candidate, explicitly activate
//! it, and reopen it through restart verification before returning
//! [`FitReceipt`]. The CLI prints only that stable receipt as one JSON line.
//!
//! # Serving boundary
//!
//! `serve --config <path>` loads [`AtlasApiConfiguration`], initializes the
//! configured `CubeCL` GPU checkpoint backend, binds the requested TCP address, and
//! runs the modern Axum router. SIGINT and, on Unix, SIGTERM trigger graceful
//! shutdown. Startup fails when no generation is active. The default bind
//! address is `127.0.0.1:4010`.
//!
//! Request and configuration documents use bounded reads and structured
//! errors; the receipt has one fixed output schema. Standard `--help` and
//! `--version` output remains owned by Clap and exits successfully.

use core::{error::Error, fmt, future::Future, net::SocketAddr, pin::Pin};
use std::{
    fs::File,
    io::{self, Read as _, Write as _},
};

#[cfg(test)]
use burn::backend::{NdArray, ndarray::NdArrayDevice};
use bytes::Bytes;
use camino::{Utf8Path, Utf8PathBuf};
use clap::{Parser, Subcommand, error::ErrorKind};
use serde::Serialize;

use crate::{
    api::{AtlasApiConfiguration, AtlasApiState, AtlasComputeBackend, router},
    salt::compute::{ProductionInferenceBackend, initialize_cubecl_compute},
};

const MAX_COMMAND_JSON_BYTES: u64 = 16 * 1024 * 1024;
/// Version of the stable JSON document emitted by `fit`.
pub const FIT_RECEIPT_SCHEMA_VERSION: u32 = 3;

/// Top-level HASH Graph Atlas command.
#[derive(Debug, Parser)]
#[command(name = "hash-graph-atlas", version, about)]
pub struct AtlasCommand {
    #[command(subcommand)]
    command: AtlasSubcommand,
}

/// Supported Atlas process modes.
#[derive(Debug, Subcommand)]
enum AtlasSubcommand {
    /// Fit, verify, publish, activate, and reopen one generation.
    Fit(FitCommand),
    /// Serve the currently active generation over HTTP.
    Serve(ServeCommand),
}

/// Input to an injected production fitting adapter.
pub struct FitRequest {
    configuration_source: Utf8PathBuf,
    configuration_bytes: Bytes,
    source: Utf8PathBuf,
    bytes: Bytes,
}

impl FitRequest {
    /// Returns the path from which the worker configuration was loaded.
    #[must_use]
    pub fn configuration_source(&self) -> &Utf8Path {
        &self.configuration_source
    }

    /// Borrows the bounded worker-configuration JSON bytes.
    #[must_use]
    pub fn configuration_bytes(&self) -> &[u8] {
        &self.configuration_bytes
    }

    /// Returns the path from which the request was loaded.
    #[must_use]
    pub fn source(&self) -> &Utf8Path {
        &self.source
    }

    /// Borrows the bounded JSON request bytes.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
}

/// Provenance class for one mandatory release gate.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FitGateAssuranceClass {
    /// The SALT runner measured the immutable generated output.
    RunnerMeasured,
    /// A content-addressed external report supplied the measurement.
    ExternallyMeasured,
    /// The local worker measured a deliberately reduced M0 cohort.
    PartiallyMeasured,
    /// The worker attested a documented local operational claim.
    LocalAttestation,
    /// The gate is provisional and does not provide release-grade evidence.
    Deferred,
}

/// Stable public name of one M0 release gate.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FitGate {
    /// Full-to-prefix representation quality.
    Representation,
    /// Approximate-neighbor recall against the exact oracle.
    AnnRecall,
    /// Semantic-neighbor preservation in the selected field.
    SemanticFidelity,
    /// Classifier and relation-policy governance.
    RelationPolicy,
    /// Relation-energy improvement over the baseline field.
    RelationSatisfaction,
    /// Two-sided merge-tree persistence diagnostics.
    MergeTreePersistence,
    /// Eligible-cohort behavior relative to the complete corpus.
    SubgroupBehavior,
    /// Coordinate influence after visibility filtering.
    AuthorizationNoninterference,
    /// Extraction and permission-snapshot consistency.
    SnapshotConsistency,
    /// Independent reproduction of the generated output.
    Reproducibility,
    /// Operator-owned security review.
    SecurityApproval,
    /// Compatibility of the pinned canvas companion.
    CompanionPin,
}

/// Assurance classification attached to one release gate.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FitGateAssurance {
    /// Gate receiving this classification.
    pub gate: FitGate,
    /// Origin and strength of the gate's evidence.
    pub assurance: FitGateAssuranceClass,
}

/// Monotonic wall-clock timings for one fit attempt.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[expect(
    clippy::struct_field_names,
    reason = "the public receipt keeps every timing unit explicit"
)]
pub struct FitTiming {
    /// Worker, request, secrets, and input-bundle loading time.
    pub configuration_milliseconds: u64,
    /// PostgreSQL connection and repeatable-read extraction time.
    pub extraction_milliseconds: u64,
    /// SALT source, evaluator, signer, and profile preparation time.
    pub preparation_milliseconds: u64,
    /// Permission, generation, publication, activation, and reload time.
    pub generation_milliseconds: u64,
    /// Projector training subset of generation time.
    pub projector_training_milliseconds: u64,
    /// Complete trainer wall time.
    pub total_milliseconds: u64,
}

/// Checked estimates and observed resource high-water marks.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitResourceReceipt {
    pub estimated_peak_resident_bytes: u64,
    pub estimated_working_disk_bytes: u64,
    pub available_memory_bytes_at_preflight: u64,
    pub available_disk_bytes_at_preflight: u64,
    pub observed_peak_resident_bytes: u64,
    pub observed_working_disk_high_water_bytes: u64,
    pub published_artifact_bytes: u64,
}

/// Stable command output from one completed fit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitReceipt {
    /// Version of this receipt document.
    pub schema_version: u32,
    /// Caller identity of the fit request.
    pub request_id: uuid::Uuid,
    /// Exact bounded request-document identity.
    pub request_hash: String,
    /// Exact bounded worker-configuration identity, excluding loaded secrets.
    pub worker_configuration_hash: String,
    /// Verified content identity of the input-bundle document.
    pub input_bundle_hash: String,
    /// Identity of the resolved immutable numerical recipe.
    pub profile_hash: String,
    /// Explicit assurance profile used by the worker.
    pub assurance: String,
    /// GPU backend that executed training and checkpoint reload.
    pub compute_backend: AtlasComputeBackend,
    /// Zero-based accelerator ordinal bound into generation identity.
    pub compute_device_ordinal: u16,
    /// Provenance class of every mandatory M0 release gate.
    pub gate_assurance: Vec<FitGateAssurance>,
    /// Actor whose visibility defined the atlas.
    pub actor_id: uuid::Uuid,
    /// Canonical hash of the sorted requested web scope.
    pub web_scope_hash: String,
    /// Application-derived repeatable-read snapshot identity.
    pub store_snapshot_identity: String,
    /// WAL-derived authorization revision sampled inside extraction.
    pub extraction_authorization_revision: String,
    /// WAL-derived authorization revision sampled around permission reads.
    pub authorization_revision: String,
    /// Exact streamed ontology provenance identity.
    pub ontology_hash: String,
    /// Exact streamed knowledge provenance identity.
    pub knowledge_hash: String,
    /// Exact extraction payload and link-type-selection identity.
    pub extraction_provenance_hash: String,
    /// Number of eligible point rows in the frozen PostgreSQL domain.
    pub available_entity_count: usize,
    /// Number of complete 3,072-dimensional rows extracted into memory.
    pub extracted_entity_count: usize,
    /// Number of rows persisted in the activated canonical base.
    pub materialized_entity_count: usize,
    /// Number of admitted extraction-time relation candidates.
    pub link_count: usize,
    /// Number of selected relation types.
    pub relation_type_count: usize,
    /// Links for which deterministic first-link-type selection was required.
    pub ambiguous_link_type_count: usize,
    /// Content-addressed generation identity.
    pub generation: String,
    /// Canonical generation-manifest content hash.
    pub manifest_hash: String,
    /// Signed aggregate release-report content hash.
    pub release_report_hash: String,
    /// Explicit compare-and-swap activation result.
    pub activation: FitActivation,
    /// Whether a fresh serving reader reverified the activated release.
    pub restart_verified: bool,
    /// Measured phase timings for the completed attempt.
    pub timing: FitTiming,
    /// Resource estimates and observed process/filesystem high-water marks.
    pub resources: FitResourceReceipt,
    /// Generated trust configuration for the read-only REST server.
    pub serving_configuration: String,
}

/// Explicit activation result reported by a fitting adapter.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FitActivation {
    /// The fit changed the active pointer to the generated release.
    Activated,
    /// The exact generated release was already active.
    AlreadyActive,
}

/// A production adapter capable of running one complete Atlas fit request.
pub trait AtlasTrainer: Send + Sync {
    /// Executes a bounded request loaded by the CLI.
    fn fit(
        &self,
        request: FitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>>;
}

/// Closure-backed production fitting adapter.
pub struct CallbackAtlasTrainer<Callback> {
    callback: Callback,
}

impl<Callback> CallbackAtlasTrainer<Callback> {
    /// Wraps a fitting callback for CLI composition.
    #[must_use]
    pub const fn new(callback: Callback) -> Self {
        Self { callback }
    }
}

impl<Callback, FitFuture> AtlasTrainer for CallbackAtlasTrainer<Callback>
where
    Callback: Fn(FitRequest) -> FitFuture + Send + Sync,
    FitFuture: Future<Output = Result<FitReceipt, AtlasFitError>> + Send + 'static,
{
    fn fit(
        &self,
        request: FitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>> {
        Box::pin((self.callback)(request))
    }
}

/// A fitting-adapter failure suitable for CLI presentation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtlasFitError {
    detail: String,
}

impl AtlasFitError {
    /// Creates an adapter-owned fitting failure.
    #[must_use]
    pub fn new(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
        }
    }
}

impl fmt::Display for AtlasFitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)
    }
}

impl Error for AtlasFitError {}

/// Explicitly disabled fitting adapter for applications that only embed serving.
///
/// The standalone binary uses [`crate::salt_fit::ProductionAtlasTrainer`].
#[derive(Debug, Default, Copy, Clone)]
pub struct UnconfiguredAtlasTrainer;

impl AtlasTrainer for UnconfiguredAtlasTrainer {
    fn fit(
        &self,
        _request: FitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>> {
        Box::pin(core::future::ready(Err(AtlasFitError::new(
            "no Atlas fitting adapter is configured for this binary",
        ))))
    }
}

/// Parses process arguments and runs the selected command.
///
/// # Errors
///
/// Returns an error when argument parsing, bounded input loading, fitting,
/// trust configuration, listener setup, or HTTP serving fails.
pub async fn run_with<Arguments, Argument, Trainer>(
    arguments: Arguments,
    trainer: &Trainer,
) -> Result<(), AtlasCliError>
where
    Arguments: IntoIterator<Item = Argument>,
    Argument: Into<std::ffi::OsString> + Clone,
    Trainer: AtlasTrainer + ?Sized,
{
    let command = match AtlasCommand::try_parse_from(arguments) {
        Ok(command) => command,
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
            ) =>
        {
            error
                .print()
                .map_err(|error| AtlasCliError::new("could not display Atlas help", error))?;
            return Ok(());
        }
        Err(error) => {
            return Err(AtlasCliError::new("invalid Atlas command", error));
        }
    };
    run(command, trainer).await
}

/// Runs an already parsed Atlas command.
///
/// # Errors
///
/// Returns an error when fitting or serving cannot complete.
pub async fn run<Trainer>(command: AtlasCommand, trainer: &Trainer) -> Result<(), AtlasCliError>
where
    Trainer: AtlasTrainer + ?Sized,
{
    match command.command {
        AtlasSubcommand::Fit(command) => run_fit(command, trainer).await,
        AtlasSubcommand::Serve(command) => run_server(command).await,
    }
}

#[derive(Debug, clap::Args)]
struct FitCommand {
    /// Versioned JSON configuration for the dedicated fitting worker.
    #[arg(long)]
    config: Utf8PathBuf,
    /// Versioned JSON request for one current-snapshot fit.
    #[arg(long)]
    request: Utf8PathBuf,
}

#[derive(Debug, clap::Args)]
struct ServeCommand {
    /// JSON file containing Atlas root and release verification keys.
    #[arg(long)]
    config: Utf8PathBuf,
    /// TCP address for the Axum listener.
    #[arg(long, default_value = "127.0.0.1:4010")]
    bind: SocketAddr,
}

async fn run_fit<Trainer>(command: FitCommand, trainer: &Trainer) -> Result<(), AtlasCliError>
where
    Trainer: AtlasTrainer + ?Sized,
{
    let configuration_bytes = read_bounded(&command.config, MAX_COMMAND_JSON_BYTES)?;
    serde_json::from_slice::<serde_json::Value>(&configuration_bytes).map_err(|error| {
        AtlasCliError::new("Atlas fit worker configuration is not valid JSON", error)
    })?;
    let bytes = read_bounded(&command.request, MAX_COMMAND_JSON_BYTES)?;
    serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|error| AtlasCliError::new("Atlas fit request is not valid JSON", error))?;
    let receipt = trainer
        .fit(FitRequest {
            configuration_source: command.config,
            configuration_bytes: Bytes::from(configuration_bytes),
            source: command.request,
            bytes: Bytes::from(bytes),
        })
        .await
        .map_err(|error| AtlasCliError::new("Atlas fit failed", error))?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer(&mut output, &receipt)
        .map_err(|error| AtlasCliError::new("could not encode Atlas fit receipt", error))?;
    output
        .write_all(b"\n")
        .map_err(|error| AtlasCliError::new("could not write Atlas fit receipt", error))
}

async fn run_server(command: ServeCommand) -> Result<(), AtlasCliError> {
    let configuration = read_bounded(&command.config, MAX_COMMAND_JSON_BYTES)?;
    let configuration = serde_json::from_slice::<AtlasApiConfiguration>(&configuration)
        .map_err(|error| AtlasCliError::new("Atlas API configuration is invalid", error))?;
    let compute = initialize_cubecl_compute(configuration.compute).map_err(|error| {
        AtlasCliError::new("Atlas API accelerator initialization failed", error)
    })?;
    let state =
        AtlasApiState::<ProductionInferenceBackend>::new(configuration, compute.into_device())
            .map_err(|error| {
                AtlasCliError::new("Atlas API trust configuration is invalid", error)
            })?;
    let listener = tokio::net::TcpListener::bind(command.bind)
        .await
        .map_err(|error| AtlasCliError::new("could not bind Atlas API listener", error))?;
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|error| AtlasCliError::new("Atlas API server failed", error))
}

#[cfg(test)]
async fn run_server_for_tests(command: ServeCommand) -> Result<(), AtlasCliError> {
    let configuration = read_bounded(&command.config, MAX_COMMAND_JSON_BYTES)?;
    let configuration = serde_json::from_slice::<AtlasApiConfiguration>(&configuration)
        .map_err(|error| AtlasCliError::new("Atlas API configuration is invalid", error))?;
    let state = AtlasApiState::<NdArray>::new_for_tests(configuration, NdArrayDevice::Cpu)
        .map_err(|error| AtlasCliError::new("Atlas API trust configuration is invalid", error))?;
    let listener = tokio::net::TcpListener::bind(command.bind)
        .await
        .map_err(|error| AtlasCliError::new("could not bind Atlas API listener", error))?;
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|error| AtlasCliError::new("Atlas API server failed", error))
}

async fn shutdown_signal() {
    let control_c = async {
        let _result = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    {
        let terminate = async {
            match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
                Ok(mut signal) => {
                    signal.recv().await;
                }
                Err(_error) => core::future::pending().await,
            }
        };
        tokio::select! {
            () = control_c => {}
            () = terminate => {}
        }
    }

    #[cfg(not(unix))]
    control_c.await;
}

fn read_bounded(path: &Utf8Path, maximum: u64) -> Result<Vec<u8>, AtlasCliError> {
    let mut file = File::open(path)
        .map_err(|error| AtlasCliError::new(format!("could not open {path}"), error))?;
    if !file
        .metadata()
        .map_err(|error| AtlasCliError::new(format!("could not inspect {path}"), error))?
        .is_file()
    {
        return Err(AtlasCliError::message(format!(
            "{path} is not a regular file"
        )));
    }
    let mut bytes = Vec::new();
    std::io::Read::by_ref(&mut file)
        .take(maximum.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| AtlasCliError::new(format!("could not read {path}"), error))?;
    if match u64::try_from(bytes.len()) {
        Ok(length) => length > maximum,
        Err(_error) => true,
    } {
        return Err(AtlasCliError::message(format!(
            "{path} exceeds the {maximum}-byte command input limit"
        )));
    }
    Ok(bytes)
}

/// A command-line setup or execution failure.
#[derive(Debug)]
pub struct AtlasCliError {
    detail: String,
    source: Option<Box<dyn Error + Send + Sync>>,
}

impl AtlasCliError {
    fn new(detail: impl Into<String>, source: impl Error + Send + Sync + 'static) -> Self {
        Self {
            detail: detail.into(),
            source: Some(Box::new(source)),
        }
    }

    fn message(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
            source: None,
        }
    }
}

impl fmt::Display for AtlasCliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)?;
        if let Some(source) = &self.source {
            write!(formatter, ": {source}")?;
        }
        Ok(())
    }
}

impl Error for AtlasCliError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.source
            .as_deref()
            .map(|source| source as &(dyn Error + 'static))
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::fmt::Write as _;
    use std::sync::Mutex;

    use ed25519_dalek::SigningKey;

    use super::*;
    use crate::api::{ExternalGate, ExternalVerifierConfiguration, VerifierConfiguration};

    #[test]
    fn command_schema_accepts_fit_and_serve() {
        AtlasCommand::try_parse_from([
            "atlas",
            "fit",
            "--config",
            "worker.json",
            "--request",
            "request.json",
        ])
        .expect("fit command should parse");
        AtlasCommand::try_parse_from(["atlas", "serve", "--config", "server.json"])
            .expect("serve command should parse");
    }

    #[tokio::test]
    async fn fit_forwards_exact_bounded_documents_to_the_trainer() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let configuration = temporary.path().join("worker.json");
        let request = temporary.path().join("request.json");
        let configuration_bytes = br#"{"schemaVersion":1,"worker":"exact"}"#;
        let request_bytes = br#"{"schemaVersion":1,"request":"exact"}"#;
        std::fs::write(&configuration, configuration_bytes)
            .expect("configuration fixture should be written");
        std::fs::write(&request, request_bytes).expect("request fixture should be written");

        let observed = Arc::new(Mutex::new(None));
        let callback_observed = Arc::clone(&observed);
        let trainer = CallbackAtlasTrainer::new(move |fit_request: FitRequest| {
            let callback_observed = Arc::clone(&callback_observed);
            async move {
                *callback_observed
                    .lock()
                    .expect("observation lock should not be poisoned") = Some((
                    fit_request.configuration_source().to_owned(),
                    fit_request.configuration_bytes().to_vec(),
                    fit_request.source().to_owned(),
                    fit_request.bytes().to_vec(),
                ));
                Err::<FitReceipt, _>(AtlasFitError::new("trainer sentinel"))
            }
        });

        let error = run_with(
            [
                "atlas",
                "fit",
                "--config",
                configuration
                    .to_str()
                    .expect("temporary configuration path should be UTF-8"),
                "--request",
                request
                    .to_str()
                    .expect("temporary request path should be UTF-8"),
            ],
            &trainer,
        )
        .await
        .expect_err("the sentinel trainer should fail");
        assert!(error.to_string().contains("trainer sentinel"));

        let observed = observed
            .lock()
            .expect("observation lock should not be poisoned")
            .take()
            .expect("trainer should observe the request");
        assert_eq!(
            observed.0,
            Utf8PathBuf::from_path_buf(configuration)
                .expect("temporary configuration path should be UTF-8")
        );
        assert_eq!(observed.1, configuration_bytes);
        assert_eq!(
            observed.2,
            Utf8PathBuf::from_path_buf(request).expect("temporary request path should be UTF-8")
        );
        assert_eq!(observed.3, request_bytes);
    }

    #[tokio::test]
    async fn serve_fails_before_binding_when_no_generation_is_active() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let config = temporary.path().join("server.json");
        let gates = [
            ExternalGate::Representation,
            ExternalGate::SemanticFidelity,
            ExternalGate::RelationPolicy,
            ExternalGate::MergeTreePersistence,
            ExternalGate::SubgroupBehavior,
            ExternalGate::AuthorizationNoninterference,
            ExternalGate::SecurityApproval,
            ExternalGate::CompanionPin,
        ];
        let configuration = AtlasApiConfiguration {
            root: temporary.path().to_string_lossy().into_owned(),
            compute: crate::api::AtlasComputeConfiguration::default(),
            release_verifier: VerifierConfiguration {
                authority: "release".to_owned(),
                public_key: public_key(1),
            },
            external_verifiers: gates
                .into_iter()
                .enumerate()
                .map(|(index, gate)| ExternalVerifierConfiguration {
                    gate,
                    authority: format!("external-{index}"),
                    public_key: public_key(
                        u8::try_from(index + 2).expect("fixture key seed should fit u8"),
                    ),
                })
                .collect(),
            allow_evidence_deferred: false,
            tile_point_budget: 4_096,
            store: None,
        };
        std::fs::write(
            &config,
            serde_json::to_vec(&configuration).expect("configuration should serialize"),
        )
        .expect("server configuration should be written");

        let error = run_server_for_tests(ServeCommand {
            config: Utf8PathBuf::from_path_buf(config)
                .expect("temporary configuration path should be UTF-8"),
            bind: "127.0.0.1:0"
                .parse()
                .expect("ephemeral loopback bind should parse"),
        })
        .await
        .expect_err("empty activation root must fail");

        assert!(
            error
                .to_string()
                .contains("run `hash-graph-atlas fit` first")
        );
    }

    fn public_key(seed: u8) -> String {
        SigningKey::from_bytes(&[seed; 32])
            .verifying_key()
            .to_bytes()
            .into_iter()
            .fold(String::with_capacity(64), |mut encoded, byte| {
                write!(encoded, "{byte:02x}").expect("writing to a String should succeed");
                encoded
            })
    }
}
