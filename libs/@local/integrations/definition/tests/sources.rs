#![expect(missing_docs, reason = "integration tests")]

use hash_integrations_definition::{Definition, Pagination, RestAuth, SourceKind};

#[test]
fn rest_interpolation() {
    let definition = Definition::from_yaml(include_str!("ui/source-rest-interpolation.yaml"))
        .expect("the REST source should parse");
    let source = definition
        .sources()
        .values()
        .next()
        .expect("the source should exist");
    let SourceKind::Rest { endpoint, .. } = &source.kind else {
        panic!("the source should be a REST endpoint");
    };
    assert_eq!(
        endpoint.url, "https://api.example.org/items",
        "the URL should expand its variable"
    );
    assert_eq!(
        endpoint.params.get("status").map(String::as_str),
        Some("active"),
        "parameter keys and values should expand their variables"
    );
    assert!(
        matches!(&endpoint.auth, Some(RestAuth::Header { name, .. }) if name == "X-Api-Key"),
        "the header name should expand its variable"
    );
    assert_eq!(
        endpoint.results_field.as_deref(),
        Some("data.items"),
        "the result path should expand its variable"
    );
    assert!(
        matches!(&endpoint.pagination, Some(Pagination::NextLink { field }) if field == "pagination.next"),
        "the next-link path should expand its variable"
    );
    assert_eq!(
        endpoint.page_size.get(),
        100,
        "the default page size should remain 100"
    );
}
