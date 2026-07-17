use super::*;

#[test]
fn compiled_manifest_template_accepts_only_the_compact_input_contract() {
    let mut manifest: GenerationManifest =
        serde_json::from_slice(include_bytes!("../m0_local_manifest_template.json"))
            .expect("compiled manifest template should remain valid JSON");
    let bundle: FitInputBundleV1 = serde_json::from_slice(include_bytes!(
        "../../../config/m0-local-input-bundle.default.json"
    ))
    .expect("checked-in input bundle should remain typed");

    assert!(manifest.artifacts.is_empty());
    apply_manifest_contract(&mut manifest, &bundle.manifest)
        .expect("typed manifest contract should apply");
    assert_eq!(manifest.embedding.model, bundle.manifest.embedding.model);
    assert_eq!(
        manifest.embedding.golden_vectors_hash,
        transform_golden_vectors_hash()
    );
    assert_eq!(
        manifest.serving.wire_versions,
        bundle.manifest.serving.wire_versions
    );
}

#[test]
fn deferred_bundle_omits_external_attestation_inputs() {
    let mut bundle: FitInputBundleV1 = serde_json::from_slice(include_bytes!(
        "../../../config/m0-local-input-bundle.default.json"
    ))
    .expect("checked-in input bundle should remain typed");
    reject_attestation_inputs(&bundle)
        .expect("deferred default should omit external attestation inputs");

    bundle.relation_policy_report = Some(bundle.classifier.clone());
    assert!(matches!(
        reject_attestation_inputs(&bundle),
        Err(FitInputError::Invalid(_))
    ));
}

#[test]
fn external_reports_reject_unbound_extra_subjects() {
    let report = br#"{
        "schemaVersion": 1,
        "suiteVersion": "fixture-v1",
        "outcome": "pass",
        "subjects": {
            "classifier": "classifier-hash",
            "undeclared": "other-hash"
        }
    }"#;

    assert!(matches!(
        validate_report(
            "fixture report",
            report,
            "fixture-v1",
            [("classifier", "classifier-hash")],
            false,
        ),
        Err(FitInputError::Invalid(_))
    ));
}

#[test]
fn external_reports_cannot_be_relabelled_as_another_suite() {
    let report = br#"{
        "schemaVersion": 1,
        "suiteVersion": "different-suite-v1",
        "outcome": "pass",
        "subjects": {
            "classifier": "classifier-hash"
        }
    }"#;

    assert!(matches!(
        validate_report(
            "fixture report",
            report,
            "required-suite-v1",
            [("classifier", "classifier-hash")],
            false,
        ),
        Err(FitInputError::Invalid(_))
    ));
}

#[test]
fn point_roles_reject_embedded_link_roots() {
    let link_root =
        VersionedUrl::from_str(LINK_ROOT_VERSIONED_URL).expect("the pinned link root should parse");

    assert_eq!(point_role(&[], &link_root), EntityRole::KnowledgeEntity);
    assert_eq!(
        point_role(core::slice::from_ref(&link_root), &link_root),
        EntityRole::Other
    );
}

#[test]
fn relation_policy_corpus_may_be_a_stable_superset() {
    let selected = VersionedUrl::from_str("https://example.com/types/relation/v/1")
        .expect("selected relation URL should parse");
    let extra = VersionedUrl::from_str("https://example.com/types/extra/v/1")
        .expect("extra relation URL should parse");
    let entry = || RelationPolicyEntryV1 {
        embedding: vec![0.0; crate::salt::CANONICAL_DIMENSIONS],
        strength: 1.0,
        human_override: None,
        human_reviewed: None,
        synthetic: None,
    };
    let document = RelationPolicyDocumentV1 {
        schema_version: 1,
        relations: BTreeMap::from([(selected.clone(), entry()), (extra, entry())]),
    };
    let ordinals = HashMap::from([(
        selected,
        ArtifactOrdinal::try_from(0_u32).expect("zero ordinal should validate"),
    )]);

    let selected = relation_policy_inputs(&document, &ordinals)
        .expect("an exact extracted subset should be selected");

    assert_eq!(selected.len(), 1);
}

#[test]
fn relation_policy_corpus_must_cover_every_extracted_url() {
    let selected = VersionedUrl::from_str("https://example.com/types/relation/v/1")
        .expect("selected relation URL should parse");
    let document = RelationPolicyDocumentV1 {
        schema_version: 1,
        relations: BTreeMap::new(),
    };
    let ordinals = HashMap::from([(
        selected,
        ArtifactOrdinal::try_from(0_u32).expect("zero ordinal should validate"),
    )]);

    assert!(matches!(
        relation_policy_inputs(&document, &ordinals),
        Err(FitInputError::Invalid(message)) if message.contains("omits extracted type")
    ));
}
