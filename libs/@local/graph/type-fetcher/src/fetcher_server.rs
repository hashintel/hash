use std::{collections::HashMap, io};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse as _, Response},
    routing::{get, post},
};
use error_stack::{Report, ResultExt as _};
use include_dir::{Dir, DirEntry, include_dir};
use time::OffsetDateTime;
use type_system::ontology::VersionedUrl;

use crate::fetcher::{FETCH_ONTOLOGY_TYPES_PATH, FetchedOntologyType, FetcherError};

#[derive(Clone)]
pub struct FetchServer {
    pub buffer_size: usize,
    pub predefined_types: HashMap<VersionedUrl, FetchedOntologyType>,
}

const PREDEFINED_TYPES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/predefined_types");

impl FetchServer {
    /// Load predefined types from the `predefined_types` directory
    ///
    /// # Errors
    ///
    /// - If the predefined types directory cannot be found
    /// - If a predefined type cannot be deserialized
    #[tracing::instrument(skip(self))]
    pub fn load_predefined_types(&mut self) -> Result<(), Report<io::Error>> {
        for entry in PREDEFINED_TYPES.find("**/*.json").change_context_lazy(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "No JSON files in predefined types directory found",
            )
        })? {
            if let DirEntry::File(file) = entry {
                let ontology_type = serde_json::from_slice(file.contents())
                    .map_err(io::Error::from)
                    .attach_with(|| file.path().display().to_string())?;
                let id = match &ontology_type {
                    FetchedOntologyType::DataType(data_type) => data_type.id.clone(),
                    FetchedOntologyType::PropertyType(property_type) => property_type.id.clone(),
                    FetchedOntologyType::EntityType(entity_type) => entity_type.id.clone(),
                };
                self.predefined_types.insert(id, ontology_type);
            }
        }

        Ok(())
    }

    /// Returns the predefined ontology types identified by the given [`VersionedUrl`]s.
    ///
    /// Only the types bundled in the `predefined_types` directory are served. A URL outside that
    /// set is rejected with [`FetcherError::NotPredefined`].
    ///
    /// # Errors
    ///
    /// - [`FetcherError::PredefinedTypes`] if the predefined types cannot be loaded
    /// - [`FetcherError::NotPredefined`] if a requested URL is not a predefined type
    #[tracing::instrument(skip(self))]
    pub fn fetch_ontology_types(
        mut self,
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError> {
        self.load_predefined_types().map_err(|err| {
            FetcherError::PredefinedTypes(format!("Error loading predefined types: {err:?}"))
        })?;

        ontology_type_urls
            .into_iter()
            .map(|url| {
                let ontology_type = self.predefined_types.get(&url).cloned().ok_or_else(|| {
                    tracing::error!(%url, "Requested ontology type is not a predefined type");
                    FetcherError::NotPredefined(format!(
                        "ontology type `{url}` is not a predefined type, and only predefined \
                         types can be fetched"
                    ))
                })?;

                Ok((ontology_type, OffsetDateTime::now_utc()))
            })
            .collect()
    }
}

/// Creates the HTTP router exposing the type fetcher service.
///
/// Serves [`FETCH_ONTOLOGY_TYPES_PATH`] for fetching ontology types and `/health` for healthchecks.
///
/// The probe body duplicates `hash_graph_api::rest::probe`, which cannot be reused because that
/// crate depends on this one.
pub fn router(server: FetchServer) -> Router {
    Router::new()
        .route(FETCH_ONTOLOGY_TYPES_PATH, post(fetch_ontology_types))
        .route(
            "/health",
            get(async || {
                (
                    [(reqwest::header::CONTENT_TYPE, "application/health+json")],
                    r#"{"status":"pass"}"#,
                )
                    .into_response()
            }),
        )
        .with_state(server)
}

async fn fetch_ontology_types(
    State(server): State<FetchServer>,
    Json(ontology_type_urls): Json<Vec<VersionedUrl>>,
) -> Response {
    match server.fetch_ontology_types(ontology_type_urls) {
        Ok(fetched) => Json(fetched).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, Json(error)).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fetcher::FetcherClient;

    fn server() -> FetchServer {
        FetchServer {
            buffer_size: 10,
            predefined_types: HashMap::new(),
        }
    }

    async fn spawn_server() -> FetcherClient {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("should bind to an ephemeral port");
        let port = listener
            .local_addr()
            .expect("listener should have a local address")
            .port();
        let app = router(server());
        tokio::spawn(async move { axum::serve(listener, app).await });

        FetcherClient::new("127.0.0.1", port).expect("client should build")
    }

    #[tokio::test]
    async fn http_round_trip_serves_predefined_type() {
        let client = spawn_server().await;
        let url: VersionedUrl =
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1"
                .parse()
                .expect("valid versioned URL");

        let fetched = client
            .fetch_ontology_types(vec![url.clone()])
            .await
            .expect("predefined type should be served");

        assert_eq!(fetched.len(), 1);
        let FetchedOntologyType::DataType(data_type) = &fetched[0].0 else {
            panic!("expected a data type");
        };
        assert_eq!(data_type.id, url);
    }

    #[tokio::test]
    async fn http_round_trip_rejects_type_outside_predefined_set() {
        let client = spawn_server().await;
        let url: VersionedUrl = "https://example.com/@alice/types/entity-type/person/v/1"
            .parse()
            .expect("valid versioned URL");

        let error = client
            .fetch_ontology_types(vec![url.clone()])
            .await
            .expect_err("type outside the predefined set should be rejected");

        let FetcherError::NotPredefined(message) = &error else {
            panic!("expected a `NotPredefined` error, got: {error:?}");
        };
        assert!(
            message.contains(&url.to_string()),
            "error should name the requested URL, got: {message}"
        );
    }

    #[test]
    fn serves_block_protocol_data_types_and_link_entity_type() {
        let urls: Vec<VersionedUrl> = [
            "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
            "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            "https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1",
            "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
        ]
        .into_iter()
        .map(|url| url.parse().expect("valid versioned URL"))
        .collect();

        let fetched = server()
            .fetch_ontology_types(urls.clone())
            .expect("predefined types should be served");

        let fetched_ids: Vec<&VersionedUrl> = fetched
            .iter()
            .map(|(ontology_type, _)| match ontology_type {
                FetchedOntologyType::DataType(data_type) => &data_type.id,
                FetchedOntologyType::PropertyType(property_type) => &property_type.id,
                FetchedOntologyType::EntityType(entity_type) => &entity_type.id,
            })
            .collect();
        assert_eq!(fetched_ids, urls.iter().collect::<Vec<_>>());
        assert!(matches!(
            fetched.last().map(|(ontology_type, _)| ontology_type),
            Some(FetchedOntologyType::EntityType(_))
        ));
    }
}
