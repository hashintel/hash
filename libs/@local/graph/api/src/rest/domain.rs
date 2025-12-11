//! Web routes for domain validation operations.

use std::collections::HashMap;

use axum::{Extension, Json, Router, routing::post};
use serde::{Deserialize, Serialize};
use type_system::ontology::{id::BaseUrl, json_schema::DomainValidator};
use utoipa::{OpenApi, ToSchema};

#[derive(OpenApi)]
#[openapi(
    paths(
        check_is_local_type,
    ),
    components(
        schemas(
            CheckIsLocalTypeParams,
            CheckIsLocalTypeResponse,
        )
    ),
    tags(
        (name = "Domain", description = "Domain validation API")
    )
)]
pub(crate) struct DomainResource;

impl DomainResource {
    /// Create routes for domain validation.
    pub(crate) fn routes() -> Router {
        Router::new().nest(
            "/types",
            Router::new().route("/is-local", post(check_is_local_type)),
        )
    }
}

/// Request body for checking if type URLs are local.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckIsLocalTypeParams {
    /// List of type URLs to check.
    pub urls: Vec<BaseUrl>,
}

/// Response indicating whether each URL is a local type.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckIsLocalTypeResponse {
    /// Map from URL to whether it is a local type.
    ///
    /// A type is considered "local" if its URL matches the domain pattern
    /// configured for this Graph instance.
    pub results: HashMap<BaseUrl, bool>,
}

/// Check if the provided type URLs are local to this Graph instance.
///
/// A type URL is considered "local" if it matches the domain pattern configured
/// for this Graph instance. This allows frontend code to determine whether a type
/// belongs to the local system or is an external type without duplicating
/// URL-based checks.
#[utoipa::path(
    post,
    path = "/types/is-local",
    request_body = CheckIsLocalTypeParams,
    tag = "Domain",
    responses(
        (
            status = 200,
            content_type = "application/json",
            description = "Map from URL to whether it is a local type",
            body = CheckIsLocalTypeResponse,
        ),
    )
)]
async fn check_is_local_type(
    domain_validator: Extension<DomainValidator>,
    Json(params): Json<CheckIsLocalTypeParams>,
) -> Json<CheckIsLocalTypeResponse> {
    let results = params
        .urls
        .into_iter()
        .map(|url| {
            let is_local = domain_validator.validate_url(url.as_str());
            (url, is_local)
        })
        .collect();

    Json(CheckIsLocalTypeResponse { results })
}
