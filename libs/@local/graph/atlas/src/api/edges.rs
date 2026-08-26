//! `POST /v1/atlas/edges/{generation}/{variant}`.
//!
//! The edges among the listed tiles' delivered rows, as `SALTILEE` bytes.

use alloc::sync::Arc;
use core::panic::AssertUnwindSafe;

use aide::transform::TransformOperation;
use axum::{extract::State, http::StatusCode};
use hashql_core::{
    collections::FastHashMap,
    id::{IdSlice, IdVec},
};
use tokio::sync::oneshot;
use type_system::ontology::id::VersionedUrl;

use super::{
    AppState, clause,
    extract::{Body, Generation, VariantPath},
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
    visibility::{Visibility, view_problem},
};
use crate::{
    postgres::id::ArchivedOntologyTypeUuid,
    serve::{
        EdgesError, EdgesRequest,
        hydrate::{DetailError, EdgesStore, TypeSlot, TypeUrlResolver as _},
    },
};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns the edges among the points the listed tiles deliver, as a `SALTILEE` binary envelope.

An edge is included exactly when both of its endpoints lie in the union of the listed tiles' \
     delivered sets, so one request listing the whole viewport also returns the edges that cross \
     between its tiles. Delivery is the tile route's level-of-detail delivery, not spatial \
     containment: an edge is absent while either endpoint sits below the listed zoom's cut, and \
     appears once the viewport or zoom reaches that endpoint.

The JSON body is required; the manifest's `limits.edgesTiles` caps the tile list.

The response's three columns - sources, targets, and `EDGE_IDS` (each edge's 32-byte link entity \
     id, web uuid then entity uuid) - are ordered ascending by identity bytes, independent of the \
     tile list's order: identical requests yield identical geometry bytes, and the order is \
     verifiable from the `EDGE_IDS` column alone. Edges have no row id of their own; the entity \
     id is an edge's identity on every route.

When the server's edge cap truncates the set, the response keeps the edges whose worse endpoint \
     ranks best, and the HEAD's `complete` key reads `false`.

`detail: \"auxiliary\"` adds the detail trailer (`\"minimal\"`, the default, sends the columns \
     alone). Every trailer value reads from its entity's currently served edition, which may \
     trail the newest edition by up to 65 seconds.

Entities and links that arrive after the serving generation's fit can also appear. A post-fit link \
     is an ordinary edge row wherever both of its endpoints deliver, merged into the same \
     identity order, and its label and representative type come from the display the server \
     captured at the link's currently served edition rather than the generation. An endpoint \
     placed since the fit takes a session-scoped row id, and such ids die with the serving \
     session that minted them, exactly as locate and translate describe.

Filtering binds at the manifest. This body has no `filter` field, and an unknown member is \
     rejected as `invalid-body`.
";

/// `POST /v1/atlas/edges/{generation}/{variant}`.
///
/// The edges among the listed tiles' delivered rows, as `SALTILEE` bytes. The tiles list is the
/// request's subject, so the route requires the body.
pub(super) async fn handler(
    State(state): State<AppState>,
    visibility: Visibility,
    Generation(VariantPath {
        generation,
        variant,
    }): Generation<VariantPath>,
    Body(request): Body<EdgesRequest>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, generation)?;
    reject_variant(&variant)?;

    // The whole pipeline is one synchronous call on a rayon worker; only the store order and its
    // answer cross back here, where the connections live.
    let atlas = Arc::clone(&state.atlas);
    let limits = state.limits.edges;
    let (order_sender, order_receiver) = oneshot::channel();
    let (answer_sender, answer_receiver) = oneshot::channel();
    let store = ChannelEdgesStore {
        order: order_sender,
        answer: answer_receiver,
    };

    let (result, ()) = tokio::join!(
        spawn(AssertUnwindSafe(move || {
            let view = visibility.view(&atlas)?;

            atlas.edges(&request, limits, view, store)
        })),
        async {
            // An order never arrives when the request skips the trailer, rejects, or panics first.
            let Ok(types) = order_receiver.await else {
                return;
            };

            let types = ArchivedOntologyTypeUuid::into_slice(types.as_raw());

            let answer = state
                .type_urls
                .resolve(types.iter().copied())
                .await
                .map(|pairs| {
                    let resolved: FastHashMap<_, _> = pairs.into_iter().collect();

                    types
                        .iter()
                        .map(|uuid| resolved.get(uuid).cloned())
                        .collect()
                });

            let _: Result<(), _> = answer_sender.send(answer);
        },
    );

    let bytes = match result? {
        Ok(bytes) => bytes,
        Err(error @ EdgesError::Tiles { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTiles,
                error.to_string(),
            ));
        }
        Err(error @ (EdgesError::Depth { .. } | EdgesError::Grid { .. })) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidCoordinate,
                error.to_string(),
            ));
        }
        // A stale sealed offset answers the uniform refusal. A mismatched pair or width names
        // an input this process produced and answers the internal problem.
        Err(EdgesError::View(error)) => return Err(view_problem(error)),
        Err(error @ EdgesError::Details(_)) => {
            return Err(Problem::internal(error, "the detail hydration failed"));
        }
    };

    Ok(Saltile::new(bytes))
}

/// The transport's edges store, carrying one order out to the handler and one answer back in.
struct ChannelEdgesStore {
    order: oneshot::Sender<IdVec<TypeSlot, ArchivedOntologyTypeUuid>>,
    answer: oneshot::Receiver<Result<IdVec<TypeSlot, Option<VersionedUrl>>, DetailError>>,
}

impl EdgesStore for ChannelEdgesStore {
    fn hydrate(
        self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, DetailError> {
        // The channel is the one boundary that owns the identities, so the list materializes
        // here and nowhere earlier.
        self.order
            .send(types.iter().copied().collect())
            .map_err(|_order| DetailError::Disconnected)?;

        self.answer
            .blocking_recv()
            .map_err(|_closed| DetailError::Disconnected)?
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("edges")
        .summary("The edges among the listed tiles' delivered rows, as SALTILEE envelope bytes")
        .description(DESCRIPTION)
        .with(clause::describe_body(
            "the edges request; the `tiles` list is the request's subject",
        ))
        .response_with::<200, Saltile, _>(|response| {
            response.description(
                "a `SALTILEE` envelope: the qualifying edges, ascending by link-entity identity",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-tiles`, `invalid-generation`, `missing-body`, `invalid-body` (a body \
                 that is not JSON), or `invalid-coordinate`",
            )
        })
        .with(clause::invalid_body_data)
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation` or `unknown-variant`: re-read `current` and retry",
            )
        })
        .with(clause::any_problem)
}
