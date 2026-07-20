use core::str::FromStr as _;

use uuid::Uuid;

use crate::salt::{
    hash::ContentHash,
    revision::{
        AuthorizationRevision, BaseRevision, DataRevision, DeltaRevision, GenerationId,
        OperationId, PublishedVariantCount, ReadSnapshot, RevisionKind, RevisionOverflow,
        ScopeFingerprint, VariantId,
    },
};

#[test]
fn revision_zero_and_successors_are_explicit() {
    assert_eq!(
        BaseRevision::ZERO
            .next()
            .expect("should advance base zero")
            .get(),
        1
    );
    assert_eq!(
        DeltaRevision::ZERO
            .next()
            .expect("should advance delta zero")
            .get(),
        1
    );
    assert_matches!(
        BaseRevision::new(u64::MAX).next(),
        Err(RevisionOverflow {
            kind: RevisionKind::Base,
            current: u64::MAX,
        })
    ));
    assert_matches!(
        DeltaRevision::new(u64::MAX).next(),
        Err(RevisionOverflow {
            kind: RevisionKind::Delta,
            current: u64::MAX,
        })
    ));
}

#[test]
fn operation_id_uses_stable_text_and_json_forms() {
    let uuid = Uuid::from_u128(0x00112233445566778899AABBCCDDEEFF);
    let operation = OperationId::new(uuid);
    let text = "00112233-4455-6677-8899-aabbccddeeff";

    assert_eq!(operation.to_string(), text);
    assert_eq!(OperationId::from_str(text).ok(), Some(operation));

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

    assert!(one.contains(VariantId::CANONICAL));
    assert!(!one.contains(VariantId::new(1)));
    assert!(two.contains(VariantId::new(1)));
    assert!(!two.contains(VariantId::new(2)));
    assert!(PublishedVariantCount::new(0).is_err());
    assert!(PublishedVariantCount::new(9).is_err());
}

#[test]
fn read_snapshot_has_a_stable_complete_json_contract() {
    let generation = GenerationId::new(ContentHash::from_bytes([0x11; 32]));
    let authorization = AuthorizationRevision::new(ContentHash::from_bytes([0x22; 32]));
    let scope = ScopeFingerprint::new(ContentHash::from_bytes([0x33; 32]));
    let data = DataRevision::new(BaseRevision::new(4), DeltaRevision::new(9));
    let snapshot = ReadSnapshot::new(generation, authorization, scope, data);

    let value = serde_json::to_value(snapshot).expect("should encode a read snapshot");
    assert_eq!(
        value,
        serde_json::json!({
            "generation": "11".repeat(32),
            "authorization": "22".repeat(32),
            "scope": "33".repeat(32),
            "data": {
                "base": 4,
                "delta": 9,
            },
        })
    );
    assert_eq!(
        serde_json::from_value::<ReadSnapshot>(value).expect("should decode the snapshot"),
        snapshot
    );
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
