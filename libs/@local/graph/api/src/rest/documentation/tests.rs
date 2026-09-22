use alloc::collections::BTreeSet;

use axum::{Router, body::to_bytes};
use http::{StatusCode, header::CONTENT_TYPE};
use serde_json::Value;

use crate::rest::{
    Audience, documentation, internal,
    test_utils::{apis, request, response_json},
};

async fn reference_html(router: &Router, path: &str) -> String {
    let response = request(router, path).await;
    assert_eq!(
        response.status(),
        StatusCode::OK,
        "{path} should serve a reference"
    );
    assert_eq!(
        response.headers()[CONTENT_TYPE],
        "text/html; charset=utf-8",
        "{path} should serve the reference as HTML"
    );
    let body = to_bytes(response.into_body(), 16 * 1024 * 1024)
        .await
        .expect("the reference body should be readable");
    String::from_utf8(body.to_vec()).expect("the reference should be UTF-8")
}

/// The documents a reference offers, read back out of the configuration it hands to Scalar.
fn source_urls(html: &str) -> BTreeSet<String> {
    let (_, initializer) = html
        .split_once("Scalar.createApiReference('#app', ")
        .expect("the reference should initialize Scalar");
    let arguments = initializer
        .lines()
        .next()
        .expect("the initializer should occupy a line")
        .trim_end();
    let configuration: Value = serde_json::from_str(
        arguments
            .strip_suffix(')')
            .expect("the initializer should close its argument list"),
    )
    .expect("the configuration should be JSON");

    configuration["sources"]
        .as_array()
        .expect("the configuration should carry its sources")
        .iter()
        .map(|source| {
            source["url"]
                .as_str()
                .expect("a source should carry its url")
                .to_owned()
        })
        .collect()
}

#[tokio::test]
async fn documentation_serves_each_document() {
    let apis = apis();
    let router = documentation::routes(&apis);
    for api in apis {
        let path = format!("{}/openapi.json", api.prefix());
        let response = request(&router, &path).await;
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "{path} should serve the API's document"
        );
        assert_eq!(
            response.headers()[CONTENT_TYPE],
            "application/json",
            "{path} should declare the document as JSON"
        );
        assert_eq!(
            response_json(response).await,
            serde_json::to_value(api.document()).expect("the specification should serialize"),
            "{path} should serve its registered specification",
        );
    }
}

#[tokio::test]
async fn documentation_resolves_legacy_subschemas() {
    let router = documentation::routes(&apis());
    let document_path = format!("{}/legacy/openapi.json", internal::PREFIX);
    let document = response_json(request(&router, &document_path).await).await;

    let reference = document["components"]["schemas"]["DataType"]["$ref"]
        .as_str()
        .expect("the legacy document should reference its subschemas")
        .to_owned();
    let resolved = format!(
        "{}/legacy/{}",
        internal::PREFIX,
        reference
            .strip_prefix("./")
            .expect("a subschema reference should be relative to the document")
    );
    assert_eq!(
        request(&router, &resolved).await.status(),
        StatusCode::OK,
        "{resolved} should serve the schema the document references as {reference}"
    );
}

#[tokio::test]
async fn documentation_ignores_former_paths() {
    let router = documentation::routes(&apis());
    for path in [
        "/openapi.json",
        "/models/data_type.json",
        "/internal/openapi.json",
    ] {
        assert_eq!(
            request(&router, path).await.status(),
            StatusCode::NOT_FOUND,
            "{path} should no longer answer"
        );
    }
}

#[tokio::test]
async fn references_partition_by_audience() {
    let apis = apis();
    let router = documentation::routes(&apis);

    let mut public = BTreeSet::new();
    let mut internal_documents = BTreeSet::new();
    for api in &apis {
        let url = format!("{}/openapi.json", api.prefix());
        match api.audience {
            Audience::Public => public.insert(url),
            Audience::Internal => internal_documents.insert(url),
        };
    }
    internal_documents.insert(format!("{}/legacy/openapi.json", internal::PREFIX));

    assert_eq!(
        source_urls(&reference_html(&router, "/").await),
        public,
        "the public reference should offer the public documents and nothing else"
    );
    assert_eq!(
        source_urls(&reference_html(&router, internal::PREFIX).await),
        internal_documents,
        "the internal reference should offer the internal and legacy documents and nothing else"
    );
}

#[tokio::test]
async fn references_serve_own_bundle() {
    let router = documentation::routes(&apis());
    for path in ["/", internal::PREFIX] {
        let bundle = format!("{}/openapi/scalar.js", path.trim_end_matches('/'));
        assert!(
            reference_html(&router, path)
                .await
                .contains(&format!("src=\"{bundle}\"")),
            "the reference at {path} should load the bundle beneath it"
        );

        let response = request(&router, &bundle).await;
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "{bundle} should be served locally"
        );
        assert_eq!(
            response.headers()[CONTENT_TYPE],
            "application/javascript",
            "{bundle} should be served as JavaScript"
        );
        let javascript = to_bytes(response.into_body(), 16 * 1024 * 1024)
            .await
            .expect("the Scalar bundle should be readable");
        assert!(!javascript.is_empty(), "{bundle} should not be empty");
    }
}

#[tokio::test]
async fn internal_reference_trailing_slash() {
    let router = documentation::routes(&apis());
    assert_eq!(
        reference_html(&router, internal::PREFIX).await,
        reference_html(&router, &format!("{}/", internal::PREFIX)).await,
        "both spellings of the internal prefix should serve the same reference"
    );
}
