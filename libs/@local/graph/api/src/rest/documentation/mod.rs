#[cfg(test)]
mod tests;

mod scalar;

use axum::{Router, body::Bytes, http::header::CONTENT_TYPE, routing::get};
use utoipa::OpenApi as _;

use self::scalar::Source;
use super::{Api, legacy};

pub(super) const OVERVIEW: &str = include_str!("overview.md");

const LEGACY_DOCUMENT_PATH: &str = "/openapi.json";

/// Serves each API's document and a shared Scalar reference at `/`.
///
/// # Panics
///
/// Panics if a document or the source list cannot be serialized, document paths overlap, the
/// Scalar bundle is missing or not UTF-8, the embedded Scalar configuration is invalid, or the
/// Scalar optional-auth correction does not match exactly once.
pub(crate) fn routes(apis: &[Api]) -> Router {
    let legacy_document = Bytes::from(
        serde_json::to_vec(&legacy::OpenApiDocumentation::openapi())
            .expect("the legacy OpenAPI document should serialize"),
    );
    // The legacy document references its subschemas as `./models/<name>.json`, so `/models/{*path}`
    // has to stay a sibling of `/openapi.json`.
    let mut router = Router::new()
        .route(LEGACY_DOCUMENT_PATH, get(serve(legacy_document)))
        .route("/models/{*path}", get(legacy::serve_static_schema));
    for api in apis {
        let document = Bytes::from(
            serde_json::to_vec(api.document()).expect("the OpenAPI document should serialize"),
        );
        router = router.route(
            &format!("{}/openapi.json", api.prefix()),
            get(serve(document)),
        );
    }

    let sources = apis
        .iter()
        .map(Source::from)
        .chain([Source {
            title: "Legacy".to_owned(),
            slug: "legacy".to_owned(),
            url: LEGACY_DOCUMENT_PATH.to_owned(),
        }])
        .collect::<Vec<_>>();
    router.merge(scalar::routes(&sources))
}

fn serve(
    document: Bytes,
) -> impl Fn() -> core::future::Ready<([(axum::http::HeaderName, &'static str); 1], Bytes)> + Clone
{
    move || core::future::ready(([(CONTENT_TYPE, "application/json")], document.clone()))
}
