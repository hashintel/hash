use core::str::FromStr as _;

use uuid::Uuid;

use crate::salt::{
    hash::ContentHash,
    revision::{
        AuthorizationRevision, BaseRevision, DataRevision, DeltaRevision, GenerationId,
        OperationId, PublishedVariantCount, ReadSnapshot, ScopeFingerprint, VariantId,
    },
};

#[test]
fn revision_zero_and_successors_are_explicit() {
    assert_eq!(BaseRevision::ZERO.get(), 0);
    assert_eq!(DeltaRevision::ZERO.get(), 0);
    assert_eq!(
        BaseRevision::ZERO.next().expect("should advance base zero"),
        BaseRevision::new(1)
    );
    assert_eq!(
        DeltaRevision::ZERO
            .next()
            .expect("should advance delta zero"),
        DeltaRevision::new(1)
    );
    assert!(BaseRevision::new(u64::MAX).next().is_err());
    assert!(DeltaRevision::new(u64::MAX).next().is_err());
}

#[test]
fn operation_id_uses_stable_text_and_json_forms() {
    let uuid = Uuid::from_u128(0x00112233445566778899AABBCCDDEEFF);
    let operation = OperationId::new(uuid);
    let text = "00112233-4455-6677-8899-aabbccddeeff";

    assert_eq!(operation.to_string(), text);
    assert_eq!(OperationId::from_str(text).ok(), Some(operation));
    assert_eq!(operation.as_uuid(), uuid);

    let json = serde_json::to_string(&operation).expect("should serialize an operation identity");
    assert_eq!(json, format!("\"{text}\""));
    assert_eq!(
        serde_json::from_str::<OperationId>(&json).ok(),
        Some(operation)
    );
    assert!(OperationId::from_str(&text.to_ascii_uppercase()).is_err());
    assert!(OperationId::from_str("00112233445566778899aabbccddeeff").is_err());
}

#[test]
fn published_variant_domain_is_bounded_and_dense() {
    let one = PublishedVariantCount::ONE;
    let two = PublishedVariantCount::new(2).expect("should accept two variants");

    assert_eq!(one.get(), 1);
    assert!(one.contains(VariantId::CANONICAL));
    assert!(!one.contains(VariantId::new(1)));
    assert!(two.contains(VariantId::new(1)));
    assert!(!two.contains(VariantId::new(2)));
    assert!(PublishedVariantCount::new(0).is_err());
    assert!(PublishedVariantCount::new(9).is_err());
}

#[test]
fn read_snapshot_keeps_all_revision_components_together() {
    let generation_hash = ContentHash::digest(b"generation");
    let authorization_hash = ContentHash::digest(b"authorization");
    let scope_hash = ContentHash::digest(b"scope");
    let generation = GenerationId::new(generation_hash);
    let authorization = AuthorizationRevision::new(authorization_hash);
    let scope = ScopeFingerprint::new(scope_hash);
    let data = DataRevision::new(BaseRevision::new(4), DeltaRevision::new(9));
    let snapshot = ReadSnapshot::new(generation, authorization, scope, data);

    assert_eq!(snapshot.generation(), generation);
    assert_eq!(generation.content_hash(), generation_hash);
    assert_eq!(snapshot.authorization(), authorization);
    assert_eq!(authorization.content_hash(), authorization_hash);
    assert_eq!(snapshot.scope(), scope);
    assert_eq!(scope.content_hash(), scope_hash);
    assert_eq!(snapshot.data().base(), BaseRevision::new(4));
    assert_eq!(snapshot.data().delta(), DeltaRevision::new(9));
    assert_eq!(DataRevision::ZERO.base(), BaseRevision::ZERO);
    assert_eq!(DataRevision::ZERO.delta(), DeltaRevision::ZERO);
}

#[test]
fn snapshot_json_rejects_unknown_fields() {
    let generation = GenerationId::new(ContentHash::digest(b"generation"));
    let authorization = AuthorizationRevision::new(ContentHash::digest(b"authorization"));
    let scope = ScopeFingerprint::new(ContentHash::digest(b"scope"));
    let snapshot = ReadSnapshot::new(generation, authorization, scope, DataRevision::ZERO);
    let mut value = serde_json::to_value(snapshot).expect("should encode a read snapshot");
    value
        .as_object_mut()
        .expect("should encode a snapshot as an object")
        .insert("unexpected".to_owned(), serde_json::Value::Bool(true));

    assert!(serde_json::from_value::<ReadSnapshot>(value).is_err());
}
