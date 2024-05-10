use core::num::NonZeroUsize;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub event_buffer_size: NonZeroUsize,
    pub transaction_buffer_size: usize,
    pub concurrent_connection_limit: usize,

    pub per_connection_concurrent_transaction_limit: usize,
    pub per_connection_response_buffer_size: usize,

    pub per_transaction_request_buffer_size: usize,

    pub per_transaction_request_byte_stream_buffer_size: usize,
    pub per_transaction_response_byte_stream_buffer_size: usize,

    pub no_delay: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            event_buffer_size: NonZeroUsize::new(8).expect("infallible"),
            transaction_buffer_size: 32,
            concurrent_connection_limit: 256,

            per_connection_concurrent_transaction_limit: 64,
            per_connection_response_buffer_size: 16,

            per_transaction_request_buffer_size: 16,

            per_transaction_request_byte_stream_buffer_size: 16,
            per_transaction_response_byte_stream_buffer_size: 16,

            no_delay: false,
        }
    }
}
