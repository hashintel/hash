use core::{pin::Pin, time::Duration};

use error_stack::Report;
use hash_integrations_definition::SecretReference;
use hash_secret::Secret;
use reqwest::{Client, Url};
#[cfg(test)]
use serde::{Deserialize as _, Deserializer};
use serde_json::{Value, json};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use uuid::Uuid;

use super::SourceError;

/// Pinned secret bytes whose storage is zeroed when dropped.
pub type SecretValue = Pin<Box<Secret<[u8]>>>;

#[cfg(test)]
pub(super) fn deserialize_secret<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Pin<Box<Secret<str>>>, D::Error> {
    String::deserialize(deserializer).map(Secret::from_string)
}

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

impl GraphVaultSecretStore {
    /// Builds an HTTPS-only client with redirects disabled and a finite request timeout.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError::Configuration`] for invalid or non-HTTPS endpoints, a mount
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
            .https_only(true)
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
    if url.scheme() != "https"
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
        let response = self.client.post(graph)
            .header("x-authenticated-user-actor-id", actor_id.to_string())
            .header("authorization", format!("HASH-Service {}", self.config.graph_service_secret.expose()))
            .json(&json!({
                "filter": {"all": [
                    {"equal": [{"path": ["webId"]}, {"parameter": web_id}]},
                    {"equal": [{"path": ["uuid"]}, {"parameter": reference.secret_entity_uuid}]},
                    {"equal": [{"path": ["archived"]}, {"parameter": false}]},
                    {"equal": [{"path": ["type", "versionedUrl"]}, {"parameter": USER_SECRET_TYPE}]}
                ]},
                "temporalAxes": {"pinned": {"axis": "transactionTime", "timestamp": null}, "variable": {"axis": "decisionTime", "interval": {"start": null, "end": null}}},
                "includeDrafts": false, "includePermissions": false, "limit": 2
            })).send().await.map_err(|_error| Report::new(SourceError::Secret))?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(Report::new(SourceError::Secret));
        }
        let body: Value = response
            .json()
            .await
            .map_err(|_error| Report::new(SourceError::Secret))?;
        let entities = body
            .get("entities")
            .and_then(Value::as_array)
            .ok_or_else(|| Report::new(SourceError::Secret))?;
        let [entity] = entities.as_slice() else {
            return Err(Report::new(SourceError::Secret));
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
            .map_err(|_error| Report::new(SourceError::Secret))?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(Report::new(SourceError::Secret));
        }
        let body: Value = response
            .json()
            .await
            .map_err(|_error| Report::new(SourceError::Secret))?;
        let data = body
            .pointer("/data/data")
            .filter(|data| data.is_object())
            .ok_or_else(|| Report::new(SourceError::Secret))?;
        let bytes = match data.as_object() {
            Some(values)
                if values.len() == 1 && values.get("value").is_some_and(Value::is_string) =>
            {
                values
                    .get("value")
                    .and_then(Value::as_str)
                    .ok_or_else(|| Report::new(SourceError::Secret))?
                    .as_bytes()
                    .to_vec()
            }
            _ => serde_json::to_vec(data).map_err(|_error| Report::new(SourceError::Secret))?,
        };
        if bytes.is_empty() {
            return Err(Report::new(SourceError::Secret));
        }
        Ok(Secret::from_vec(bytes))
    }
}

