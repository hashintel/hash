//! [`CoordinationStore`] as a token bucket table in the system database.
//!
//! The backend only keeps the buckets. Spending from one before a batch of Graph writes is the
//! Graph client's job, through a limiter over [`CoordinationStore::consume`] that waits out a
//! negative balance and falls back to a local bucket when the store is unreachable.

use alloc::{format, string::String};

use error_stack::{Report, ResultExt as _};
use time::UtcDateTime;

use crate::{BucketScope, CoordinationError, CoordinationStore, TokenBucket, dbos::DbosBackend};

/// Creates the token bucket table in `schema`. One row per scope; `refilled_at` is in seconds
/// since the Unix epoch.
pub(crate) fn create_table(schema: &str) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS \"{schema}\".token_bucket (
             scope text PRIMARY KEY,
             tokens double precision NOT NULL,
             refilled_at double precision NOT NULL
         )"
    )
}

/// Refills the scope's bucket to `$4` at `$3` tokens per second, up to `$2`, takes `$5` tokens
/// and returns the balance. A new bucket starts full. The row lock serialises concurrent calls on
/// a scope.
pub(crate) fn consume(schema: &str) -> String {
    format!(
        "INSERT INTO \"{schema}\".token_bucket (scope, tokens, refilled_at)
         VALUES ($1, $2::float8 - $5::float8, $4::float8)
         ON CONFLICT (scope) DO UPDATE SET
             tokens = LEAST(
                 $2::float8,
                 token_bucket.tokens
                     + GREATEST(0, $4::float8 - token_bucket.refilled_at) * $3::float8
             ) - $5::float8,
             refilled_at = $4::float8
         RETURNING tokens"
    )
}

impl CoordinationStore for DbosBackend {
    async fn consume(
        &self,
        scope: &BucketScope,
        bucket: TokenBucket,
        ops: u32,
        now: UtcDateTime,
    ) -> Result<f64, Report<CoordinationError>> {
        let now = (now - UtcDateTime::UNIX_EPOCH).as_seconds_f64();
        let row = self
            .postgres
            .query_one(
                &self.consume,
                &[
                    &scope.as_ref(),
                    &f64::from(bucket.capacity.get()),
                    &f64::from(bucket.rate_per_second.get()),
                    &now,
                    &f64::from(ops),
                ],
            )
            .await
            .change_context(CoordinationError)?;
        Ok(row.get(0))
    }
}
