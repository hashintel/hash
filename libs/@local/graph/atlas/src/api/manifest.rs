//! `POST /v1/atlas/generation/{generation}/manifest`.
//!
//! Bootstrap data - configuration, snapshot provenance, and the delivery schedule resolved for this
//! caller - delivered beside a fresh per-caller authority token in the `Atlas-Authority` response
//! header. An optional body carries the filter document that binds the view.

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
    clause,
    extract::Generation,
    headers,
    problem::{Problem, ProblemType, reject_generation, unauthorized},
    visibility::{self, Actor},
};
use crate::{
    integrity::HexBytes,
    serve::{
        Atlas, CutOffset, DensityPolicy, GenerationId, Manifest, ViewOccupancy, VisibilityProof,
        authorization::{Scope, ScopeFilter},
        cache::FilterDigest,
        visibility::ProofKind,
    },
};

/// What one mint asks of the delivery-cut policy.
#[derive(Debug, Copy, Clone)]
enum Mint {
    /// A first token for this actor, which resolves the wanted view's own offset.
    Bootstrap,
    /// A token for the view its predecessor sealed.
    ///
    /// A scoped view keeps the offset it sealed, so the detail a tile carries at a fixed zoom does
    /// not move across a renewal. Zero is what an operator view seals here as everywhere, which
    /// normalizes a token minted under an older contract instead of carrying its value forward.
    Carry(CutOffset),
    /// A token for another view, which keeps the sealed offset unless that view resolves coarser.
    Rebind(CutOffset),
}

/// The occupancy source one mint resolves over, absent under an operator proof.
///
/// The corpus schedule an operator view serves has one cut per zoom and takes no offset, leaving
/// the policy nothing to resolve. For a scoped view the answer is a source rather than an
/// aggregate: that aggregate costs a pass over the code column, and a mint carrying its offset
/// forward never needs one.
fn mint_view<'atlas>(
    atlas: &'atlas Atlas,
    proof: &'atlas VisibilityProof,
) -> Option<impl FnOnce() -> ViewOccupancy + use<'atlas>> {
    match proof.kind() {
        ProofKind::Corpus => None,
        ProofKind::Scope => Some(move || atlas.visible_occupancy(proof)),
    }
}

/// The delivery-cut offset one mint seals.
///
/// [`CutOffset::ZERO`] whenever no offset is servable. A deployment without a density policy serves
/// every scope at its recorded cut. An operator view serves the corpus schedule, and an absent
/// `view` is what says that, so no route can serve corpus bytes while its manifest declares a
/// deeper cut.
///
/// With a policy and a scoped view, [`Mint`] states which question this mint asks, and the
/// arithmetic of every answer lives in [`DensityPolicy`]. Every handler path mints through here, so
/// no branch can seal an offset by a rule of its own. `Mint::Carry` never calls `view`: a session
/// keeping its own view keeps the offset it sealed, and the aggregate that resolved it is not read
/// again.
fn sealed_offset<V: FnOnce() -> ViewOccupancy>(
    density: Option<DensityPolicy>,
    mint: Mint,
    view: Option<V>,
) -> CutOffset {
    let (Some(policy), Some(view)) = (density, view) else {
        return CutOffset::ZERO;
    };

    match mint {
        Mint::Bootstrap => policy.resolve(&view()),
        Mint::Carry(carried) => carried,
        Mint::Rebind(carried) => policy.rebind(carried, &view()),
    }
}

/// The operation's description.
const DESCRIPTION: &str =
    "Returns the bootstrap document for one generation: everything a client needs before its \
     first tile.

The wire version the binary envelopes speak, the served variant names, the bucket schedule the \
     tile grid follows, the serving limits the handlers enforce, and the snapshot's decision-time \
     point when the source data carried one. Those blocks hold for the generation's lifetime. One \
     block does not: `scopeSchedule` states the delivery cut resolved for this caller, so two \
     callers of one generation can read different documents, and a client reads its own rather \
     than a shared one. The response is not cached either: the `Atlas-Authority` header carries a \
     fresh authority token the data routes require, valid for `authorityHardSeconds`. Re-fetch at \
     the `authoritySoftSeconds` cadence, presenting the current token - even expired - in the \
     same header: a scoped view's sealed delivery depth carries into the fresh mint, so renewing \
     authority does not change the detail a tile carries, and a full-visibility view renews at \
     the corpus cut it serves. There is no separate renewal mode: every request states the view \
     it wants, so a caller that wants its filter must send that filter's exact bytes again. A \
     presented token that is invalid or names another actor answers `401`; a request without a \
     token bootstraps.";

