//! [`CoordinationStore`] as a Restate object: one `TokenBucket` per scope, with the bucket as its
//! state.
//!
//! Restate executes the calls on one scope one after the other and keeps the object's state, so a
//! bucket needs no table and no lock. A worker serves the object next to the run object.

use alloc::format;
use core::time::Duration;

use error_stack::{Report, ResultExt as _};
use restate_sdk::prelude::{
    ContextReadState as _, ContextWriteState as _, Json, ObjectContext, TerminalError,
};
use serde::{Deserialize, Serialize};
use time::UtcDateTime;

use super::{RestateBackend, path_segment};
use crate::{BucketScope, CoordinationError, CoordinationStore, TokenBucket};

/// The state key under which a bucket keeps its balance and when it was last refilled.
const BUCKET: &str = "bucket";

/// How long a consume waits for a worker to answer, before the store counts as unavailable.
const CONSUME_TIMEOUT: Duration = Duration::from_secs(5);

/// One call of [`CoordinationStore::consume`]. `now` is in seconds since the Unix epoch.
#[derive(Serialize, Deserialize)]
struct Consume {
    capacity: f64,
    rate_per_second: f64,
    ops: f64,
    now: f64,
}

pub(crate) struct TokenBuckets;

#[restate_sdk::object(name = "TokenBucket")]
impl TokenBuckets {
    /// Refills the bucket to `now`, takes `ops` tokens and returns the balance. A new bucket
    /// starts full.
    #[handler]
    #[expect(
        clippy::float_arithmetic,
        reason = "a bucket's balance is a fraction of a token"
    )]
    async fn consume(
        &self,
        ctx: ObjectContext<'_>,
        Json(consume): Json<Consume>,
    ) -> Result<f64, TerminalError> {
        let (tokens, refilled_at) = ctx
            .get::<Json<(f64, f64)>>(BUCKET)
            .await?
            .map_or((consume.capacity, consume.now), Json::into_inner);
        let refilled = (consume.now - refilled_at)
            .max(0.0)
            .mul_add(consume.rate_per_second, tokens);
        let balance = refilled.min(consume.capacity) - consume.ops;
        ctx.set(BUCKET, Json::from((balance, consume.now)));
        Ok(balance)
    }
}

impl CoordinationStore for RestateBackend {
    async fn consume(
        &self,
        scope: &BucketScope,
        bucket: TokenBucket,
        ops: u32,
        now: UtcDateTime,
    ) -> Result<f64, Report<CoordinationError>> {
        self.http
            .post(format!(
                "{}/restate/call/TokenBucket/{}/consume",
                self.config.ingress_url,
                path_segment(scope.as_ref())
            ))
            .timeout(CONSUME_TIMEOUT)
            .json(&Consume {
                capacity: f64::from(bucket.capacity.get()),
                rate_per_second: f64::from(bucket.rate_per_second.get()),
                ops: f64::from(ops),
                now: (now - UtcDateTime::UNIX_EPOCH).as_seconds_f64(),
            })
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .change_context(CoordinationError)?
            .json()
            .await
            .change_context(CoordinationError)
    }
}
