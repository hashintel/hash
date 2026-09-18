use core::marker::PhantomData;

use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{ApiKeyLocation, OpenApi, Operation, SecurityScheme},
    transform::TransformOperation,
};
use axum::extract::{FromRequestParts, OptionalFromRequestParts};
use hash_graph_authentication::cloudflare::ACCESS_JWT_HEADER;
use hash_middleware::authentication::{
    AuthenticatedActorId, AuthenticationRejection, request::ACTOR_ID_HEADER,
    service_secret::SERVICE_AUTH_SCHEME,
};
use http::{header::AUTHORIZATION, request::Parts};
use indexmap::IndexMap;
use type_system::principal::actor::ActorId;

use crate::rest::openapi::{add_response, problem_response};

pub(super) const CLOUDFLARE_ACCESS: &str = "cloudflareAccess";
pub(super) const SERVICE_SECRET: &str = "serviceSecret";
pub(super) const DELEGATED_ACTOR: &str = "delegatedActor";

pub(super) fn api_key(
    location: ApiKeyLocation,
    name: &str,
    description: impl Into<String>,
) -> SecurityScheme {
    SecurityScheme::ApiKey {
        location,
        name: name.to_owned(),
        description: Some(description.into()),
        extensions: IndexMap::default(),
    }
}

pub(super) fn shared_schemes() -> [(&'static str, SecurityScheme); 3] {
    [
        (
            CLOUDFLARE_ACCESS,
            api_key(
                ApiKeyLocation::Header,
                ACCESS_JWT_HEADER,
                "Cloudflare Access JWT, when configured.",
            ),
        ),
        (
            SERVICE_SECRET,
            api_key(
                ApiKeyLocation::Header,
                AUTHORIZATION.as_str(),
                format!(
                    "Enter the complete Authorization header value: `{SERVICE_AUTH_SCHEME} \
                     <secret>`. Include the `{SERVICE_AUTH_SCHEME}` prefix; the client sends this \
                     value unchanged. Requires the `{ACTOR_ID_HEADER}` header to name the \
                     delegated actor."
                ),
            ),
        ),
        (
            DELEGATED_ACTOR,
            api_key(
                ApiKeyLocation::Header,
                ACTOR_ID_HEADER,
                "Delegated actor UUID, used with the service credential. The nil UUID resolves as \
                 anonymous.",
            ),
        ),
    ]
}

pub(super) fn responses(api: &mut OpenApi) {
    for (status, name, description) in [
        (
            400,
            "MalformedCredentials",
            "Malformed credentials or actor header.",
        ),
        (
            401,
            "AuthenticationRejected",
            "The credentials cannot resolve to a permitted caller.",
        ),
        (
            503,
            "AuthenticationUnavailable",
            "The credential provider or actor store is unavailable.",
        ),
    ] {
        add_response(api, status, name, problem_response(status, description));
    }
}

pub(super) struct Actor<C>(ActorId, PhantomData<fn() -> C>);

impl<C> From<Actor<C>> for ActorId {
    fn from(Actor(actor, _): Actor<C>) -> Self {
        actor
    }
}

impl<S: Sync, C> FromRequestParts<S> for Actor<C> {
    type Rejection = AuthenticationRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        <AuthenticatedActorId as FromRequestParts<S>>::from_request_parts(parts, state)
            .await
            .map(|AuthenticatedActorId(actor)| Self(actor, PhantomData))
    }
}

impl<C: OperationInput> OperationInput for Actor<C> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        C::operation_input(ctx, operation);
    }
}

pub(super) struct MaybeActor<C>(Option<ActorId>, PhantomData<fn() -> C>);

impl<C> From<MaybeActor<C>> for Option<ActorId> {
    fn from(MaybeActor(actor, _): MaybeActor<C>) -> Self {
        actor
    }
}

impl<S: Sync, C> FromRequestParts<S> for MaybeActor<C> {
    type Rejection = AuthenticationRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        <AuthenticatedActorId as OptionalFromRequestParts<S>>::from_request_parts(parts, state)
            .await
            .map(|actor| Self(actor.map(|AuthenticatedActorId(actor)| actor), PhantomData))
    }
}

impl<C: OperationInput> OperationInput for MaybeActor<C> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        let _: TransformOperation<'_> =
            TransformOperation::new(operation).security_requirement_multi([]);
        C::operation_input(ctx, operation);
    }
}
