//! `POST /v1/atlas/translate/{generation}/{variant}`.
//!
//! Upstream entity ids to atlas row ids, plus wire-frame positions for nodes.

use alloc::sync::Arc;

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, header},
};

use super::{
    AppState,
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::spawn,
};
use crate::serve::{GenerationId, TranslateError, TranslateRequest, TranslateResponse};

/// The operation's description.
const DESCRIPTION: &str = "Translates upstream entity ids (`webId~entityUuid`) to atlas identity: \
                           the row ids every binary response speaks (`ROW_IDS` / `EDGE_ROW_IDS`) \
                           plus, for nodes, the wire-frame position - the correlation seam \
                           between separately fetched entities and dots already on screen.

Row ids are opaque per-generation values, sparse in the full u32 range: consistent across every \
                           endpoint of one generation, carrying no ordering, adjacency, or count \
                           information, never bounded by the generation's row count, and not \
                           stable across generations - re-translate after a generation change.

The response is two maps keyed by the requested id string echoed verbatim, so kind is carried by \
                           which map answers. An id that resolves to nothing is an absent key - \
                           never an error, never a null entry: nonexistent ids, draft-suffixed \
                           ids, and entities the principal cannot see are indistinguishable.

The JSON body is required; the manifest's `limits.translateEntityIds` caps the id list. Duplicates \
                           are legal and collapse.";

/// The generation/variant pair addressing one fitted layout.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct VariantPath {
    /// The sha256 generation id, as bootstrapped from `current`.
    //
    // A string for the same reason as the manifest route's
    // `generation`: an unparsable id must answer the 404 problem.
    #[schemars(with = "GenerationId")]
    generation: String,
    /// The fitted variant name; the manifest lists what this generation serves.
    variant: String,
}

/// `POST /v1/atlas/translate/{generation}/{variant}`: upstream entity ids to atlas identity.
///
/// The id list is the request's subject, so the body is required.
pub(super) async fn handler(
    State(state): State<AppState>,
    Path(VariantPath {
        generation,
        variant,
    }): Path<VariantPath>,
    body: Option<Json<TranslateRequest>>,
) -> Result<impl IntoApiResponse, Problem<'static>> {
    reject_generation(&state, &generation)?;
    reject_variant(&variant)?;

    let Some(Json(request)) = body else {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::MissingBody,
            "a translate request lists its entity ids in a JSON body",
        ));
    };

    let atlas = Arc::clone(&state.atlas);
    let caps = state.caps.translate;
    let proof = Arc::clone(&state.proof);
    match spawn(move || atlas.translate(&request, caps, &proof)).await? {
        Ok(response) => Ok((
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(response),
        )),
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
        .with(|mut operation| {
            if let Some(body) = operation
                .inner_mut()
                .request_body
                .as_mut()
                .and_then(|body| body.as_item_mut())
            {
                body.description = Some(
                    "the translate request; the `entityIds` list is the request's subject"
                        .to_owned(),
                );
            }
            operation
        })
        .response_with::<200, Json<TranslateResponse>, _>(|response| {
            response.description(
                "two maps keyed by the requested id echoed verbatim; unresolvable ids are absent \
                 keys",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description("`too-many-entity-ids` or `missing-body`")
        })
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
