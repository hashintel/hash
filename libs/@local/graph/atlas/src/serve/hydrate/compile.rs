//! Store-side visibility resolution that yields a proof of an actor's viewable rows.
//!
//! One query answers both halves of a request's scope. The actor's `ViewEntity` policies produce a
//! filter. The caller's own filter intersects with it when the request carries one. The result
//! selects the web id and entity uuid of every entity in the actor's viewable set. Each returned id
//! resolves against the generation's identity tables, and the rows that resolve form the proof's
//! two masks. Node rows go in one mask and link rows in the other. An id the generation never
//! fitted resolves once more through the resolution's placement cohort. A placed arrival
//! admits its slot into the node mask, so the proof's width follows the cohort's universe rather
//! than the generation's, and a published delta link enters the proof's admitted identity set,
//! so the same resolution authorizes the post-fit edges a response may append.
//!
//! Because the caller's filter and the policy filter meet in the same statement, a filtered request
//! and a permission-restricted request arrive at serving in the same shape, a proof
//! that admits fewer rows. The proof therefore carries the request's whole visible view.
//!
//! A caller filter also carries the store's own protection obligation. The store's entity reads
//! transform a caller's filter through [`PropertyProtectionFilterConfig`] before compiling it, so a
//! filter over a protected property cannot enumerate the entity types that configuration excludes.
//! This path compiles a caller filter as well. A proof is observable (the rows it admits are the
//! rows the responses deliver), so this path applies the same transformation under the same
//! condition, from a configuration its caller supplies.
//!
//! The proof admits exactly the rows the query returned. Permissions evaluate against the live
//! decision-time axes, so the proof reflects policy as it stands at request time. Entities the
//! store admits that the generation does not carry contribute no rows.

use core::{error::Error, fmt, pin::pin};

use error_stack::Report;
use futures::StreamExt as _;
use hash_graph_authorization::policies::{
    MergePolicies, PolicyComponents,
    action::ActionName,
    store::{PolicyStore, PrincipalStore, error::ContextCreationError},
};
use hash_graph_postgres_store::store::{
    AsClient, StoreProvider,
    error::StoreError,
    postgres::query::{SelectCompiler, SelectCompilerError},
};
use hash_graph_store::{
    entity::EntityQueryPath,
    filter::{
        Filter, ParameterConversionError,
        protection::{PropertyProtectionFilterConfig, transform_filter},
    },
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_types::ontology::DataTypeLookup;
use hashql_core::collections::fast_hash_set;
use tokio_postgres::GenericClient as _;
use type_system::{
    knowledge::{Entity, entity::id::EntityUuid},
    principal::{actor::ActorId, actor_group::WebId},
};
use uuid::Uuid;

use super::MaskingActor;
use crate::{
    bitset::CompressedBitSet,
    offload::OffloadError,
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    serve::{Atlas, VisibilityProof, delta::PlacementCohort},
};

/// Resolving an actor's visible rows against the store failed.
///
/// Each variant names one failing stage, so a caller can separate a request it can repair from a
/// condition it cannot. [`Filter`](Self::Filter) is the one variant a caller's own input produces.
#[derive(Debug)]
pub(crate) enum ProofError {
    /// No store connection was available for the resolution.
    Connect(Report<StoreError>),
    /// Assembling the actor's policy set failed.
    Policies(Report<ContextCreationError>),
    /// The caller's filter does not compile against the entity query paths.
    Filter(Report<SelectCompilerError>),
    /// The caller's filter carries a parameter that does not match its path's type.
    Convert(Report<ParameterConversionError>),
    /// The scope's held filter document does not parse.
    Document(serde_json::Error),
    /// The policy filter does not compile against the entity query paths.
    PolicyFilter(Report<SelectCompilerError>),
    /// The store rejected the visibility query.
    Query(tokio_postgres::Error),
    /// The visibility query stopped partway through its rows.
    Rows(tokio_postgres::Error),
    /// The offloaded schedule-and-census computation produced no value.
    ComputeView(OffloadError),
}

impl From<OffloadError> for ProofError {
    fn from(error: OffloadError) -> Self {
        Self::ComputeView(error)
    }
}

impl fmt::Display for ProofError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(_) => fmt.write_str("the resolution reached no store connection"),
            Self::Policies(_) => fmt.write_str("the actor's policy set could not be assembled"),
            Self::Filter(_) => fmt.write_str("the request filter does not compile"),
            Self::Convert(_) => {
                fmt.write_str("the request filter's parameters do not match its paths")
            }
            Self::Document(_) => fmt.write_str("the scope's held filter document does not parse"),
            Self::PolicyFilter(_) => fmt.write_str("the policy filter does not compile"),
            Self::Query(_) => fmt.write_str("the store rejected the visibility query"),
            Self::Rows(_) => fmt.write_str("the visibility query stopped partway through its rows"),
            Self::ComputeView(_) => {
                fmt.write_str("the view's schedule and census failed to compute")
            }
        }
    }
}

