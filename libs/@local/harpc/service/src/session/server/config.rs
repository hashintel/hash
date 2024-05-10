use core::{num::NonZero, time::Duration};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub event_buffer_size: NonZero<usize>,
    pub transaction_buffer_size: NonZero<usize>,
    pub concurrent_connection_limit: usize,

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
            concurrent_connection_limit: 256,

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
