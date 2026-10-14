use core::marker::PhantomData;

use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{ApiKeyLocation, Operation, SecurityScheme},
    transform::TransformOperation,
};
use axum::extract::{FromRequestParts, OptionalFromRequestParts};
use hash_middleware::authentication::{AuthenticatedActorId, AuthenticationRejection, Challenge};
use http::request::Parts;
use indexmap::IndexMap;
use type_system::principal::actor::ActorId;

use super::Audience;

pub(super) const API_TOKEN: &str = "apiToken";

/// The credentials an API accepts.
///
/// `AUDIENCE` selects the provider chain verifying them, `CHALLENGE` names the scheme a `401`
/// answers with, `schemes` documents them, and the [`OperationInput`] impl states them as an
/// operation's security requirements.
pub(super) trait Credentials: OperationInput + 'static {
    const AUDIENCE: Audience;
    const CHALLENGE: Challenge;

    fn schemes() -> impl IntoIterator<Item = (&'static str, SecurityScheme)>;
}

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

pub(super) fn api_token_scheme() -> SecurityScheme {
    SecurityScheme::Http {
        scheme: "bearer".to_owned(),
        bearer_format: None,
        description: Some(
            "API token starting with `hsh_pat_`. The token acts as the user it belongs to."
                .to_owned(),
        ),
        extensions: IndexMap::default(),
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

impl<C: Credentials> OperationInput for Actor<C> {
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

impl<C: Credentials> OperationInput for MaybeActor<C> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        let _: TransformOperation<'_> =
            TransformOperation::new(operation).security_requirement_multi([]);
        C::operation_input(ctx, operation);
    }
}
