use alloc::sync::Arc;
use core::time::Duration;

use harpc_wire_protocol::request::id::RequestId;
use scc::HashIndex;
use tokio::select;
use tokio_util::sync::CancellationToken;

pub(crate) trait Cancellable {
    fn is_cancelled(&self) -> bool;
}

pub(crate) struct ConnectionGarbageCollectorTask<C> {
    pub(crate) every: Duration,
    pub(crate) index: Arc<HashIndex<RequestId, C>>,
}

impl<C> ConnectionGarbageCollectorTask<C>
where
    C: Cancellable + Clone + Send + Sync + 'static,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    pub(crate) async fn run(self, cancel: CancellationToken) {
        let mut interval = tokio::time::interval(self.every);

        loop {
            select! {
                _ = interval.tick() => {}
                () = cancel.cancelled() => break,
            }

            tracing::debug!("running garbage collector");

            let mut removed = 0_usize;
            self.index
                .retain_async(|_, value| {
                    if value.is_cancelled() {
                        removed += 1;
                        false
                    } else {
                        true
                    }
                })
                .await;

            if removed > 0 {
                // this should never really happen, but it's good to know if it does
                tracing::info!(removed, "garbage collector removed stale transactions");
            }
        }
    }
}
