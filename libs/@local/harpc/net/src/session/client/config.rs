use core::{num::NonZero, time::Duration};

use crate::macros::non_zero;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    pub response_delivery_deadline: Duration,

    pub per_connection_request_buffer_size: NonZero<usize>,
    pub per_connection_transaction_garbage_collect_interval: Duration,

    pub per_transaction_response_buffer_size: NonZero<usize>,
    pub per_transaction_response_byte_stream_buffer_size: NonZero<usize>,

    pub no_delay: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            response_delivery_deadline: Duration::from_millis(100),

            per_connection_request_buffer_size: non_zero!(16),
            per_connection_transaction_garbage_collect_interval: Duration::from_secs(10),

            per_transaction_response_buffer_size: non_zero!(16),
            per_transaction_response_byte_stream_buffer_size: non_zero!(32),

            no_delay: false,
        }
    }
}
