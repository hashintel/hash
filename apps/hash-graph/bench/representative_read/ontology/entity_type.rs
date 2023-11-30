use authorization::NoAuthorization;
use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    store::{query::Filter, EntityTypeStore},
    subgraph::{
        edges::GraphResolveDepths,
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
};
use graph_types::account::AccountId;
use rand::{prelude::IteratorRandom, thread_rng};
use temporal_versioning::TemporalBound;
use tokio::runtime::Runtime;
use type_system::url::VersionedUrl;

use crate::util::Store;

pub fn bench_get_entity_type_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    actor_id: AccountId,
    entity_type_ids: &[VersionedUrl],
) {
    b.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity type from the sample to query
            entity_type_ids
                .iter()
                .choose(&mut thread_rng())
                .expect("could not choose random entity type")
        },
        |entity_type_id| async move {
            store
                .get_entity_type(
                    actor_id,
                    &NoAuthorization,
                    &StructuralQuery {
                        filter: Filter::for_versioned_url(entity_type_id),
                        graph_resolve_depths: GraphResolveDepths::default(),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(
                                Some(TemporalBound::Unbounded),
                                None,
                            ),
                        },
                    },
                    None,
                    None,
                )
                .await
                .expect("failed to read entity type from store");
        },
        SmallInput,
    );
}
