use core::fmt::Write as _;

use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use burn::backend::{NdArray, ndarray::NdArrayDevice};
use ed25519_dalek::SigningKey;
use serde_json::json;
use tempfile::tempdir;
use tower::ServiceExt as _;

use super::*;
use crate::salt::{
    ActivationOutcome, ActiveRelease, GenerationId, external_signer, external_verifiers,
    fixture_manifest, passing_evidence, publish_fixture_artifacts, publish_gated_candidate,
    publish_manifest, signer,
};

#[tokio::test]
async fn api_state_rejects_an_empty_activation_root() {
    let root = tempdir().expect("temporary API root should create");
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
    let result = AtlasApiState::<NdArray>::new_for_tests(
        AtlasApiConfiguration {
            root: root.path().to_string_lossy().into_owned(),
            compute: AtlasComputeConfiguration::default(),
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
                        u8::try_from(index + 2).expect("fixture seed should fit u8"),
                    ),
                })
                .collect(),
            allow_evidence_deferred: false,
            tile_point_budget: DEFAULT_TILE_POINT_BUDGET,
        },
        NdArrayDevice::Cpu,
    );
    assert!(result.is_err());
}

#[test]
fn compute_configuration_has_no_cpu_variant() {
    let error = serde_json::from_value::<AtlasComputeConfiguration>(json!({
        "backend": "cpu",
        "deviceOrdinal": 0
    }))
    .expect_err("CPU compute configuration should be rejected");

    assert!(
        error.to_string().contains("unknown variant `cpu`"),
        "unexpected compute-configuration error: {error}"
    );
}

#[test]
fn production_api_state_rejects_backend_fallback() {
    let directory = tempdir().expect("temporary API root should create");
    let root =
        camino::Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");

    let error = AtlasApiState::<NdArray>::new(test_configuration(root, false), NdArrayDevice::Cpu)
        .err()
        .expect("production API state should reject CPU");

    assert!(
        error
            .to_string()
            .contains("does not match initialized ndarray"),
        "unexpected backend mismatch: {error}"
    );
}

#[tokio::test]
async fn tile_route_serves_binary_quadrants_and_reloads_the_active_generation() {
    let directory = tempdir().expect("temporary API root should create");
    let root =
        camino::Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let (first, first_generation) = publish_active(root, "api-first", None);
    let state = loaded_test_state(root);
    let application = router(state);
    let root_uri = format!("/v1/atlas/tile/{first_generation}/0/0/0/0");
    let response = application
        .clone()
        .oneshot(
            Request::builder()
                .uri(&root_uri)
                .body(Body::empty())
                .expect("tile request should build"),
        )
        .await
        .expect("tile request should complete");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(CONTENT_TYPE),
        Some(&axum::http::HeaderValue::from_static(
            TILE_WIRE_V4_CONTENT_TYPE
        ))
    );
    assert!(response.headers().contains_key(ETAG));
    let body = to_bytes(response.into_body(), 1_000_000)
        .await
        .expect("tile body should buffer");
    assert_eq!(&body[..8], b"ATLTILE4");

    let contours = application
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/atlas/contours/{first_generation}/0"))
                .body(Body::empty())
                .expect("contour request should build"),
        )
        .await
        .expect("contour request should complete");
    assert_eq!(contours.status(), StatusCode::OK);
    assert_eq!(
        contours.headers().get(CONTENT_TYPE),
        Some(&axum::http::HeaderValue::from_static(
            CONTOUR_WIRE_V1_CONTENT_TYPE
        ))
    );
    assert!(contours.headers().contains_key(ETAG));
    let contour_body = to_bytes(contours.into_body(), 1_000_000)
        .await
        .expect("contour body should buffer");
    assert_eq!(&contour_body[..8], b"ATLCONT1");

    let flows = application
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/atlas/flows/{first_generation}/0"))
                .body(Body::empty())
                .expect("flow request should build"),
        )
        .await
        .expect("flow request should complete");
    assert_eq!(flows.status(), StatusCode::OK);
    assert_eq!(
        flows.headers().get(CONTENT_TYPE),
        Some(&axum::http::HeaderValue::from_static(
            FLOW_WIRE_V1_CONTENT_TYPE
        ))
    );
    let flow_body = to_bytes(flows.into_body(), 1_000_000)
        .await
        .expect("flow body should buffer");
    assert_eq!(&flow_body[..8], b"ATLFLOW1");

    let invalid = application
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/atlas/tile/{first_generation}/0/17/0/0"))
                .body(Body::empty())
                .expect("invalid tile request should build"),
        )
        .await
        .expect("invalid tile request should complete");
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    let unavailable_variant = application
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/atlas/tile/{first_generation}/99/0/0/0"))
                .body(Body::empty())
                .expect("unavailable variant request should build"),
        )
        .await
        .expect("unavailable variant request should complete");
    assert_eq!(unavailable_variant.status(), StatusCode::NOT_FOUND);
    let raw_artifact = application
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/atlas/current/artifacts/base.salt")
                .body(Body::empty())
                .expect("removed route request should build"),
        )
        .await
        .expect("removed route request should complete");
    assert_eq!(raw_artifact.status(), StatusCode::NOT_FOUND);

    let (_second, second_generation) = publish_active(root, "api-second", Some(first));
    let stale = application
        .clone()
        .oneshot(
            Request::builder()
                .uri(&root_uri)
                .body(Body::empty())
                .expect("stale tile request should build"),
        )
        .await
        .expect("stale tile request should complete");
    assert_eq!(stale.status(), StatusCode::NOT_FOUND);
    let reloaded = application
        .oneshot(
            Request::builder()
                .uri(format!("/v1/atlas/tile/{second_generation}/0/0/0/0"))
                .body(Body::empty())
                .expect("reloaded tile request should build"),
        )
        .await
        .expect("reloaded tile request should complete");
    assert_eq!(reloaded.status(), StatusCode::OK);
}

