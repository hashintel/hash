//! Per-generation bootstrap metadata and authority renewal.
//!
//! The body names the wanted filter on every request. An unchanged filter preserves the sealed
//! offset, while a changed filter can reduce it to the wanted view's density resolution.

use alloc::sync::Arc;
use core::panic::AssertUnwindSafe;
use std::time::SystemTime;

use aide::transform::TransformOperation;
use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse as _, Response},
};
use error_stack::Report;
use hash_graph_store::filter::Filter;
use rand::TryCryptoRng;
use serde_json::value::RawValue;
use type_system::knowledge::Entity;

use super::{
    AppState,
    authorization::Renewal,
    clause, headers,
    problem::{Problem, ProblemType},
    saltile::{self, DocumentResponse},
    visibility,
};
use crate::{
    morton::Zoom,
    serve::{
        authorization::{authority::Issue, scope::ContinuityScope},
        density::{DensityBand, DensityPolicy, ViewOccupancy},
        document::{Document as _, ManifestDocument},
        scene::Scene,
        visibility::cache::FilterDigest,
    },
};

/// How [`sealed_offset`] derives this response's zoom from a renewal's carried continuity.
#[derive(Debug, Copy, Clone)]
enum OffsetRule {
    /// No continuity scope was carried: resolve a fresh offset from the density policy.
    Bootstrap,
    /// The carried scope's filter matches the wanted filter: keep its zoom unchanged.
    Carry(Zoom),
    /// The carried scope's filter differs from the wanted filter: rebind from its zoom.
    ///
    /// A rebind only ever coarsens.
    Rebind(Zoom),
}

/// Keeps the carried zoom for an unchanged filter and only coarsens it for a changed one.
///
/// A renewal carrying no continuity scope has no zoom to keep and bootstraps a fresh offset. The
/// filter digests compare exactly, [`None`] included. Dropping a filter therefore counts as
/// changing it and rebinds. [`OffsetRule`] states what each outcome means for the sealed offset.
const fn offset_rule(carried: Option<ContinuityScope>, wanted: Option<FilterDigest>) -> OffsetRule {
    match carried {
        Some(scope) if scope.filter == wanted => OffsetRule::Carry(scope.k),
        Some(scope) => OffsetRule::Rebind(scope.k),
        None => OffsetRule::Bootstrap,
    }
}

/// Resolves the zoom this response seals its schedule to, applying `rule` to `density` and `view`.
///
/// Returns [`Zoom::MIN`] when `density` or `view` is absent, because an unscoped or
/// full-visibility view uses the corpus cut rather than a resolved offset.
fn sealed_offset(
    density: Option<DensityPolicy>,
    rule: OffsetRule,
    view: Option<&ViewOccupancy>,
) -> Zoom {
    let (Some(policy), Some(view)) = (density, view) else {
        return Zoom::MIN;
    };
    match rule {
        OffsetRule::Bootstrap => policy.resolve(view),
        OffsetRule::Carry(carried) => carried,
        OffsetRule::Rebind(carried) => policy.rebind(carried, view),
    }
}

/// Answers with the generation's bootstrap manifest and a freshly issued authority token.
///
/// Serves `POST /v1/atlas/generation/{generation}/manifest`. An empty body requests an unfiltered
/// view, while a present one supplies the wanted entity-query filter. Continuity with the renewed
/// scope keeps a matching filter's sealed offset, and a changed filter may only coarsen it. The
/// response's `Atlas-Authority` header holds the fresh token.
///
/// # Errors
///
/// Raw-body buffering can reject the request before this handler runs, with a plain-text 413 for
/// the body limit or 400 for another body-read failure. These framework rejections have no
/// problem-document body.
///
/// Answers `invalid-body` where the body is not an entity-query filter document, and `internal`
/// where retaining the parsed filter fails. Scope resolution reports next: `invalid-body` for a
/// filter the store cannot compile or convert, `visibility-unavailable` where the store cannot
/// answer, `unauthorized` where the actor resolves to no scope. Binding the delivery schedule,
/// encoding the document and issuing the token each answer `internal` after that.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
    Renewal {
        observation,
        actor,
        carried,
    }: Renewal,
    body: Bytes,
) -> Result<Response, Problem<'static>>
where
    R: TryCryptoRng + Send + 'static,
{
    let filter = if body.is_empty() {
        None
    } else {
        serde_json::from_slice::<Filter<'_, Entity>>(&body).map_err(|error| {
            Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidBody,
                format!("the filter document does not parse: {error}"),
            )
        })?;
        // Identity includes surrounding whitespace, which RawValue does not retain.
        let digest = FilterDigest::of(&body);
        let document: Box<RawValue> = serde_json::from_slice(&body).map_err(|error| {
            Problem::internal(&Report::new(error), "retaining the validated filter failed")
        })?;
        Some((digest, Arc::from(document)))
    };
    let (wanted, document) = filter.map_or((None, None), |(digest, document)| {
        (Some(digest), Some(document))
    });
    let entry = visibility::resolve(&state, &observation, actor, wanted, document).await?;
    let rule = offset_rule(carried, wanted);

    saltile::spawn(AssertUnwindSafe(move || {
        let requested = observation.requested();
        let buckets = requested.world().schedule();
        let density = DensityPolicy::new(
            DensityBand::default(),
            buckets.span(),
            buckets.max_tile_depth(),
        )
        .ok();

        let offset = sealed_offset(density, rule, entry.occupancy.as_ref());
        let scene = Scene::of(requested.world(), requested.epoch(), &entry, offset)
            .map_err(|error| Problem::internal(&error, "binding the manifest schedule failed"))?;

        let document = ManifestDocument::new(scene, &state.limits, state.visibility);
        let mut bytes = Vec::new();
        let envelope = document
            .encode(&mut bytes)
            .map_err(|error| Problem::internal(&error, "encoding the manifest failed"))?;

        let token = state
            .tokens
            .issue(
                requested.epoch(),
                SystemTime::now(),
                Issue {
                    actor,
                    filter: wanted,
                    k: offset,
                },
            )
            .map_err(|error| {
                Problem::internal_message(&error, "issuing the authority token failed")
            })?;

        let mut response = DocumentResponse::new(bytes, envelope.content_type()).into_response();
        response.headers_mut().insert(
            HeaderName::from_static(headers::AUTHORITY),
            HeaderValue::try_from(token.to_string())
                .expect("hexadecimal should form a valid header value"),
        );
        Ok(response)
    }))
    .await?
}

