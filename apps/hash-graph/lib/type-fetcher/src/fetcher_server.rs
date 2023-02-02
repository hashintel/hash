use std::collections::{HashSet, VecDeque};

use futures::{stream, TryStreamExt};
use reqwest::{
    header::{ACCEPT, USER_AGENT},
    Client,
};
use tarpc::context::Context;
use type_system::{
    DataType, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

use crate::fetcher::{FetchedOntologyType, Fetcher, FetcherError, TypeFetchResponse};

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

#[derive(Debug)]
struct StreamState {
    seen: HashSet<String>,
    queue: VecDeque<String>,
}

impl StreamState {
    fn new(seen: HashSet<String>, queue: VecDeque<String>) -> Self {
        Self { seen, queue }
    }

    fn with_intitial_state(start: String) -> Self {
        let mut seen = HashSet::new();
        seen.insert(start.clone());
        let mut queue = VecDeque::new();
        queue.push_back(start);

        Self::new(seen, queue)
    }
}

async fn fetch_entity_type_exhaustive(
    entity_type_url: String,
) -> Result<TypeFetchResponse, FetcherError> {
    // let seen: DashSet<String> = DashSet::new();

    let http_client = Client::new();
    let res = stream::try_unfold(
        StreamState::with_intitial_state(entity_type_url),
        |mut state| async {
            let client = http_client.clone();
            let next_url = state.queue.pop_front();

            let Some(url) = next_url else { return Ok(None) };
            let response = fetch_ontology_type(client, url).await?;

            let uris: Vec<String> = match response.clone() {
                FetchedOntologyType::EntityType(schema) => {
                    let entity_type: EntityType = schema.try_into().map_err(|error| {
                        tracing::error!(error=?error, "Couldn't convert schema to Entity Type");
                        FetcherError::TypeParsingError(format!(
                            "Error parsing ontology type: {error:?}"
                        ))
                    })?;
                    traverse_entity_type_references(&entity_type).collect()
                }
                FetchedOntologyType::PropertyType(schema) => {
                    let property_type: PropertyType = schema.try_into().map_err(|error| {
                        tracing::error!(error=?error, "Couldn't convert schema to Property Type");
                        FetcherError::TypeParsingError(format!(
                            "Error parsing ontology type: {error:?}"
                        ))
                    })?;

                    traverse_property_type_references(&property_type).collect()
                }
                FetchedOntologyType::DataType(schema) => {
                    let data_type: DataType = schema.try_into().map_err(|error| {
                        tracing::error!(error=?error, "Couldn't convert schema to Data Type");
                        FetcherError::TypeParsingError(format!(
                            "Error parsing ontology type: {error:?}"
                        ))
                    })?;

                    traverse_data_type_references(&data_type).collect()
                }
            };

            for uri in uris {
                // TODO: reconsider how we should handle these "builtin" external types.
                if uri.starts_with("https://blockprotocol.org/@blockprotocol/types/") {
                    continue;
                }

                if !state.seen.contains(&uri) {
                    state.seen.insert(uri.clone());
                    state.queue.push_back(uri);
                }
            }

            Ok(Some((response, state)))
        },
    )
    .try_collect::<Vec<_>>()
    .await?;

    Ok(TypeFetchResponse::new(res))
}

pub async fn fetch_ontology_type(
    client: Client,
    url: String,
) -> Result<FetchedOntologyType, FetcherError> {
    let resp = client
        .get(&url)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "HASH Graph")
        .send()
        .await
        .map_err(|err| {
            tracing::error!(error=?err, url=&url, "Could not fetch ontology type");
            FetcherError::NetworkError(format!("Error fetching {url}: {err:?}"))
        })?
        .json::<FetchedOntologyType>()
        .await
        .map_err(|err| {
            tracing::error!(error=?err, url=&url, "Could not deserialize response");
            FetcherError::SerializationError(format!("Error deserializing {url}: {err:?}"))
        })?;

    Ok(resp)
}

#[allow(clippy::enum_variant_names)]
enum OntologyTypeReference<'a> {
    EntityTypeReference(&'a EntityTypeReference),
    PropertyTypeReference(&'a PropertyTypeReference),
    DataTypeReference(&'a DataTypeReference),
}

impl<'a> From<OntologyTypeReference<'a>> for String {
    fn from(val: OntologyTypeReference<'a>) -> Self {
        match val {
            OntologyTypeReference::EntityTypeReference(r) => r.uri(),
            OntologyTypeReference::PropertyTypeReference(r) => r.uri(),
            OntologyTypeReference::DataTypeReference(r) => r.uri(),
        }
        .to_string()
    }
}

fn traverse_entity_type_references(entity_type: &EntityType) -> impl Iterator<Item = String> + '_ {
    entity_type
        .property_type_references()
        .into_iter()
        .map(OntologyTypeReference::PropertyTypeReference)
        .chain(
            entity_type
                .inherits_from()
                .all_of()
                .iter()
                .map(OntologyTypeReference::EntityTypeReference),
        )
        .chain(entity_type.link_mappings().into_iter().flat_map(
            |(link_entity_type, destination_entity_type_constraint)| {
                let mut references = Vec::new();
                references.push(OntologyTypeReference::EntityTypeReference(link_entity_type));

                if let Some(entity_type_constraint) = destination_entity_type_constraint {
                    references.extend(entity_type_constraint.iter().map(|entity_type| {
                        OntologyTypeReference::EntityTypeReference(entity_type)
                    }));
                }

                references
            },
        ))
        .map(Into::<String>::into)
}

fn traverse_property_type_references(
    property_type: &PropertyType,
) -> impl Iterator<Item = String> + '_ {
    property_type
        .property_type_references()
        .into_iter()
        .map(OntologyTypeReference::PropertyTypeReference)
        .chain(
            property_type
                .data_type_references()
                .into_iter()
                .map(OntologyTypeReference::DataTypeReference),
        )
        .map(Into::<String>::into)
}

fn traverse_data_type_references(_data_type: &DataType) -> impl Iterator<Item = String> + '_ {
    // Doesn't currently have other references.
    std::iter::empty()
}
