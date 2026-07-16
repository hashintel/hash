//! Concrete direct-PostgreSQL implementation of the public fit façade.

#![expect(
    clippy::std_instead_of_alloc,
    reason = "m0-local-v1 is a std-only worker"
)]

use core::{error::Error, future::Future, pin::Pin, time::Duration};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::Write as _,
    sync::{Mutex, OnceLock},
    time::Instant,
};

use camino::Utf8Path;
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use tempfile::NamedTempFile;
use type_system::principal::actor::ActorEntityUuid;

use super::{
    configuration::{
        LoadedFitAuthority, encode_hex, load_input_bundle, load_request,
        load_worker_configuration_for_assurance,
    },
    evidence::{EXTERNAL_GATES, FitRuntimeAuthorities},
    input::{PreparedFitSource, prepare_fit_source},
    postgres::{ConnectedExtraction, FitAuthorizationRevisionProvider, connect_and_extract},
    profile::m0_local_profile,
};
use crate::{
    api::{
        AtlasApiConfiguration, ExternalGate, ExternalVerifierConfiguration, VerifierConfiguration,
    },
    cli::{
        AtlasFitError, AtlasTrainer, FIT_RECEIPT_SCHEMA_VERSION, FitActivation, FitGate,
        FitGateAssurance, FitGateAssuranceClass, FitReceipt, FitRequest as CliFitRequest,
        FitResourceReceipt, FitTiming,
    },
    salt::{
        ContentHash, ContentHasher,
        compute::{
            ProductionInferenceBackend, ProductionTrainingBackend, initialize_cubecl_compute,
        },
        salt_fit_boundary::{
            ActivationOutcome, CanonicalReleaseAuthority, FileActivationStore,
            StoreBackedCanonicalGenerationRequest, StoreBackedSnapshotRequest,
            TrustedExternalGateAuthority, run_local_m0_canonical_generation,
        },
    },
    salt_fit::resource::ResidentMemoryMonitor,
};

static RAYON_THREADS: OnceLock<usize> = OnceLock::new();
static RAYON_CONFIGURATION_LOCK: Mutex<()> = Mutex::new(());

/// Operational trainer used by the standalone `hash-graph-atlas fit` command.
#[derive(Debug, Default, Copy, Clone)]
pub struct ProductionAtlasTrainer;

impl AtlasTrainer for ProductionAtlasTrainer {
    fn fit(
        &self,
        request: CliFitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>> {
        Box::pin(async move {
            // Fitting performs long synchronous numerical and durable-filesystem
            // work. Own a blocking worker and a private single-thread runtime so
            // joining the numerical phase cannot occupy an Axum/Tokio worker.
            match tokio::task::spawn_blocking(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|error| -> Box<dyn Error + Send + Sync> { Box::new(error) })?;
                runtime.block_on(fit(request))
            })
            .await
            {
                Ok(Ok(receipt)) => Ok(receipt),
                Ok(Err(error)) => Err(atlas_fit_error(error.as_ref())),
                Err(error) => Err(AtlasFitError::new(format!(
                    "Atlas fitting worker terminated unexpectedly: {error}"
                ))),
            }
        })
    }
}

