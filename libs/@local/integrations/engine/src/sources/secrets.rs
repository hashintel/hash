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
mod tests {
    use alloc::{borrow::Cow, sync::Arc};
    use core::sync::atomic::{AtomicUsize, Ordering};

    use axum::{
        Json, Router,
        http::{HeaderMap, StatusCode, header::LOCATION},
        response::IntoResponse as _,
        routing::{get, post},
    };
    use hash_crypto::Secret;
    use hash_graph_store::{
        entity::EntityQueryPath,
        filter::{Filter, FilterExpression, Parameter},
        subgraph::temporal_axes::QueryTemporalAxesUnresolved,
    };
    use hash_graph_temporal_versioning::{
        ClosedTemporalBound, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp,
    };
    use hash_integrations_definition::SecretReference;
    use hash_middleware::authentication::{
        request::ACTOR_ID_HEADER, service_secret::service_credential,
    };
    use reqwest::Client;
    use rstest::rstest;
    use serde::{Deserialize, Serialize};
    use serde_json::{Map, Value};
    use type_system::{
        knowledge::{
            Entity, Property, PropertyValue,
            entity::{
                EntityId, EntityMetadata, EntityProvenance,
                id::{EntityEditionId, EntityRecordId, EntityUuid},
                metadata::EntityTemporalMetadata,
                provenance::{EntityEditionProvenance, ProvidedEntityEditionProvenance},
            },
            property::{PropertyObject, metadata::PropertyObjectMetadata},
        },
        ontology::BaseUrl,
        principal::{
            actor::{ActorEntityUuid, ActorType},
            actor_group::WebId,
        },
        provenance::{OriginProvenance, OriginType},
    };
    use uuid::Uuid;

    use super::{
        EXPIRED_AT, GraphVaultConfig, GraphVaultSecretStore, SecretQueryResponse, SecretStore as _,
        USER_SECRET_TYPE, VAULT_PATH, VaultResponse, VaultSecret, secret_response, validate_entity,
    };
    use crate::sources::{SecretService, SourceError, tests::server};

    fn entity(web: Uuid, id: Uuid) -> Entity {
        let transaction_time = Timestamp::from_unix_timestamp(1_767_225_600);
        let decision_time = Timestamp::from_unix_timestamp(1_767_225_600);
        Entity {
            properties: PropertyObject::new(
                [
                    (EXPIRED_AT, "2999-01-01T00:00:00Z".to_owned()),
                    (VAULT_PATH, format!("users/{web}/connector/token")),
                ]
                .into_iter()
                .map(|(url, value)| {
                    (
                        BaseUrl::new(url.to_owned()).expect("should parse the property URL"),
                        Property::Value(PropertyValue::String(value)),
                    )
                })
                .collect(),
            ),
            link_data: None,
            metadata: EntityMetadata {
                record_id: EntityRecordId {
                    entity_id: EntityId {
                        web_id: WebId::new(web),
                        entity_uuid: EntityUuid::new(id),
                        draft_id: None,
                    },
                    edition_id: EntityEditionId::new(id),
                },
                temporal_versioning: EntityTemporalMetadata {
                    decision_time: LeftClosedTemporalInterval::new(
                        ClosedTemporalBound::Inclusive(decision_time),
                        OpenTemporalBound::Unbounded,
                    ),
                    transaction_time: LeftClosedTemporalInterval::new(
                        ClosedTemporalBound::Inclusive(transaction_time),
                        OpenTemporalBound::Unbounded,
                    ),
                },
                entity_type_ids: [USER_SECRET_TYPE
                    .parse()
                    .expect("should parse the secret type")]
                .into(),
                archived: false,
                read_only: false,
                provenance: EntityProvenance {
                    created_by_id: ActorEntityUuid::new(web),
                    created_at_transaction_time: transaction_time,
                    created_at_decision_time: decision_time,
                    first_non_draft_created_at_transaction_time: None,
                    first_non_draft_created_at_decision_time: None,
                    deletion: None,
                    edition: EntityEditionProvenance {
                        created_by_id: ActorEntityUuid::new(web),
                        archived_by_id: None,
                        provided: ProvidedEntityEditionProvenance {
                            sources: Vec::new(),
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                        },
                    },
                },
                confidence: None,
                properties: PropertyObjectMetadata::default(),
            },
        }
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SecretQueryRequest<'a> {
        #[serde(borrow)]
        filter: Filter<'a, Entity>,
        temporal_axes: QueryTemporalAxesUnresolved,
        limit: usize,
        include_drafts: bool,
        include_permissions: bool,
    }

