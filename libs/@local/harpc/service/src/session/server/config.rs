#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub transaction_buffer_size: usize,
    pub concurrent_connection_limit: usize,

    pub per_connection_concurrent_transaction_limit: usize,
    pub per_connection_response_buffer_size: usize,

    pub per_transaction_request_buffer_size: usize,

    pub per_transaction_request_bytes_buffer_size: usize,
    pub per_transaction_response_bytes_buffer_size: usize,

    pub no_delay: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            transaction_buffer_size: 32,
            concurrent_connection_limit: 256,

            per_connection_concurrent_transaction_limit: 64,
            per_connection_response_buffer_size: 16,

            per_transaction_request_buffer_size: 16,

            per_transaction_request_bytes_buffer_size: 16,
            per_transaction_response_bytes_buffer_size: 16,

            no_delay: false,
        }
    }
}
