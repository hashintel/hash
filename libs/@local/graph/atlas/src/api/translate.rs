//! `POST /v1/atlas/translate/{generation}/{variant}`.
//!
//! Upstream entity ids to atlas row ids, plus wire-frame positions for nodes.

use alloc::sync::Arc;

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{
    Json,
    extract::State,
    http::{StatusCode, header},
};

use super::{
    AppState, clause,
    extract::{Body, Generation, VariantPath},
    headers,
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::spawn,
    visibility::Visibility,
};
use crate::serve::{TranslateError, TranslateRequest, TranslateResponse};

/// The operation's description.
const DESCRIPTION: &str =
    "Translates upstream entity ids (`webId~entityUuid`) into the row ids and positions the \
     binary routes speak.

Use it to place entities fetched elsewhere onto the map. A resolved node answers its row id (the \
     `ROW_IDS` value every binary response uses) plus its position in the map's coordinate frame; \
     a resolved edge answers its two endpoints' row ids. Edges have no row id of their own - \
     binary responses identify an edge by its link entity id, which the requester already holds.

Row ids are opaque per-generation values, sparse in the full 32-bit range: consistent across every \
     route of one generation, carrying no ordering, adjacency, or count information, and not \
     stable across generations - re-translate after a generation change. An id can also name an \
     entity placed since the generation was fitted. Those ids die with the serving session that \
     minted them, and the uniform token refusal that follows a restart is the signal to \
     re-bootstrap and re-translate.

The response is two maps - `nodes` and `edges` - keyed by the requested id strings echoed \
     verbatim, so which map answers carries the kind. An id that resolves to nothing is an absent \
     key, never an error and never a null entry: nonexistent ids, draft ids, and entities the \
     caller cannot see are indistinguishable.

The `edges` map answers a link id when the caller may see the link row and both of its endpoints; \
     otherwise the id is absent, indistinguishable from an id belonging to neither domain.

The JSON body is required; the manifest's `limits.translateEntityIds` caps the id list. Duplicates \
     are legal and collapse.";

/// `POST /v1/atlas/translate/{generation}/{variant}`: upstream entity ids to atlas identity.
///
/// The id list is the request's subject, so this route requires a body.
pub(super) async fn handler(
    State(state): State<AppState>,
    visibility: Visibility,
    Generation(VariantPath {
        generation,
        variant,
    }): Generation<VariantPath>,
    Body(request): Body<TranslateRequest>,
) -> Result<impl IntoApiResponse, Problem<'static>> {
    reject_generation(&state, generation)?;
    reject_variant(&variant)?;

    let atlas = Arc::clone(&state.atlas);
    let limits = state.limits.translate;
    match spawn(move || {
        atlas.translate(
            request,
            limits,
            visibility.proof(),
            visibility.delta(),
            visibility.cohort(),
        )
    })
    .await?
    {
        Ok(response) => Ok(([(header::CACHE_CONTROL, headers::NO_STORE)], Json(response))),
        Err(error @ TranslateError::Ids { .. }) => Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::TooManyEntityIds,
            error.to_string(),
        )),
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("translate")
        .summary("Upstream entity ids to atlas row ids and positions")
        .description(DESCRIPTION)
        .with(clause::describe_body(
            "the translate request; the `entityIds` list is the request's subject",
        ))
        .response_with::<200, Json<TranslateResponse>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::NO_STORE,
                    "the response keys on the request body, which shared caches cannot see; the \
                     client's application-layer cache is the cache",
                ),
            );
            response.description(
                "two maps keyed by the requested id echoed verbatim; unresolvable ids are absent \
                 keys",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-entity-ids`, `invalid-generation`, `missing-body`, or `invalid-body` \
                 (a body that is not JSON)",
            )
        })
        .with(clause::invalid_body_data)
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation` or `unknown-variant`: re-bootstrap through `current`",
            )
        })
        .default_response_with::<Problem<'static>, _>(|response| {
            response
                .description("any other problem; `internal` marks a server-side assembly failure")
        })
}
