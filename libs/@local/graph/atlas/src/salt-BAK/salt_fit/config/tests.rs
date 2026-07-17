use std::fs;

use camino::{Utf8Path, Utf8PathBuf};
use ed25519_dalek::SigningKey;
use uuid::Uuid;

use super::*;

#[test]
fn worker_loader_pins_one_release_key_and_eight_external_issuers() {
    let temporary = tempfile::tempdir().expect("temporary directory should be created");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let source = root.join("worker.json");
    let mut document = FitWorkerConfigurationV1 {
        actor_id: Uuid::from_u128(1),
        ..FitWorkerConfigurationV1::default()
    };
    prepare_secrets(root, &mut document);

    let loaded = load_worker_configuration(
        &source,
        &serde_json::to_vec(&document).expect("configuration should serialize"),
    )
    .expect("configuration should load");

    assert_eq!(loaded.document.actor_id, Uuid::from_u128(1));
    assert_eq!(loaded.postgres_password, "postgres-secret");
    assert!(loaded.atlas_root.is_absolute());
    assert!(loaded.serving_config_output.is_absolute());
    let debug = format!("{loaded:?}");
    assert!(!debug.contains("postgres-secret"));
    assert!(!debug.contains(&encode_hex(&[1; 32])));
}

#[test]
fn evidence_deferred_loader_does_not_require_external_issuer_processes() {
    let temporary = tempfile::tempdir().expect("temporary directory should be created");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let source = root.join("worker.json");
    let mut document = FitWorkerConfigurationV1 {
        actor_id: Uuid::from_u128(1),
        ..FitWorkerConfigurationV1::default()
    };
    prepare_secrets(root, &mut document);
    fs::remove_dir_all(root.join("issuers")).expect("issuer fixtures should be removed");

    let loaded = load_worker_configuration_for_assurance(
        &source,
        &serde_json::to_vec(&document).expect("configuration should serialize"),
        FitAssuranceMode::EvidenceDeferredLocal,
    )
    .expect("deferred configuration should not open issuer commands");

    assert!(
        loaded
            .authorities
            .representation
            .issuer_command
            .as_str()
            .is_empty()
    );
}

#[test]
fn worker_loader_rejects_reused_gate_key() {
    let temporary = tempfile::tempdir().expect("temporary directory should be created");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let source = root.join("worker.json");
    let mut document = FitWorkerConfigurationV1 {
        actor_id: Uuid::from_u128(1),
        ..FitWorkerConfigurationV1::default()
    };
    prepare_secrets(root, &mut document);
    document.authorities.companion_pin.expected_public_key = document
        .authorities
        .security_approval
        .expected_public_key
        .clone();

    assert!(matches!(
        load_worker_configuration(
            &source,
            &serde_json::to_vec(&document).expect("configuration should serialize")
        ),
        Err(FitConfigurationError::Invalid {
            field: "authorities",
            ..
        })
    ));
}

#[test]
fn request_loader_rejects_nil_identity_and_empty_scope() {
    let default = FitRequestV1::default();
    assert!(matches!(
        load_request(&serde_json::to_vec(&default).expect("request should serialize")),
        Err(FitConfigurationError::Invalid {
            field: "requestId",
            ..
        })
    ));

    let mut request = default;
    request.request_id = Uuid::from_u128(1);
    request.web_ids.clear();
    assert!(matches!(
        load_request(&serde_json::to_vec(&request).expect("request should serialize")),
        Err(FitConfigurationError::Invalid {
            field: "webIds",
            ..
        })
    ));

    request.web_ids.push(Uuid::from_u128(2));
    load_request(&serde_json::to_vec(&request).expect("request should serialize"))
        .expect("complete full-corpus request should load");
}

#[test]
fn request_loader_rejects_noncanonical_scope_and_process_cap_overrides() {
    let mut request = FitRequestV1 {
        request_id: Uuid::from_u128(1),
        ..FitRequestV1::default()
    };
    request.web_ids = vec![Uuid::from_u128(2), Uuid::from_u128(2)];
    assert!(matches!(
        load_request(&serde_json::to_vec(&request).expect("request should serialize")),
        Err(FitConfigurationError::Invalid {
            field: "webIds",
            ..
        })
    ));

    request.web_ids = vec![Uuid::nil()];
    assert!(matches!(
        load_request(&serde_json::to_vec(&request).expect("request should serialize")),
        Err(FitConfigurationError::Invalid {
            field: "webIds",
            ..
        })
    ));

    request.web_ids = vec![Uuid::from_u128(2)];
    request.limits.maximum_entities = MAXIMUM_FIT_ENTITIES + 1;
    assert!(matches!(
        load_request(&serde_json::to_vec(&request).expect("request should serialize")),
        Err(FitConfigurationError::Invalid {
            field: "limits.maximumEntities",
            ..
        })
    ));
}

#[test]
fn worker_loader_rejects_unbounded_thread_pools_before_loading_secrets() {
    let document = FitWorkerConfigurationV1 {
        actor_id: Uuid::from_u128(1),
        cpu_threads: core::num::NonZeroUsize::new(MAXIMUM_FIT_CPU_THREADS + 1)
            .expect("the invalid test thread count is non-zero"),
        ..FitWorkerConfigurationV1::default()
    };

    assert!(matches!(
        load_worker_configuration(
            Utf8Path::new("worker.json"),
            &serde_json::to_vec(&document).expect("configuration should serialize")
        ),
        Err(FitConfigurationError::Invalid {
            field: "cpuThreads",
            ..
        })
    ));
}

