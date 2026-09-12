//! Actor and token admission against one captured generation publication.
//!
//! Data requests require an unexpired scope. Manifest renewals retain the filter identity and
//! delivery offset after expiry, while actor and generation-lifetime checks remain mandatory.

#[cfg(test)]
mod tests;

use std::time::SystemTime;

use aide::{generate::GenContext, openapi, operation::OperationInput};
use axum::{
    RequestPartsExt as _,
    extract::FromRequestParts,
    http::{HeaderValue, request::Parts},
};
use hash_middleware::authentication::{AuthenticatedActorId, AuthenticationRejection};
use type_system::principal::actor::ActorId;

use super::{
    AppState,
    extract::{Generation, Variant},
    headers,
    problem::{Problem, unauthorized},
};
use crate::serve::{
    authorization::{
        scope::{ContinuityScope, CurrentScope, ScopeLease},
        token::EncryptedToken,
    },
    runtime::registry::Observation,
};

#[derive(Clone)]
struct ActorCache(Result<Actor, AuthenticationRejection>);

/// The authenticated caller.
#[derive(Debug, Copy, Clone)]
pub(super) struct Actor(pub ActorId);

impl<S: Send + Sync> FromRequestParts<S> for Actor {
    type Rejection = Problem<'static>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let resolution = if let Some(ActorCache(cached)) = parts.extensions.get::<ActorCache>() {
            cached.clone()
        } else {
            let resolution =
                <AuthenticatedActorId as FromRequestParts<S>>::from_request_parts(parts, state)
                    .await
                    .map(|AuthenticatedActorId(actor)| Self(actor));
            parts.extensions.insert(ActorCache(resolution.clone()));
            resolution
        };

        match resolution {
            Ok(actor) => Ok(actor),
            Err(AuthenticationRejection::Misconfigured) => Err(Problem::internal(
                "`Actor` extracted on a route without the authentication middleware",
                "the caller's authentication was never resolved",
            )),
            Err(AuthenticationRejection::Authentication { ref report, .. }) => {
                Err(report.current_context().into())
            }
        }
    }
}

impl OperationInput for Actor {}

fn presentation(header: &HeaderValue) -> Result<EncryptedToken, Problem<'static>> {
    header
        .to_str()
        .ok()
        .and_then(|text| text.parse().ok())
        .ok_or_else(unauthorized)
}

/// A current authority scope with its request's captured publication.
pub(super) struct AuthorityScope {
    pub observation: Observation,
    pub scope: CurrentScope,
}

impl<R: Send> FromRequestParts<AppState<R>> for AuthorityScope {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState<R>,
    ) -> Result<Self, Self::Rejection> {
        let Actor(actor) = Actor::from_request_parts(parts, state).await?;
        let token = parts
            .headers
            .get(headers::AUTHORITY)
            .ok_or_else(unauthorized)
            .and_then(presentation)?;

        let Variant { observation } = parts.extract_with_state::<Variant, _>(state).await?;

        let scope = state
            .tokens
            .decrypt(actor, observation.requested().epoch(), &token)
            .and_then(|lease| lease.current(SystemTime::now()))
            .map_err(|error| {
                tracing::warn!(?error, "unable to admit authority token");
                unauthorized()
            })?;

        Ok(Self { observation, scope })
    }
}

impl OperationInput for AuthorityScope {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Variant::operation_input(ctx, operation);

        operation
            .parameters
            .push(openapi::ReferenceOr::Item(headers::presented_authority()));
    }
}

/// A manifest's requested publication and optional verified continuity.
pub(super) struct Renewal {
    pub observation: Observation,
    pub actor: ActorId,
    pub carried: Option<ContinuityScope>,
}

impl<R: Send> FromRequestParts<AppState<R>> for Renewal {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState<R>,
    ) -> Result<Self, Self::Rejection> {
        let Actor(actor) = Actor::from_request_parts(parts, state).await?;
        let token = parts
            .headers
            .get(headers::AUTHORITY)
            .map(presentation)
            .transpose()?;

        let Generation { observation } = parts.extract_with_state::<Generation, _>(state).await?;

        let carried = token
            .as_ref()
            .map(|token| {
                state
                    .tokens
                    .decrypt(actor, observation.requested().epoch(), token)
                    .map(ScopeLease::continuity)
                    .map_err(|error| {
                        tracing::warn!(?error, "unable to renew authority token");
                        unauthorized()
                    })
            })
            .transpose()?;

        Ok(Self {
            observation,
            actor,
            carried,
        })
    }
}

impl OperationInput for Renewal {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Generation::operation_input(ctx, operation);

        let mut parameter = headers::presented_authority();
        parameter.parameter_data_mut().required = false;
        operation
            .parameters
            .push(openapi::ReferenceOr::Item(parameter));
    }
}
