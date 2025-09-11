use criterion::{BatchSize::SmallInput, Bencher};
use hash_graph_store::{
    entity_type::{CommonGetEntityTypesParams, EntityTypeStore as _, GetEntityTypesParams},
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::TemporalBound;
use rand::{prelude::IteratorRandom as _, rng};
use tokio::runtime::Runtime;
use type_system::{ontology::VersionedUrl, principal::actor::ActorEntityUuid};

use crate::util::Store;

pub fn bench_get_entity_type_by_id(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    actor_id: ActorEntityUuid,
    entity_type_ids: &[VersionedUrl],
) {
    bencher.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity type from the sample to query
            entity_type_ids
                .iter()
                .choose(&mut rng())
                .expect("could not choose random entity type")
        },
        |entity_type_id| async move {
            store
                .get_entity_types(
                    actor_id,
                    GetEntityTypesParams {
                        request: CommonGetEntityTypesParams {
                            filter: Filter::for_versioned_url(entity_type_id),
                            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                                pinned: PinnedTemporalAxisUnresolved::new(None),
                                variable: VariableTemporalAxisUnresolved::new(
                                    Some(TemporalBound::Unbounded),
                                    None,
                                ),
                            },
                            include_drafts: false,
                            after: None,
                            limit: None,
                            include_count: false,
                            include_web_ids: false,
                            include_edition_created_by_ids: false,
                        },
                        include_entity_types: None,
                    },
                )
                .await
                .expect("failed to read entity type from store");
        },
        SmallInput,
    );
}
