//! Stateful producers for higher-level seeding outputs.
//!
//! Producers orchestrate multiple [`Distribution`] building blocks to produce valid, domain-level
//! objects while enforcing cross-field invariants and managing state such as deduplication maps or
//! counters. Unlike plain distributions, producers are intentionally stateful and expose a
//! pull-based API via [`Producer::generate`] with a [`ProduceContext`], plus a convenience iterator
//! adapter via [`ProducerExt::iter_mut`].
//!
//! Design principles:
//! - Deterministic: callers pass a [`ProduceContext`], which derives per-sample RNG streams from
//!   the `master_seed`, [`ShardId`], [`LocalId`], and [`Scope`]. Identical inputs yield identical
//!   sequences.
//! - Separation of concerns: small, stateless distributions sample primitive values; producers
//!   compose them into complete objects and ensure invariants.
//! - Ergonomics: provide an iterator adapter for streaming generation in tests and benchmarks.
//!
//! [`ShardId`]: crate::seeding::context::ShardId

use core::{iter, marker::PhantomData};

use error_stack::IntoReport;
use rand::distr::Distribution;

use super::context::ProduceContext;
use crate::seeding::context::{LocalId, Scope};

pub mod data_type;

/// Stateful producer of complex values composed from one or more distributions.
///
/// Producers keep internal state (for example, deduplication maps, counters, or caches) and are
/// responsible for enforcing invariants across fields or across multiple produced objects. They are
/// deterministic when driven by a caller-supplied [`ProduceContext`].
///
/// Do not implement [`Distribution`] for producers. That trait is stateless and returns plain
/// values by reference (`&self`), while producers require `&mut self` and often need to return
/// `Result<T, E>` to report build errors (e.g., invalid URLs or schema issues).
pub trait Producer<T> {
    type Error: IntoReport;

    /// Produce the next value using the provided RNG.
    ///
    /// # Errors
    ///
    /// Returns an error when a value cannot be produced while respecting the implementor's
    /// invariants, for example due to invalid identifiers, URL construction failures, schema
    /// violations, or exhausted retries during deduplication.
    fn generate(&mut self, context: &ProduceContext) -> Result<T, Self::Error>;
}

pub trait ProducerExt<T>: Producer<T> {
    fn iter_mut<'c>(&mut self, context: &'c ProduceContext) -> ProducerIter<'_, 'c, Self, T>
    where
        Self: Sized;
}

impl<P, T> ProducerExt<T> for P
where
    P: Producer<T> + Sized,
{
    fn iter_mut<'c>(&mut self, context: &'c ProduceContext) -> ProducerIter<'_, 'c, Self, T> {
        ProducerIter {
            producer: self,
            context,
            _marker: PhantomData,
        }
    }
}

#[derive(Debug)]
pub struct ProducerIter<'p, 'c, P: ?Sized, T> {
    producer: &'p mut P,
    context: &'c ProduceContext,
    _marker: PhantomData<fn() -> T>,
}

impl<P, T> Iterator for ProducerIter<'_, '_, P, T>
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

impl<P, T> iter::FusedIterator for ProducerIter<'_, '_, P, T> where P: Producer<T> + ?Sized {}

pub fn for_distribution<T, D>(distribution: D) -> impl Producer<T, Error = !>
where
    D: Distribution<T>,
{
    struct DistributionProducer<D> {
        distribution: D,
        local_id: LocalId,
    }

    impl<T, D> Producer<T> for DistributionProducer<D>
    where
        D: Distribution<T>,
    {
        type Error = !;

        fn generate(&mut self, context: &ProduceContext) -> Result<T, Self::Error> {
            Ok(self.distribution.sample(&mut context.rng(
                context.global_id(self.local_id.take_and_advance()),
                Scope::Domain,
            )))
        }
    }

    DistributionProducer {
        distribution,
        local_id: LocalId::default(),
    }
}

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
