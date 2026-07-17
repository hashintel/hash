use super::RepositoryVersion;

#[test]
fn version_serializes_as_a_plain_integer() {
    let json = serde_json::to_string(&RepositoryVersion::V0).expect("version should serialize");
    assert_eq!(json, "0");
    assert_eq!(
        serde_json::from_str::<RepositoryVersion>("0").expect("version 0 should deserialize"),
        RepositoryVersion::V0,
    );
}

#[test]
fn unknown_versions_fail_to_deserialize() {
    let error = serde_json::from_str::<RepositoryVersion>("1")
        .expect_err("an unimplemented version should be rejected");
    assert!(error.to_string().contains("unknown repository version 1"));
}
