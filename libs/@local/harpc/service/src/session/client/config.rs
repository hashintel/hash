use core::num::NonZero;

use crate::macros::non_zero;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub per_connection_request_buffer_size: NonZero<usize>,

    pub per_transaction_response_buffer_size: NonZero<usize>,
    pub per_transaction_response_byte_stream_buffer_size: NonZero<usize>,

    pub no_delay: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            per_connection_request_buffer_size: non_zero!(16),

            per_transaction_response_buffer_size: non_zero!(16),
            per_transaction_response_byte_stream_buffer_size: non_zero!(32),

            no_delay: false,
        }
    }
}
