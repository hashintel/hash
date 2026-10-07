//! Web routes for the API tokens of the authenticated user.

use alloc::sync::Arc;
use core::time::Duration;

use axum::{
    Extension, Router,
    extract::Path,
    routing::{delete, post},
};
use error_stack::Report;
use hash_graph_authentication::api_token::{
    ApiTokenHint, ApiTokenIssuer, Environment, IssuedApiToken,
};
use hash_graph_store::{
    api_token::{
        ApiTokenId, ApiTokenMetadata, ApiTokenName, ApiTokenNameError, ApiTokenRevocationError,
        ApiTokenStore,
    },
    pool::StorePool,
};
use hash_status::StatusCode;
use hash_temporal_client::TemporalClient;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::principal::{
    actor::{ActorId, UserId},
    actor_group::WebId,
};
use utoipa::{OpenApi, ToSchema};
use uuid::Uuid;

use super::{
    AuthenticatedActorId,
    json::Json,
    status::{BoxedResponse, report_to_response},
};

const MAX_LIFETIME_DAYS: u16 = 366;

#[derive(OpenApi)]
#[openapi(
    paths(create_api_token, list_api_tokens, revoke_api_token),
    components(
        schemas(
            CreateApiTokenRequest,
            CreateApiTokenResponse,
            ApiTokenResponse,
            ApiTokenStatus,
        ),
    ),
    tags(
        (name = "ApiToken", description = "API token management API")
    )
)]
pub(crate) struct ApiTokenResource;

impl ApiTokenResource {
    /// Create routes for managing the API tokens of the authenticated user.
    pub(crate) fn routes<S>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        for<'p> S::Store<'p>: ApiTokenStore,
    {
        Router::new().nest(
            "/api-tokens",
            Router::new()
                .route("/", post(create_api_token::<S>).get(list_api_tokens::<S>))
                .route("/{token_id}", delete(revoke_api_token::<S>)),
        )
    }
}

/// Why an API token request is refused.
#[derive(Debug, derive_more::Display, derive_more::Error)]
enum ApiTokenRequestError {
    #[display("only users can manage API tokens")]
    NotAUser,
    #[display("API tokens are not configured")]
    Unavailable,
    #[display("{_0}")]
    Name(#[error(not(source))] ApiTokenNameError),
    #[display("the lifetime must be between 1 and {} days", MAX_LIFETIME_DAYS)]
    Lifetime,
}

impl From<ApiTokenRequestError> for BoxedResponse {
    fn from(error: ApiTokenRequestError) -> Self {
        let status_code = match error {
            ApiTokenRequestError::NotAUser => StatusCode::PermissionDenied,
            ApiTokenRequestError::Unavailable => StatusCode::Unavailable,
            ApiTokenRequestError::Name(_) | ApiTokenRequestError::Lifetime => {
                StatusCode::InvalidArgument
            }
        };
        report_to_response(Report::new(error).attach_opaque(status_code))
    }
}

/// The user `actor_id` acts as, who owns the tokens the request manages.
const fn token_owner(actor_id: ActorId) -> Result<UserId, ApiTokenRequestError> {
    match actor_id {
        ActorId::User(user_id) => Ok(user_id),
        ActorId::Machine(_) | ActorId::Ai(_) => Err(ApiTokenRequestError::NotAUser),
    }
}

/// The lifetime of `days` days, or `None` for a token without expiry.
fn lifetime(days: Option<u16>) -> Result<Option<Duration>, ApiTokenRequestError> {
    match days {
        None => Ok(None),
        Some(days @ 1..=MAX_LIFETIME_DAYS) => Ok(Some(Duration::from_hours(u64::from(days) * 24))),
        Some(_) => Err(ApiTokenRequestError::Lifetime),
    }
}

/// The API token to create for the authenticated user.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CreateApiTokenRequest {
    #[schema(min_length = 1, max_length = 128)]
    name: String,
    /// How many days the token stays valid. Without it, the token does not expire.
    #[schema(minimum = 1, maximum = 366)]
    lifetime_days: Option<u16>,
}

