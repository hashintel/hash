use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    identifier::time::{
        TimeIntervalBound, UnresolvedPinnedTemporalAxis, UnresolvedTemporalAxes,
        UnresolvedVariableTemporalAxis,
    },
    store::{query::Filter, EntityTypeStore},
    subgraph::{edges::GraphResolveDepths, query::StructuralQuery},
};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;
use type_system::uri::VersionedUri;

use crate::util::Store;

pub fn bench_get_entity_type_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    entity_type_ids: &[VersionedUri],
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
                .get_entity_type(&StructuralQuery {
                    filter: Filter::for_versioned_uri(entity_type_id),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    time_axes: UnresolvedTemporalAxes::DecisionTime {
                        pinned: UnresolvedPinnedTemporalAxis::new(None),
                        variable: UnresolvedVariableTemporalAxis::new(
                            Some(TimeIntervalBound::Unbounded),
                            None,
                        ),
                    },
                })
                .await
                .expect("failed to read entity type from store");
        },
        SmallInput,
    );
}
