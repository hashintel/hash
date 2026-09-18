#[cfg(test)]
mod tests;

mod scalar;

use axum::{Json, Router, body::Bytes, http::header::CONTENT_TYPE, routing::get};
use utoipa::OpenApi as _;

use self::scalar::Source;
use super::{Api, legacy};

pub(super) const OVERVIEW: &str = include_str!("overview.md");

/// Serves each API's document and a shared Scalar reference at `/`.
///
/// # Panics
///
/// Panics if a document cannot be serialized, document paths overlap, the Scalar bundle is
/// missing, or the embedded Scalar configuration is invalid.
pub(crate) fn routes(apis: &[Api]) -> Router {
    let legacy_document = legacy::OpenApiDocumentation::openapi();
    // Legacy subschemas use relative `./models/…` references.
    let mut router = Router::new()
        .route("/openapi.json", get(|| async { Json(legacy_document) }))
        .route("/models/{*path}", get(legacy::serve_static_schema));
    for api in apis {
        let document =
            serde_json::to_vec(&api.document).expect("the OpenAPI document should serialize");
        let document = Bytes::from(document);
        router = router.route(
            &format!("{}/openapi.json", api.prefix),
            get(move || {
                let document = document.clone();
                async move { ([(CONTENT_TYPE, "application/json")], document) }
            }),
        );
    }

    let sources = apis
        .iter()
        .map(|api| Source {
            title: api.document.info.title.clone(),
            slug: api.prefix.trim_matches('/').replace('/', "-"),
            url: format!("{}/openapi.json", api.prefix),
        })
        .chain([Source {
            title: "Legacy".to_owned(),
            slug: "legacy".to_owned(),
            url: "/openapi.json".to_owned(),
        }])
        .collect::<Vec<_>>();
    router.merge(scalar::routes(&sources))
}
