use type_system::{knowledge::entity::id::EntityUuid, principal::actor_group::WebId};
use uuid::Uuid;

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
            [("classifier", "classifier-hash")]
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
            [("classifier", "classifier-hash")]
        ),
        Err(FitInputError::Invalid(_))
    ));
}

#[test]
fn point_roles_distinguish_link_entities_from_knowledge_entities() {
    let entity_id = EntityId {
        web_id: WebId::new(Uuid::from_u128(1)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(2)),
        draft_id: None,
    };
    let link_root =
        VersionedUrl::from_str(LINK_ROOT_VERSIONED_URL).expect("the pinned link root should parse");

    assert_eq!(
        point_role(entity_id, &[], &HashSet::new(), &link_root),
        EntityRole::KnowledgeEntity
    );
    assert_eq!(
        point_role(
            entity_id,
            core::slice::from_ref(&link_root),
            &HashSet::new(),
            &link_root
        ),
        EntityRole::Other
    );
    assert_eq!(
        point_role(entity_id, &[], &HashSet::from([entity_id]), &link_root),
        EntityRole::Other
    );
    let candidates = landmark_candidates(&[EntityRole::KnowledgeEntity, EntityRole::Other])
        .expect("bounded rows should produce landmark candidates");
    assert_eq!(
        candidates
            .iter()
            .map(|candidate| candidate.entity_role)
            .collect::<Vec<_>>(),
        vec![
            EntityRole::KnowledgeEntity.index(),
            EntityRole::Other.index()
        ]
    );
}
