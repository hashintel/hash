//! Actor and token admission against one captured generation publication.
//!
//! [`AuthorityScope`] requires a token whose issue-time check succeeds. [`Renewal`] accepts an
//! absent token for bootstrap or retains a verified token's filter identity and delivery offset
//! without checking expiry. Both extract the authenticated [`Actor`] before examining the token.
//! The [authorization model](crate::serve::authorization) separates these checks from visibility
//! resolution.
//!
//! # Rejection order
//!
//! Actor extraction precedes token syntax, then generation selection and any variant check precede
//! token authentication. Both paths reject a malformed presented token: it never becomes a
//! bootstrap. Generation and variant failures keep their own problem classification.
//!
//! Token parsing, authentication, binding and data-expiry failures all return the same `401
//! unauthorized` problem through [`unauthorized`], while server logs retain a typed cause for
//! verification failures. This uniform response does not promise uniform execution time or conceal
//! errors from earlier actor and path checks.

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

/// The cached actor-extraction result for one request.
#[derive(Clone)]
struct ActorCache(Result<Actor, AuthenticationRejection>);

/// The authenticated principal resolved for a request.
///
/// Extraction reads [`AuthenticatedActorId`] and caches success or rejection in the request
/// extensions. Repeated extraction reuses this result. Credential verification belongs to the
/// authentication middleware.
///
/// # Errors
///
/// Authentication failures retain the middleware's status and client-safe message under
/// `unauthenticated`. A route missing that middleware returns an internal problem.
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
            Err(AuthenticationRejection::Misconfigured) => Err(Problem::internal_message(
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

/// Parses a presented token's canonical hexadecimal encoding.
///
/// # Errors
///
/// Returns the unauthorized [`Problem`] when `header` contains invalid header text or does not
/// parse as an [`EncryptedToken`].
fn presentation(header: &HeaderValue) -> Result<EncryptedToken, Problem<'static>> {
    header
        .to_str()
        .ok()
        .and_then(|text| text.parse().ok())
        .ok_or_else(unauthorized)
}

/// An admitted token scope paired with its request's captured publication.
///
/// Extraction requires a supported [`Variant`] and a token matching the independently authenticated
/// actor, generation and delta lifetime. The issue-time check uses the current wall clock once at
/// admission. A later delta revision in the same lifetime does not invalidate the token. Success
/// does not resolve row visibility.
///
/// # Errors
///
/// [`Actor`] errors precede a missing or malformed token's unauthorized response. [`Variant`]
/// errors precede verification. All token verification and expiry failures return the unauthorized
/// [`Problem`].
pub(super) struct AuthorityScope {
    /// The publication used for the token's generation and delta-lifetime checks.
    pub observation: Observation,
    /// The authenticated delivery context whose issue-time check succeeded.
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

/// A manifest's requested publication and optional verified renewal context.
///
/// Omitting the token requests bootstrap. A presented token must authenticate and match the actor,
/// generation and delta lifetime. Its issue time must be host-representable, but neither a future
/// issue time nor elapsed expiry prevents continuity. The result carries only the filter identity
/// and delivery offset from the token. Manifest processing must resolve the wanted visibility
/// before issuing a replacement, and that resolution may reuse a cached entry.
///
/// # Errors
///
/// [`Actor`] errors precede a malformed token's unauthorized response. [`Generation`] errors
/// precede verification. All token verification failures return the unauthorized [`Problem`],
/// including for renewal.
pub(super) struct Renewal {
    /// The publication used for the token's generation and delta-lifetime checks.
    pub observation: Observation,
    /// The independently authenticated principal requesting the manifest.
    pub actor: ActorId,
    /// The verified filter identity and offset, absent only when the request supplies no token.
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
