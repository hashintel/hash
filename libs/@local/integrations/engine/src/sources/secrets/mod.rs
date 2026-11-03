use core::{error::Error as _, pin::Pin, time::Duration};

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_graph_store::{
    entity::{EntityQueryPath, EntityQuerySorting, QueryEntitiesParams},
    filter::{Filter, FilterExpression, Parameter},
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_integrations_definition::SecretReference;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use reqwest::{Client, Url, header::AUTHORIZATION};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Map, Value};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use type_system::{
    knowledge::{
        Entity, Property, PropertyValue,
        entity::{EntityId, id::EntityUuid},
    },
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::{SecretService, SourceError};

/// Pinned secret bytes whose storage is zeroed when dropped.
pub type SecretValue = Pin<Box<Secret<[u8]>>>;

/// Resolves a User Secret using the run owner's permissions and web.
pub trait SecretStore: Send + Sync {
    fn read(
        &self,
        web_id: Uuid,
        actor_id: Uuid,
        reference: SecretReference,
    ) -> impl Future<Output = Result<SecretValue, Report<SourceError>>> + Send;
}

/// Endpoints and service credentials for Graph and a Vault KV v2 mount.
#[derive(Debug)]
pub struct GraphVaultConfig {
    pub graph_url: String,
    pub graph_service_secret: Pin<Box<Secret<str>>>,
    pub vault_url: String,
    pub vault_mount: String,
    pub vault_token: Pin<Box<Secret<str>>>,
}

/// Checks an active User Secret entity in Graph before reading its value from Vault.
pub struct GraphVaultSecretStore {
    config: GraphVaultConfig,
    graph: Url,
    vault: Url,
    client: Client,
}

const USER_SECRET_TYPE: &str = "https://hash.ai/@h/types/entity-type/user-secret/v/1";
const EXPIRED_AT: &str = "https://hash.ai/@h/types/property-type/expired-at/";
const VAULT_PATH: &str = "https://hash.ai/@h/types/property-type/vault-path/";

#[derive(Deserialize, Serialize)]
struct SecretQueryResponse {
    entities: Vec<Entity>,
}

#[derive(Deserialize, Serialize)]
struct VaultResponse<T> {
    data: VaultSecret<T>,
}

#[derive(Deserialize, Serialize)]
struct VaultSecret<T> {
    data: T,
}

impl GraphVaultSecretStore {
    /// Builds a client with redirects disabled and a finite request timeout.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError::Configuration`] for invalid or non-HTTP(S) endpoints, a mount
    /// containing path separators, or a failed HTTP client initialization.
    pub fn new(config: GraphVaultConfig) -> Result<Self, Report<SourceError>> {
        let graph = endpoint(&config.graph_url)?;
        let vault = endpoint(&config.vault_url)?;
        if !segment(&config.vault_mount)
            || config.graph_service_secret.expose().is_empty()
            || config.vault_token.expose().is_empty()
        {
            return Err(Report::new(SourceError::Configuration));
        }
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_error| Report::new(SourceError::Configuration))?;
        Ok(Self {
            config,
            graph,
            vault,
            client,
        })
    }
}

fn endpoint(value: &str) -> Result<Url, Report<SourceError>> {
    let url = Url::parse(value).map_err(|_error| Report::new(SourceError::Configuration))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Report::new(SourceError::Configuration));
    }
    Ok(url)
}

fn segment(value: &str) -> bool {
    !matches!(value, "" | "." | "..")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn secret_query(
    web_id: Uuid,
    entity_id: Uuid,
    secret_type: &VersionedUrl,
) -> QueryEntitiesParams<'_> {
    QueryEntitiesParams {
        filter: Filter::All(vec![
            Filter::for_entity_by_entity_id(EntityId {
                web_id: WebId::new(web_id),
                entity_uuid: EntityUuid::new(entity_id),
                draft_id: None,
            }),
            Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::Archived,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Boolean(false),
                    convert: None,
                },
            ),
            Filter::for_entity_by_type_id(secret_type),
        ]),
        temporal_axes: QueryTemporalAxesUnresolved::live_only(),
        sorting: EntityQuerySorting {
            paths: Vec::new(),
            cursor: None,
        },
        conversions: Vec::new(),
        limit: 2,
        include_drafts: false,
        include_entity_types: None,
        include_permissions: false,
    }
}

