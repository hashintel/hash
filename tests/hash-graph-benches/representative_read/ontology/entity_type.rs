use authorization::AuthorizationApi;
use criterion::{BatchSize::SmallInput, Bencher};
use graph::store::{EntityTypeStore, ontology::GetEntityTypesParams};
use graph_types::account::AccountId;
use hash_graph_store::{
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use rand::{prelude::IteratorRandom, thread_rng};
use temporal_versioning::TemporalBound;
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
                    include_closed: false,
                    include_count: false,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                })
                .await
                .expect("failed to read entity type from store");
        },
        SmallInput,
    );
}
