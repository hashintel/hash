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

#[derive(Debug, Copy, Clone)]
enum OffsetRule {
    Bootstrap,
    Carry(Zoom),
    Rebind(Zoom),
}

const fn offset_rule(carried: Option<ContinuityScope>, wanted: Option<FilterDigest>) -> OffsetRule {
    match carried {
        Some(scope) if scope.filter == wanted => OffsetRule::Carry(scope.k),
        Some(scope) => OffsetRule::Rebind(scope.k),
        None => OffsetRule::Bootstrap,
    }
}

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
        let document: Box<RawValue> = serde_json::from_slice(&body)
            .map_err(|error| Problem::internal(error, "retaining the validated filter failed"))?;
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
        let scene =
            Scene::of(requested.world(), requested.epoch(), &entry, offset).map_err(|error| {
                tracing::error!(?error, "unable to bind manifest schedule");
                Problem::internal(error, "binding the manifest schedule failed")
            })?;

        let document = ManifestDocument::new(scene, &state.limits, state.visibility);
        let mut bytes = Vec::new();
        let envelope = document
            .encode(&mut bytes)
            .map_err(|error| Problem::internal(error, "encoding the manifest failed"))?;
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
            .map_err(|_error| {
                Problem::internal(
                    "system randomness unavailable",
                    "issuing the authority token failed",
                )
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

struct FilterDocument;

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
             generation can reuse a cached scope until its hard expiry, but cannot resolve a \
             missing scope. An absent token requests a bootstrap.",
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
    use core::num::NonZero;

    use aide::{openapi::Operation, transform::TransformOperation};

    use super::{OffsetRule, document, offset_rule, sealed_offset};
    use crate::{
        math::Log2,
        morton::{Depth, MortonCell, Zoom},
        serve::{
            authorization::scope::ContinuityScope,
            density::{DensityBand, DensityPolicy, ViewOccupancy},
            visibility::cache::FilterDigest,
        },
    };

    fn policy() -> DensityPolicy {
        DensityPolicy::new(
            DensityBand::new(
                NonZero::new(2).expect("should be positive"),
                NonZero::new(3).expect("should be positive"),
            )
            .expect("lower bound should not exceed upper bound"),
            Log2::new(1).expect("should fit the span"),
            Zoom::new(4).expect("should fit the zoom"),
        )
        .expect("should admit an offset")
    }

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

    #[test]
    fn offset_bootstrap() {
        assert_eq!(
            sealed_offset(Some(policy()), OffsetRule::Bootstrap, Some(&view())),
            Zoom::new(1).expect("should fit the zoom")
        );
    }

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

    #[test]
    fn offset_rebind_coarser() {
        assert_eq!(
            sealed_offset(Some(policy()), OffsetRule::Rebind(Zoom::MIN), Some(&view())),
            Zoom::MIN
        );
    }

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
