//! Authority token transport: the `Atlas-Authority` header and its two readings.
//!
//! The manifest response issues the token and every data request presents it back in the same
//! header. The judgment is [`TokenAuthority::open`]'s. Extracting [`Scope`] is the data routes'
//! reading: admission only under a fresh token naming the requesting actor, every refusal one
//! uniform `401`. Extracting `Option<Scope>` is the manifest's reading: an absent token is a
//! fresh bootstrap and the reading forgives the window, while the tag and the actor stay binding.
//! Both readings resolve the caller through [`Actor`], the authentication middleware's resolution.
//!
//! [`TokenAuthority::open`]: crate::serve::authorization::TokenAuthority::open

use std::time::SystemTime;

use aide::{generate::GenContext, openapi, operation::OperationInput};
use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts},
    http::request::Parts,
};
use hash_middleware::authentication::{AuthenticatedActorId, AuthenticatedActorIdRejection};
use type_system::principal::actor::ActorId;

use super::{
    AppState, headers,
    problem::{Problem, unauthorized},
};
use crate::{
    integrity::HexBytes,
    serve::authorization::{Scope, TOKEN_BYTES, TokenAuthority},
};

/// A request's cached caller resolution.
///
/// [`Actor`] reads this entry before asking the middleware and stores the outcome after, so a
/// request resolves its caller once however many extractors ask. An entry inserted before the
/// first extraction supplies the resolution itself, which is what lets a test drive the
/// extractors without the middleware's layer.
#[derive(Debug, Clone)]
struct ActorCache(Result<Actor, AuthenticatedActorIdRejection>);

/// The authenticated caller, anonymous included.
///
/// The authentication middleware resolves the caller ahead of this router, and this extractor
/// reads that resolution. [`None`] is an anonymous caller, a first-class presenter.
#[derive(Debug, Clone, Copy)]
pub(super) struct Actor(pub Option<ActorId>);

impl<S> FromRequestParts<S> for Actor
where
    S: Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let resolution = if let Some(ActorCache(cached)) = parts.extensions.get::<ActorCache>() {
            cached.clone()
        } else {
            let resolution = Option::<AuthenticatedActorId>::from_request_parts(parts, state)
                .await
                .map(|actor| Self(actor.map(|AuthenticatedActorId(id)| id)));

            parts.extensions.insert(ActorCache(resolution.clone()));
            resolution
        };

        match resolution {
            Ok(actor) => Ok(actor),
            Err(AuthenticatedActorIdRejection::MissingLayer) => Err(Problem::internal(
                "`Actor` extracted on a route without the authentication middleware",
                "the caller's authentication was never resolved",
            )),
            Err(AuthenticatedActorIdRejection::Authentication(error)) => Err(error.into()),
        }
    }
}

/// Adds nothing per operation: the document root declares the credential surface.
///
/// The authentication middleware resolves credentials ahead of this router and cannot write into
/// this document, so [`router`](super::router) declares the schemes it accepts once, as the
/// document's own security requirements.
impl OperationInput for Actor {}

/// The token authority slice of a router state.
///
/// Both [`Scope`] readings judge presentations against the authority alone, so they extract from
/// any state that supplies one, the full application state or a bare authority.
pub(super) trait TokenState {
    /// The authority's randomness source.
    type Rng;

    /// The authority judging every presentation.
    fn tokens(&self) -> &TokenAuthority<Self::Rng>;
}

impl<R> TokenState for AppState<R> {
    type Rng = R;

    fn tokens(&self) -> &TokenAuthority<R> {
        &self.tokens
    }
}

