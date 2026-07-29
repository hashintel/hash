//! Store-side visibility resolution: the rows an actor may view, as a proof.
//!
//! One query answers both halves of a request's scope. The actor's `ViewEntity` policies compile
//! into a filter, the caller's own filter intersects with it when one is given, and the result
//! selects the web id and entity uuid of every entity the actor may view. Each returned id resolves
//! against the generation's identity tables, and the rows that resolve form the proof's two masks -
//! node rows in one, link rows in the other.
//!
//! Because the caller's filter and the policy filter meet in the same statement, a filtered request
//! and a permission-restricted request arrive at the serving surface in the same shape: a proof
//! that admits fewer rows. The proof therefore carries the request's whole visible view.
//!
//! A caller filter also carries the store's own protection obligation. The store's entity reads
//! transform a caller's filter through [`PropertyProtectionFilterConfig`] before compiling it, so a
//! filter over a protected property cannot enumerate the entity types that configuration excludes.
//! This path compiles a caller filter as well, and a proof is observable - the rows it admits are
//! the rows the surfaces deliver - so it applies the same transformation under the same condition.
//! The configuration is a parameter rather than a default: a resolver that cannot be built without
//! it cannot be wired without it.
//!
//! The proof admits exactly the rows the query returned. Permissions evaluate against the live
//! decision-time axes, so the proof reflects policy as it stands at request time; entities the
//! store admits that the generation does not carry contribute no rows.

use core::{error::Error, fmt, pin::pin};

use error_stack::Report;
use futures::StreamExt as _;
use hash_graph_authorization::policies::{
    MergePolicies, PolicyComponents,
    action::ActionName,
    principal::actor::AuthenticatedActor,
    store::{PolicyStore, PrincipalStore, error::ContextCreationError},
};
use hash_graph_postgres_store::store::{
    AsClient,
    error::StoreError,
    postgres::query::{SelectCompiler, SelectCompilerError},
};
use hash_graph_store::{
    entity::EntityQueryPath,
    filter::{
        Filter,
        protection::{PropertyProtectionFilterConfig, transform_filter},
    },
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use tokio_postgres::GenericClient as _;
use type_system::{
    knowledge::{Entity, entity::id::EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::{
    bitset::CompressedBitSet,
    dataset::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    serve::{Atlas, VisibilityProof},
};

/// Resolving an actor's visible rows against the store failed.
///
/// Each variant names one failing stage, so a caller can separate a request it can repair from a
/// condition it cannot. [`Filter`](Self::Filter) is the one variant a caller's own input produces.
#[derive(Debug)]
pub(crate) enum ProofError {
    /// No store connection was available for the resolution.
    Connect(Report<StoreError>),
    /// The actor's policy set could not be assembled.
    Policies(Report<ContextCreationError>),
    /// The caller's filter does not compile against the entity query surface.
    Filter(Report<SelectCompilerError>),
    /// The policy filter does not compile against the entity query surface.
    PolicyFilter(Report<SelectCompilerError>),
    /// The store rejected the visibility query.
    Query(tokio_postgres::Error),
    /// The visibility query stopped partway through its rows.
    Rows(tokio_postgres::Error),
}

impl fmt::Display for ProofError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(_) => fmt.write_str("the resolution reached no store connection"),
            Self::Policies(_) => fmt.write_str("the actor's policy set could not be assembled"),
            Self::Filter(_) => fmt.write_str("the request filter does not compile"),
            Self::PolicyFilter(_) => fmt.write_str("the policy filter does not compile"),
            Self::Query(_) => fmt.write_str("the store rejected the visibility query"),
            Self::Rows(_) => fmt.write_str("the visibility query stopped partway through its rows"),
        }
    }
}

impl Error for ProofError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(report) => Some(report.current_context()),
            Self::Policies(report) => Some(report.current_context()),
            Self::Filter(report) | Self::PolicyFilter(report) => Some(report.current_context()),
            Self::Query(error) | Self::Rows(error) => Some(error),
        }
    }
}