    fn assert_query(headers: &HeaderMap, body: &str, web: Uuid, actor: Uuid, id: Uuid) {
        let body: SecretQueryRequest<'_> =
            serde_json::from_str(body).expect("should decode the Graph query using shared types");
        assert_eq!(
            headers
                .get(ACTOR_ID_HEADER)
                .and_then(|header| header.to_str().ok()),
            Some(actor.to_string().as_str()),
            "should query as the run owner"
        );
        assert_eq!(
            service_credential(headers),
            Some("graph-token"),
            "should authenticate the service"
        );
        let secret_type = USER_SECRET_TYPE
            .parse()
            .expect("should parse the secret type");
        let equal = |path, parameter| {
            Filter::Equal(
                FilterExpression::Path { path },
                FilterExpression::Parameter {
                    parameter,
                    convert: None,
                },
            )
        };
        assert_eq!(
            body.filter,
            Filter::All(vec![
                Filter::All(vec![
                    equal(
                        EntityQueryPath::WebId,
                        Parameter::Text(Cow::Owned(web.to_string()))
                    ),
                    equal(
                        EntityQueryPath::Uuid,
                        Parameter::Text(Cow::Owned(id.to_string()))
                    ),
                ]),
                equal(EntityQueryPath::Archived, Parameter::Boolean(false)),
                Filter::for_entity_by_type_id(&secret_type),
            ]),
            "should constrain the web, identity, archive state, and type"
        );
        assert_eq!(
            body.temporal_axes,
            QueryTemporalAxesUnresolved::live_only(),
            "should query the current entity edition"
        );
        assert_eq!(body.limit, 2, "should detect ambiguous secret references");
        assert!(!body.include_drafts, "should exclude drafts");
        assert!(!body.include_permissions, "should omit permissions");
    }

    #[derive(Serialize)]
    struct StoredValue {
        value: String,
    }

    fn store(graph_url: &str, vault_url: &str) -> GraphVaultSecretStore {
        GraphVaultSecretStore::new(GraphVaultConfig {
            graph_url: graph_url.to_owned(),
            graph_service_secret: Secret::from_string("graph-token".to_owned()),
            vault_url: vault_url.to_owned(),
            vault_mount: "secret".to_owned(),
            vault_token: Secret::from_string("vault-token".to_owned()),
        })
        .expect("should configure the service endpoints")
    }

    #[tokio::test]
    async fn read_graph_authorization_and_vault_value() {
        let web = Uuid::new_v4();
        let actor = Uuid::new_v4();
        let id = Uuid::new_v4();
        let entity = entity(web, id);
        let router = Router::new()
            .route(
                "/entities/query",
                post(move |headers: HeaderMap, body: String| {
                    let entity = entity.clone();
                    async move {
                        assert_query(&headers, &body, web, actor, id);
                        Json(SecretQueryResponse {
                            entities: vec![entity],
                        })
                    }
                }),
            )
            .route(
                &format!("/v1/secret/data/users/{web}/connector/token"),
                get(|headers: HeaderMap| async move {
                    assert_eq!(
                        headers
                            .get("x-vault-token")
                            .and_then(|header| header.to_str().ok()),
                        Some("vault-token"),
                        "should authenticate to Vault"
                    );
                    Json(VaultResponse {
                        data: VaultSecret {
                            data: StoredValue {
                                value: serde_json::to_string(&StoredValue {
                                    value: "stored-token".to_owned(),
                                })
                                .expect("should encode the stored secret"),
                            },
                        },
                    })
                }),
            );
        let server = server(router).await;
        let store = store(server.url(), server.url());
        let result = store
            .read(
                web,
                actor,
                SecretReference {
                    secret_entity_uuid: id,
                },
            )
            .await
            .expect("should resolve an authorized secret");
        assert_eq!(
            result.expose(),
            serde_json::to_vec(&StoredValue {
                value: "stored-token".to_owned()
            })
            .expect("should encode the expected secret"),
            "should unwrap the Vault value envelope"
        );
        assert!(
            !format!("{result:?}").contains("stored-token"),
            "should redact secret diagnostics"
        );
    }

