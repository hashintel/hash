//! Deterministic seeding utilities for performance testing.

pub mod context;
pub mod distributions;
pub mod producer;

#[cfg(test)]
mod test_utils {
    use core::fmt::Debug;

    use error_stack::IntoReport;
    use pretty_assertions::assert_eq;
    use rand::{SeedableRng as _, rngs::StdRng};
    use rand_distr::Distribution;
    use serde::Serialize;

    use super::producer::{Producer, ProducerExt as _};
    use crate::seeding::context::{ProduceContext, ShardId};

    pub(crate) fn test_deterministic_distribution<T: Debug + PartialEq>(
        distribution: impl Distribution<T>,
    ) {
        let random_seed = rand::random::<u64>();

        assert_eq!(
            (&distribution)
                .sample_iter(StdRng::seed_from_u64(random_seed))
                .take(1000)
                .collect::<Vec<_>>(),
            distribution
                .sample_iter(&mut StdRng::seed_from_u64(random_seed))
                .take(1000)
                .collect::<Vec<_>>()
        );
    }

    pub(crate) fn test_deterministic_producer<P, T>(make_producer: impl Fn() -> P)
    where
        P: Producer<T>,
        T: Debug + Serialize,
    {
        let random_seed = rand::random::<u64>();
        let context = ProduceContext {
            master_seed: random_seed,
            shard_id: ShardId::new(0),
        };

        assert_eq!(
            make_producer()
                .iter_mut(&context)
                .take(1000)
                .map(|result| result
                    .map(|value| serde_json::to_string_pretty(&value)
                        .expect("should be able to serialize value"))
                    .map_err(IntoReport::into_report))
                .collect::<Result<Vec<_>, _>>()
                .expect("should be able to produce values"),
            make_producer()
                .iter_mut(&context)
                .take(1000)
                .map(|result| result
                    .map(|value| serde_json::to_string_pretty(&value)
                        .expect("should be able to serialize value"))
                    .map_err(IntoReport::into_report))
                .collect::<Result<Vec<_>, _>>()
                .expect("should be able to produce values")
        );
    }
}