/// What the optional filter document does.
const FILTER: &str =
    "The body states the view this request wants, which is why this read is a `POST`: the filter \
     is part of the view's identity. A body carries a filter document, and no body asks for the \
     unfiltered view. The digest - taken over the bytes exactly as presented - seals into the \
     token, and the visibility proof compiles over the document itself.

A request whose wanted filter is the one its token already seals keeps a scoped session's delivery \
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
/// Bootstrap data for one generation and one caller.
///
/// Every block but one holds for the generation's lifetime. `scopeSchedule` states the delivery cut
/// this mint resolved and sealed, so the document a caller reads describes the bytes its own routes
/// answer with. The response carries a freshly minted authority token in the `Atlas-Authority`
/// header, which is the second reason it sends `no-store`. Fetching it also resolves the caller's
/// scope. A client bootstraps here, so the resolution costs the request that expects a wait rather
/// than the first tile.
///
/// The handler judges the generation first, so a retired generation answers `404` whatever the
/// caller presented, and a client re-fetching there discovers the re-pin. At the pinned generation
/// a token that is present and unacceptable answers `401`, never a silent fresh view under the
/// caller's `200`. An absent token bootstraps.
///
/// The body states the view the request wants, either a filter document or nothing for the
/// unfiltered view. No renewal mode leaves the wanted view unstated, because the server purges a
/// filter document with its cache entry and a token cannot rebuild it. The token seals the filter's
/// digest, and a digest names no document.
///
/// The wanted view therefore decides. When it equals the sealed one, a scoped session keeps its
/// delivery depth `k` while an operator one renews at the corpus cut, and the handler resolves the
/// view either way, so the fresh token carries current authorization and a purged filter document
/// is rebuilt from the resent bytes. When it differs from the sealed one - a changed filter, or its
/// removal - the handler resolves the wanted view and keeps `k` unless that view resolves coarser,
/// which clamps it down through [`DensityPolicy::rebind`]; an empty wanted view therefore seals
/// zero. Without a density policy the seal is [`CutOffset::ZERO`]. A bootstrap resolves both the
/// wanted view and its depth.
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

    // The contract orders the judgments as the generation above, then the presentation here, then
    // the body below.
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
        // Resolve again rather than trust what the token seals: the authorization behind the view
        // may have changed, and a wanted filter is rebuilt from the resent bytes because the server
        // purges a document with its entry. An unfiltered renewal has no document to rebuild and
        // resolves the same way.
        Some(scope) if scope.filter.digest() == wanted => {
            let visibility = visibility::resolve(&state, actor, wanted, document).await?;

            Scope {
                actor: scope.actor,
                filter: scope.filter,
                k: sealed_offset(
                    state.density,
                    Mint::Carry(scope.k),
                    mint_view(&state.atlas, visibility.proof()),
                ),
            }
        }
        // A different wanted view, removal included: the handler resolves it, and the session
        // keeps its delivery depth unless the wanted view resolves coarser.
        Some(scope) => {
            let visibility = visibility::resolve(&state, actor, wanted, document).await?;

            Scope {
                actor: scope.actor,
                filter: ScopeFilter::from(wanted),
                k: sealed_offset(
                    state.density,
                    Mint::Rebind(scope.k),
                    mint_view(&state.atlas, visibility.proof()),
                ),
            }
        }
        // A bootstrap resolves the wanted view and the depth it will serve at.
        None => {
            let visibility = visibility::resolve(&state, actor, wanted, document).await?;

            Scope::new(
                actor,
                wanted,
                sealed_offset(
                    state.density,
                    Mint::Bootstrap,
                    mint_view(&state.atlas, visibility.proof()),
                ),
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
                    .unwrap_or_else(|_| unreachable!("hexadecimal is a valid header value")),
            ),
        ],
        Json(
            state
                .atlas
                .manifest(state.limits.manifest_limits(state.visibility), scope.k),
        ),
    ))
}

/// The filter document's schema.
///
/// One JSON object in the graph's entity-query filter grammar, which lives in that surface rather
/// than in a restatement here: the server validates the document against it and answers
/// `invalid-body` when it does not parse. The digest that names the view hashes the bytes exactly
/// as presented, so a client re-presenting a filter sends the same bytes it sent before.
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
///
/// The default response is the catch-all each of the four data routes already declares. The
/// manifest resolves a caller's scope too, so it answers the same visibility and internal problems
/// and owes the same declaration; without it the document would promise four statuses for an
/// operation that has five.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    // A bodyless request states the unfiltered view (a bootstrap, or a renewal that removes its
    // filter), so the declared body is optional. The input declaration marks it required.
    operation
        .id("manifest")
        .summary("The generation's bootstrap manifest")
        .description(&format!("{DESCRIPTION}\n\n{FILTER}"))
        .input::<Json<FilterDocument>>()
        .with(clause::optional_body)
        .response_with::<200, Json<Manifest>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::NO_STORE,
                    "the response carries a per-caller authority token, and its document states \
                     the delivery schedule resolved for that caller",
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
                 is not a filter document, or one the entity query surface cannot compile",
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
        .default_response_with::<Problem<'static>, _>(|response| {
            response.description(
                "any other problem document: `visibility-unavailable` marks a scope the store \
                 could not resolve, `internal` a server-side failure",
            )
        })
}