impl Error for ProofError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(report) => Some(report.current_context()),
            Self::Policies(report) => Some(report.current_context()),
            Self::Filter(report) | Self::PolicyFilter(report) => Some(report.current_context()),
            Self::Convert(report) => Some(report.current_context()),
            Self::Document(error) => Some(error),
            Self::Query(error) | Self::Rows(error) => Some(error),
            Self::ComputeView(error) => Some(error),
        }
    }
}

/// Returns whether a request answers with the whole generation without asking the store.
///
/// True for an unconstrained view, where the caller narrows nothing and the compiled policy filter
/// is the tautology. Under those conditions the query returns every entity id the store holds and
/// the resulting proof admits every row. The check reads both conditions where the code decides
/// them rather than inferring them from the actor's kind. An actor's administrative standing is a
/// statement about its policies. The compiled filter already holds the resolution of those
/// policies.
///
/// [`Filter::for_policies`] yields an empty [`Filter::All`] on exactly one path, an unconstrained
/// permit meeting no forbid. Every other shape carries a conjunct, a disjunct, or a negation. A
/// caller filter keeps the query, since a caller that narrows its view asked for the narrowed view.
const fn admits_every_row(
    filter: Option<&Filter<'_, Entity>>,
    policy_filter: &Filter<'_, Entity>,
) -> bool {
    filter.is_none() && matches!(policy_filter, Filter::All(conjuncts) if conjuncts.is_empty())
}