#[tokio::test]
async fn evidence_deferred_generation_requires_explicit_server_permission() {
    let directory = tempdir().expect("temporary API root should create");
    let root =
        camino::Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    publish_active_with_assurance(
        root,
        "api-deferred",
        None,
        GenerationAssuranceMode::EvidenceDeferredLocal,
    );

    assert!(
        AtlasApiState::<NdArray>::new_for_tests(
            test_configuration(root, false),
            NdArrayDevice::Cpu
        )
        .is_err()
    );
    assert!(
        AtlasApiState::<NdArray>::new_for_tests(test_configuration(root, true), NdArrayDevice::Cpu)
            .is_ok()
    );
}

fn publish_active(
    root: &camino::Utf8Path,
    name: &str,
    expected: Option<ActiveRelease>,
) -> (ActiveRelease, String) {
    publish_active_with_assurance(
        root,
        name,
        expected,
        GenerationAssuranceMode::IndependentAuthorities,
    )
}

fn publish_active_with_assurance(
    root: &camino::Utf8Path,
    name: &str,
    expected: Option<ActiveRelease>,
    assurance_mode: GenerationAssuranceMode,
) -> (ActiveRelease, String) {
    let generation = GenerationId::new(ContentHash::digest(name.as_bytes()));
    let generation_directory = root.join("generations").join(generation.to_string());
    std::fs::create_dir_all(&generation_directory).expect("generation directory should be created");
    let mut manifest = fixture_manifest();
    manifest.generation_id = generation;
    manifest.assurance_mode = assurance_mode;
    publish_fixture_artifacts(&generation_directory, &mut manifest);
    let published = publish_manifest(&generation_directory.join("manifest.json"), &manifest)
        .expect("fixture manifest should publish");
    let evidence = passing_evidence(&manifest);
    assert_eq!(evidence.head().manifest, published.content_hash);
    let release =
        publish_gated_candidate(root, &evidence).expect("fixture candidate should publish");
    let active = ActiveRelease::from(release);
    assert!(matches!(
        test_store(root)
            .compare_exchange(expected, release)
            .expect("fixture release should activate"),
        ActivationOutcome::Activated(_) | ActivationOutcome::AlreadyActive(_)
    ));
    (active, generation.to_string())
}

fn test_configuration(
    root: &camino::Utf8Path,
    allow_evidence_deferred: bool,
) -> AtlasApiConfiguration {
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
    let release = signer().verifier();
    AtlasApiConfiguration {
        root: root.to_string(),
        compute: AtlasComputeConfiguration::default(),
        release_verifier: VerifierConfiguration {
            authority: release.authority().to_owned(),
            public_key: release.public_key().to_string(),
        },
        external_verifiers: gates
            .into_iter()
            .map(|gate| {
                let verifier = external_signer(gate_id(gate)).verifier();
                ExternalVerifierConfiguration {
                    gate,
                    authority: verifier.authority().to_owned(),
                    public_key: verifier.public_key().to_string(),
                }
            })
            .collect(),
        allow_evidence_deferred,
        tile_point_budget: DEFAULT_TILE_POINT_BUDGET,
    }
}

fn loaded_test_state(root: &camino::Utf8Path) -> AtlasApiState<NdArray> {
    let store = test_store(root);
    let cached = store
        .load_active()
        .expect("fixture active generation should load")
        .map(Arc::new);
    AtlasApiState {
        store,
        cached: Mutex::new(cached),
        compute: AtlasComputeConfiguration::default(),
        enforce_compute: false,
        allow_evidence_deferred: false,
        tile_point_budget: NonZeroUsize::new(4_096).expect("fixture budget should be non-zero"),
    }
}

fn test_store(root: &camino::Utf8Path) -> FileActivationStore<NdArray> {
    FileActivationStore::new(
        root,
        signer().verifier(),
        external_verifiers(),
        NdArrayDevice::Cpu,
    )
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
