use core::{error::Error, fmt, pin::pin};

use error_stack::{Report, ResultExt};
use futures::{StreamExt as _, TryStreamExt};
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

use crate::{
    bitset::CompressedBitSet,
    offload::OffloadError,
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    salt::fit::prepare::IdentityProvider as _,
    serve::{
        delta::epoch::Epoch,
        visibility::{VisibilityActor, VisibilityMask},
        world::World,
    },
};

/// Resolving an actor's visible rows against the store failed.
///
/// Each variant names one failing stage, so a caller can separate a request it can repair from a
/// condition it cannot. [`Filter`](Self::Filter) is the one variant a caller's own input produces.
#[derive(Debug)]
pub(crate) enum VisibilityProofError {
    /// No store connection was available for the resolution.
    Connect,
    /// Assembling the actor's policy set failed.
    Policies,
    /// The caller's filter does not compile against the entity query paths.
    Filter,
    /// The caller's filter carries a parameter that does not match its path's type.
    Convert,
    /// The scope's held filter document does not parse.
    Document,
    /// The policy filter does not compile against the entity query paths.
    PolicyFilter,
    /// The store rejected the visibility query.
    Query,
    /// The offloaded schedule-and-census computation produced no value.
    ComputeView,
}

impl fmt::Display for VisibilityProofError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect => fmt.write_str("the resolution reached no store connection"),
            Self::Policies => fmt.write_str("the actor's policy set could not be assembled"),
            Self::Filter => fmt.write_str("the request filter does not compile"),
            Self::Convert => {
                fmt.write_str("the request filter's parameters do not match its paths")
            }
            Self::Document => fmt.write_str("the scope's held filter document does not parse"),
            Self::PolicyFilter => fmt.write_str("the policy filter does not compile"),
            Self::Query => fmt.write_str("the store rejected the visibility query"),
            Self::ComputeView => fmt.write_str("the view's schedule and census failed to compute"),
        }
    }
}

impl Error for VisibilityProofError {}

const fn admits_every_row(
    filter: Option<&Filter<'_, Entity>>,
    policy_filter: &Filter<'_, Entity>,
) -> bool {
    filter.is_none() && matches!(policy_filter, Filter::All(conjuncts) if conjuncts.is_empty())
}

#[tracing::instrument(skip_all)]
pub(crate) async fn visibility_proof<S>(
    world: &World,
    epoch: &Epoch,

    actor: ActorId,
    filter: Option<&Filter<'_, Entity>>,
    protection: &PropertyProtectionFilterConfig<'static>,
    store: &S,
) -> Result<VisibilityMask, Report<VisibilityProofError>>
where
    S: PrincipalStore + PolicyStore + AsClient + Sync,
    for<'store> StoreProvider<'store, S>: DataTypeLookup + Sync,
{
    let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
    let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);

    let policy_components = PolicyComponents::builder(store, Some(actor))
        .with_action(ActionName::ViewEntity, MergePolicies::Yes)
        .await
        .change_context(VisibilityProofError::Policies)?;

    let actor = VisibilityActor {
        id: actor,
        instance_admin: policy_components.is_instance_admin(),
    };

    let policy_filter = Filter::<Entity>::for_policies(
        policy_components.extract_filter_policies(ActionName::ViewEntity),
        policy_components.actor_id(),
        policy_components.optimization_data(ActionName::ViewEntity),
    );

    if admits_every_row(filter, &policy_filter) {
        return Ok(VisibilityMask::full(epoch, actor));
    }

    let converted;
    let filter = match filter {
        Some(filter) => {
            let mut owned = filter.clone();
            owned
                .convert_parameters(&StoreProvider::new(store, &policy_components))
                .await
                .change_context(VisibilityProofError::Convert)?;

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
        Some(filter) if actor.masked_by(protection) => {
            protected =
                transform_filter(filter.clone(), protection, 0, policy_components.actor_id());
            Some(&protected)
        }
        filter => filter,
    };

    if let Some(filter) = filter {
        compiler
            .add_filter(filter)
            .change_context(VisibilityProofError::Filter)?;
    }
    compiler
        .add_filter(&policy_filter)
        .change_context(VisibilityProofError::PolicyFilter)?;

    let web_id_index = compiler.add_selection_path(&EntityQueryPath::WebId);
    let uuid_index = compiler.add_selection_path(&EntityQueryPath::Uuid);

    let (statement, parameters) = compiler.compile();
    let stream = store
        .as_client()
        .query_raw(&statement, parameters)
        .await
        .change_context(VisibilityProofError::Query)?;

    let mut nodes = CompressedBitSet::default();
    let mut edges = CompressedBitSet::default();

    let mut placed = 0_u64;
    let mut unplaced = 0_u64;

    let mut stream = pin!(stream);
    while let Some(row) = stream
        .try_next()
        .await
        .change_context(VisibilityProofError::Query)?
    {
        let web_id: WebId = row.get(web_id_index);
        let uuid: EntityUuid = row.get(uuid_index);

        let id = ArchivedEntityId {
            web_id: ArchivedWebId::from(Uuid::from(web_id)),
            entity_uuid: ArchivedEntityUuid::from(Uuid::from(uuid)),
        };

        if let Some(row_id) = world.layout.index.row_of(epoch, id) {
            nodes.insert(row_id);
            placed += 1;
        } else if let Some(row_id) = world.topology.row_of(epoch, id) {
            edges.insert(row_id);
            placed += 1;
        } else {
            unplaced += 1;
        }
    }

    tracing::debug!(
        nodes = nodes.count(),
        edges = edges.count(),
        placed,
        unplaced,
        "resolved the actor's visible rows"
    );

    Ok(VisibilityMask::partial(epoch, actor, nodes, edges))
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
    /// hand-built filter, so a change in what that constructor emits fails here rather than
    /// serving a scoped caller the operator's rows.
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
        // // tautology, and reading either as one would invert the decision.
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