#[expect(
    clippy::too_many_lines,
    reason = "the worker keeps extraction, evidence, activation, and receipt binding in one flow"
)]
async fn fit(request: CliFitRequest) -> Result<FitReceipt, Box<dyn Error + Send + Sync>> {
    let resource_monitor = ResidentMemoryMonitor::start()?;
    let started = Instant::now();
    let configuration_started = Instant::now();
    let request_hash = document_hash(b"hash.graph.atlas.fit.request-document.v1", request.bytes());
    let worker_configuration_hash = document_hash(
        b"hash.graph.atlas.fit.worker-configuration-document.v1",
        request.configuration_bytes(),
    );
    let fit_request = load_request(request.bytes())?;
    let worker = load_worker_configuration_for_assurance(
        request.configuration_source(),
        request.configuration_bytes(),
        fit_request.assurance,
    )?;
    configure_rayon(worker.document.cpu_threads.get())?;
    let compute = initialize_cubecl_compute(worker.document.compute)?;
    let bundle = load_input_bundle(&worker.input_root, &fit_request.input_bundle)?;
    let input_bundle_hash = fit_request.input_bundle.sha256.clone();
    let configuration_elapsed = configuration_started.elapsed();

    let extraction_started = Instant::now();
    let ConnectedExtraction { store, extraction } =
        connect_and_extract(&worker, &fit_request).await?;
    let extraction_elapsed = extraction_started.elapsed();

    let preparation_started = Instant::now();
    let envelope = extraction.envelope;
    let provenance_hash = extraction.provenance_hash;
    let available_entity_count = extraction.available_entity_count;
    let available_link_count = extraction.available_link_count;
    let resource_preflight = extraction.resource_preflight;
    let entity_count = extraction.entities.len();
    let link_count = extraction.links.len();
    if entity_count != available_entity_count || link_count != available_link_count {
        return Err("full-corpus extraction counts changed before source preparation".into());
    }
    let relation_type_count = extraction
        .links
        .iter()
        .map(|link| link.relation_type.selected.clone())
        .collect::<BTreeSet<_>>()
        .len();
    let ambiguous_link_type_count = extraction.ambiguous_link_type_count;
    let PreparedFitSource {
        source,
        link_candidates,
        temporal_axes,
        relation_security_policy,
        extraction_receipt,
        authorization_report_hash: _authorization_report_hash,
        condition_evaluator,
        persistence_evaluator,
    } = prepare_fit_source(&worker, &bundle, extraction, fit_request.assurance)?;

    let authorities = FitRuntimeAuthorities::new(
        &worker.authorities,
        &worker.atlas_root,
        fit_request.assurance,
    )?;
    let external = authorities.external();
    let mut trusted = Vec::with_capacity(EXTERNAL_GATES.len());
    for (gate, authority) in EXTERNAL_GATES.into_iter().zip(external) {
        trusted.push(TrustedExternalGateAuthority::new(
            gate,
            &authority.issuer,
            authority.verifier.clone(),
        )?);
    }
    let release_authority = CanonicalReleaseAuthority::new(&authorities.release, trusted)?;
    let serving_store = FileActivationStore::<ProductionInferenceBackend>::new(
        worker.atlas_root.clone(),
        authorities.release.verifier(),
        release_authority.external_verifiers().clone(),
        compute.device().clone(),
    );
    let expected_active = serving_store.load_active()?.map(|loaded| loaded.release());
    // The serving trust document is release-independent. Persist it before
    // numerical work so no filesystem failure remains after activation.
    write_serving_configuration(&worker, &authorities, fit_request.assurance)?;

    let profile = m0_local_profile(
        &worker.atlas_root,
        entity_count,
        link_count,
        relation_type_count,
        condition_evaluator.as_ref(),
        &persistence_evaluator,
    )?;
    let actor = AuthenticatedActor::from(ActorEntityUuid::new(worker.document.actor_id));
    let snapshot = StoreBackedSnapshotRequest::new(
        actor,
        temporal_axes,
        link_candidates,
        relation_security_policy,
        extraction_receipt,
    );
    let generation_request = StoreBackedCanonicalGenerationRequest::new(snapshot, source)
        .with_expected_active(expected_active);
    let revision_provider = match fit_request.assurance {
        super::FitAssuranceMode::M0LocalAttestation => {
            FitAuthorizationRevisionProvider::optimistic(&store)
        }
        super::FitAssuranceMode::EvidenceDeferredLocal => {
            FitAuthorizationRevisionProvider::evidence_deferred(envelope.authorization_revision)
        }
    };
    let preparation_elapsed = preparation_started.elapsed();

    let generation_started = Instant::now();
    let completed = Box::pin(run_local_m0_canonical_generation::<
        _,
        _,
        ProductionTrainingBackend,
    >(
        &store,
        &revision_provider,
        generation_request,
        &profile,
        &release_authority,
        compute,
    ))
    .await?;
    let generation_elapsed = generation_started.elapsed();

    let generated = completed.generated();
    let materialized_entity_count = usize::try_from(generated.manifest.storage.row_count)
        .map_err(|_error| "materialized row count does not fit usize")?;
    if materialized_entity_count != entity_count {
        return Err("activated generation does not contain every extracted point".into());
    }
    let profile_hash = generated.manifest.reproducibility.config_hash;
    let working_disk_high_water_bytes = generated.working_disk_high_water_bytes;
    let published_artifact_bytes = generated.published_artifact_bytes;
    let candidate = generated.candidate;
    let manifest_publication = candidate.manifest();
    let gated_release = candidate.release();
    let activation = match completed.activation() {
        ActivationOutcome::Activated(_) => FitActivation::Activated,
        ActivationOutcome::AlreadyActive(_) => FitActivation::AlreadyActive,
        ActivationOutcome::Conflict { .. } => {
            return Err("SALT returned an unresolved activation conflict".into());
        }
    };
    let observed_peak_resident_bytes = resource_monitor.finish()?;
    Ok(FitReceipt {
        schema_version: FIT_RECEIPT_SCHEMA_VERSION,
        request_id: fit_request.request_id,
        request_hash: request_hash.to_string(),
        worker_configuration_hash: worker_configuration_hash.to_string(),
        input_bundle_hash,
        profile_hash: profile_hash.to_string(),
        assurance: assurance_name(fit_request.assurance).to_owned(),
        compute_backend: worker.document.compute.backend,
        compute_device_ordinal: worker.document.compute.device_ordinal,
        gate_assurance: gate_assurance(fit_request.assurance),
        actor_id: worker.document.actor_id,
        web_scope_hash: web_scope_hash(&fit_request.web_ids).to_string(),
        store_snapshot_identity: envelope.store_snapshot_identity.to_string(),
        extraction_authorization_revision: envelope.authorization_revision.to_string(),
        authorization_revision: generated
            .manifest
            .input_snapshot
            .authorization_revision
            .to_string(),
        ontology_hash: envelope.ontology_hash.to_string(),
        knowledge_hash: envelope.knowledge_hash.to_string(),
        extraction_provenance_hash: provenance_hash.to_string(),
        available_entity_count,
        extracted_entity_count: entity_count,
        materialized_entity_count,
        link_count,
        relation_type_count,
        ambiguous_link_type_count,
        generation: generated.manifest.generation_id.to_string(),
        manifest_hash: manifest_publication.content_hash.to_string(),
        release_report_hash: gated_release.report().to_string(),
        activation,
        restart_verified: completed.loaded().release().head() == gated_release.head(),
        timing: FitTiming {
            configuration_milliseconds: duration_milliseconds(configuration_elapsed),
            extraction_milliseconds: duration_milliseconds(extraction_elapsed),
            preparation_milliseconds: duration_milliseconds(preparation_elapsed),
            generation_milliseconds: duration_milliseconds(generation_elapsed),
            projector_training_milliseconds: duration_milliseconds(generated.training_wall_time),
            total_milliseconds: duration_milliseconds(started.elapsed()),
        },
        resources: FitResourceReceipt {
            estimated_peak_resident_bytes: resource_preflight.estimate.peak_resident_bytes,
            estimated_working_disk_bytes: resource_preflight.estimate.working_disk_bytes,
            available_memory_bytes_at_preflight: resource_preflight.available_memory_bytes,
            available_disk_bytes_at_preflight: resource_preflight.available_disk_bytes,
            observed_peak_resident_bytes,
            observed_working_disk_high_water_bytes: working_disk_high_water_bytes,
            published_artifact_bytes,
        },
        serving_configuration: worker.serving_config_output.to_string(),
    })
}

