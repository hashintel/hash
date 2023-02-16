use std::collections::{HashSet, VecDeque};

use futures::{stream, TryStreamExt};
use reqwest::{
    header::{ACCEPT, USER_AGENT},
    Client,
};
use tarpc::context::Context;
use time::OffsetDateTime;
use type_system::{
    uri::VersionedUri, DataType, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

use crate::fetcher::{FetchedOntologyType, Fetcher, FetcherError, OntologyType, TypeFetchResponse};

#[derive(Clone)]
pub struct FetchServer;

#[tarpc::server]
impl Fetcher for FetchServer {
    async fn fetch_ontology_type_exhaustive(
        self,
        _context: Context,
        ontology_type_url: VersionedUri,
    ) -> Result<TypeFetchResponse, FetcherError> {
        fetch_ontology_type_exhaustive(ontology_type_url).await
    }
}

#[derive(Debug)]
struct StreamState {
    seen: HashSet<VersionedUri>,
    queue: VecDeque<VersionedUri>,
}

impl StreamState {
    fn new(seen: HashSet<VersionedUri>, queue: VecDeque<VersionedUri>) -> Self {
        Self { seen, queue }
    }

    fn with_intitial_state(start: VersionedUri) -> Self {
        let mut seen = HashSet::new();
        seen.insert(start.clone());
        let mut queue = VecDeque::new();
        queue.push_back(start);

        Self::new(seen, queue)
    }
}

async fn fetch_ontology_type_exhaustive(
    ontology_type_url: VersionedUri,
) -> Result<TypeFetchResponse, FetcherError> {
    let http_client = Client::new();
    let res = stream::try_unfold(
        StreamState::with_intitial_state(ontology_type_url),
        |mut state| async {
            let client = http_client.clone();
            let next_url = state.queue.pop_front();

            let Some(url) = next_url else { return Ok(None) };
            let response = fetch_ontology_type(client, url).await?;

            let uris: Vec<VersionedUri> = match response.ontology_type.clone() {
                OntologyType::EntityType(schema) => {
                    let entity_type: EntityType = schema.try_into().map_err(|error| {
                        tracing::error!(error=?error, "Couldn't convert schema to Entity Type");
                        FetcherError::TypeParsingError(format!(
                            "Error parsing ontology type: {error:?}"
                        ))
                    })?;
                    traverse_entity_type_references(&entity_type)
                        .map(|reference| reference.uri().clone())
                        .collect()
                }
                OntologyType::PropertyType(schema) => {
                    let property_type: PropertyType = schema.try_into().map_err(|error| {
                        tracing::error!(error=?error, "Couldn't convert schema to Property Type");
                        FetcherError::TypeParsingError(format!(
                            "Error parsing ontology type: {error:?}"
                        ))
                    })?;

                    traverse_property_type_references(&property_type)
                        .map(|reference| reference.uri().clone())
                        .collect()
                }
                OntologyType::DataType(schema) => {
                    let data_type: DataType = schema.try_into().map_err(|error| {
                        tracing::error!(error=?error, "Couldn't convert schema to Data Type");
                        FetcherError::TypeParsingError(format!(
                            "Error parsing ontology type: {error:?}"
                        ))
                    })?;

                    traverse_data_type_references(&data_type)
                        .map(|reference| reference.uri().clone())
                        .collect()
                }
            };

            for uri in uris {
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

/// # Errors
///
/// - If the client fails to fetch the ontology type
/// - If the client fails to deserialize the response
pub async fn fetch_ontology_type(
    client: Client,
    url: VersionedUri,
) -> Result<FetchedOntologyType, FetcherError> {
    let ontology_type = client
        .get(url.to_url())
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "HASH Graph")
        .send()
        .await
        .map_err(|err| {
            tracing::error!(error=?err, %url, "Could not fetch ontology type");
            FetcherError::NetworkError(format!("Error fetching {url}: {err:?}"))
        })?
        .json::<OntologyType>()
        .await
        .map_err(|err| {
            tracing::error!(error=?err, %url, "Could not deserialize response");
            FetcherError::SerializationError(format!("Error deserializing {url}: {err:?}"))
        })?;

    Ok(FetchedOntologyType {
        ontology_type,
        fetched_at: OffsetDateTime::now_utc(),
    })
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
pub enum OntologyTypeReference<'a> {
    EntityTypeReference(&'a EntityTypeReference),
    PropertyTypeReference(&'a PropertyTypeReference),
    DataTypeReference(&'a DataTypeReference),
}

impl OntologyTypeReference<'_> {
    #[must_use]
    pub const fn uri(&self) -> &VersionedUri {
        match self {
            OntologyTypeReference::EntityTypeReference(r) => r.uri(),
            OntologyTypeReference::PropertyTypeReference(r) => r.uri(),
            OntologyTypeReference::DataTypeReference(r) => r.uri(),
        }
    }
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

pub fn traverse_entity_type_references(
    entity_type: &EntityType,
) -> impl Iterator<Item = OntologyTypeReference> + '_ {
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
                    references.extend(
                        entity_type_constraint
                            .iter()
                            .map(OntologyTypeReference::EntityTypeReference),
                    );
                }

                references
            },
        ))
}

pub fn traverse_property_type_references(
    property_type: &PropertyType,
) -> impl Iterator<Item = OntologyTypeReference> + '_ {
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
}

pub fn traverse_data_type_references(
    _data_type: &DataType,
) -> impl Iterator<Item = OntologyTypeReference> + '_ {
    // Doesn't currently have other references.
    std::iter::empty()
}
