#[cfg(test)]
mod tests;

mod scalar;

use axum::{Router, body::Bytes, http::header::CONTENT_TYPE, routing::get};
use utoipa::OpenApi as _;

use self::scalar::Source;
use super::{Api, Audience, internal, legacy};

pub(super) const OVERVIEW: &str = include_str!("overview.md");

const PUBLIC_REFERENCE_PATH: &str = "/";

/// Serves each API's document, the legacy document and its schemas under the internal prefix, and
/// a Scalar reference per audience: the public one at the root, the internal one under that same
/// prefix, listing the internal and legacy documents.
///
/// # Panics
///
/// Panics if a document or a source list cannot be serialized, route paths overlap, the Scalar
/// bundle is missing or not UTF-8, the embedded Scalar configuration is invalid, or the Scalar
/// optional-auth correction does not match exactly once.
pub(crate) fn routes(apis: &[Api]) -> Router {
    let legacy_path = format!("{}/legacy", internal::PREFIX);
    let legacy_document_path = format!("{legacy_path}/openapi.json");
    let legacy_document = Bytes::from(
        serde_json::to_vec(&legacy::OpenApiDocumentation::openapi())
            .expect("the legacy OpenAPI document should serialize"),
    );
    // The legacy document references its subschemas as `./models/<name>.json`, so the `models`
    // directory has to stay a sibling of the document.
    let mut router = Router::new()
        .route(&legacy_document_path, get(serve(legacy_document)))
        .route(
            &format!("{legacy_path}/models/{{*path}}"),
            get(legacy::serve_static_schema),
        );

    let mut public_sources = Vec::new();
    let mut internal_sources = Vec::new();
    for api in apis {
        let document = Bytes::from(
            serde_json::to_vec(api.document()).expect("the OpenAPI document should serialize"),
        );
        router = router.route(
            &format!("{}/openapi.json", api.prefix()),
            get(serve(document)),
        );
        match api.audience {
            Audience::Public => public_sources.push(Source::from(api)),
            Audience::Internal => internal_sources.push(Source::from(api)),
        }
    }
    internal_sources.push(Source {
        title: "Legacy".to_owned(),
        slug: "legacy".to_owned(),
        url: legacy_document_path,
    });

    router
        .merge(scalar::routes(PUBLIC_REFERENCE_PATH, &public_sources))
        .merge(scalar::routes(internal::PREFIX, &internal_sources))
}

fn serve(
    document: Bytes,
) -> impl Fn() -> core::future::Ready<([(axum::http::HeaderName, &'static str); 1], Bytes)> + Clone
{
    move || core::future::ready(([(CONTENT_TYPE, "application/json")], document.clone()))
}