fn document_hash(domain: &'static [u8], bytes: &[u8]) -> ContentHash {
    let mut hasher = ContentHasher::new(domain);
    hasher.update(bytes);
    hasher.finish()
}

fn duration_milliseconds(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

const fn assurance_name(assurance: super::FitAssuranceMode) -> &'static str {
    match assurance {
        super::FitAssuranceMode::M0LocalAttestation => "m0_local_attestation",
        super::FitAssuranceMode::EvidenceDeferredLocal => "evidence_deferred_local",
    }
}

fn gate_assurance(assurance: super::FitAssuranceMode) -> Vec<FitGateAssurance> {
    use FitGateAssuranceClass::{
        ExternallyMeasured, LocalAttestation, PartiallyMeasured, RunnerMeasured,
    };

    if assurance == super::FitAssuranceMode::EvidenceDeferredLocal {
        return [
            FitGate::Representation,
            FitGate::AnnRecall,
            FitGate::SemanticFidelity,
            FitGate::RelationPolicy,
            FitGate::RelationSatisfaction,
            FitGate::MergeTreePersistence,
            FitGate::SubgroupBehavior,
            FitGate::AuthorizationNoninterference,
            FitGate::SnapshotConsistency,
            FitGate::Reproducibility,
            FitGate::SecurityApproval,
            FitGate::CompanionPin,
        ]
        .into_iter()
        .map(|gate| FitGateAssurance {
            gate,
            assurance: FitGateAssuranceClass::Deferred,
        })
        .collect();
    }
    [
        (FitGate::Representation, RunnerMeasured),
        (FitGate::AnnRecall, RunnerMeasured),
        (FitGate::SemanticFidelity, RunnerMeasured),
        (FitGate::RelationPolicy, ExternallyMeasured),
        (FitGate::RelationSatisfaction, RunnerMeasured),
        (FitGate::MergeTreePersistence, RunnerMeasured),
        (FitGate::SubgroupBehavior, PartiallyMeasured),
        (FitGate::AuthorizationNoninterference, LocalAttestation),
        (FitGate::SnapshotConsistency, LocalAttestation),
        (FitGate::Reproducibility, RunnerMeasured),
        (FitGate::SecurityApproval, ExternallyMeasured),
        (FitGate::CompanionPin, ExternallyMeasured),
    ]
    .into_iter()
    .map(|(gate, assurance)| FitGateAssurance { gate, assurance })
    .collect()
}