/// Whether an API token can still be used.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ApiTokenStatus {
    Active,
    Expired,
    Revoked,
}

impl ApiTokenStatus {
    /// The status of `metadata` at `now`. A revoked token counts as revoked even after it expired.
    fn of(metadata: &ApiTokenMetadata, now: OffsetDateTime) -> Self {
        if metadata.revoked_at.is_some() {
            Self::Revoked
        } else if metadata
            .expires_at
            .is_some_and(|expires_at| expires_at <= now)
        {
            Self::Expired
        } else {
            Self::Active
        }
    }
}

/// An API token of the authenticated user, without its secret.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiTokenResponse {
    #[schema(value_type = String, format = Uuid)]
    token_id: Uuid,
    /// The start of the token, such as `hsh_pat_pd_0296…`.
    hint: String,
    name: String,
    status: ApiTokenStatus,
    #[serde(with = "hash_codec::serde::time")]
    #[schema(value_type = String, format = DateTime)]
    created_at: OffsetDateTime,
    #[serde(with = "hash_codec::serde::time::option")]
    #[schema(value_type = Option<String>, format = DateTime)]
    expires_at: Option<OffsetDateTime>,
    #[serde(with = "hash_codec::serde::time::option")]
    #[schema(value_type = Option<String>, format = DateTime)]
    last_used_at: Option<OffsetDateTime>,
    #[serde(with = "hash_codec::serde::time::option")]
    #[schema(value_type = Option<String>, format = DateTime)]
    revoked_at: Option<OffsetDateTime>,
}

impl ApiTokenResponse {
    /// The response for `metadata` of a token issued for `environment`, with its status at `now`.
    fn new(metadata: ApiTokenMetadata, environment: Environment, now: OffsetDateTime) -> Self {
        Self {
            token_id: Uuid::from(metadata.token_id),
            hint: ApiTokenHint::new(
                metadata.token_type,
                environment,
                metadata.version,
                metadata.token_id,
            )
            .to_string(),
            status: ApiTokenStatus::of(&metadata, now),
            name: String::from(metadata.name),
            created_at: metadata.created_at,
            expires_at: metadata.expires_at,
            last_used_at: metadata.last_used_at,
            revoked_at: metadata.revoked_at,
        }
    }
}

/// A newly created API token.
#[derive(derive_more::Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateApiTokenResponse {
    /// The complete token. No other response contains it.
    #[debug(skip)]
    token: String,
    api_token: ApiTokenResponse,
}

#[utoipa::path(
    post,
    path = "/api-tokens",
    tag = "ApiToken",
    request_body = CreateApiTokenRequest,
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The API token was created", body = CreateApiTokenResponse),

        (status = 400, description = "The request body is invalid, for example because the name or the lifetime is out of range"),
        (status = 403, description = "The actor is not a user"),
        (status = 500, description = "Store error occurred"),
        (status = 503, description = "API tokens are not configured"),
    )
)]
async fn create_api_token<S>(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    issuer: Extension<Option<Arc<ApiTokenIssuer>>>,
    Json(request): Json<CreateApiTokenRequest>,
) -> Result<Json<CreateApiTokenResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: ApiTokenStore,
{
    let user_id = token_owner(actor_id)?;
    let issuer = issuer
        .0
        .as_deref()
        .ok_or(ApiTokenRequestError::Unavailable)?;
    let name = ApiTokenName::new(request.name).map_err(ApiTokenRequestError::Name)?;
    let lifetime = lifetime(request.lifetime_days)?;

    let IssuedApiToken { token, params } = issuer
        .issue(user_id, name, lifetime)
        .map_err(report_to_response)?;
    let metadata = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?
        .create_api_token(params)
        .await
        .map_err(report_to_response)?;

    tracing::info!(
        token_id = %metadata.token_id,
        web_id = %metadata.web_id,
        "created an API token"
    );
    Ok(Json(CreateApiTokenResponse {
        token: token.expose(),
        api_token: ApiTokenResponse::new(metadata, issuer.environment(), OffsetDateTime::now_utc()),
    }))
}

