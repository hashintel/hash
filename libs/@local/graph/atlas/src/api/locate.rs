//! `POST /v1/atlas/locate/{generation}/{variant}`.
//!
//! The source entity's ego-graph - its edges and the partners they connect - as `SALTILEL` bytes.

use alloc::sync::Arc;
use core::panic::AssertUnwindSafe;

use aide::transform::TransformOperation;
use axum::{extract::State, http::StatusCode};
use hashql_core::id::IdVec;
use tokio::sync::oneshot;
use tracing::Instrument as _;

use super::{
    AppState, clause,
    extract::{Body, Generation, VariantPath},
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
    visibility::{Visibility, view_problem},
};
use crate::{
    dataset::postgres::id::ArchivedEntityId,
    serve::{
        LocateError, LocateRequest,
        hydrate::{
            DetailError, EdgeSlot, LocateHydration, LocateOrder, LocateStore, MaskingActor,
            NodeSlot,
        },
    },
};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns one entity's ego-graph: the source point, every neighbour it links to, and the edges \
     joining them, as a `SALTILEL` binary envelope.

The JSON body is required and names the source in exactly one of two fields: `entityId` (the \
     upstream `webId~entityUuid` id a search result or deep link carries) or `row` (a row id a \
     tile's `ROW_IDS` column delivered - if you hold one, no translate round trip is needed). A \
     body carrying both or neither answers `invalid-source`. Either field reaches identical \
     geometry bytes for the same source.

A source may also name an entity placed since the generation was fitted: it resolves through the \
     serving session's own records in either field form, answers its frozen coordinate and \
     captured display, and delivers alone - the generation's adjacency never names an entity \
     placed after the fit, so its ego-graph is empty and complete. The row ids such entities \
     carry die with the serving session that minted them, exactly as translate describes.

The source is delivered first, partners follow ascending by row id, and edges are ordered \
     ascending by link-entity identity bytes (the `EDGE_IDS` column: each edge's 32-byte entity \
     id, web uuid then entity uuid). The manifest's `limits.locateEdges` caps the edge set; under \
     truncation the response keeps the edges whose partners lie nearest the source, the HEAD's \
     `complete` key reads `false`, and a partner whose every edge was truncated is not delivered.

The HEAD also carries the source's first visible zoom and its tile there (the fly-to target), the \
     source's entity id as 32 raw bytes, and two completeness flags: `typeIdsComplete` (the \
     request's `coloredTypeIds` cover every direct type of the source) and `propertiesComplete` \
     (the trailer's source property map is the entity's whole deliverable set - every property no \
     protection withholds from the requesting actor). `coloredTypeIds` behaves exactly as on the \
     tile route.

The response always carries the detail trailer. Labels come from the generation (for an entity \
     placed since the fit, from its placement's captured display) and are admitted only when the \
     request-time store read resolves the corresponding entity. The store also supplies each \
     node's first direct type, the source's properties capped by `limits.locateProperties`, and \
     each edge's direct types and properties capped by `limits.locateLinkTypeIds` and \
     `limits.locateLinkProperties`. Each edge cap has a completeness flag. Type and property \
     references are integer indexes into the trailer's two sorted URL tables.

A source that does not name a visible node answers `unknown-entity`: nonexistent, inaccessible, \
     unparsable, and out-of-range `row` values are indistinguishable by design.

Filtering binds at the manifest. This body has no `filter` field, and an unknown member is \
     rejected as `invalid-body`.
";

/// `POST /v1/atlas/locate/{generation}/{variant}`.
///
/// The source's spotlight subgraph, as `SALTILEL` bytes. The source id is the request's subject, so
/// the route requires the body.
pub(super) async fn handler(
    State(state): State<AppState>,
    visibility: Visibility,
    Generation(VariantPath {
        generation,
        variant,
    }): Generation<VariantPath>,
    Body(request): Body<LocateRequest>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, generation)?;
    reject_variant(&variant)?;

    // The whole pipeline is one synchronous call on a rayon worker; only the store order and its
    // answer cross back here, where the connections live and the two queries run concurrently.
    let atlas = Arc::clone(&state.atlas);
    let limits = state.limits;
    let masking = visibility.masking();
    let (order_sender, order_receiver) = oneshot::channel();
    let (answer_sender, answer_receiver) = oneshot::channel();
    let store = ChannelLocateStore {
        order: order_sender,
        answer: answer_receiver,
    };

    let (result, ()) = tokio::join!(
        spawn(AssertUnwindSafe(move || {
            let view = visibility.view(&atlas)?;

            atlas.locate(&request, limits, view, store)
        })),
        async {
            // An order never arrives when the pipeline rejects the request or panics first.
            let Ok(order) = order_receiver.await else {
                return;
            };
            let _: Result<(), _> = answer_sender.send(hydrate(&state, order, masking).await);
        },
    );

    let bytes = match result? {
        Ok(bytes) => bytes,
        Err(error @ LocateError::UnknownEntity) => {
            return Err(Problem::new(
                StatusCode::NOT_FOUND,
                ProblemType::UnknownEntity,
                error.to_string(),
            ));
        }
        Err(error @ LocateError::Types { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTypes,
                error.to_string(),
            ));
        }
        Err(error @ LocateError::Source { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidSource,
                error.to_string(),
            ));
        }
        Err(error @ LocateError::Unsupported(_)) => {
            return Err(Problem::new(
                StatusCode::NOT_IMPLEMENTED,
                ProblemType::UnsupportedFeature,
                error.to_string(),
            ));
        }
        // A stale sealed offset answers the uniform refusal. A mismatched pair or width names
        // an input this process produced and answers the internal problem.
        Err(LocateError::View(error)) => return Err(view_problem(error)),
        Err(error @ LocateError::Details(_)) => {
            return Err(Problem::internal(error, "the detail hydration failed"));
        }
    };

    Ok(Saltile::new(bytes))
}

/// One locate hydration order, owned for the trip between the pipeline and the store side.
struct LocateOrderMessage {
    /// The delivered node identities, source first.
    nodes: IdVec<NodeSlot, ArchivedEntityId>,
    /// The delivered link-entity identities, ascending identity bytes.
    links: IdVec<EdgeSlot, ArchivedEntityId>,
    /// Most properties the source's map delivers.
    properties: u32,
    /// Most direct-type URLs each link delivers.
    link_type_ids: u32,
    /// Most properties each link's map delivers.
    link_properties: u32,
}

/// The transport's locate store, carrying one order out to the handler and one answer back in.
struct ChannelLocateStore {
    order: oneshot::Sender<LocateOrderMessage>,
    answer: oneshot::Receiver<Result<LocateHydration, DetailError>>,
}

impl LocateStore for ChannelLocateStore {
    fn hydrate(self, order: LocateOrder<'_>) -> Result<LocateHydration, DetailError> {
        self.order
            .send(LocateOrderMessage {
                // The channel is the one boundary that owns the identities, so the views
                // materialize here and nowhere earlier.
                nodes: order.nodes.iter().collect(),
                links: order.links.iter().copied().collect(),
                properties: order.properties,
                link_type_ids: order.link_type_ids,
                link_properties: order.link_properties,
            })
            .map_err(|_order| DetailError::Disconnected)?;

        self.answer
            .blocking_recv()
            .map_err(|_closed| DetailError::Disconnected)?
    }
}

/// Answers one order against the serving store, both halves concurrently.
async fn hydrate(
    state: &AppState,
    order: LocateOrderMessage,
    masking: MaskingActor,
) -> Result<LocateHydration, DetailError> {
    let (nodes, links) = tokio::try_join!(
        state
            .remote
            .locate_node_hydration(&order.nodes, order.properties, masking)
            .in_current_span(),
        state
            .remote
            .locate_link_hydration(
                &order.links,
                order.link_type_ids,
                order.link_properties,
                masking
            )
            .in_current_span(),
    )?;

    Ok(LocateHydration { nodes, links })
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("locate")
        .summary("The source entity's ego-graph, as SALTILEL envelope bytes")
        .description(DESCRIPTION)
        .with(clause::describe_body(
            "the locate request; exactly one of `entityId` and `row` names the subject",
        ))
        .response_with::<200, Saltile, _>(|response| {
            response.description(
                "a `SALTILEL` envelope: the source first, its linked partners, and the edges \
                 joining them",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-types`, `invalid-source`, `invalid-generation`, `missing-body`, or \
                 `invalid-body` (a body that is not JSON)",
            )
        })
        .with(clause::invalid_body_data)
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation`, `unknown-variant`, or `unknown-entity` (identical for \
                 nonexistent, inaccessible, unparsable, and out-of-range sources)",
            )
        })
        .with(clause::any_problem)
}
