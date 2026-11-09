use alloc::{borrow::Cow, sync::Arc};
use core::sync::atomic::{AtomicUsize, Ordering};

use axum::{
    Json, Router,
    http::{
        HeaderMap, StatusCode,
        header::{AUTHORIZATION, LOCATION},
    },
    response::IntoResponse as _,
    routing::{get, post},
};
use bytes::Bytes;
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
use serde_json::{Map, Value, json};
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
    EXPIRED_AT, GraphVaultConfig, GraphVaultSecretStore, ResponseBody, SecretObject,
    SecretQueryResponse, SecretStore as _, USER_SECRET_TYPE, VAULT_PATH, VaultResponse,
    VaultSecret, secret_response, validate_entity,
};
use crate::sources::{SecretService, SourceError, rest, tests::server};

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
            entity_type_ids: [USER_SECRET_TYPE.clone()].into(),
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
                    created_from_draft_id: None,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
            Filter::for_entity_by_type_id(&USER_SECRET_TYPE),
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
    // The owner runs the integration in their own web.
    let actor = web;
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
                            value: "stored-token".to_owned(),
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
        "should return the stored secret object as JSON"
    );
    assert!(
        !format!("{result:?}").contains("stored-token"),
        "should redact secret diagnostics"
    );
    let auth = serde_json::from_value(json!({"type": "bearer", "secretEntityUuid": id}))
        .expect("should describe bearer authentication");
    let headers = rest::headers(Some(&auth), Some(&result))
        .expect("should read the stored secret as a REST token");
    assert_eq!(
        headers
            .get(AUTHORIZATION)
            .and_then(|header| header.to_str().ok()),
        Some("Bearer stored-token"),
        "should send the stored token as a bearer credential"
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
            web,
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
#[case::empty_data(1)]
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
                                data: Map::<String, Value>::new(),
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
            web,
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
    let server =
        server(Router::new().fallback(move || async move { (status, "sensitive-response-body") }))
            .await;
    let response = Client::builder()
        .no_proxy()
        .build()
        .expect("should build the client")
        .get(server.url())
        .send()
        .await
        .expect("should receive the response");
    let error = secret_response(response, service)
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
    let body = secret_response(response, service)
        .await
        .expect("should read the response body");
    let error = body
        .decode::<VaultResponse<SecretObject<'_>>>()
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

#[rstest]
#[case::object(r#"{ "username": "user", "password": "pa\"ss" }"#, Some(false))]
#[case::empty("{ }", Some(true))]
#[case::string(r#""sensitive-secret-value""#, None)]
#[case::array(r#"["sensitive-secret-value"]"#, None)]
fn vault_secret_object(#[case] object: &str, #[case] empty: Option<bool>) {
    let body = ResponseBody {
        bytes: Bytes::from(format!(r#"{{"data": {{"data": {object}}}}}"#)),
        service: SecretService::Vault,
    };
    match (body.decode::<VaultResponse<SecretObject<'_>>>(), empty) {
        (Ok(response), Some(empty)) => {
            assert_eq!(
                response.data.data.json.get(),
                object,
                "should keep the stored object's JSON text unchanged"
            );
            assert_eq!(
                response.data.data.empty, empty,
                "should report whether the object has entries"
            );
        }
        (Err(error), None) => {
            assert!(
                matches!(
                    error.current_context(),
                    SourceError::SecretResponse {
                        service: SecretService::Vault
                    }
                ),
                "should reject a secret that is not an object"
            );
            assert!(
                !format!("{error:?}").contains("sensitive-secret-value"),
                "should redact the rejected value"
            );
        }
        (Ok(_), None) => panic!("should reject a secret that is not an object"),
        (Err(error), Some(_)) => panic!("should decode the secret object: {error:?}"),
    }
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
    let body = secret_response(response, SecretService::Graph)
        .await
        .expect("should read the response body");
    let error = body
        .decode::<SecretQueryResponse>()
        .err()
        .expect("should reject incomplete JSON");
    assert!(
        error.contains::<serde_json::Error>(),
        "should retain the underlying parser error"
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
            web,
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
fn member_alias_of_another_users_secret() {
    // A member of the owner's web creates an entity that points at the owner's Vault path.
    let owner = Uuid::new_v4();
    let member = Uuid::new_v4();
    let id = Uuid::new_v4();
    let alias = entity(owner, id);
    let error = validate_entity(&alias, owner, member, id)
        .expect_err("should reject a Vault path owned by another user");
    assert!(
        matches!(error.current_context(), SourceError::SecretPath),
        "should identify the foreign Vault path"
    );
}

#[test]
fn entity_identity_expiry_and_path() {
    let web = Uuid::new_v4();
    let id = Uuid::new_v4();
    let original = entity(web, id);
    assert!(
        validate_entity(&original, web, web, id).is_ok(),
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
        let error = validate_entity(&invalid, web, web, id)
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
            BaseUrl::new(VAULT_PATH.to_owned()).expect("should parse the Vault path property URL"),
            Property::Value(PropertyValue::String(path)),
        );
        invalid.properties = PropertyObject::new(properties);
        let error = validate_entity(&invalid, web, web, id)
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
        let error = validate_entity(&invalid, web, web, id)
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
        validate_entity(&expired, web, web, id).expect_err("should reject an expired secret");
    assert!(
        matches!(error.current_context(), SourceError::SecretExpired),
        "should distinguish expiration from invalid expiry metadata"
    );
}
