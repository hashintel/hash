//! The self-serving documentation.
//!
//! The OpenAPI document rendered at startup and the Scalar reference page over it.

use std::sync::LazyLock;

use aide::{openapi::OpenApi, scalar::Scalar};
use axum::{
    Extension,
    body::Bytes,
    http::header,
    response::{Html, IntoResponse},
};

#[derive(Debug, Clone)]
pub(crate) struct OpenApiDocument(Bytes);

impl OpenApiDocument {
    pub(crate) fn new(api: &OpenApi) -> Self {
        let document =
            Bytes::from(serde_json::to_string(&api).expect("the OpenAPI document serializes"));

        Self(document)
    }
}

/// Serves the OpenAPI document rendered at startup.
pub(super) async fn json(
    Extension(OpenApiDocument(document)): Extension<OpenApiDocument>,
) -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/json")], document)
}

/// Serves the Scalar reference page.
pub(super) async fn html() -> impl IntoResponse {
    static BUNDLE: LazyLock<Bytes> = LazyLock::new(|| {
        let html = Scalar::new("/v1/atlas/openapi.json")
            .with_title("HASH Atlas API")
            .html();

        let patched = html.replace(
            "--scalar-font: \"Inter\", var(--system-fonts);",
            "--scalar-font: ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, \
             \"Helvetica Neue\", Arial, sans-serif;\n  --scalar-font-code: ui-monospace, \
             SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace;",
        );

        if patched == html {
            tracing::warn!("the scalar theme no longer uses Inter, fonts may render incorrectly");
        }

        Bytes::from(patched)
    });

    Html((*BUNDLE).clone())
}
