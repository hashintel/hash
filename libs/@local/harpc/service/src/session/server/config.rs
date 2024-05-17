use core::{num::NonZero, time::Duration};

use tokio::sync::Semaphore;

use crate::macros::non_zero;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ConcurrentConnectionLimit(u32);

impl ConcurrentConnectionLimit {
    pub fn new(value: u32) -> Option<Self> {
        if value == 0 {
            return None;
        }

        let value_usize = usize::try_from(value).ok()?;

        if value_usize > Semaphore::MAX_PERMITS {
            return None;
        }

        Some(Self(value))
    }

    #[must_use]
    pub const fn as_u32(self) -> u32 {
        self.0
    }

    #[must_use]
    pub const fn as_usize(self) -> usize {
        self.0 as usize
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub event_buffer_size: NonZero<usize>,
    pub transaction_buffer_size: NonZero<usize>,
    pub concurrent_connection_limit: ConcurrentConnectionLimit,

    /// The linger time for the connection shutdown.
    ///
    /// Once all existing connections have been closed (and the stream has been closed), this is
    /// the amount of time the server will stay open to allow for any remaining packages in
    /// transit to be delivered.
    ///
    /// A duration of 0 will immediately stop the swarm after all connections have been closed and
    /// will likely result in lost packages still in transit.
    ///
    /// This is different from the swarm [`SwarmConfig::idle_connection_timeout`], which is the
    /// time the swarm will keep alive a connection, instead of the time the swarm will remain
    /// active once shutdown.
    ///
    /// [`SwarmConfig`]: crate::transport::config::SwarmConfig
    pub connection_shutdown_linger: Duration,

    pub request_delivery_deadline: Duration,
    pub transaction_delivery_deadline: Duration,

    pub per_connection_concurrent_transaction_limit: usize,
    pub per_connection_response_buffer_size: NonZero<usize>,
    pub per_connection_transaction_garbage_collect_interval: Duration,

    pub per_transaction_request_buffer_size: NonZero<usize>,

    pub per_transaction_request_byte_stream_buffer_size: NonZero<usize>,
    pub per_transaction_response_byte_stream_buffer_size: NonZero<usize>,

    pub no_delay: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            event_buffer_size: non_zero!(8),
            transaction_buffer_size: non_zero!(32),
            concurrent_connection_limit: ConcurrentConnectionLimit::new(256)
                .unwrap_or_else(|| unreachable!()),

            connection_shutdown_linger: Duration::from_millis(250),

            request_delivery_deadline: Duration::from_millis(100),
            transaction_delivery_deadline: Duration::from_millis(100),

            per_connection_concurrent_transaction_limit: 64,
            per_connection_response_buffer_size: non_zero!(16),
            per_connection_transaction_garbage_collect_interval: Duration::from_secs(10),

            per_transaction_request_buffer_size: non_zero!(16),

            per_transaction_request_byte_stream_buffer_size: non_zero!(16),
            per_transaction_response_byte_stream_buffer_size: non_zero!(16),

            no_delay: false,
        }
    }
}