/// The OpenAPI request-body schema for the manifest's entity-query filter.
struct FilterDocument;

// written out by hand: `Filter` does not derive `schemars::JsonSchema`
impl schemars::JsonSchema for FilterDocument {
    fn schema_name() -> alloc::borrow::Cow<'static, str> {
        "FilterDocument".into()
    }

    fn json_schema(_generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "object",
            "description": "an entity-query filter document, in the graph's structural-query filter grammar",
        })
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("manifest")
        .summary("The generation's bootstrap manifest")
        .description(
            "Returns generation metadata, grouped route limits and the resolved delivery \
             schedule. The Atlas-Authority response header contains a fresh token. Renew at \
             limits.authorityRefreshSeconds by presenting the held token and the wanted filter's \
             exact bytes. No body requests an unfiltered view. An unchanged filter preserves the \
             offset of a scoped view. A changed filter keeps that offset unless the wanted view \
             resolves coarser. Full-visibility views use the corpus cut. An expired token may \
             renew, but actor, generation and delta lifetime must still match. A retained \
             generation can reuse a cached scope until its hard expiry, but cannot resolve one \
             that is missing or already expired. An absent token requests a bootstrap. Issuing a \
             token is not a permission read. The response reuses the scope held for this actor, \
             filter, generation and delta lifetime whenever one is live. Past \
             limits.authorityRefreshSeconds that scope is stale, and a request of the same delta \
             lifetime is still answered from it while one such request starts a background \
             refresh. A request reading a retained lifetime reuses it and starts none. The \
             request itself resolves a scope only where none is held or the held one has reached \
             limits.authorityHardSeconds; below that age the refresh resolves in the background \
             while the held scope answers. A served scope is therefore no older than \
             limits.authorityHardSeconds, which bounds how long a permission change can go unseen \
             by a caller that keeps asking. It is not a deadline for a new answer: a resolution \
             can fail, and a failed refresh leaves the held scope and its original expiry in \
             place.",
        )
        .input::<Json<FilterDocument>>()
        .with(clause::optional_body)
        .response_with::<200, Json<ManifestDocument<'static>>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::NO_STORE,
                    "the document and authority token are specific to this request",
                ),
            );
            response.inner().headers.insert(
                headers::AUTHORITY_DOCUMENTED.to_owned(),
                headers::authority(),
            );
            response.description("the manifest with a fresh Atlas-Authority token")
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description("invalid-generation or invalid-body")
        })
        .with(clause::invalid_body_data)
        .response_with::<401, Problem<'static>, _>(|response| {
            response
                .description("the token is invalid, or the requested scope is no longer reusable")
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description("unknown-generation: re-read current and retry")
        })
        .response_with::<503, Problem<'static>, _>(|response| {
            response.description("no generation is ready or visibility resolution is unavailable")
        })
        .default_response_with::<Problem<'static>, _>(|response| {
            response.description("an internal server failure")
        })
}

#[cfg(test)]
mod tests {

    use aide::{openapi::Operation, transform::TransformOperation};

    use super::{OffsetRule, document, offset_rule, sealed_offset};
    use crate::{
        math::{Log2, nz},
        morton::{Depth, MortonCell, Zoom},
        serve::{
            authorization::scope::ContinuityScope,
            density::{DensityBand, DensityPolicy, ViewOccupancy},
            visibility::cache::FilterDigest,
        },
    };

