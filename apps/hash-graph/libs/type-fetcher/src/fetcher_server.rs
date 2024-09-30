use core::time::Duration;
use std::{collections::HashMap, env, fs::File, io};

use error_stack::{Report, ResultExt};
use futures::{StreamExt, TryStreamExt, stream};
use reqwest::{
    Client,
    header::{ACCEPT, USER_AGENT},
};
use tarpc::context::Context;
use time::OffsetDateTime;
use type_system::url::VersionedUrl;
use walkdir::WalkDir;

use crate::fetcher::{FetchedOntologyType, Fetcher, FetcherError};

#[derive(Clone)]
pub struct FetchServer {
    pub buffer_size: usize,
    pub predefined_types: HashMap<VersionedUrl, FetchedOntologyType>,
}

impl FetchServer {
    /// Load predefined types from the `predefined_types` directory
    ///
    /// # Errors
    ///
    /// - If the predefined types directory cannot be found
    /// - If a predefined type cannot be deserialized
    pub fn load_predefined_types(&mut self) -> Result<(), Report<io::Error>> {
        let directory = env::current_dir()?
            .join("apps")
            .join("hash-graph")
            .join("libs")
            .join("type-fetcher")
            .join("predefined_types")
            .canonicalize()?;
        for entry in WalkDir::new(directory) {
            let entry = match &entry {
                Ok(entry) => entry,
                Err(error) => {
                    tracing::error!(error=?error, "Could not read entry");
                    continue;
                }
            };

            if entry.file_type().is_dir() {
                continue;
            }

            self.load_predefined_type(
                serde_json::from_reader(File::open(entry.path())?)
                    .map_err(io::Error::from)
                    .attach_printable_lazy(|| entry.path().display().to_string())?,
            );
        }

        Ok(())
    }

    pub fn load_predefined_type(&mut self, ontology_type: FetchedOntologyType) {
        let id = match &ontology_type {
            FetchedOntologyType::DataType(data_type) => {
                tracing::info!(%data_type.id, "Loaded predefined data type");
                data_type.id.clone()
            }
            FetchedOntologyType::PropertyType(property_type) => {
                tracing::info!(%property_type.id, "Loaded predefined property type");
                property_type.id.clone()
            }
            FetchedOntologyType::EntityType(entity_type) => {
                tracing::info!(%entity_type.id, "Loaded predefined entity type");
                entity_type.id.clone()
            }
        };
        self.predefined_types.insert(id, ontology_type);
    }
}

#[tarpc::server]
impl Fetcher for FetchServer {
    async fn fetch_ontology_types(
        self,
        _context: Context,
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError> {
        let client = Client::new();
        let predefined_types = &self.predefined_types;
        stream::iter(ontology_type_urls)
            .map(|url| {
                let client = client.clone();
                async move {
                    let ontology_type = if let Some(ontology_type) = predefined_types.get(&url) {
                        ontology_type.clone()
                    } else {
                        client
                            .get(url.to_url())
                            .header(ACCEPT, "application/json")
                            .header(USER_AGENT, "HASH Graph")
                            .timeout(Duration::from_secs(10))
                            .send()
                            .await
                            .map_err(|err| {
                                tracing::error!(error=?err, %url, "Could not fetch ontology type");
                                FetcherError::NetworkError(format!("Error fetching {url}: {err:?}"))
                            })?
                            .json::<FetchedOntologyType>()
                            .await
                            .map_err(|err| {
                                tracing::error!(error=?err, %url, "Could not deserialize response");
                                FetcherError::SerializationError(format!(
                                    "Error deserializing {url}: {err:?}"
                                ))
                            })?
                    };

                    Ok::<_, FetcherError>((ontology_type, OffsetDateTime::now_utc()))
                }
            })
            .buffer_unordered(self.buffer_size)
            .try_collect()
            .await
    }
}
