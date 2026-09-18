#[cfg(test)]
mod tests;

mod scalar;

use axum::{Router, body::Bytes, http::header::CONTENT_TYPE, routing::get};

pub(crate) use self::scalar::Source;
use super::Api;

pub(super) const OVERVIEW: &str = include_str!("overview.md");

/// Serves each API's document and a shared Scalar reference at `/`.
///
/// # Panics
///
/// Panics if a document cannot be serialized, document paths overlap, the Scalar bundle is
/// missing, or the embedded Scalar configuration is invalid.
pub(crate) fn routes(apis: &[Api], additional_sources: impl IntoIterator<Item = Source>) -> Router {
    let mut router = Router::new();
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
        .chain(additional_sources)
        .collect::<Vec<_>>();
    router.merge(scalar::routes(&sources))
}
