use super::RepositoryVersion;

#[test]
fn version_serializes_as_a_plain_integer() {
    let json = serde_json::to_string(&RepositoryVersion::V1).expect("version should serialize");
    assert_eq!(json, "1");
    assert_eq!(
        serde_json::from_str::<RepositoryVersion>("1").expect("version 1 should deserialize"),
        RepositoryVersion::V1,
    );
}

#[test]
fn unsupported_versions_fail_to_deserialize() {
    // The retired version 0 layout is rejected whole, never reinterpreted.
    let error = serde_json::from_str::<RepositoryVersion>("0")
        .expect_err("the retired version should be rejected");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 0")
    );

    let error = serde_json::from_str::<RepositoryVersion>("2")
        .expect_err("an unimplemented version should be rejected");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 2")
    );
}