    #[rstest]
    #[case(SecretService::Graph)]
    #[case(SecretService::Vault)]
    #[tokio::test]
    async fn read_request_failure(#[case] service: SecretService) {
        let unavailable = server(Router::new()).await;
        let unavailable_url = unavailable.url().to_owned();
        drop(unavailable);
        let web = Uuid::new_v4();
        let id = Uuid::new_v4();
        let entity = entity(web, id);
        let graph = server(Router::new().route(
            "/entities/query",
            post(move || {
                let entity = entity.clone();
                async move {
                    Json(SecretQueryResponse {
                        entities: vec![entity],
                    })
                }
            }),
        ))
        .await;
        let graph_url = match service {
            SecretService::Graph => unavailable_url.as_str(),
            SecretService::Vault => graph.url(),
        };
        let error = store(graph_url, &unavailable_url)
            .read(
                web,
                Uuid::new_v4(),
                SecretReference {
                    secret_entity_uuid: id,
                },
            )
            .await
            .expect_err("should report an unavailable service");
        assert!(
            matches!(error.current_context(), SourceError::SecretRequest { service: actual } if *actual == service),
            "should identify the service whose request failed"
        );
        assert!(
            error.contains::<reqwest::Error>(),
            "should preserve the underlying request error"
        );
        let diagnostic = format!("{error:?}");
        for sensitive in [&unavailable_url, "graph-token", "vault-token"] {
            assert!(
                !diagnostic.contains(sensitive),
                "should omit request URLs and credentials"
            );
        }
    }

