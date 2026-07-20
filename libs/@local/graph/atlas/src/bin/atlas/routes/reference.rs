//! The self-serving documentation: the OpenAPI document rendered at
//! startup and the Scalar reference page over it.

use aide::{axum::IntoApiResponse, scalar::Scalar};
use axum::{Extension, body::Bytes, http::header, response::Html};

/// Serves the OpenAPI document rendered at startup.
pub(super) async fn serve_document(Extension(document): Extension<Bytes>) -> impl IntoApiResponse {
    ([(header::CONTENT_TYPE, "application/json")], document)
}

/// Builds the handler serving the Scalar reference page.
///
/// aide's bundled theme asks for `"Inter", var(--system-fonts)` but
/// ships neither: Inter never loads and the standalone bundle never
/// defines `--system-fonts`, so the `font-family` computes invalid
/// and the page falls back to the browser's default serif. The patch
/// pins a self-contained system stack instead.
pub(super) fn page() -> impl Fn() -> core::future::Ready<Html<String>> + Clone {
    let bundled = Scalar::new("/v1/atlas/openapi.json")
        .with_title("HASH Atlas API")
        .html();
    let page = bundled.replace(
        "--scalar-font: \"Inter\", var(--system-fonts);",
        "--scalar-font: ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, \
         \"Helvetica Neue\", Arial, sans-serif;\n  --scalar-font-code: ui-monospace, \
         SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace;",
    );
    if page == bundled {
        tracing::warn!("the Scalar theme no longer names Inter; the font patch did not apply");
    }

    move || core::future::ready(Html(page.clone()))
}