/// Resolves the rows visible to `actor` as a [`VisibilityProof`] over `atlas`, beside the
/// [`MaskingActor`] the same policy resolution produced.
///
/// `filter` narrows the view the proof admits. A request without one resolves the actor's whole
/// viewable set, while a request with one resolves its intersection with that set, so the proof
/// describes the view the request asked for. The masking actor travels with the proof so the
/// scope's hydrations mask properties for the actor whose rows the proof admits.
///
/// An unconstrained view answers without the store. Every row is visible when the actor's policies
/// compile to the tautology and the request narrows nothing. The proof is then
/// [`VisibilityProof::full_visibility`] rather than one mask bit per row of the generation.
///
/// A row is visible when the query returned its entity id. Both masks stay separate because the
/// link rows an actor's policies admit are not a function of the node rows they admit.
///
/// `cohort` is the arrivals snapshot this resolution reads. A returned identity the generation
/// never fitted admits its cohort slot into the node mask, so a scoped proof answers placed
/// arrivals exactly where it answers fitted rows, and the mask's width follows the cohort's
/// universe. A returned identity the cohort publishes as a delta link enters the proof's
/// admitted identity set, the same admission one query grants the other three shapes. The
/// caller binds the same snapshot beside the proof, so the slots and links the proof admits and
/// the placements a request reads come from one publication.
///
/// Caller requirement: `atlas` is the generation the proof serves, since row ids are that
/// generation's own. Caller requirement: the generation's node and link identity tables carry
/// disjoint entity ids. An id that both tables carry resolves as a node row.
///
/// # Errors
///
/// Returns [`ProofError::Policies`] when assembling the actor's policy set fails,
/// [`ProofError::Convert`] when a filter parameter does not match its path's type,
/// [`ProofError::Filter`] when `filter` does not compile, [`ProofError::PolicyFilter`] when the
/// policy filter does not compile, [`ProofError::Query`] when the store rejects the statement, and
/// [`ProofError::Rows`] when the row stream fails before it ends. A failure yields no proof, so a
/// partial row stream admits no rows anywhere.
#[tracing::instrument(skip_all)]
pub(crate) async fn visibility_proof<S>(
    actor: ActorId,
    filter: Option<&Filter<'_, Entity>>,
    protection: &PropertyProtectionFilterConfig<'static>,
    store: &S,
    atlas: &Atlas,
    cohort: PlacementCohort<'_>,
) -> Result<(VisibilityProof, MaskingActor), ProofError>
where
    S: PrincipalStore + PolicyStore + AsClient + Sync,
    for<'store> StoreProvider<'store, S>: DataTypeLookup + Sync,
{
    let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
    let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);

    let policy_components = PolicyComponents::builder(store, Some(actor))
        .with_action(ActionName::ViewEntity, MergePolicies::Yes)
        .await
        .map_err(ProofError::Policies)?;

    let masking = MaskingActor {
        id: actor,
        instance_admin: policy_components.is_instance_admin(),
    };

    let policy_filter = Filter::<Entity>::for_policies(
        policy_components.extract_filter_policies(ActionName::ViewEntity),
        policy_components.actor_id(),
        policy_components.optimization_data(ActionName::ViewEntity),
    );

    if admits_every_row(filter, &policy_filter) {
        return Ok((VisibilityProof::full_visibility(), masking));
    }

    // Convert the caller filter's parameters to the types its paths expect - a web-id text
    // parameter to a UUID, a property value to its data type - exactly as the entity read path
    // does before it compiles (`PostgresStore::query_entities_impl`). The compiler binds a
    // converted parameter with its column's type. An unconverted text parameter against a UUID
    // or typed column compiles but the store rejects the statement at execution. The conversion
    // reads data types through the same `StoreProvider` the read path builds.
    let converted;
    let filter = match filter {
        Some(filter) => {
            let mut owned = filter.clone();
            owned
                .convert_parameters(&StoreProvider::new(store, &policy_components))
                .await
                .map_err(ProofError::Convert)?;
            converted = owned;
            Some(&converted)
        }
        None => None,
    };

    // The store's read path transforms a caller's filter whenever the deployment configures
    // protection and the actor is not an instance admin. The same condition governs here, since the
    // same filter reaches the same compiler.
    let protected;
    let filter = match filter {
        Some(filter) if masking.masked_by(protection) => {
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
        .query_raw(&statement, parameters)
        .await
        .map_err(ProofError::Query)?;

    let mut nodes = CompressedBitSet::default();
    let mut edges = CompressedBitSet::default();
    let mut links = fast_hash_set();
    // Placed arrivals the actor may view, admitted into the node mask on their cohort slots.
    let mut placed = 0_u64;
    // Entities the actor may view that neither the generation nor the cohort carries: staged or
    // unplaced arrivals, or of a shape the corpus does not place.
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
        } else if let Some(arrival) = cohort.node(id) {
            nodes.insert(arrival.id);
            placed += 1;
        } else if cohort.edge(id).is_some() {
            links.insert(id);
        } else {
            unplaced += 1;
        }
    }

    tracing::debug!(
        nodes = nodes.count(),
        edges = edges.count(),
        links = links.len(),
        placed,
        unplaced,
        "resolved the actor's visible rows"
    );

    Ok((VisibilityProof::from_masks(nodes, edges, links), masking))
}

