use core::time::Duration;

use futures::{stream, StreamExt, TryStreamExt};
use reqwest::{
    header::{ACCEPT, USER_AGENT},
    Client,
};
use tarpc::context::Context;
use time::OffsetDateTime;
use type_system::url::VersionedUrl;

use crate::fetcher::{FetchedOntologyType, Fetcher, FetcherError};

#[derive(Clone)]
pub struct FetchServer {
    pub buffer_size: usize,
}

#[tarpc::server]
impl Fetcher for FetchServer {
    async fn fetch_ontology_types(
        self,
        _context: Context,
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError> {
        let client = Client::new();
        stream::iter(ontology_type_urls)
            .map(|url| {
                let client = client.clone();
                async move {
                    let ontology_type = client
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
                        })?;

                    Ok::<_, FetcherError>((ontology_type, OffsetDateTime::now_utc()))
                }
            })
            .buffer_unordered(self.buffer_size)
            .try_collect()
            .await
    }
}
