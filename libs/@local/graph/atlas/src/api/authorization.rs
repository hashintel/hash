//! Authority token transport: the `Atlas-Authority` header codec and its two readings.
//!
//! The manifest response mints a token and sends it hex-encoded in the `Atlas-Authority` header;
//! every data request presents it back in the same header. The judgment - tag, window, actor - is
//! [`TokenAuthority::open`]'s; this module owns the transport and the two ways a route reads a
//! presentation. [`admit`] is the data routes' reading. It returns the sealed [`Scope`] only under
//! a fresh token naming the requesting actor, and collapses every refusal into one uniform `401`
//! problem, so a caller learns that it must re-fetch the manifest and nothing about why.
//! [`Presented`] is the manifest's reading. It distinguishes an absent token from a refused one
//! and never rejects, because the manifest judges the generation before it judges continuity.
//!
//! [`TokenAuthority::open`]: crate::serve::authorization::TokenAuthority::open

use core::future::{self, Future};
use std::time::SystemTime;

use aide::{generate::GenContext, openapi, operation::OperationInput};
use axum::{
    extract::FromRequestParts,
    http::{HeaderValue, request::Parts},
};
use rand::TryCryptoRng;
use type_system::principal::actor::ActorEntityUuid;

use super::{
    AppState, headers,
    problem::{Problem, unauthorized},
    visibility::actor,
};
use crate::{
    integrity::HexBytes,
    serve::authorization::{Scope, TOKEN_BYTES, TokenAuthority},
};

/// Judges one presentation for admission: the sealed scope under a fresh, actor-matching token.
///
/// [`None`] for every other presentation - an absent header, a value outside the codec, or a token
/// [`TokenAuthority::open`] refuses.
fn judge<R>(
    header: Option<&HeaderValue>,
    tokens: &TokenAuthority<R>,
    actor: ActorEntityUuid,
    now: SystemTime,
) -> Option<Scope>
where
    R: TryCryptoRng,
{
    let token: HexBytes<TOKEN_BYTES> = header?.to_str().ok()?.parse().ok()?;

    tokens.open(&token.into_inner(), actor, now).ok()
}

/// Admits one data request, returning the sealed [`Scope`] under a fresh actor-matching token.
///
/// Runs inside [`Visibility`]'s extraction, ahead of the scope resolution, so an unauthorized
/// request costs one AEAD open and never a store round trip. It also runs ahead of the handler
/// body's generation check, and that order is the data routes' half of the contract: **a data route
/// admits first and reaches the generation's `404` only under an acceptable token.** A token
/// minted under a retired generation therefore answers `401` here - its tag fails under the current
/// key - while a token this generation minted, presented at a route naming a retired one, passes
/// admission and answers `404` `unknown-generation` from the handler body.
///
/// The manifest orders the two judgments the other way round, generation first, so a client that
/// holds no acceptable token still discovers a re-pin there. Both orders are contractual. A `404`
/// from a data route means the caller's pin is stale and its token is good, and a `401` never
/// discriminates a stale pin from a stale token. The generation judgment stays in the handler body
/// for exactly that reason.
///
/// # Errors
///
/// One uniform `401` problem for every token refusal cause, and the `400` missing-actor problem
/// for a request that names no authenticated actor.
///
/// [`Visibility`]: super::visibility::Visibility
pub(super) fn admit(parts: &Parts, state: &AppState) -> Result<Scope, Problem<'static>> {
    let actor = actor(parts)?;

    judge(
        parts.headers.get(headers::AUTHORITY),
        &state.tokens,
        ActorEntityUuid::from(actor),
        SystemTime::now(),
    )
    .ok_or_else(unauthorized)
}

/// A presented token's continuity reading, for the manifest's re-mint.
///
/// Extraction never rejects on the token. The manifest judges the generation first, so a retired
/// generation answers `404` whatever the presentation, and the refusal of a present-but-invalid
/// token is the handler's to give after that check. The reading forgives the window - an expired
/// token is the expected presentation at a refresh - while the tag and the actor stay binding: a
/// token that fails either reads as [`Presented::Refused`], never as a fresh bootstrap.
#[derive(Debug)]
pub(super) enum Presented {
    /// No token in the header: a fresh bootstrap.
    Absent,
    /// An authentic same-actor token, staleness forgiven.
    ///
    /// The sealed scope carries into the re-mint.
    Carried(Scope),
    /// A present and unacceptable token.
    ///
    /// Outside the codec, failing the tag, or naming another actor.
    Refused,
}

/// Reads one presentation for continuity.
fn read<R>(
    header: Option<&HeaderValue>,
    tokens: &TokenAuthority<R>,
    actor: ActorEntityUuid,
) -> Presented
where
    R: TryCryptoRng,
{
    let Some(value) = header else {
        return Presented::Absent;
    };

    value
        .to_str()
        .ok()
        .and_then(|text| text.parse::<HexBytes<TOKEN_BYTES>>().ok())
        .and_then(|token| tokens.carried(&token.into_inner(), actor).ok())
        .map_or(Presented::Refused, Presented::Carried)
}

