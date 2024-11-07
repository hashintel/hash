use authorization::AuthorizationApi;
use criterion::{BatchSize::SmallInput, Bencher};
use graph::store::ontology::{EntityTypeStore as _, GetEntityTypesParams};
use hash_graph_store::{
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::TemporalBound;
use hash_graph_types::account::AccountId;
use rand::{prelude::IteratorRandom as _, thread_rng};
use tokio::runtime::Runtime;
use type_system::url::VersionedUrl;

use crate::util::Store;

pub fn bench_get_entity_type_by_id<A: AuthorizationApi>(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &Store<A>,
    actor_id: AccountId,
    entity_type_ids: &[VersionedUrl],
) {
    bencher.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity type from the sample to query
            entity_type_ids
                .iter()
                .choose(&mut thread_rng())
                .expect("could not choose random entity type")
        },
        |entity_type_id| async move {
            store
                .get_entity_types(actor_id, GetEntityTypesParams {
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
                    include_entity_types: None,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                })
                .await
                .expect("failed to read entity type from store");
        },
        SmallInput,
    );
}