    /// Builds the density policy the offset tests below resolve against.
    ///
    /// It admits offsets `1..=2` over a 3-level band, capped at zoom 4.
    fn policy() -> DensityPolicy {
        DensityPolicy::new(
            DensityBand::new(nz!(2), nz!(3)).expect("lower bound should not exceed upper bound"),
            Log2::new(1).expect("should fit the span"),
            Zoom::new(4).expect("should fit the zoom"),
        )
        .expect("should admit an offset")
    }

    /// Builds a view with four occupied cells at depth 3 and no bootstrap-relevant coarser cell.
    fn view() -> ViewOccupancy {
        let mut keys: Vec<_> = (0..4)
            .map(|x| {
                MortonCell::new(Depth::try_new(3).expect("should fit the depth"), x, 0)
                    .expect("should fit the grid")
                    .min_key()
            })
            .collect();
        ViewOccupancy::of(&mut keys)
    }

    /// A bootstrap request resolves to the policy's admitted offset, not [`Zoom::MIN`].
    ///
    /// A bootstrap request is one with no carried scope, resolved here over the fixture view.
    #[test]
    fn offset_bootstrap() {
        assert_eq!(
            sealed_offset(Some(policy()), OffsetRule::Bootstrap, Some(&view())),
            Zoom::new(1).expect("should fit the zoom")
        );
    }

    /// A renewal keeps its carried offset only on an exactly matching filter.
    ///
    /// A removed or changed filter rebinds from that offset instead, which only ever coarsens:
    /// against this fixture's policy and view, the carried zoom 2 rebinds to the 1 the policy
    /// admits.
    #[test]
    fn offset_renewal_filter() {
        let filter = Some(FilterDigest::of(b"filter"));
        let carried = Zoom::new(2).expect("should fit the zoom");
        let same = offset_rule(Some(ContinuityScope { filter, k: carried }), filter);
        let removed = offset_rule(Some(ContinuityScope { filter, k: carried }), None);
        let changed = offset_rule(
            Some(ContinuityScope { filter, k: carried }),
            Some(FilterDigest::of(b"other filter")),
        );
        assert_eq!(sealed_offset(Some(policy()), same, Some(&view())), carried);
        for rule in [removed, changed] {
            assert_eq!(
                sealed_offset(Some(policy()), rule, Some(&view())),
                Zoom::new(1).expect("should fit the zoom")
            );
        }
    }

    /// Rebinding to the coarsest zoom resolves to [`Zoom::MIN`] regardless of the policy.
    #[test]
    fn offset_rebind_coarser() {
        assert_eq!(
            sealed_offset(Some(policy()), OffsetRule::Rebind(Zoom::MIN), Some(&view())),
            Zoom::MIN
        );
    }

    /// Every offset rule resolves to [`Zoom::MIN`] without a policy or without a view.
    ///
    /// Rebinding against an empty view resolves to [`Zoom::MIN`] as well, even with a policy
    /// present.
    #[test]
    fn offset_zero_cases() {
        let offset = Zoom::new(2).expect("should fit the zoom");
        for rule in [
            OffsetRule::Bootstrap,
            OffsetRule::Carry(offset),
            OffsetRule::Rebind(offset),
        ] {
            assert_eq!(sealed_offset(Some(policy()), rule, None), Zoom::MIN);
            assert_eq!(sealed_offset(None, rule, Some(&view())), Zoom::MIN);
        }
        assert_eq!(
            sealed_offset(
                Some(policy()),
                OffsetRule::Rebind(offset),
                Some(&ViewOccupancy::of(&mut []))
            ),
            Zoom::MIN
        );
    }

    /// [`document`] documents the request body, the `200` headers and every description.
    ///
    /// The request body is optional JSON. The `200` carries `Atlas-Authority` and `Cache-Control`
    /// headers. Every declared response has a description, the default included.
    #[test]
    fn operation_body_headers() {
        let mut operation = Operation::default();
        let _documented = document(TransformOperation::new(&mut operation));
        let emitted = serde_json::to_value(operation).expect("should serialize the operation");
        assert!(emitted["requestBody"]["content"]["application/json"].is_object());
        assert!(
            !emitted["requestBody"]["required"]
                .as_bool()
                .unwrap_or(false)
        );
        assert!(
            emitted["responses"]["200"]["headers"][super::headers::AUTHORITY_DOCUMENTED]
                .is_object()
        );
        assert!(emitted["responses"]["200"]["headers"]["Cache-Control"].is_object());
        assert!(emitted["responses"]["default"]["description"].is_string());
        assert!(
            emitted["responses"]["400"]["description"]
                .as_str()
                .expect("should contain the description")
                .contains("invalid-body")
        );
    }
}