/// Resolves the rows `actor` may view into a [`VisibilityProof`] over `atlas`.
///
/// `filter` narrows the view the proof admits. A request without one resolves the actor's whole
/// viewable set; a request with one resolves its intersection with that set, so the proof describes
/// the view the request asked for.
///
/// A row is visible when the query returned its entity id. The two masks stay separate because the
/// link rows an actor may read are not a function of the node rows it may read.
///
/// Caller requirement: `atlas` is the generation the proof will serve, since row ids are that
/// generation's own. Caller requirement: the generation's node and link identity tables carry
/// disjoint entity ids; an id that both tables carry resolves as a node row.
///
/// # Errors
///
/// Returns [`ProofError::Policies`] when the actor's policy set cannot be assembled,
/// [`ProofError::Filter`] when `filter` does not compile, [`ProofError::PolicyFilter`] when the
/// policy filter does not compile, [`ProofError::Query`] when the store rejects the statement, and
/// [`ProofError::Rows`] when the row stream fails before it ends. A failure yields no proof, so a
/// partial row stream admits no rows anywhere.
#[tracing::instrument(skip_all)]
pub(crate) async fn visibility_proof<S>(
    actor: AuthenticatedActor,
    filter: Option<&Filter<'_, Entity>>,
    protection: &PropertyProtectionFilterConfig<'static>,
    store: &S,
    atlas: &Atlas,
) -> Result<VisibilityProof, ProofError>
where
    S: PrincipalStore + PolicyStore + AsClient + Sync,
{
    let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
    let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);

    let policy_components = PolicyComponents::builder(store)
        .with_actor(actor)
        .with_action(ActionName::ViewEntity, MergePolicies::Yes)
        .await
        .map_err(ProofError::Policies)?;

    let policy_filter = Filter::<Entity>::for_policies(
        policy_components.extract_filter_policies(ActionName::ViewEntity),
        policy_components.actor_id(),
        policy_components.optimization_data(ActionName::ViewEntity),
    );

    // The store's read path transforms a caller's filter whenever protection is configured and the
    // actor is not an instance admin; the same condition governs here, since the same filter
    // reaches the same compiler.
    let protected;
    let filter = match filter {
        Some(filter) if !protection.is_empty() && !policy_components.is_instance_admin() => {
            protected =
                transform_filter(filter.clone(), protection, 0, policy_components.actor_id());
            Some(&protected)
        }
        filter => filter,
    };

    if let Some(filter) = filter {
        compiler.add_filter(filter).map_err(ProofError::Filter)?;
    }
    compiler
        .add_filter(&policy_filter)
        .map_err(ProofError::PolicyFilter)?;

    let web_id_index = compiler.add_selection_path(&EntityQueryPath::WebId);
    let uuid_index = compiler.add_selection_path(&EntityQueryPath::Uuid);

    let (statement, parameters) = compiler.compile();
    let stream = store
        .as_client()
        .query_raw(&statement, parameters.iter().copied())
        .await
        .map_err(ProofError::Query)?;

    let mut nodes = CompressedBitSet::default();
    let mut edges = CompressedBitSet::default();
    // Entities the actor may view that this generation does not carry: created after publish, or of
    // a shape the corpus does not place.
    let mut unplaced = 0_u64;

    let mut stream = pin!(stream);
    while let Some(row) = stream.next().await {
        let row = row.map_err(ProofError::Rows)?;

        let web_id: WebId = row.get(web_id_index);
        let uuid: EntityUuid = row.get(uuid_index);

        let id = ArchivedEntityId {
            web_id: ArchivedWebId::from(Uuid::from(web_id)),
            entity_uuid: ArchivedEntityUuid::from(Uuid::from(uuid)),
        };

        if let Some(row_id) = atlas.node_ids.row_of(id) {
            nodes.insert(row_id);
        } else if let Some(row_id) = atlas.edge_ids.row_of(id) {
            edges.insert(row_id);
        } else {
            unplaced += 1;
        }
    }

    tracing::debug!(
        nodes = nodes.count(),
        edges = edges.count(),
        unplaced,
        "resolved the actor's visible rows"
    );

    Ok(VisibilityProof::from_masks(nodes, edges))
}
