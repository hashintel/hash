//! `POST /v1/atlas/generation/{generation}/manifest`.
//!
//! Immutable bootstrap data - configuration and snapshot provenance, no corpus-derived aggregates -
//! delivered beside a fresh per-caller authority token in the `Atlas-Authority` response header.
//! An optional body carries the filter document that binds the view.

use alloc::sync::Arc;
use std::time::SystemTime;

use aide::{axum::IntoApiResponse, openapi, transform::TransformOperation};
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
     header: the sealed delivery depth carries into the fresh mint, so renewing authority does \
     not change the detail a tile carries. There is no separate renewal mode: every request \
     states the view it wants, so a caller that wants its filter must send that filter's exact \
     bytes again. A presented token that is invalid or names another actor answers `401`; a \
     request without a token bootstraps.";

/// What the optional filter document does.
const FILTER: &str =
    "The body states the view this request wants, which is why this read is a `POST`: the filter \
     is part of the view's identity. A body carries a filter document, and no body asks for the \
     unfiltered view. The digest - taken over the bytes exactly as presented - seals into the \
     token, and the visibility proof compiles over the document itself.

A request whose wanted filter is the one its token already seals keeps the session's delivery \
     depth, so the detail a tile carries at a fixed zoom does not move; its document is still \
     resolved from the resent bytes, because a filter the server has already purged can be \
     rebuilt only from them. A request wanting a different filter - including no filter at all, \
     which removes one - resolves the wanted view and keeps the session's depth unless that view \
     resolves coarser, which clamps the depth down to it. A request without a token bootstraps \
     the view it asks for.";

/// The route's path parameters.
///
/// Extracted through [`Generation`]: a malformed generation id answers the `invalid-generation`
/// problem before the handler runs.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct GenerationPath {
    /// The sha256 generation id, as returned by `current`.
    generation: GenerationId,
}

/// `POST /v1/atlas/generation/{generation}/manifest`.
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
/// presented, and a client re-fetching there discovers the re-pin. At the pinned generation a token
/// that is present and unacceptable answers `401`, never a silent fresh view under the caller's
/// `200`; an absent token bootstraps.
///
/// The body states the view the request wants: a filter document, or nothing for the unfiltered
/// view. No renewal mode leaves the wanted view unstated, because a filter document is purged with
/// the cache entry it was resolved for and cannot be recovered from a token - the token seals the
/// filter's digest, and a digest names no document.
///
/// So the wanted view decides. Equal to the sealed one, the session keeps its delivery depth `k`,
/// and a wanted filter is resolved from the resent bytes so a purged document and its proof are
/// rebuilt. Different from the sealed one - a changed filter, or its removal - the wanted view is
/// resolved and `k` is kept unless that view resolves coarser, which clamps it down through
/// [`DensityPolicy::rebind`]; an empty wanted view therefore seals zero. Without a density policy
/// the seal is [`CutOffset::ZERO`]. A bootstrap resolves both the wanted view and its depth.
///
/// [`DensityPolicy::rebind`]: crate::serve::DensityPolicy::rebind
pub(super) async fn handler(
    State(state): State<AppState>,
    Actor(actor): Actor,
    presented: Presented,
    Generation(GenerationPath { generation }): Generation<GenerationPath>,
    body: Bytes,
) -> Result<impl IntoApiResponse, Problem<'static>> {
    reject_generation(&state, generation)?;

    // The order is the contract's: the generation above, the presentation here, the body below.
    let carried = match presented {
        Presented::Refused => return Err(unauthorized()),
        Presented::Absent => None,
        Presented::Carried(scope) => Some(scope),
    };

    let actor = ActorEntityUuid::from(actor);

    // The digest is over the bytes exactly as presented; the parse is the edge validation, and the
    // resolution recompiles the filter from the same bytes.
    let filter = (!body.is_empty())
        .then(|| {
            serde_json::from_slice::<Filter<'_, Entity>>(&body)
                .map(|_document| (FilterDigest::of(&body), Arc::<[u8]>::from(body.as_ref())))
                .map_err(|error| {
                    Problem::new(
                        StatusCode::BAD_REQUEST,
                        ProblemType::InvalidBody,
                        format!("the filter document does not parse: {error}"),
                    )
                })
        })
        .transpose()?;

    // The body states the wanted view, so an absent one wants the unfiltered view rather than
    // whatever a token happens to seal.
    let (wanted, document) = filter.map_or((None, None), |(digest, document)| {
        (Some(digest), Some(document))
    });

    let scope = match carried {
        // The wanted view is the sealed one, so the delivery depth carries. A wanted filter is
        // still resolved from the resent bytes: the server purges a filter document with its
        // entry and cannot recover bytes a caller omitted.
        Some(scope) if scope.filter.digest() == wanted => {
            if wanted.is_some() {
                visibility::resolve(&state, actor, wanted, document).await?;
            }

            scope
        }
        // A different wanted view, removal included: it is resolved, and the session keeps its
        // delivery depth unless the wanted view resolves coarser.
        Some(scope) => {
            let visibility = visibility::resolve(&state, actor, wanted, document).await?;

            Scope {
                actor: scope.actor,
                filter: ScopeFilter::from(wanted),
                k: state.density.map_or(CutOffset::ZERO, |policy| {
                    policy.rebind(scope.k, &state.atlas.visible_occupancy(&visibility.proof))
                }),
            }
        }
        // A bootstrap resolves the wanted view and the depth it will serve at.
        None => {
            let visibility = visibility::resolve(&state, actor, wanted, document).await?;

            Scope::new(
                actor,
                wanted,
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

/// The filter document's schema.
///
/// One JSON object in the graph's entity-query filter grammar, which lives in that surface rather
/// than being restated here: the server validates the document against it and answers
/// `invalid-body` when it does not parse. The digest that names the view is taken over the bytes
/// exactly as presented, so a client re-presenting a filter sends the same bytes it sent before.
struct FilterDocument;

impl schemars::JsonSchema for FilterDocument {
    fn schema_name() -> alloc::borrow::Cow<'static, str> {
        "FilterDocument".into()
    }

    fn json_schema(_generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "object",
            "description": "an entity-query filter document, in the graph's structural-query \
                            filter grammar",
        })
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    let mut operation = operation
        .id("manifest")
        .summary("The generation's bootstrap manifest")
        .description(&format!("{DESCRIPTION}\n\n{FILTER}"))
        .input::<Json<FilterDocument>>();

    // A bodyless request is the unfiltered bootstrap or the verbatim renewal, so the declared body
    // is optional; the input declaration marks it required.
    if let Some(openapi::ReferenceOr::Item(body)) = operation.inner_mut().request_body.as_mut() {
        body.required = false;
    }

    operation
        .response_with::<200, Json<Manifest>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::NO_STORE,
                    "the response carries a per-caller authority token beside the immutable \
                     document",
                ),
            );
            response.inner().headers.insert(
                headers::AUTHORITY_DOCUMENTED.to_owned(),
                headers::authority(),
            );
            response.description(
                "the manifest, with a fresh authority token in the `Atlas-Authority` header",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`invalid-generation`: a malformed generation id, or `invalid-body`: a body that \
                 is not a filter document",
            )
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