#[cfg(test)]
mod tests {
    use hash_graph_authorization::policies::{
        Effect, OptimizationData, resource::ResourceConstraint,
    };
    use hash_graph_store::filter::Filter;
    use type_system::{
        knowledge::{Entity, entity::id::EntityId},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::admits_every_row;

    /// The compiled tautology plus no caller filter is the unconstrained view.
    ///
    /// The bug class is a short-circuit that reads a shape the policy compiler does not reserve for
    /// unconstrained permits. The expectation therefore comes from
    /// [`Filter::for_policies`](hash_graph_store::filter::Filter::for_policies) itself, not from a
    /// hand-built filter, so a change in what that constructor emits fails here rather than serving
    /// a scoped caller the operator's rows.
    #[test]
    fn only_an_unconstrained_permit_admits_every_row() {
        let optimization = OptimizationData::default();

        let unconstrained =
            Filter::<Entity>::for_policies([(Effect::Permit, None)], None, &optimization);
        assert!(
            admits_every_row(None, &unconstrained),
            "an unconstrained permit with no caller filter admits every row: {unconstrained:?}"
        );

        // A web-scoped permit is the same actor shape with one resource constraint, and it must
        // keep the query.
        let web = ResourceConstraint::Web {
            web_id: WebId::new(Uuid::nil()),
        };
        let scoped =
            Filter::<Entity>::for_policies([(Effect::Permit, Some(&web))], None, &optimization);
        assert!(!admits_every_row(None, &scoped));

        // A blank forbid denies everything, and no permit at all denies everything: neither is the
        // tautology, and reading either as one would invert the decision.
        let forbidden =
            Filter::<Entity>::for_policies([(Effect::Forbid, None)], None, &optimization);
        assert!(!admits_every_row(None, &forbidden));
        let silent = Filter::<Entity>::for_policies([], None, &optimization);
        assert!(!admits_every_row(None, &silent));

        // An unconstrained permit met by a forbid compiles to a negation, which the store must
        // still evaluate.
        let partly = Filter::<Entity>::for_policies(
            [(Effect::Permit, None), (Effect::Forbid, Some(&web))],
            None,
            &optimization,
        );
        assert!(!admits_every_row(None, &partly));

        // A scoped permit met by a forbid is the one shape that compiles to a non-empty
        // conjunction. It is the dangerous neighbour of the tautology: reading the constructor
        // rather than the conjunction's emptiness would answer this scoped actor with the whole
        // generation.
        let elsewhere = ResourceConstraint::Web {
            web_id: WebId::new(Uuid::from_u128(1)),
        };
        let scoped_with_forbid = Filter::<Entity>::for_policies(
            [
                (Effect::Permit, Some(&web)),
                (Effect::Forbid, Some(&elsewhere)),
            ],
            None,
            &optimization,
        );
        assert!(
            matches!(&scoped_with_forbid, Filter::All(conjuncts) if !conjuncts.is_empty()),
            "the fixture builds the non-empty conjunction it is here to reject: \
             {scoped_with_forbid:?}"
        );
        assert!(!admits_every_row(None, &scoped_with_forbid));
    }

    /// A caller filter keeps the query even under the tautology.
    ///
    /// The bug class is a short-circuit that answers the filtered request with the whole
    /// generation. An operator asking for a narrowed view would receive every row instead, which is
    /// a wrong answer rather than a leak.
    #[test]
    fn caller_filter_keeps_the_query() {
        let optimization = OptimizationData::default();
        let unconstrained =
            Filter::<Entity>::for_policies([(Effect::Permit, None)], None, &optimization);
        let requested = Filter::<Entity>::for_entity_by_entity_id(EntityId {
            web_id: WebId::new(Uuid::nil()),
            entity_uuid: type_system::knowledge::entity::id::EntityUuid::new(Uuid::nil()),
            draft_id: None,
        });

        assert!(!admits_every_row(Some(&requested), &unconstrained));
    }
}
