use core::num::NonZeroUsize;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub event_buffer_size: NonZeroUsize,
    pub transaction_buffer_size: NonZeroUsize,
    pub concurrent_connection_limit: usize,

    pub per_connection_concurrent_transaction_limit: usize,
    pub per_connection_response_buffer_size: NonZeroUsize,

    pub per_transaction_request_buffer_size: NonZeroUsize,

    pub per_transaction_request_byte_stream_buffer_size: NonZeroUsize,
    pub per_transaction_response_byte_stream_buffer_size: NonZeroUsize,

    pub no_delay: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            event_buffer_size: NonZeroUsize::new(8).expect("infallible"),
            transaction_buffer_size: NonZeroUsize::new(32).expect("infallible"),
            concurrent_connection_limit: 256,

            per_connection_concurrent_transaction_limit: 64,
            per_connection_response_buffer_size: NonZeroUsize::new(16).expect("infallible"),

            per_transaction_request_buffer_size: NonZeroUsize::new(16).expect("infallible"),

            per_transaction_request_byte_stream_buffer_size: NonZeroUsize::new(16)
                .expect("infallible"),
            per_transaction_response_byte_stream_buffer_size: NonZeroUsize::new(16)
                .expect("infallible"),

            no_delay: false,
        }
    }
}
