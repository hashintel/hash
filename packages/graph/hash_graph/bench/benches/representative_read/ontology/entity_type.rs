use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    store::{query::Expression, EntityTypeStore},
    subgraph::{GraphResolveDepths, StructuralQuery},
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
                .unwrap()
                .clone()
        },
        |entity_type_id| async move {
            store
                .get_entity_type(&StructuralQuery {
                    expression: Expression::for_versioned_uri(&entity_type_id),
                    graph_resolve_depths: GraphResolveDepths {
                        data_type_resolve_depth: 0,
                        property_type_resolve_depth: 0,
                        entity_type_resolve_depth: 0,
                        link_type_resolve_depth: 0,
                        link_resolve_depth: 0,
                        link_target_entity_resolve_depth: 0,
                    },
                })
                .await
                .expect("failed to read entity type from store");
        },
        SmallInput,
    );
}
