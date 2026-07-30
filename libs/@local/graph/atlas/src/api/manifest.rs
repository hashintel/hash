//! `GET /v1/atlas/generation/{generation}/manifest`.
//!
//! Immutable bootstrap data - configuration and snapshot provenance, no corpus-derived aggregates -
//! delivered beside a fresh per-caller authority token in the `Atlas-Authority` response header.

use alloc::sync::Arc;
use std::time::SystemTime;

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderName, HeaderValue, StatusCode, header},
};
use hash_graph_store::filter::Filter;
use type_system::{knowledge::Entity, principal::actor::ActorEntityUuid};

use super::{
    AppState,
    authorization::Presented,
    extract::Generation,
    headers,
    problem::{Problem, ProblemType, reject_generation, unauthorized},
    visibility::{self, Actor},
};
use crate::{
    integrity::HexBytes,
    serve::{
        CutOffset, FilterDigest, GenerationId, Manifest,
        authorization::{Scope, ScopeFilter},
    },
};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns the bootstrap document for one generation: everything a client needs before its \
     first tile.

The wire version the binary envelopes speak, the served variant names, the bucket schedule the \
     tile grid follows, the serving limits the handlers enforce, and the snapshot's decision-time \
     point when the source data carried one. The document is immutable per generation, but the \
     response is not cached: the `Atlas-Authority` header carries a fresh authority token the \
     data routes require, valid for `authorityHardSeconds`. Re-fetch at the \
     `authoritySoftSeconds` cadence, presenting the current token - even expired - in the same \
     header: its sealed view state carries into the fresh mint, so a refresh never perturbs the \
     view. A presented token that is invalid or names another actor answers `401`; a bootstrap \
     without a token succeeds. An optional JSON body carries a filter document: its digest seals \
     into the token as the view's identity, the visibility proof compiles over it, and beside an \
     authentic token it re-binds the view's filter at the one boundary a filter may change.";

/// The route's path parameters.
///
/// Extracted through [`Generation`]: a malformed generation id answers the `invalid-generation`
/// problem before the handler runs.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct GenerationPath {
    /// The sha256 generation id, as returned by `current`.
    generation: GenerationId,
}

/// `GET /v1/atlas/generation/{generation}/manifest`.
///
/// Immutable bootstrap data: configuration and snapshot provenance, no corpus-derived aggregates.
///
/// The document is the same for every caller; the response is not, carrying a freshly minted
/// authority token in the `Atlas-Authority` header - which is why it sends `no-store` where the
/// document alone could be immutable. Fetching it also resolves the caller's scope: a client
/// bootstraps here, so the resolution lands on the request that expects to wait rather than on the
/// first tile.
///
/// The generation is judged first, so a retired generation answers `404` whatever the caller
/// presented, and the renewal a client attempts there discovers the re-pin. At the pinned
/// generation the presentation decides: an absent token is a fresh bootstrap, which resolves `k`
/// from the density policy over the caller's own authorized occupancy; an authentic token -
/// expired is expected and forgiven - carries its sealed view state into the fresh mint verbatim,
/// so a refresh renews authority without perturbing the view; and a token that is present and
/// unacceptable answers `401`, never a silent fresh view under the caller's `200`.
///
/// The manifest is also where a filter binds. A request body carries the filter document; its
/// digest seals into the token as the view's identity and the resolution compiles the document
/// into the visibility proof. Presented beside an authentic token, the document re-binds the
/// view's filter while the carried `k` keeps its depth - the re-mint boundary is the one place
/// the filter may change. A renewal without a body re-mints the sealed scope verbatim and
/// resolves nothing.
pub(super) async fn handler(
    State(state): State<AppState>,
    Actor(actor): Actor,
    presented: Presented,
    Generation(GenerationPath { generation }): Generation<GenerationPath>,
    body: Bytes,
) -> Result<impl IntoApiResponse, Problem<'static>> {
    reject_generation(&state, generation)?;

    // The digest is over the canonical bytes as presented; the parse is the edge validation, and
    // the resolution recompiles from the same bytes.
    let filter = (!body.is_empty())
        .then(
            || match serde_json::from_slice::<Filter<'_, Entity>>(&body) {
                Ok(_document) => Ok((FilterDigest::of(&body), Arc::<[u8]>::from(body.as_ref()))),
                Err(error) => Err(Problem::new(
                    StatusCode::BAD_REQUEST,
                    ProblemType::InvalidBody,
                    format!("the filter document does not parse: {error}"),
                )),
            },
        )
        .transpose()?;

    let scope = match presented {
        Presented::Refused => return Err(unauthorized()),
        Presented::Carried(scope) => match filter {
            // A verbatim renewal: authority re-mints, the view is untouched, nothing resolves.
            None => scope,
            // The filter binds at the re-mint: the new scope resolves over the presented
            // document while the carried `k` keeps the view's depth.
            Some((digest, document)) => {
                let scope = Scope {
                    actor: scope.actor,
                    filter: ScopeFilter::from(Some(digest)),
                    k: scope.k,
                };
                visibility::resolve(&state, *scope.actor, Some(digest), Some(document)).await?;

                scope
            }
        },
        Presented::Absent => {
            let actor = ActorEntityUuid::from(actor);
            let (digest, document) = filter.map_or((None, None), |(digest, document)| {
                (Some(digest), Some(document))
            });
            let visibility = visibility::resolve(&state, actor, digest, document).await?;

            Scope::new(
                actor,
                digest,
                state.density.map_or(CutOffset::ZERO, |policy| {
                    policy.resolve(&state.atlas.visible_occupancy(&visibility.proof))
                }),
            )
        }
    };

    let token = state
        .tokens
        .mint(scope, SystemTime::now())
        .map_err(|error| Problem::internal(error, "minting the authority token failed"))?;

    Ok((
        [
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static(headers::NO_STORE),
            ),
            (
                HeaderName::from_static(headers::AUTHORITY),
                HeaderValue::try_from(HexBytes::new(token).to_string())
                    .expect("hexadecimal is a valid header value"),
            ),
        ],
        Json(
            state
                .atlas
                .manifest(state.limits.manifest_limits(state.visibility)),
        ),
    ))
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("manifest")
        .summary("The generation's bootstrap manifest")
        .description(DESCRIPTION)
        .response_with::<200, Json<Manifest>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::NO_STORE,
                    "the response carries a per-caller authority token beside the immutable \
                     document",
                ),
            );
            response.description(
                "the manifest, with a fresh authority token in the `Atlas-Authority` header",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description("`invalid-generation`: a malformed generation id")
        })
        .response_with::<401, Problem<'static>, _>(|response| {
            response.description(
                "`unauthorized`: the presented token is invalid or names another actor; a \
                 bootstrap without a token succeeds",
            )
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description("`unknown-generation`: re-read `current` and retry")
        })
}
