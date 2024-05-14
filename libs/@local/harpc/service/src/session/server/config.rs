use core::{num::NonZero, time::Duration};

use tokio::sync::Semaphore;

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
            event_buffer_size: NonZero::new(8).expect("infallible"),
            transaction_buffer_size: NonZero::new(32).expect("infallible"),
            concurrent_connection_limit: ConcurrentConnectionLimit::new(256).expect("infallible"),

            request_delivery_deadline: Duration::from_millis(100),
            transaction_delivery_deadline: Duration::from_millis(100),

            per_connection_concurrent_transaction_limit: 64,
            per_connection_response_buffer_size: NonZero::new(16).expect("infallible"),
            per_connection_transaction_garbage_collect_interval: Duration::from_secs(10),

            per_transaction_request_buffer_size: NonZero::new(16).expect("infallible"),

            per_transaction_request_byte_stream_buffer_size: NonZero::new(16).expect("infallible"),
            per_transaction_response_byte_stream_buffer_size: NonZero::new(16).expect("infallible"),

            no_delay: false,
        }
    }
}