#[cfg(test)]
mod tests {
    use core::{cell::Cell, num::NonZero};

    use aide::{openapi::Operation, transform::TransformOperation};

    use super::{Mint, document, sealed_offset};
    use crate::{
        math::Log2,
        morton::{Depth, MortonCell, MortonKey},
        serve::{CutOffset, DensityBand, DensityPolicy, ViewOccupancy},
    };

    /// The fixture policy.
    ///
    /// The span exponent is 1, so offset `k` cuts at depth `1 + k`. The band is `[2, 3]` occupied
    /// cells, and the deepest served zoom is 4.
    ///
    /// The band is narrow and small on purpose. Under the default `[2_000, 4_000]` band every
    /// fixture view small enough to hand-derive sits below the band at every depth, so the argmin
    /// ties everywhere and resolves to zero - which is the one value that cannot distinguish
    /// `resolve` from `rebind` from the no-policy branch.
    fn policy() -> DensityPolicy {
        DensityPolicy::new(
            DensityBand::new(
                NonZero::new(2).expect("the fixture band's lower bound is positive"),
                NonZero::new(3).expect("the fixture band's upper bound is positive"),
            )
            .expect("the fixture band is ordered"),
            Log2::new(1).expect("the fixture span lies below the shift width"),
            4,
        )
        .expect("the fixture schedule admits an offset")
    }

    /// The absent occupancy source, which is what an operator proof answers.
    const NO_VIEW: Option<fn() -> ViewOccupancy> = None;

    /// The fixture view, hand-derived: four points on one row of the depth-3 grid.
    ///
    /// Cells `(0, 0)`, `(1, 0)`, `(2, 0)`, `(3, 0)` at depth 3. Folding the grid coarser: at depth
    /// 2 they pair into `(0, 0)` and `(1, 0)`, at depth 1 they all fall in `(0, 0)`, so `C(1, V) =
    /// 1`, `C(2, V) = 2`, `C(3, V) = 4`, constant below that, and the saturation depth is 3 - every
    /// occupied cell holds one key there.
    ///
    /// Against the band `[2, 3]`, the candidate offsets `0..=2` (the saturation cap, below the
    /// schedule's ceiling of 27) sit at distances 1, 0, 1. The argmin is **offset 1**, and it is a
    /// strict minimum rather than a tie, so a resolution and a clamp read differently on it.
    fn view() -> ViewOccupancy {
        let mut keys: Vec<MortonKey> = (0..4)
            .map(|x| {
                MortonCell::new(
                    Depth::new(3).expect("the fixture depth lies within the key width"),
                    x,
                    0,
                )
                .expect("the fixture cell lies on the depth's grid")
                .min_key()
            })
            .collect();

        ViewOccupancy::of(&mut keys)
    }

    /// A generation whose schedule admits no offset seals zero, whatever a session carried.
    #[test]
    fn no_density_policy_seals_zero() {
        assert_eq!(
            sealed_offset(None, Mint::Bootstrap, Some(view)),
            CutOffset::ZERO
        );
        assert_eq!(
            sealed_offset(None, Mint::Rebind(CutOffset::new(2)), Some(view)),
            CutOffset::ZERO
        );
    }