impl FromRequestParts<AppState> for Presented {
    type Rejection = Problem<'static>;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        future::ready(actor(parts).map(|actor| {
            read(
                parts.headers.get(headers::AUTHORITY),
                &state.tokens,
                ActorEntityUuid::from(actor),
            )
        }))
    }
}

impl OperationInput for Presented {
    /// Documents the presented token as an optional request header.
    ///
    /// Optional is the manifest's whole distinction from a data route: a request presenting no
    /// token bootstraps a view where a data route would refuse.
    fn operation_input(_ctx: &mut GenContext, operation: &mut openapi::Operation) {
        operation
            .parameters
            .push(openapi::ReferenceOr::Item(headers::presented_authority(
                headers::Required::No,
            )));
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, time::Duration};
    use std::time::SystemTime;

    use aide::{openapi::Operation, transform::TransformOperation};
    use axum::http::HeaderValue;
    use rand::{SeedableRng as _, rngs::ChaCha20Rng};
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::{Presented, headers, judge, read};
    use crate::{
        api::visibility::Visibility,
        integrity::{HexBytes, SecretHexBytes},
        serve::{
            CutOffset,
            authorization::{Scope, TOKEN_BYTES, TokenAuthority},
        },
    };

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
            ChaCha20Rng::from_seed([7; 32]),
        )
    }

    /// The actor identity `actor` names.
    fn presenter(actor: u128) -> ActorEntityUuid {
        ActorEntityUuid::new(Uuid::from_u128(actor))
    }

    /// The header value carrying a freshly minted token for `actor`.
    fn minted(tokens: &TokenAuthority<ChaCha20Rng>, actor: u128) -> HeaderValue {
        let scope = Scope::new(presenter(actor), None, CutOffset::ZERO);
        let token = tokens
            .mint(scope, issued_at())
            .expect("the seeded generator is infallible");

        HeaderValue::try_from(HexBytes::new(token).to_string())
            .expect("hexadecimal is a valid header value")
    }

    /// An absent header reads as a fresh bootstrap, never as a refusal.
    #[test]
    fn an_absent_token_reads_as_a_fresh_bootstrap() {
        assert_matches!(read(None, &authority(), presenter(11)), Presented::Absent);
    }

    /// A present header outside the codec reads as refused, never as a fresh bootstrap.
    ///
    /// The manifest's case split depends on this distinction: a client that presented something
    /// receives a refusal, so a corrupted retention never becomes another view without notice.
    #[test]
    fn a_garbage_header_reads_as_refused() {
        let tokens = authority();

        for garbage in ["", "zz", &"ab".repeat(TOKEN_BYTES)] {
            assert_matches!(
                read(
                    Some(&HeaderValue::from_str(garbage).expect("a visible ASCII string")),
                    &tokens,
                    presenter(11),
                ),
                Presented::Refused,
                "a garbage header did not read as refused"
            );
        }
    }

    /// Another actor's authentic token reads as refused, never as a fresh bootstrap.
    ///
    /// This test closes a witnessed hole: an actor switch that leaves a stale token behind must
    /// answer with a refusal rather than mint the new actor a fresh view under a `200` the client
    /// reads as continuity.
    #[test]
    fn a_foreign_actors_token_reads_as_refused() {
        let tokens = authority();
        let header = minted(&tokens, 11);

        assert_matches!(
            read(Some(&header), &tokens, presenter(12)),
            Presented::Refused
        );
    }

    /// An expired token still reads as carried, and its sealed scope is intact.
    #[test]
    fn an_expired_token_reads_as_carried() {
        let tokens = authority();
        let header = minted(&tokens, 11);

        let Presented::Carried(scope) = read(Some(&header), &tokens, presenter(11)) else {
            panic!("an authentic token did not read as carried");
        };
        assert_eq!(
            scope,
            Scope::new(presenter(11), None, CutOffset::ZERO),
            "the carried scope differs from the minted one"
        );
    }

    /// The emitted OpenAPI documents the token optional on the manifest, required on a data route.
    ///
    /// The readings differ in exactly one emitted field, and a generated client's behaviour
    /// follows it. A required header makes the token a precondition of the call, while an optional
    /// one leaves the bootstrap reachable. Asserted on the serialized parameter rather than on the
    /// builder call, because that is what a generator reads.
    #[test]
    fn the_presented_token_is_documented_by_reading() {
        let manifest = emitted_input::<Presented>();
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

    /// Admission enforces the window the continuity reading forgives.
    ///
    /// The same presentation diverges at the two readings: past the enforced window a data request
    /// refuses while the manifest still carries the sealed view into a fresh mint.
    #[test]
    fn an_expired_token_refuses_at_admission_yet_reads_as_carried() {
        let tokens = authority();
        let header = minted(&tokens, 11);
        let expired = issued_at() + Duration::from_mins(11);

        assert_eq!(
            judge(Some(&header), &tokens, presenter(11), expired),
            None,
            "an expired token admitted a data request"
        );
        assert_matches!(
            read(Some(&header), &tokens, presenter(11)),
            Presented::Carried(_)
        );
        assert_matches!(
            judge(Some(&header), &tokens, presenter(11), issued_at()),
            Some(_)
        );
    }
}