#[utoipa::path(
    get,
    path = "/api-tokens",
    tag = "ApiToken",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The API tokens of the authenticated user, newest first", body = [ApiTokenResponse]),

        (status = 403, description = "The actor is not a user"),
        (status = 500, description = "Store error occurred"),
        (status = 503, description = "API tokens are not configured"),
    )
)]
async fn list_api_tokens<S>(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    issuer: Extension<Option<Arc<ApiTokenIssuer>>>,
) -> Result<Json<Vec<ApiTokenResponse>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: ApiTokenStore,
{
    let user_id = token_owner(actor_id)?;
    let environment = issuer
        .0
        .as_deref()
        .ok_or(ApiTokenRequestError::Unavailable)?
        .environment();

    let now = OffsetDateTime::now_utc();
    Ok(Json(
        store_pool
            .acquire(temporal_client.0)
            .await
            .map_err(report_to_response)?
            .list_api_tokens(WebId::from(user_id))
            .await
            .map_err(report_to_response)?
            .into_iter()
            .map(|metadata| ApiTokenResponse::new(metadata, environment, now))
            .collect(),
    ))
}

#[utoipa::path(
    delete,
    path = "/api-tokens/{token_id}",
    tag = "ApiToken",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("token_id" = Uuid, Path, description = "The ID of the API token to revoke"),
    ),
    responses(
        (status = 204, description = "The API token is revoked"),

        (status = 400, description = "The token ID is not a UUID"),
        (status = 403, description = "The actor is not a user"),
        (status = 404, description = "The authenticated user has no API token with this ID"),
        (status = 500, description = "Store error occurred"),
        (status = 503, description = "API tokens are not configured"),
    )
)]
async fn revoke_api_token<S>(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    Path(token_id): Path<Uuid>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    issuer: Extension<Option<Arc<ApiTokenIssuer>>>,
) -> Result<axum::http::StatusCode, BoxedResponse>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: ApiTokenStore,
{
    let user_id = token_owner(actor_id)?;
    if issuer.0.is_none() {
        return Err(ApiTokenRequestError::Unavailable.into());
    }

    let web_id = WebId::from(user_id);
    let token_id = ApiTokenId::new(token_id);
    store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?
        .revoke_api_token(web_id, token_id)
        .await
        .map_err(|report| {
            if matches!(report.current_context(), ApiTokenRevocationError::NotFound) {
                report_to_response(report.attach_opaque(StatusCode::NotFound))
            } else {
                report_to_response(report)
            }
        })?;

    tracing::info!(%token_id, %web_id, "revoked an API token");
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use axum::response::IntoResponse as _;
    use hash_graph_store::api_token::{
        ApiTokenId, ApiTokenMetadata, ApiTokenName, ApiTokenNameError, ApiTokenType,
        ApiTokenVersion,
    };
    use rstest::rstest;
    use time::OffsetDateTime;
    use type_system::principal::{
        actor::{ActorId, MachineId, UserId},
        actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{
        ApiTokenRequestError, ApiTokenResponse, ApiTokenStatus, BoxedResponse,
        CreateApiTokenResponse, Environment, lifetime, token_owner,
    };

    fn metadata(
        expires_at: Option<OffsetDateTime>,
        revoked_at: Option<OffsetDateTime>,
    ) -> ApiTokenMetadata {
        ApiTokenMetadata {
            token_id: ApiTokenId::new(Uuid::nil()),
            token_type: ApiTokenType::User,
            version: ApiTokenVersion::V0,
            web_id: WebId::new(Uuid::nil()),
            name: ApiTokenName::new("ci".to_owned()).expect("the name should be valid"),
            created_at: OffsetDateTime::UNIX_EPOCH,
            expires_at,
            last_used_at: None,
            revoked_at,
        }
    }

    #[test]
    fn token_owner_user() {
        let user_id = UserId::new(Uuid::nil());

        assert_eq!(
            token_owner(ActorId::User(user_id)).expect("a user should own their tokens"),
            user_id,
            "the user should own the tokens"
        );
    }

    #[test]
    fn token_owner_machine() {
        assert!(
            matches!(
                token_owner(ActorId::Machine(MachineId::new(Uuid::nil()))),
                Err(ApiTokenRequestError::NotAUser)
            ),
            "a machine should not manage API tokens"
        );
    }

    #[test]
    fn lifetime_bounds() {
        assert_eq!(
            lifetime(None).expect("a token without lifetime should be accepted"),
            None,
            "a token without lifetime should not expire"
        );
        assert!(
            matches!(lifetime(Some(0)), Err(ApiTokenRequestError::Lifetime)),
            "a lifetime of zero days should be refused"
        );
        assert_eq!(
            lifetime(Some(1)).expect("a lifetime of one day should be accepted"),
            Some(Duration::from_hours(24)),
            "a lifetime of one day should last a day"
        );
        assert_eq!(
            lifetime(Some(366)).expect("a lifetime of 366 days should be accepted"),
            Some(Duration::from_hours(366 * 24)),
            "the lifetime should count whole days"
        );
        assert!(
            matches!(lifetime(Some(367)), Err(ApiTokenRequestError::Lifetime)),
            "a lifetime of 367 days should be refused"
        );
    }

    #[rstest]
    #[case::not_a_user(ApiTokenRequestError::NotAUser, http::StatusCode::FORBIDDEN)]
    #[case::unavailable(
        ApiTokenRequestError::Unavailable,
        http::StatusCode::SERVICE_UNAVAILABLE
    )]
    #[case::name(
        ApiTokenRequestError::Name(ApiTokenNameError),
        http::StatusCode::BAD_REQUEST
    )]
    #[case::lifetime(ApiTokenRequestError::Lifetime, http::StatusCode::BAD_REQUEST)]
    fn request_error_status(#[case] error: ApiTokenRequestError, #[case] status: http::StatusCode) {
        assert_eq!(
            BoxedResponse::from(error).into_response().status(),
            status,
            "the refusal should answer with its status code"
        );
    }

    #[test]
    fn debug_redacts_token() {
        let token =
            "hsh_pat_pd_0296tiiBb3U904RIpygpjj_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg39B9Yp";
        let response = CreateApiTokenResponse {
            token: token.to_owned(),
            api_token: ApiTokenResponse::new(
                metadata(None, None),
                Environment::Production,
                OffsetDateTime::UNIX_EPOCH,
            ),
        };

        assert!(
            !format!("{response:?}").contains(token),
            "the debug output should leave out the token"
        );
    }

    #[test]
    fn status_of_token() {
        let now = OffsetDateTime::UNIX_EPOCH + Duration::from_hours(1);
        let later = now + Duration::from_hours(1);

        assert_eq!(
            ApiTokenStatus::of(&metadata(None, None), now),
            ApiTokenStatus::Active,
            "a token without expiry should be active"
        );
        assert_eq!(
            ApiTokenStatus::of(&metadata(Some(later), None), now),
            ApiTokenStatus::Active,
            "a token before its expiry should be active"
        );
        assert_eq!(
            ApiTokenStatus::of(&metadata(Some(now), None), now),
            ApiTokenStatus::Expired,
            "a token should expire at its expiry time"
        );
        assert_eq!(
            ApiTokenStatus::of(&metadata(Some(now), Some(now)), now),
            ApiTokenStatus::Revoked,
            "a revoked token should count as revoked even after it expired"
        );
    }
}
