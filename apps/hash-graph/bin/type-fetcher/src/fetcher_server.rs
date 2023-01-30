use reqwest::header::{ACCEPT, USER_AGENT};
use tarpc::context::Context;
use tracing::info;
use type_fetcher::fetcher::{FetchedOntologyType, Fetcher, FetcherError, TypeFetchResponse};
use type_system::repr::EntityType;

#[derive(Clone)]
pub struct FetchServer;

#[tarpc::server]
impl Fetcher for FetchServer {
    async fn fetch_entity_type_exhaustive(
        self,
        _context: Context,
        entity_type_url: String,
    ) -> Result<TypeFetchResponse, FetcherError> {
        fetch_entity_type_exhaustive(entity_type_url).await
    }
}

async fn fetch_entity_type_exhaustive(
    _entity_type_url: String,
) -> Result<TypeFetchResponse, FetcherError> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://alpha.hash.ai/@ciaran/types/entity-type/code-snippet/v/2")
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "HASH Graph")
        .send()
        .await
        .map_err(|_| FetcherError::NetworkError)?
        .json::<EntityType>()
        .await
        .map_err(|_| FetcherError::SerializationError)?;

    info!("{:#?}", resp);

    Ok(TypeFetchResponse::new(vec![
        FetchedOntologyType::EntityType(resp),
    ]))
}