/// Admits one data request: the sealed [`Scope`] under a fresh, actor-matching token.
///
/// Admission precedes every resolution (an unauthorized request costs one AEAD open and never a
/// store round trip) and precedes the handler body's generation check. A retired generation's
/// token fails its tag under the current key and answers `401` here, while a current token
/// presented at a route naming a retired generation passes admission and finds the `404` in the
/// handler. A `404` from a data route therefore means the caller's pin is stale and its token is
/// good.
///
/// Every refusal is the one uniform `401` problem. An absent header and a value outside the
/// codec refuse silently. A refusal from [`TokenAuthority::open`] also reaches the server log.
///
/// [`TokenAuthority::open`]: crate::serve::authorization::TokenAuthority::open
impl<S> FromRequestParts<S> for Scope
where
    S: TokenState + Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Actor(actor) = Actor::from_request_parts(parts, state).await?;

        parts
            .headers
            .get(headers::AUTHORITY)
            .and_then(|header| header.to_str().ok()?.parse::<HexBytes<TOKEN_BYTES>>().ok())
            .and_then(|token| {
                state
                    .tokens()
                    .open(&token.into_inner(), actor, SystemTime::now())
                    .inspect_err(|error| tracing::warn!(%error, "unable to open token"))
                    .ok()
            })
            .ok_or_else(unauthorized)
    }
}

/// Reads one presentation for the manifest's renewal: window forgiven, tag and actor binding.
///
/// An absent header is [`None`], a fresh bootstrap. A refused presentation (outside the codec,
/// failing the tag, or naming another actor) is the uniform `401` problem rather than a fresh
/// bootstrap, so a corrupted retention or an actor switch cannot become another view without
/// notice. [`TokenAuthority::continuity`] is the judgment, so an expired token still carries its
/// sealed view into the fresh token the manifest issues.
///
/// Refusal fires at extraction, ahead of the handler body's generation check. A stale pin with a
/// refused token answers `401`, and the token-less follow-up finds the generation's `404` and the
/// re-pin there.
///
/// [`TokenAuthority::continuity`]: crate::serve::authorization::TokenAuthority::continuity
impl<S> OptionalFromRequestParts<S> for Scope
where
    S: TokenState + Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> Result<Option<Self>, Self::Rejection> {
        let Actor(actor) = Actor::from_request_parts(parts, state).await?;

        let Some(header) = parts.headers.get(headers::AUTHORITY) else {
            return Ok(None);
        };

        header
            .to_str()
            .ok()
            .and_then(|text| text.parse::<HexBytes<TOKEN_BYTES>>().ok())
            .and_then(|token| state.tokens().continuity(&token.into_inner(), actor).ok())
            .map_or_else(|| Err(unauthorized()), |scope| Ok(Some(scope)))
    }
}

impl OperationInput for Scope {
    /// Documents the presented token as a required request header.
    ///
    /// Required is the data routes' contract: extraction admits before anything resolves, so a
    /// route taking the sealed scope answers nothing without a token. The manifest takes
    /// `Option<Scope>`, and aide derives its documentation from this impl, flipping the parameter
    /// to optional - the manifest's whole distinction from a data route.
    fn operation_input(_ctx: &mut GenContext, operation: &mut openapi::Operation) {
        operation
            .parameters
            .push(openapi::ReferenceOr::Item(headers::presented_authority()));
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, time::Duration};
    use std::time::SystemTime;

    use aide::{openapi::Operation, transform::TransformOperation};
    use axum::{
        extract::{FromRequestParts, OptionalFromRequestParts},
        http::{HeaderValue, Request, request::Parts},
    };
    use futures::executor::block_on;
    use rand::{SeedableRng as _, rngs::ChaCha20Rng};
    use type_system::principal::actor::{ActorId, UserId};
    use uuid::Uuid;

    use super::{Actor, ActorCache, Problem, TokenState, headers};
    use crate::{
        api::visibility::Visibility,
        integrity::{HexBytes, SecretHexBytes},
        serve::{
            CutOffset,
            authorization::{Scope, TOKEN_BYTES, TokenAuthority},
        },
    };

    /// The bare authority as a test's whole state.
    impl TokenState for TokenAuthority<ChaCha20Rng> {
        type Rng = ChaCha20Rng;

