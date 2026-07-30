//! The authority gate: a data route answers only under a fresh token naming its actor.
//!
//! The manifest response mints the token and sends it hex-encoded in the `Atlas-Authority` header;
//! every data request presents it back in the same header. The judgment - tag, window, actor - is
//! [`TokenAuthority::open`]'s; this module owns the transport alone: the header's hexadecimal
//! codec, and the collapse of every refusal into one uniform `401` problem, so a caller learns
//! that it must re-fetch the manifest and nothing about why.
//!
//! [`TokenAuthority::open`]: crate::serve::authorization::TokenAuthority::open

use core::future::{Future, ready};
use std::time::SystemTime;

use aide::operation::OperationInput;
use axum::{extract::FromRequestParts, http::request::Parts};

use super::{
    AppState, headers,
    problem::{Problem, unauthorized},
    visibility::actor,
};
use crate::{
    integrity::HexBytes,
    serve::authorization::{Scope, TOKEN_BYTES},
};

/// Encodes one minted envelope for the `Atlas-Authority` header.
pub(super) fn encode(token: Vec<u8>) -> String {
    HexBytes::new(
        <[u8; TOKEN_BYTES]>::try_from(token).expect("a minted envelope has the envelope's width"),
    )
    .to_string() // NOTE: why is this a function?! why is token here a `Vec`? shouldn't Authority just return an array? (it can and should)
}

/// A presented token's view state, read for a re-mint.
///
/// [`None`] when no token was presented, or when the presented one refuses for any cause: a
/// manifest fetch with a bad token is a fresh bootstrap, never a refusal, because the manifest is
/// the one route that repairs a client's state. The tag and the actor are still enforced by the
/// read itself; only staleness is forgiven, which is the point - an expired token is the expected
/// presentation at a refresh.
pub(super) struct Carried(pub Option<Scope>);

impl FromRequestParts<AppState> for Carried {
    type Rejection = Problem<'static>;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        ready(actor(parts).map(|actor| {
            Self(
                parts
                    .headers
                    .get(headers::AUTHORITY)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|text| text.parse::<HexBytes<TOKEN_BYTES>>().ok())
                    .and_then(|token| state.tokens.carried(&token.into_inner(), actor).ok()),
            )
        }))
    }
}

impl OperationInput for Carried {}

// NOTE: we don't say gate in docs... again rust-doc skill
/// The gate: extraction succeeds only under a fresh token naming the requesting actor.
///
/// Runs before the scope resolution in every data handler's argument list, so an unauthorized
/// request costs one AEAD open and never a store round trip. It also runs before the handler
/// body's generation check: a token minted under a retired generation fails the tag under the
/// current key and answers `401` here, so a re-pinned client discovers the new generation at its
/// manifest renewal (`404` `unknown-generation`), never at the data routes it retries. The client
/// recovery contract rests on that order - do not hoist the generation judgment ahead of this
/// gate.
pub(super) struct Authorized;

impl FromRequestParts<AppState> for Authorized {
    type Rejection = Problem<'static>;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        ready(admit(parts, state)) // NOTE: never bare, always `future::ready`...
    }
}

/// Judges one request's presentation: the header codec here, the token's judgment the authority's.
fn admit(parts: &Parts, state: &AppState) -> Result<Authorized, Problem<'static>> {
    // NOTE: def before use
    let actor = actor(parts)?;
    let token: HexBytes<TOKEN_BYTES> = parts
        .headers
        .get(headers::AUTHORITY)
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.parse().ok())
        .ok_or_else(unauthorized)?;

    state
        .tokens
        .open(&token.into_inner(), actor, SystemTime::now())
        .map_err(|_error| unauthorized())?;

    Ok(Authorized)
}

impl OperationInput for Authorized {}

#[cfg(test)]
mod tests {
    use core::time::Duration;
    use std::time::SystemTime;

    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
    use rand::{SeedableRng as _, rngs::ChaCha20Rng};
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::{TOKEN_BYTES, encode};
    use crate::{
        integrity::{HexBytes, SecretHexBytes},
        serve::{
            CutOffset,
            authorization::{Scope, TokenAuthority},
        },
    };

    /// A minted token survives the header codec: encode, parse, open.
    ///
    /// The envelope's own judgment is the serve battery's; this pins the one thing the api layer
    /// adds - that the hexadecimal form the manifest sends decodes back to the bytes the gate
    /// opens.
    #[test]
    fn the_header_codec_round_trips() {
        let issued_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        let actor = AuthenticatedActor::Uuid(ActorEntityUuid::new(Uuid::from_u128(11)));
        let generation = "07"
            .repeat(32)
            .parse()
            .expect("64 hexadecimal digits name a generation");
        let authority = TokenAuthority::new(
            generation,
            &SecretHexBytes::new([0x5A; 32]),
            Duration::from_mins(10),
            ChaCha20Rng::from_seed([7; 32]),
        );
        let scope = Scope {
            actor,
            filter: None,
            k: CutOffset::ZERO,
        };

        let header = encode(
            authority
                .mint(scope, issued_at)
                .expect("the seeded generator is infallible"),
        );
        let token: HexBytes<TOKEN_BYTES> = header.parse().expect("the header form parses back");

        assert_eq!(
            authority
                .open(&token.into_inner(), actor, issued_at)
                .expect("the decoded token opens"),
            scope,
            "the opened scope differs from the minted one"
        );
    }
}
