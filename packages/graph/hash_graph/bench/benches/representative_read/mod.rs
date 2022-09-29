use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;

use crate::{representative_read::seed::setup_and_extract_samples, util::setup};

mod knowledge;
mod ontology;

mod seed;

const DB_NAME: &str = "representative_read";

#[criterion]
fn bench_representative_read(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read");
    let (runtime, mut store_wrapper) = setup(DB_NAME, false);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, type_ids_and_entity_ids) in samples.entities {
        for (entity_type_id, entity_ids) in type_ids_and_entity_ids {
            group.bench_with_input(
                BenchmarkId::from_parameter(format!(
                    "Account ID: `{}`, Entity Type ID: `{}`",
                    account_id, entity_type_id
                )),
                &(account_id, entity_type_id, entity_ids),
                |b, (_account_id, _entity_type_id, entity_ids)| {
                    knowledge::entity::bench_get_entity_by_id(b, &runtime, store, entity_ids);
                },
            );
        }
    }
}