async fn secret_response<T: DeserializeOwned>(
    response: reqwest::Response,
    service: SecretService,
) -> Result<T, Report<SourceError>> {
    let status = response.status();
    if status != reqwest::StatusCode::OK {
        return Err(Report::new(SourceError::SecretStatus {
            service,
            status: status.as_u16(),
        }));
    }
    response.json().await.map_err(|error| {
        if let Some(json_error) = error
            .source()
            .and_then(|source| source.downcast_ref::<serde_json::Error>())
            && json_error.is_data()
        {
            Report::new(SourceError::SecretResponse { service }).attach(format!(
                "secret response does not match the expected schema at line {} column {}",
                json_error.line(),
                json_error.column(),
            ))
        } else {
            Report::new(error.without_url()).change_context(SourceError::SecretResponse { service })
        }
    })
}

impl SecretStore for GraphVaultSecretStore {
    async fn read(
        &self,
        web_id: Uuid,
        actor_id: Uuid,
        reference: SecretReference,
    ) -> Result<Pin<Box<Secret<[u8]>>>, Report<SourceError>> {
        let mut graph = self.graph.clone();
        graph
            .path_segments_mut()
            .map_err(|()| Report::new(SourceError::Configuration))?
            .pop_if_empty()
            .extend(["entities", "query"]);
        let secret_type = USER_SECRET_TYPE
            .parse::<VersionedUrl>()
            .map_err(|_error| Report::new(SourceError::Configuration))?;
        let query = secret_query(web_id, reference.secret_entity_uuid, &secret_type);
        let response = self
            .client
            .post(graph)
            .header(ACTOR_ID_HEADER, actor_id.to_string())
            .header(
                AUTHORIZATION,
                format!(
                    "{SERVICE_AUTH_SCHEME} {}",
                    self.config.graph_service_secret.expose()
                ),
            )
            .json(&query)
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(SourceError::SecretRequest {
                service: SecretService::Graph,
            })?;
        let body: SecretQueryResponse = secret_response(response, SecretService::Graph).await?;
        let [entity] = body.entities.as_slice() else {
            return Err(Report::new(SourceError::SecretEntityCount {
                count: body.entities.len(),
            }));
        };
        let path = validate_entity(entity, web_id, reference.secret_entity_uuid)?;
        let mut vault = self.vault.clone();
        vault
            .path_segments_mut()
            .map_err(|()| Report::new(SourceError::Configuration))?
            .pop_if_empty()
            .extend(["v1", &self.config.vault_mount, "data"])
            .extend(path.split('/'));
        let response = self
            .client
            .get(vault)
            .header("x-vault-token", self.config.vault_token.expose())
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(SourceError::SecretRequest {
                service: SecretService::Vault,
            })?;
        let body: VaultResponse<Map<String, Value>> =
            secret_response(response, SecretService::Vault).await?;
        let data = body.data.data;
        let bytes = match data.get("value") {
            Some(Value::String(value)) if data.len() == 1 => value.as_bytes().to_vec(),
            _ => serde_json::to_vec(&data).change_context(SourceError::SecretValue)?,
        };
        if bytes.is_empty() {
            return Err(Report::new(SourceError::SecretValue));
        }
        Ok(Secret::from_vec(bytes))
    }
}

fn validate_entity(
    entity: &Entity,
    web_id: Uuid,
    entity_id: Uuid,
) -> Result<&str, Report<SourceError>> {
    let expected = EntityId {
        web_id: WebId::new(web_id),
        entity_uuid: EntityUuid::new(entity_id),
        draft_id: None,
    };
    if entity.metadata.record_id.entity_id != expected
        || entity.metadata.archived
        || !entity
            .metadata
            .entity_type_ids
            .iter()
            .any(|id| id.to_string() == USER_SECRET_TYPE)
    {
        return Err(Report::new(SourceError::SecretEntity));
    }
    let expiry = string_property(entity, EXPIRED_AT)
        .and_then(|value| OffsetDateTime::parse(value, &Rfc3339).ok())
        .ok_or_else(|| Report::new(SourceError::SecretExpiry))?;
    if expiry <= OffsetDateTime::now_utc() {
        return Err(Report::new(SourceError::SecretExpired));
    }
    let path =
        string_property(entity, VAULT_PATH).ok_or_else(|| Report::new(SourceError::SecretPath))?;
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() < 4
        || parts.first().copied() != Some("users")
        || parts.get(1).copied() != Some(web_id.to_string().as_str())
        || !parts.iter().all(|part| segment(part))
    {
        return Err(Report::new(SourceError::SecretPath));
    }
    Ok(path)
}

fn string_property<'entity>(entity: &'entity Entity, url: &str) -> Option<&'entity str> {
    entity.properties.iter().find_map(|(key, property)| {
        if key.as_str() != url {
            return None;
        }
        let Property::Value(PropertyValue::String(value)) = property else {
            return None;
        };
        Some(value.as_str())
    })
}

#[cfg(test)]
mod tests;
