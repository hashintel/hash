use core::{future::Future, num::NonZero};

use error_stack::Report;
use time::UtcDateTime;

use crate::BucketScope;

/// Reports that a coordination store is unavailable. Callers fall back to a local bucket, since
/// throttling only protects the Graph.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("the coordination store is unavailable")]
pub struct CoordinationError;

/// The rate and burst of a token bucket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TokenBucket {
    pub rate_per_second: NonZero<u32>,
    pub capacity: NonZero<u32>,
}

/// Token buckets shared by every process of a backend, for the shared Graph rate limit.
pub trait CoordinationStore: Send + Sync {
    /// Refills the bucket of `scope` to `now` at the bucket's rate, up to its capacity, takes
    /// `ops` tokens, and returns the remaining balance.
    ///
    /// The balance can go negative: the caller has reserved the tokens and waits
    /// `-balance / rate_per_second` seconds before using them. A new bucket starts full.
    /// Concurrent calls on the same scope are applied one after another.
    ///
    /// # Errors
    ///
    /// Returns [`CoordinationError`] if the store is unavailable.
    fn consume(
        &self,
        scope: &BucketScope,
        bucket: TokenBucket,
        ops: u32,
        now: UtcDateTime,
    ) -> impl Future<Output = Result<f64, Report<CoordinationError>>> + Send;
}
