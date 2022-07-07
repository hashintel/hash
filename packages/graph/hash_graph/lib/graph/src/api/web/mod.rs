//! The Axum webserver for accessing the Graph API datastore operations.
//!
//! Handler methods are grouped by routes that make up the `web_api`. See [`data_type`] for a
//! grouped router example

mod data_type;

use axum::{routing::get, Extension, Json, Router};
use utoipa::{openapi::Components, Modify, OpenApi};

use crate::datastore::Datastore;

pub fn web_api_with_datastore<T: Datastore>(datastore: T) -> Router {
    let api_doc = ApiDoc::openapi();

    Router::new()
        .merge(data_type::routes::<T>())
        // Make sure extensions are added at the end so they attach to merged routers.
        .layer(Extension(datastore))
        .route(
            "/api-doc/openapi.json",
            get({
                let doc = api_doc;
                move || async { Json(doc) }
            }),
        )
}

#[derive(OpenApi)]
#[openapi(
        tags(
            (name = "Graph", description = "HASH Graph API")
        ),
        modifiers(&MergeAddon)
    )]
struct ApiDoc;

fn api_documentation() -> Vec<utoipa::openapi::OpenApi> {
    vec![data_type::ApiDoc::openapi()]
}

struct MergeAddon;

impl Modify for MergeAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let api_documentation = api_documentation();

        let api_components = api_documentation
            .iter()
            .cloned()
            .filter_map(|api_docs| {
                api_docs
                    .components
                    .map(|components| components.schemas.into_iter())
            })
            .flatten();

        let mut components = openapi.components.take().unwrap_or_default();
        components.schemas.extend(api_components);
        openapi.components = Some(components);

        let mut tags = openapi.tags.take().unwrap_or_default();
        tags.extend(
            api_documentation
                .iter()
                .cloned()
                .filter_map(|api_docs| api_docs.tags)
                .flatten(),
        );
        openapi.tags = Some(tags);

        openapi.paths.paths.extend(
            api_documentation
                .iter()
                .cloned()
                .flat_map(|api_docs| api_docs.paths.paths.into_iter()),
        );
    }
}