fn validate_entity(
    entity: &Value,
    web_id: Uuid,
    entity_id: Uuid,
) -> Result<&str, Report<SourceError>> {
    let metadata = entity
        .get("metadata")
        .ok_or_else(|| Report::new(SourceError::Secret))?;
    let expected = format!("{web_id}~{entity_id}");
    if metadata
        .pointer("/recordId/entityId")
        .and_then(Value::as_str)
        != Some(&expected)
        || metadata.get("archived").and_then(Value::as_bool) != Some(false)
        || !metadata
            .get("entityTypeIds")
            .and_then(Value::as_array)
            .is_some_and(|types| types.iter().any(|id| id.as_str() == Some(USER_SECRET_TYPE)))
    {
        return Err(Report::new(SourceError::Secret));
    }
    let properties = entity
        .get("properties")
        .ok_or_else(|| Report::new(SourceError::Secret))?;
    let expiry = properties
        .get(EXPIRED_AT)
        .and_then(Value::as_str)
        .and_then(|value| OffsetDateTime::parse(value, &Rfc3339).ok())
        .ok_or_else(|| Report::new(SourceError::Secret))?;
    if expiry <= OffsetDateTime::now_utc() {
        return Err(Report::new(SourceError::Secret));
    }
    let path = properties
        .get(VAULT_PATH)
        .and_then(Value::as_str)
        .ok_or_else(|| Report::new(SourceError::Secret))?;
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() < 4
        || parts.first().copied() != Some("users")
        || parts.get(1).copied() != Some(web_id.to_string().as_str())
        || !parts.iter().all(|part| segment(part))
    {
        return Err(Report::new(SourceError::Secret));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::sync::atomic::{AtomicUsize, Ordering};

    use axum::{
        Json, Router,
        http::{HeaderMap, StatusCode},
        routing::{get, post},
    };
    use hash_integrations_definition::SecretReference;
    use hash_secret::Secret;
    use reqwest::{Client, Url};
    use serde_json::{Value, json};
    use uuid::Uuid;

    use super::{
        EXPIRED_AT, GraphVaultConfig, GraphVaultSecretStore, SecretStore as _, USER_SECRET_TYPE,
        VAULT_PATH, validate_entity,
    };
    use crate::sources::{SourceError, tests::server};

    fn entity(web: Uuid, id: Uuid) -> Value {
        json!({
            "metadata": {"recordId": {"entityId": format!("{web}~{id}")}, "archived": false, "entityTypeIds": [USER_SECRET_TYPE]},
            "properties": {EXPIRED_AT: "2999-01-01T00:00:00Z", VAULT_PATH: format!("users/{web}/connector/token")}
        })
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
                post(move |headers: HeaderMap, Json(body): Json<Value>| {
                    let entity = entity.clone();
                    async move {
                        assert_eq!(
                            headers
                                .get("x-authenticated-user-actor-id")
                                .and_then(|header| header.to_str().ok()),
                            Some(actor.to_string().as_str()),
                            "should query as the run owner"
                        );
                        assert_eq!(
                            headers
                                .get("authorization")
                                .and_then(|header| header.to_str().ok()),
                            Some("HASH-Service graph-token"),
                            "should authenticate the service"
                        );
                        assert_eq!(
                            body.pointer("/filter/all/0/equal/1/parameter"),
                            Some(&json!(web)),
                            "should constrain the web"
                        );
                        assert_eq!(
                            body.pointer("/filter/all/1/equal/1/parameter"),
                            Some(&json!(id)),
                            "should constrain the secret entity"
                        );
                        Json(json!({"entities": [entity]}))
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
                    Json(json!({"data": {"data": {"value": "{\"value\":\"stored-token\"}"}}}))
                }),
            );
        let server = server(router).await;
        let config = GraphVaultConfig {
            graph_url: server.url().to_owned(),
            graph_service_secret: Secret::from_string("graph-token".to_owned()),
            vault_url: server.url().to_owned(),
            vault_mount: "secret".to_owned(),
            vault_token: Secret::from_string("vault-token".to_owned()),
        };
        let store = GraphVaultSecretStore {
            graph: Url::parse(server.url()).expect("should parse the mock Graph endpoint"),
            vault: Url::parse(server.url()).expect("should parse the mock Vault endpoint"),
            config,
            client: Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("should build the mock client"),
        };
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
            br#"{"value":"stored-token"}"#,
            "should unwrap the Vault value envelope"
        );
        assert!(
            !format!("{result:?}").contains("stored-token"),
            "should redact secret diagnostics"
        );
    }

    #[tokio::test]
    async fn read_rejects_cleartext_transport() {
        let requests = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&requests);
        let server = server(Router::new().fallback(move || {
            let observed = Arc::clone(&observed);
            async move {
                observed.fetch_add(1, Ordering::SeqCst);
                StatusCode::OK
            }
        }))
        .await;
        for (graph_url, vault_url) in [
            (server.url(), "https://vault.example.com"),
            ("https://graph.example.com", server.url()),
        ] {
            let result = GraphVaultSecretStore::new(GraphVaultConfig {
                graph_url: graph_url.to_owned(),
                graph_service_secret: Secret::from_string("graph-token".to_owned()),
                vault_url: vault_url.to_owned(),
                vault_mount: "secret".to_owned(),
                vault_token: Secret::from_string("vault-token".to_owned()),
            });
            assert!(
                matches!(result, Err(error) if matches!(error.current_context(), SourceError::Configuration)),
                "should reject an HTTP Graph or Vault endpoint"
            );
        }
        let mut store = GraphVaultSecretStore::new(GraphVaultConfig {
            graph_url: "https://graph.example.com".to_owned(),
            graph_service_secret: Secret::from_string("graph-token".to_owned()),
            vault_url: "https://vault.example.com".to_owned(),
            vault_mount: "secret".to_owned(),
            vault_token: Secret::from_string("vault-token".to_owned()),
        })
        .expect("should configure HTTPS endpoints");
        store.graph = Url::parse(server.url()).expect("should parse the HTTP endpoint");
        let error = store
            .read(
                Uuid::new_v4(),
                Uuid::new_v4(),
                SecretReference {
                    secret_entity_uuid: Uuid::new_v4(),
                },
            )
            .await
            .expect_err("should enforce HTTPS when sending credentials");
        assert!(
            matches!(error.current_context(), SourceError::Secret),
            "should report an unavailable secret"
        );
        assert_eq!(
            requests.load(Ordering::SeqCst),
            0,
            "should reject cleartext before sending credentials"
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
        for (pointer, value) in [
            ("/metadata/archived", json!(true)),
            (
                "/metadata/recordId/entityId",
                json!(format!("{}~{id}", Uuid::new_v4())),
            ),
            (
                "/metadata/entityTypeIds",
                json!(["https://other.example/type/v/1"]),
            ),
        ] {
            let mut invalid = original.clone();
            *invalid
                .pointer_mut(pointer)
                .expect("should find the test property") = value;
            let error = validate_entity(&invalid, web, id)
                .expect_err("should reject an invalid secret identity");
            assert!(
                matches!(error.current_context(), SourceError::Secret),
                "should report an unavailable secret"
            );
        }
        for path in [
            format!("users/{web}/../token"),
            format!("users/{web}/connector/%2e%2e"),
            format!("users/{}/connector/token", Uuid::new_v4()),
            format!("users/{web}/connector/token?x=1"),
        ] {
            let mut invalid = original.clone();
            invalid["properties"][VAULT_PATH] = json!(path);
            assert!(
                validate_entity(&invalid, web, id).is_err(),
                "should constrain Vault paths to the owner's web"
            );
        }
        let mut expired = original;
        expired["properties"][EXPIRED_AT] = json!("2000-01-01T00:00:00Z");
        assert!(
            validate_entity(&expired, web, id).is_err(),
            "should reject expired secrets before reading Vault"
        );
    }
}