    /// A bootstrap - nothing carried - resolves the wanted view's own offset.
    ///
    /// The fixture's argmin is 1, which is neither `CutOffset::ZERO` nor either carried value the
    /// tests below use, so this fails if the branch resolves nothing or clamps something.
    #[test]
    fn bootstrap_resolves_the_wanted_views_own_offset() {
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Bootstrap, Some(view)),
            CutOffset::new(1)
        );
    }

    /// The rebind keeps a carried offset coarser than the wanted view's resolution.
    #[test]
    fn rebind_keeps_a_carried_offset_coarser_than_the_views_resolution() {
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Rebind(CutOffset::ZERO), Some(view)),
            CutOffset::ZERO,
            "the wanted view resolves to 1 and a session at 0 must not be deepened into it"
        );
    }

    /// A carried offset deeper than the wanted view's resolution clamps down to it.
    #[test]
    fn rebind_clamps_a_carried_offset_deeper_than_the_views_resolution() {
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Rebind(CutOffset::new(2)), Some(view)),
            CutOffset::new(1),
            "a session at 2 must clamp to the wanted view's resolution of 1"
        );
    }

    /// An operator view seals zero at every mint, over a fixture whose argmin is not zero.
    ///
    /// The absent occupancy is what an operator proof answers, and the fixture's own argmin is 1,
    /// so a mint that consulted the policy anyway would seal 1 here and fail all three assertions.
    /// The carried case is the one that matters after a change: a token minted before this rule
    /// seals a nonzero offset, and its renewal has to come back at zero rather than carry the bad
    /// value forward.
    #[test]
    fn operator_view_seals_zero_at_every_mint() {
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Bootstrap, NO_VIEW),
            CutOffset::ZERO,
        );
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Carry(CutOffset::new(2)), NO_VIEW),
            CutOffset::ZERO,
            "a renewal must not carry an offset the corpus schedule cannot serve",
        );
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Rebind(CutOffset::new(2)), NO_VIEW),
            CutOffset::ZERO,
        );
        assert_eq!(
            policy().resolve(&view()),
            CutOffset::new(1),
            "the fixture must resolve nonzero, or the assertions above pass for the wrong reason",
        );
    }

    /// A renewal of an unchanged view never reads the occupancy aggregate.
    ///
    /// The aggregate costs a pass over the code column and an allocation for the visible keys, and
    /// a session keeping its own view keeps the offset that aggregate already resolved. The source
    /// here records its own call, so the case fails if the mint takes it.
    #[test]
    fn renewal_takes_no_occupancy_pass() {
        let taken = Cell::new(false);
        let source = || {
            taken.set(true);
            view()
        };

        assert_eq!(
            sealed_offset(Some(policy()), Mint::Carry(CutOffset::new(2)), Some(source)),
            CutOffset::new(2),
        );
        assert!(
            !taken.get(),
            "a carried mint must not aggregate the view it is not resolving",
        );
    }

    /// A renewal of an unchanged view keeps the offset its predecessor sealed.
    ///
    /// The wanted view's own resolution is 1 and the carried value is 2, so a renewal that
    /// re-resolved or clamped would read 1 here. The session serves at the depth it bootstrapped.
    #[test]
    fn renewed_view_keeps_its_sealed_offset() {
        assert_eq!(
            sealed_offset(Some(policy()), Mint::Carry(CutOffset::new(2)), Some(view)),
            CutOffset::new(2),
        );
    }

    /// A carried offset over a view with no occupancy reaches zero.
    ///
    /// The empty view resolves to zero through the same argmin, and the clamp is a minimum, so the
    /// session's depth collapses however deep it was.
    #[test]
    fn carried_offset_over_an_empty_view_reaches_zero() {
        let empty = ViewOccupancy::of(&mut []);
        assert!(empty.is_empty(), "the fixture view is empty");

        assert_eq!(
            sealed_offset(
                Some(policy()),
                Mint::Rebind(CutOffset::new(2)),
                Some(|| empty)
            ),
            CutOffset::ZERO
        );
    }

    /// Renders the operation's emitted OpenAPI.
    ///
    /// The assertions read the serialized document rather than the builder calls, because the
    /// emitted contract is what a client receives.
    fn emitted() -> serde_json::Value {
        let mut operation = Operation::default();
        let _documented = document(TransformOperation::new(&mut operation));

        serde_json::to_value(&operation).expect("an operation serializes")
    }

    /// The operation declares the filter document, and declares it optional.
    ///
    /// A bodyless request states the unfiltered view (a bootstrap, or a renewal that removes its
    /// filter), so a body marked required would document a refusal this operation does not make.
    #[test]
    fn operation_declares_the_filter_document_as_optional() {
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
    fn response_declares_both_headers_it_carries() {
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

    /// The operation declares the catch-all response.
    ///
    /// A manifest fetch resolves the caller's visibility, so it answers `visibility-unavailable`
    /// and `internal` beside the four statuses it declares by name. Without the default response
    /// the document would omit both.
    #[test]
    fn operation_declares_the_catch_all_response() {
        let responses = &emitted()["responses"];

        assert!(
            responses["default"]["description"].is_string(),
            "the operation declares no catch-all response: {responses:#}"
        );
    }

    /// The `400` names the body problem the filter document can answer with.
    #[test]
    fn bad_request_response_names_the_body_problem() {
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