    #[rstest]
    #[case::missing(0)]
    #[case::ambiguous(2)]
    #[case::empty_value(1)]
    #[tokio::test]
    async fn read_entity_count_and_value(#[case] count: usize) {
        let web = Uuid::new_v4();
        let id = Uuid::new_v4();
        let entity = entity(web, id);
        let vault_reads = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&vault_reads);
        let services = server(
            Router::new()
                .route(
                    "/entities/query",
                    post(move || {
                        let entities = vec![entity.clone(); count];
                        async move { Json(SecretQueryResponse { entities }) }
                    }),
                )
                .route(
                    &format!("/v1/secret/data/users/{web}/connector/token"),
                    get(move || {
                        let observed = Arc::clone(&observed);
                        async move {
                            observed.fetch_add(1, Ordering::SeqCst);
                            Json(VaultResponse {
                                data: VaultSecret {
                                    data: StoredValue {
                                        value: String::new(),
                                    },
                                },
                            })
                        }
                    }),
                ),
        )
        .await;
        let error = store(services.url(), services.url())
            .read(
                web,
                Uuid::new_v4(),
                SecretReference {
                    secret_entity_uuid: id,
                },
            )
            .await
            .expect_err("should reject a missing or ambiguous entity or an empty credential");
        match count {
            1 => assert!(
                matches!(error.current_context(), SourceError::SecretValue),
                "should identify an invalid credential value"
            ),
            _ => assert!(
                matches!(error.current_context(), SourceError::SecretEntityCount { count: actual } if *actual == count),
                "should report how many secret entities were returned"
            ),
        }
        assert_eq!(
            vault_reads.load(Ordering::SeqCst),
            usize::from(count == 1),
            "should read Vault only after identifying exactly one secret entity"
        );
    }

    #[rstest]
    #[case(SecretService::Graph, StatusCode::FORBIDDEN)]
    #[case(SecretService::Vault, StatusCode::SERVICE_UNAVAILABLE)]
    #[case(SecretService::Graph, StatusCode::CREATED)]
    #[tokio::test]
    async fn response_http_status(#[case] service: SecretService, #[case] status: StatusCode) {
        let server = server(
            Router::new().fallback(move || async move { (status, "sensitive-response-body") }),
        )
        .await;
        let response = Client::builder()
            .no_proxy()
            .build()
            .expect("should build the client")
            .get(server.url())
            .send()
            .await
            .expect("should receive the response");
        let error = secret_response::<SecretQueryResponse>(response, service)
            .await
            .err()
            .expect("should reject an unexpected HTTP status");
        let diagnostic = format!("{error:?}");
        assert!(
            diagnostic.contains(&service.to_string()),
            "should identify the service"
        );
        assert!(
            diagnostic.contains(&status.as_u16().to_string()),
            "should include the HTTP status"
        );
        assert!(
            !diagnostic.contains("sensitive-response-body"),
            "should omit the response body"
        );
        assert!(
            matches!(
                error.current_context(),
                SourceError::SecretStatus { service: actual, status: code }
                    if *actual == service && *code == status.as_u16()
            ),
            "should expose the service and status as structured context"
        );
    }

    #[rstest]
    #[case(SecretService::Graph)]
    #[case(SecretService::Vault)]
    #[tokio::test]
    async fn response_schema_error(#[case] service: SecretService) {
        let server = server(Router::new().fallback(|| async {
            Json(VaultResponse {
                data: VaultSecret {
                    data: "sensitive-secret-value",
                },
            })
        }))
        .await;
        let response = Client::builder()
            .no_proxy()
            .build()
            .expect("should build the client")
            .get(server.url())
            .send()
            .await
            .expect("should receive the response");
        let error = secret_response::<VaultResponse<Map<String, Value>>>(response, service)
            .await
            .err()
            .expect("should reject a response with the wrong schema");
        let diagnostic = format!("{error:?}");
        assert!(
            matches!(error.current_context(), SourceError::SecretResponse { service: actual } if *actual == service),
            "should identify the service with an invalid response"
        );
        assert!(
            diagnostic.contains("expected schema at line 1 column"),
            "should identify a schema mismatch and its location"
        );
        assert!(
            !diagnostic.contains("sensitive-secret-value"),
            "should redact values echoed by serde errors"
        );
    }

    #[tokio::test]
    async fn response_incomplete_json() {
        let server = server(Router::new().fallback(|| async { "{" })).await;
        let response = Client::builder()
            .no_proxy()
            .build()
            .expect("should build the client")
            .get(server.url())
            .send()
            .await
            .expect("should receive the response");
        let error = secret_response::<SecretQueryResponse>(response, SecretService::Graph)
            .await
            .err()
            .expect("should reject incomplete JSON");
        assert!(
            error.contains::<reqwest::Error>(),
            "should retain the underlying response error"
        );
        assert!(
            matches!(
                error.current_context(),
                SourceError::SecretResponse {
                    service: SecretService::Graph
                }
            ),
            "should distinguish response decoding from request failures"
        );
        let diagnostic = format!("{error:?}");
        assert!(
            diagnostic.contains("EOF"),
            "should retain the JSON parser error"
        );
        assert!(diagnostic.contains("Graph"), "should identify the service");
        assert!(
            !diagnostic.contains(server.url()),
            "should omit the request URL"
        );
    }

    #[rstest]
    #[case::graph(true)]
    #[case::vault(false)]
    #[tokio::test]
    async fn read_redirects(#[case] redirect_graph: bool) {
        let requests = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&requests);
        let destination = server(Router::new().fallback(move || {
            let observed = Arc::clone(&observed);
            async move {
                observed.fetch_add(1, Ordering::SeqCst);
                StatusCode::OK
            }
        }))
        .await;
        let location = destination.url().to_owned();
        let graph_location = location.clone();
        let web = Uuid::new_v4();
        let id = Uuid::new_v4();
        let secret = entity(web, id);
        let router = Router::new()
            .route(
                "/entities/query",
                post(move || {
                    let location = graph_location.clone();
                    let entity = secret.clone();
                    async move {
                        if redirect_graph {
                            (StatusCode::TEMPORARY_REDIRECT, [(LOCATION, location)]).into_response()
                        } else {
                            Json(SecretQueryResponse {
                                entities: vec![entity],
                            })
                            .into_response()
                        }
                    }
                }),
            )
            .route(
                &format!("/v1/secret/data/users/{web}/connector/token"),
                get(move || {
                    let location = location.clone();
                    async move { (StatusCode::TEMPORARY_REDIRECT, [(LOCATION, location)]) }
                }),
            );
        let services = server(router).await;
        let store = store(services.url(), services.url());
        let error = store
            .read(
                web,
                Uuid::new_v4(),
                SecretReference {
                    secret_entity_uuid: id,
                },
            )
            .await
            .expect_err("should reject a redirected secret request");
        let diagnostic = format!("{error:?}");
        assert!(
            diagnostic.contains("307"),
            "should report the redirect status"
        );
        let expected_service = if redirect_graph {
            SecretService::Graph
        } else {
            SecretService::Vault
        };
        assert!(
            matches!(error.current_context(), SourceError::SecretStatus { service, status: 307 } if *service == expected_service),
            "should classify a redirect as an unexpected service status"
        );
        assert!(
            diagnostic.contains(if redirect_graph { "Graph" } else { "Vault" }),
            "should identify the redirecting service"
        );
        assert_eq!(
            requests.load(Ordering::SeqCst),
            0,
            "should keep credentials away from redirect destinations"
        );
    }

    #[test]
    fn entity_identity_expiry_and_path() {
        let web = Uuid::new_v4();
        let id = Uuid::new_v4();
        let original = entity(web, id);
        assert!(
            validate_entity(&original, web, id).is_ok(),
            "should accept an active secret in the owner's web"
        );
        let mut archived = original.clone();
        archived.metadata.archived = true;
        let mut foreign = original.clone();
        foreign.metadata.record_id.entity_id.web_id = WebId::new(Uuid::new_v4());
        let mut wrong_type = original.clone();
        wrong_type.metadata.entity_type_ids = ["https://other.example/type/v/1"
            .parse()
            .expect("should parse the unrelated entity type")]
        .into();
        for invalid in [archived, foreign, wrong_type] {
            let error = validate_entity(&invalid, web, id)
                .expect_err("should reject an invalid secret identity");
            assert!(
                matches!(error.current_context(), SourceError::SecretEntity),
                "should identify invalid secret entity metadata"
            );
        }
        for path in [
            format!("users/{web}/../token"),
            format!("users/{web}/connector/%2e%2e"),
            format!("users/{}/connector/token", Uuid::new_v4()),
            format!("users/{web}/connector/token?x=1"),
        ] {
            let mut invalid = original.clone();
            let mut properties = invalid.properties.properties().clone();
            properties.insert(
                BaseUrl::new(VAULT_PATH.to_owned())
                    .expect("should parse the Vault path property URL"),
                Property::Value(PropertyValue::String(path)),
            );
            invalid.properties = PropertyObject::new(properties);
            let error = validate_entity(&invalid, web, id)
                .expect_err("should reject an invalid Vault path");
            assert!(
                matches!(error.current_context(), SourceError::SecretPath),
                "should identify an invalid Vault path"
            );
        }
        for expiry in [None, Some("sensitive-invalid-expiry")] {
            let mut invalid = original.clone();
            let mut properties = invalid.properties.properties().clone();
            let key =
                BaseUrl::new(EXPIRED_AT.to_owned()).expect("should parse the expiry property URL");
            properties.remove(&key);
            if let Some(expiry) = expiry {
                properties.insert(
                    key,
                    Property::Value(PropertyValue::String(expiry.to_owned())),
                );
            }
            invalid.properties = PropertyObject::new(properties);
            let error = validate_entity(&invalid, web, id)
                .expect_err("should reject missing or malformed expiry metadata");
            assert!(
                matches!(error.current_context(), SourceError::SecretExpiry),
                "should identify invalid expiry metadata"
            );
            assert!(
                !format!("{error:?}").contains("sensitive-invalid-expiry"),
                "should omit invalid property values"
            );
        }
        let mut expired = original;
        let mut properties = expired.properties.properties().clone();
        properties.insert(
            BaseUrl::new(EXPIRED_AT.to_owned()).expect("should parse the expiry property URL"),
            Property::Value(PropertyValue::String("2000-01-01T00:00:00Z".to_owned())),
        );
        expired.properties = PropertyObject::new(properties);
        let error =
            validate_entity(&expired, web, id).expect_err("should reject an expired secret");
        assert!(
            matches!(error.current_context(), SourceError::SecretExpired),
            "should distinguish expiration from invalid expiry metadata"
        );
    }
}