        fn tokens(&self) -> &Self {
            self
        }
    }

    /// Renders the operation input one extractor documents.
    fn emitted_input<T: aide::operation::OperationInput>() -> serde_json::Value {
        let mut operation = Operation::default();
        let _documented = TransformOperation::new(&mut operation).input::<T>();

        serde_json::to_value(&operation).expect("an operation serializes")
    }

    /// The fixture issue time, a round wall-clock second.
    fn issued_at() -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000)
    }

    /// The fixture authority, accepting tokens for ten minutes.
    fn authority() -> TokenAuthority<ChaCha20Rng> {
        TokenAuthority::new(
            "07".repeat(32)
                .parse()
                .expect("64 hexadecimal digits name a generation"),
            &SecretHexBytes::new([0x5A; 32]),
            Duration::from_mins(10),
            None,
            ChaCha20Rng::from_seed([7; 32]),
        )
    }

    /// The actor identity `actor` names.
    #[expect(
        clippy::unnecessary_wraps,
        reason = "the presenter's domain is `Option<ActorId>`, and this fixture names its `Some` \
                  form beside the literal `None`, the anonymous presenter"
    )]
    fn presenter(actor: u128) -> Option<ActorId> {
        Some(ActorId::User(UserId::new(Uuid::from_u128(actor))))
    }

    /// The authority header presenting a token for `presenter`, issued at `issued_at`.
    fn minted(
        tokens: &TokenAuthority<ChaCha20Rng>,
        presenter: Option<ActorId>,
        issued_at: SystemTime,
    ) -> HeaderValue {
        let token = tokens
            .issue(Scope::new(presenter, None, CutOffset::ZERO), issued_at)
            .expect("the seeded generator is infallible");

        HeaderValue::try_from(HexBytes::new(token).to_string())
            .expect("hexadecimal is a valid header value")
    }

    /// One request's parts, with `resolution` cached as the middleware's outcome and `token`
    /// presented in the authority header.
    fn parts(resolution: Option<ActorId>, token: Option<&HeaderValue>) -> Parts {
        let mut request = Request::builder().uri("/");
        if let Some(token) = token {
            request = request.header(headers::AUTHORITY, token.clone());
        }

        let (mut parts, ()) = request
            .body(())
            .expect("a static URI and a hexadecimal header form a valid request")
            .into_parts();
        parts.extensions.insert(ActorCache(Ok(Actor(resolution))));

        parts
    }

    /// Drives a data route's admission reading with the authority as the whole state.
    fn admit(
        tokens: &TokenAuthority<ChaCha20Rng>,
        resolution: Option<ActorId>,
        token: Option<&HeaderValue>,
    ) -> Result<Scope, Problem<'static>> {
        block_on(<Scope as FromRequestParts<_>>::from_request_parts(
            &mut parts(resolution, token),
            tokens,
        ))
    }

    /// Drives the manifest's continuity reading with the authority as the whole state.
    fn read(
        tokens: &TokenAuthority<ChaCha20Rng>,
        resolution: Option<ActorId>,
        token: Option<&HeaderValue>,
    ) -> Result<Option<Scope>, Problem<'static>> {
        block_on(<Scope as OptionalFromRequestParts<_>>::from_request_parts(
            &mut parts(resolution, token),
            tokens,
        ))
    }

    /// An absent header reads as a fresh bootstrap, never as a refusal.
    #[test]
    fn absent_token_reads_as_a_fresh_bootstrap() {
        assert_matches!(read(&authority(), presenter(11), None), Ok(None));
    }

    /// A header outside the codec reads as refused, never as a fresh bootstrap.
    ///
    /// The refused answer tells a client its retention corrupted, where a bootstrap would
    /// silently hand it another view.
    #[test]
    fn garbage_header_reads_as_refused() {
        let tokens = authority();

        for garbage in ["", "zz", &"ab".repeat(TOKEN_BYTES)] {
            let header = garbage
                .parse::<HeaderValue>()
                .expect("a visible ASCII string");

            assert_matches!(
                read(&tokens, presenter(11), Some(&header)),
                Err(_),
                "a garbage header did not read as refused"
            );
        }
    }

    /// Another actor's authentic token reads as refused, never as a fresh bootstrap.
    ///
    /// An actor switch that leaves a stale token behind answers with a refusal rather than a
    /// fresh view under a `200` the client would read as continuity.
    #[test]
    fn foreign_actors_token_reads_as_refused() {
        let tokens = authority();
        let header = minted(&tokens, presenter(11), issued_at());

        assert_matches!(read(&tokens, presenter(12), Some(&header)), Err(_));
    }

    /// An anonymous caller's token binds to the anonymous presenter exactly as a named one.
    #[test]
    fn anonymous_token_binds_its_presenter() {
        let tokens = authority();
        let anonymous = minted(&tokens, None, issued_at());
        let named = minted(&tokens, presenter(11), issued_at());

        assert_matches!(read(&tokens, None, Some(&anonymous)), Ok(Some(_)));
        assert_matches!(
            read(&tokens, presenter(11), Some(&anonymous)),
            Err(_),
            "a named presenter carried the anonymous token"
        );
        assert_matches!(
            read(&tokens, None, Some(&named)),
            Err(_),
            "an anonymous presenter carried a named token"
        );
    }

    /// Admission enforces the window the continuity reading forgives.
    ///
    /// The same presentation diverges at the two readings: past the enforced window a data
    /// request refuses while the manifest still carries the sealed view into the fresh token it
    /// issues. Issue times pin to the wall clock admission reads, so the fresh token stays inside
    /// the ten-minute window and the expired one stays outside it.
    #[test]
    fn expired_token_refuses_at_admission_yet_reads_as_carried() {
        let tokens = authority();
        let now = SystemTime::now();
        let expired = minted(&tokens, presenter(11), now - Duration::from_mins(11));
        let fresh = minted(&tokens, presenter(11), now);

        assert_matches!(
            admit(&tokens, presenter(11), Some(&expired)),
            Err(_),
            "an expired token admitted a data request"
        );
        assert_matches!(read(&tokens, presenter(11), Some(&expired)), Ok(Some(_)));
        assert_matches!(admit(&tokens, presenter(11), Some(&fresh)), Ok(_));
    }

    /// The emitted OpenAPI documents the token optional on the manifest, required on a data route.
    ///
    /// The readings differ in exactly one emitted field, and a generated client's behaviour follows
    /// it. A required header makes the token a precondition of the call, while an optional one
    /// leaves the bootstrap reachable. Asserted on the serialized parameter rather than on the
    /// builder call, because that is what a generator reads.
    #[test]
    fn presented_token_is_documented_by_reading() {
        let manifest = emitted_input::<Option<Scope>>();
        let data_route = emitted_input::<Visibility>();

        for (route, emitted) in [("manifest", &manifest), ("data route", &data_route)] {
            let parameter = &emitted["parameters"][0];

            assert_eq!(
                parameter["in"], "header",
                "the {route} parameter is not a header"
            );
            assert_eq!(
                parameter["name"],
                headers::AUTHORITY_DOCUMENTED,
                "the {route} parameter names another header"
            );
            assert!(
                parameter["schema"].is_object(),
                "the {route} parameter carries no schema"
            );
        }

        // The emitted form omits `required` when it is false.
        assert!(
            !manifest["parameters"][0]["required"]
                .as_bool()
                .unwrap_or(false),
            "the manifest documents the token as required, refusing its own bootstrap"
        );
        assert_eq!(
            data_route["parameters"][0]["required"],
            serde_json::Value::Bool(true),
            "a data route documents the token as optional"
        );
    }
}
