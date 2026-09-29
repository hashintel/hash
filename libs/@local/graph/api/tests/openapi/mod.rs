use crate::rest::test_utils::apis;

#[test]
fn documents_match_snapshots() {
    for api in apis() {
        let suffix = api.slug();
        let mut document =
            serde_json::to_value(api.document()).expect("the specification should be a JSON value");
        document.sort_all_objects();
        insta::with_settings!({
            snapshot_path => concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/openapi"),
            prepend_module_to_snapshot => false,
        }, {
            insta::assert_binary_snapshot!(
                &format!("{suffix}.json"),
                serde_json::to_vec_pretty(&document).expect("the specification should serialize")
            );
        });
    }
}