fn configure_rayon(threads: usize) -> Result<(), Box<dyn Error + Send + Sync>> {
    let _configuration = RAYON_CONFIGURATION_LOCK
        .lock()
        .map_err(|_poisoned| "the process Rayon configuration lock is poisoned")?;
    if let Some(configured) = RAYON_THREADS.get() {
        return if *configured == threads {
            Ok(())
        } else {
            Err(format!(
                "the process Rayon pool already uses {configured} threads, not requested {threads}"
            )
            .into())
        };
    }
    rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .thread_name(|index| format!("atlas-fit-{index}"))
        .build_global()
        .map_err(|error| format!("could not configure the Atlas Rayon pool: {error}"))?;
    let _configured = RAYON_THREADS.set(threads);
    Ok(())
}

fn web_scope_hash(web_ids: &[uuid::Uuid]) -> ContentHash {
    let mut web_ids = web_ids.to_vec();
    web_ids.sort_unstable();
    web_ids.dedup();
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.web-scope.v1");
    for web_id in web_ids {
        hasher.update(web_id.as_bytes());
    }
    hasher.finish()
}

fn write_serving_configuration(
    worker: &super::configuration::LoadedFitWorkerConfiguration,
    authorities: &FitRuntimeAuthorities,
    assurance: super::FitAssuranceMode,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let external = [
        ExternalGate::Representation,
        ExternalGate::SemanticFidelity,
        ExternalGate::RelationPolicy,
        ExternalGate::MergeTreePersistence,
        ExternalGate::SubgroupBehavior,
        ExternalGate::AuthorizationNoninterference,
        ExternalGate::SecurityApproval,
        ExternalGate::CompanionPin,
    ];
    let runtime_external = authorities.external();
    let configuration = AtlasApiConfiguration {
        root: worker.atlas_root.to_string(),
        compute: worker.document.compute,
        release_verifier: verifier(&worker.authorities.release),
        external_verifiers: external
            .into_iter()
            .zip(runtime_external)
            .map(|(gate, authority)| ExternalVerifierConfiguration {
                gate,
                authority: authority.verifier.authority().to_owned(),
                public_key: authority.verifier.public_key().to_string(),
            })
            .collect(),
        allow_evidence_deferred: assurance == super::FitAssuranceMode::EvidenceDeferredLocal,
        tile_point_budget: 4_096,
    };
    // Confirm that the generated public-key pins agree with the signers used
    // for this release before replacing the serving configuration.
    if authorities.release.verifier().public_key()
        != ContentHash::from_bytes(worker.authorities.release.public_key)
    {
        return Err("release signer no longer matches its configured public key".into());
    }
    let bytes = serde_json::to_vec_pretty(&configuration)?;
    atomic_write(&worker.serving_config_output, &bytes)?;
    Ok(())
}

fn verifier(authority: &LoadedFitAuthority) -> VerifierConfiguration {
    VerifierConfiguration {
        authority: authority.authority.clone(),
        public_key: encode_hex(&authority.public_key),
    }
}

fn atomic_write(path: &Utf8Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Utf8Path::new("."));
    fs::create_dir_all(parent)?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.write_all(b"\n")?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| error.error)?
        .sync_all()?;
    File::open(parent)?.sync_all()
}

fn atlas_fit_error(error: &(dyn Error + Send + Sync)) -> AtlasFitError {
    AtlasFitError::new(error.to_string())
}
