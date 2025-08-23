//! Stateful producers for higher-level seeding outputs.
//!
//! Producers orchestrate multiple [`Distribution`] building blocks to produce valid, domain-level
//! objects while enforcing cross-field invariants and managing state such as deduplication maps or
//! counters. Unlike plain distributions, producers are intentionally stateful and expose a
//! pull-based API via [`Producer::generate`] with a [`ProduceContext`], plus a convenience iterator
//! adapter via [`ProducerExt::iter_mut`].
//!
//! Design principles:
//! - Deterministic: callers pass a [`ProduceContext`], which constructs a [`GlobalId`] per sample
//!   from the [`RunId`], [`ShardId`], [`LocalId`], and [`Scope`]. The RNG is derived via
//!   [`GlobalId::rng`]. Identical inputs yield identical sequences.
//! - Separation of concerns: small, stateless distributions sample primitive values; producers
//!   compose them into complete objects and ensure invariants.
//! - Ergonomics: provide an iterator adapter for streaming generation in tests and benchmarks.
//!
//! [`Distribution`]: rand::distr::Distribution
//! [`GlobalId`]: crate::seeding::context::GlobalId
//! [`GlobalId::rng`]: crate::seeding::context::GlobalId::rng
//! [`RunId`]: crate::seeding::context::RunId
//! [`ShardId`]: crate::seeding::context::ShardId
//! [`LocalId`]: crate::seeding::context::LocalId
//! [`Scope`]: crate::seeding::context::Scope

use core::{iter, marker::PhantomData};

use error_stack::IntoReport;

use super::context::{ProduceContext, ProducerId};

pub mod data_type;
pub mod ontology;
pub mod property_type;
pub mod user;

/// Stateful producer of complex values composed from one or more distributions.
///
/// Producers keep internal state (for example, deduplication maps, counters, or caches) and are
/// responsible for enforcing invariants across fields or across multiple produced objects. They are
/// deterministic when driven by a caller-supplied [`ProduceContext`].
///
/// Do not implement [`Distribution`] for producers. That trait is stateless and returns plain
/// values by reference (`&self`), while producers require `&mut self` and often need to return
/// `Result<T, E>` to report build errors (e.g., invalid URLs or schema issues).
///
/// [`Distribution`]: rand::distr::Distribution
pub trait Producer<T> {
    type Error: IntoReport;

    const ID: ProducerId;

    /// Produce the next value using the provided RNG.
    ///
    /// # Errors
    ///
    /// Returns an error when a value cannot be produced while respecting the implementor's
    /// invariants, for example due to invalid identifiers, URL construction failures, schema
    /// violations, or exhausted retries during deduplication.
    fn generate(&mut self, context: ProduceContext) -> Result<T, Self::Error>;
}

pub trait ProducerExt<T>: Producer<T> {
    fn iter_mut<'c>(&mut self, context: ProduceContext) -> ProducerIter<'_, Self, T>
    where
        Self: Sized;
}

impl<P, T> ProducerExt<T> for P
where
    P: Producer<T> + Sized,
{
    fn iter_mut<'c>(&mut self, context: ProduceContext) -> ProducerIter<'_, Self, T> {
        ProducerIter {
            producer: self,
            context,
            _marker: PhantomData,
        }
    }
}

#[derive(Debug)]
pub struct ProducerIter<'p, P: ?Sized, T> {
    producer: &'p mut P,
    context: ProduceContext,
    _marker: PhantomData<fn() -> T>,
}

impl<P, T> Iterator for ProducerIter<'_, P, T>
where
    P: Producer<T> + ?Sized,
{
    type Item = Result<T, P::Error>;

    fn next(&mut self) -> Option<Self::Item> {
        Some(self.producer.generate(self.context))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (usize::MAX, None)
    }
}

impl<P, T> iter::FusedIterator for ProducerIter<'_, P, T> where P: Producer<T> + ?Sized {}

fn slug_from_title(title: &str) -> String {
    // Use iterator methods for better performance
    let mut output = String::with_capacity(title.len());
    let mut prev_dash = false;

    for ch in title.chars().map(|ch| ch.to_ascii_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            output.push('-');
            prev_dash = true;
        } else {
            // Skip non-alphanumeric characters that would create consecutive dashes
        }
    }

    output.trim_matches('-').to_owned()
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

    use super::*;
    use crate::seeding::context::{Provenance, RunId, ShardId, StageId};

    pub(crate) fn assert_producer_is_deterministic<P, T>(make_producer: impl Fn() -> P + Sync)
    where
        P: Producer<T> + Sized,
        T: serde::Serialize,
    {
        let run_id = RunId::new(rand::random());
        let num_shards = 10;
        let per_shard = 1000;

        // --- Run 1: parallel over shards ---
        let run_1: Vec<_> = (0..num_shards)
            .into_par_iter()
            .flat_map(|sid| {
                let context = ProduceContext {
                    run_id,
                    stage_id: StageId::new(0),
                    shard_id: ShardId::new(sid),
                    provenance: Provenance::Integration,
                    producer: P::ID,
                };

                make_producer()
                    .iter_mut(context)
                    .take(per_shard)
                    .filter_map(|data_type| serde_json::to_value(data_type.ok()?).ok())
                    .collect::<Vec<_>>()
            })
            .collect();

        // --- Run 2: sequential over shards ---
        let run_2: Vec<_> = (0..(num_shards))
            .flat_map(|sid| {
                let context = ProduceContext {
                    run_id,
                    stage_id: StageId::new(0),
                    shard_id: ShardId::new(sid),
                    provenance: Provenance::Integration,
                    producer: P::ID,
                };

                make_producer()
                    .iter_mut(context)
                    .take(per_shard)
                    .filter_map(|data_type| serde_json::to_value(data_type.ok()?).ok())
                    .collect::<Vec<_>>()
            })
            .collect();

        assert_eq!(run_1, run_2);
    }
}