#[test]
fn manifest_contract_rejects_placeholder_hashes_and_invalid_probabilities() {
    let mut bundle: FitInputBundleV1 = serde_json::from_slice(include_bytes!(
        "../../../config/m0-local-input-bundle.default.json"
    ))
    .expect("checked-in bundle should deserialize");
    bundle.manifest.embedding.producer_contract_hash = "0".repeat(64);
    assert!(matches!(
        validate_manifest_contract(&bundle.manifest),
        Err(FitConfigurationError::Invalid {
            field: "manifest.embedding.producerContractHash",
            ..
        })
    ));

    let identity = "01".repeat(32);
    bundle.manifest.embedding.producer_contract_hash = identity.clone();
    bundle.manifest.relations.relation_card_corpus_hash = identity.clone();
    bundle.manifest.relations.annotation_corpus_hash = identity.clone();
    bundle.manifest.relations.reviewed_holdout_hash = identity.clone();
    bundle.manifest.relations.applicability_config_hash = identity;
    validate_manifest_contract(&bundle.manifest).expect("complete manifest should validate");

    bundle.manifest.relations.class_prior = Some([0.2, 0.3, 0.6]);
    assert!(matches!(
        validate_manifest_contract(&bundle.manifest),
        Err(FitConfigurationError::Invalid {
            field: "manifest.relations.classPrior",
            ..
        })
    ));
}

#[test]
fn content_addresses_cannot_escape_the_input_root() {
    let reference = FitInputReferenceV1 {
        path: Utf8PathBuf::from("../outside.json"),
        sha256: "0".repeat(64),
    };
    assert!(matches!(
        read_content_addressed(Utf8Path::new("inputs"), "fixture", &reference),
        Err(FitConfigurationError::PathEscape {
            field: "fixture",
            ..
        })
    ));
}

#[test]
fn path_only_content_addresses_are_streamed_and_verified() {
    let temporary = tempfile::tempdir().expect("temporary directory should be created");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let path = root.join("classifier.salt");
    fs::write(&path, b"classifier fixture").expect("fixture should be written");
    let mut reference = FitInputReferenceV1 {
        path: Utf8PathBuf::from("classifier.salt"),
        sha256: encode_hex(&Sha256::digest(b"classifier fixture")),
    };
    let canonical_path =
        Utf8PathBuf::from_path_buf(fs::canonicalize(&path).expect("fixture should canonicalize"))
            .expect("temporary path should be UTF-8");

    assert_eq!(
        content_addressed_path(root, "classifier", &reference)
            .expect("matching content should verify"),
        canonical_path
    );
    reference.sha256 = "01".repeat(32);
    assert!(matches!(
        content_addressed_path(root, "classifier", &reference),
        Err(FitConfigurationError::ContentHash {
            field: "classifier",
            ..
        })
    ));
}

#[cfg(unix)]
#[test]
fn content_addresses_cannot_escape_through_symlinks() {
    use std::os::unix::fs::symlink;

    let temporary = tempfile::tempdir().expect("temporary directory should be created");
    let root = Utf8Path::from_path(temporary.path()).expect("temporary path should be UTF-8");
    let inputs = root.join("inputs");
    fs::create_dir_all(&inputs).expect("input directory should be created");
    let outside = root.join("outside.json");
    fs::write(&outside, b"outside").expect("outside fixture should be written");
    symlink(&outside, inputs.join("escaped.json")).expect("symlink should be created");
    let reference = FitInputReferenceV1 {
        path: Utf8PathBuf::from("escaped.json"),
        sha256: encode_hex(&Sha256::digest(b"outside")),
    };

    assert!(matches!(
        read_content_addressed(&inputs, "fixture", &reference),
        Err(FitConfigurationError::PathEscape {
            field: "fixture",
            ..
        })
    ));
}

fn prepare_secrets(root: &Utf8Path, document: &mut FitWorkerConfigurationV1) {
    let secrets = root.join("secrets");
    let issuers = root.join("issuers");
    fs::create_dir_all(&secrets).expect("secret directory should be created");
    fs::create_dir_all(&issuers).expect("issuer directory should be created");
    write_secret(&secrets.join("postgres.password"), "postgres-secret");
    let release_secret = [1_u8; 32];
    write_secret(&secrets.join("release.key"), &encode_hex(&release_secret));
    document.authorities.release.secret_key_file = Utf8PathBuf::from("secrets/release.key");
    document.authorities.release.expected_public_key = encode_hex(
        &SigningKey::from_bytes(&release_secret)
            .verifying_key()
            .to_bytes(),
    );
    let authorities = [
        &mut document.authorities.representation,
        &mut document.authorities.semantic_fidelity,
        &mut document.authorities.relation_policy,
        &mut document.authorities.merge_tree_persistence,
        &mut document.authorities.subgroup_behavior,
        &mut document.authorities.authorization_noninterference,
        &mut document.authorities.security_approval,
        &mut document.authorities.companion_pin,
    ];
    for (index, authority) in authorities.into_iter().enumerate() {
        let discriminator = u8::try_from(index + 2).expect("nine discriminators fit u8");
        let secret = [discriminator; 32];
        let filename = format!("{index}.issuer");
        let path = issuers.join(&filename);
        fs::write(&path, "#!/bin/sh\nexit 1\n").expect("issuer fixture should be written");
        #[cfg(unix)]
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
            .expect("issuer permissions should be set");
        authority.issuer_command = Utf8PathBuf::from(format!("issuers/{filename}"));
        authority.expected_public_key =
            encode_hex(&SigningKey::from_bytes(&secret).verifying_key().to_bytes());
    }
}

fn write_secret(path: &Utf8Path, value: &str) {
    fs::write(path, format!("{value}\n")).expect("secret should be written");
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .expect("secret permissions should be set");
}
