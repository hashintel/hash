use super::RepositoryVersion;

#[test]
fn version_serializes_as_a_plain_integer() {
    let json = serde_json::to_string(&RepositoryVersion::V2).expect("version should serialize");
    assert_eq!(json, "2");
    assert_eq!(
        serde_json::from_str::<RepositoryVersion>("2").expect("version 2 should deserialize"),
        RepositoryVersion::V2,
    );
}

#[test]
fn unsupported_versions_fail_to_deserialize() {
    // The retired layouts are rejected whole, never reinterpreted.
    for retired in ["0", "1"] {
        let error = serde_json::from_str::<RepositoryVersion>(retired)
            .expect_err("a retired version should be rejected");
        assert!(
            error
                .to_string()
                .contains(&format!("unsupported repository version {retired}"))
        );
    }

    let error = serde_json::from_str::<RepositoryVersion>("3")
        .expect_err("an unimplemented version should be rejected");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 3")
    );
}
