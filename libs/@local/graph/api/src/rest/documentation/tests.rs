use axum::body::to_bytes;
use http::{StatusCode, header::CONTENT_TYPE};

use crate::rest::{
    documentation,
    test_utils::{apis, request, response_json},
};

#[tokio::test]
async fn documents_served() {
    let apis = apis();
    let router = documentation::routes(&apis);
    for api in apis {
        let response = request(&router, &format!("{}/openapi.json", api.prefix)).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        assert_eq!(
            response_json(response).await,
            serde_json::to_value(api.document).expect("the specification should serialize"),
            "each document route should serve its registered specification",
        );
    }
}

#[tokio::test]
async fn documentation_self_hosted() {
    let router = documentation::routes(&apis());
    let response = request(&router, "/").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[CONTENT_TYPE], "text/html; charset=utf-8");
    let body = to_bytes(response.into_body(), 16 * 1024 * 1024)
        .await
        .expect("the reference body should be readable");
    let html = core::str::from_utf8(&body).expect("the reference should be UTF-8");
    assert!(
        html.contains("src=\"/openapi/scalar.js\""),
        "the reference should load its local Scalar bundle"
    );
    let response = request(&router, "/openapi/scalar.js").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[CONTENT_TYPE], "application/javascript");
    let javascript = to_bytes(response.into_body(), 16 * 1024 * 1024)
        .await
        .expect("the Scalar bundle should be readable");
    assert!(
        !javascript.is_empty(),
        "the Scalar bundle should contain JavaScript"
    );
}