#[cfg(test)]
mod tests {
    use aide::{openapi::Operation, transform::TransformOperation};

    use super::document;

    /// Renders the operation's emitted OpenAPI.
    ///
    /// The assertions read the serialized document rather than the builder calls, because what a
    /// client is owed is the emitted contract.
    fn emitted() -> serde_json::Value {
        let mut operation = Operation::default();
        let _documented = document(TransformOperation::new(&mut operation));

        serde_json::to_value(&operation).expect("an operation serializes")
    }

    /// The filter document is declared, and declared optional.
    ///
    /// A bodyless request is the unfiltered bootstrap and the verbatim renewal, so a body marked
    /// required would document a refusal this operation does not make.
    #[test]
    fn the_filter_document_is_declared_and_optional() {
        let emitted = emitted();
        let body = &emitted["requestBody"];

        assert!(
            body["content"]["application/json"].is_object(),
            "the filter document is not declared as a JSON body: {emitted:#}"
        );
        // The emitted form omits `required` when it is false.
        assert!(
            !body["required"].as_bool().unwrap_or(false),
            "the filter document is declared required"
        );
    }

    /// The `200` declares both headers it carries.
    #[test]
    fn the_response_declares_the_minted_authority_header() {
        let headers = &emitted()["responses"]["200"]["headers"];

        assert!(
            headers[super::headers::AUTHORITY_DOCUMENTED].is_object(),
            "the minted authority header is not declared"
        );
        assert!(
            headers["Cache-Control"].is_object(),
            "the cache directive is not declared"
        );
    }

    /// The `400` names the body problem the filter document can answer with.
    #[test]
    fn the_bad_request_response_names_the_body_problem() {
        let description = emitted()["responses"]["400"]["description"]
            .as_str()
            .expect("the 400 response carries a description")
            .to_owned();

        assert!(
            description.contains("invalid-body"),
            "the 400 omits the body problem it answers: {description}"
        );
    }
}
