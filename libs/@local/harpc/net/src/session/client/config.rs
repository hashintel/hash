use core::{num::NonZero, time::Duration};

use crate::macros::non_zero;

/// Configuration for the client session layer.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    /// Time limit for delivering a received response to the output stream of a call.
    /// If this limit is exceeded (the stream buffer is full and no progress has been made on the
    /// output stream), the call will be closed.
    ///
    /// **Default:** `100ms`.
    pub response_delivery_deadline: Duration,

    /// Maximum number of request packets that can be buffered before sending, per connection.
    /// Increasing this value can enhance throughput (as tasks are not switched immediately after
    /// sending a single packet), but it also raises memory usage and potentially increases
    /// latency. In some environments, this might mean that the task for sending a request to the
    /// server is not immediately awakened.
    ///
    /// **Default:** `16`.
    pub per_connection_request_buffer_size: NonZero<usize>,

    /// Interval for performing transaction garbage collection on a connection.
    /// A transaction is garbage collected only when it reaches a "zombie" state (i.e., it has been
    /// completed but wasn't removed). This is a safety measure and should not typically occur.
    ///
    /// **Default:** `10s`.
    pub per_connection_transaction_garbage_collect_interval: Duration,

    /// Maximum number of response packets that can be buffered before being delivered to the
    /// output stream of a call. Increasing this value can enhance throughput but also
    /// increases memory usage.
    ///
    /// **Default:** `16`.
    pub per_transaction_response_buffer_size: NonZero<usize>,

    /// Maximum number of response byte packets that can be buffered before being delivered to the
    /// output stream of a call. Increasing this value can enhance throughput but also increases
    /// memory usage.
    ///
    /// This buffer is in addition to `per_transaction_response_buffer_size`. The total buffering
    /// amount per transaction is the sum of `per_transaction_response_buffer_size` and
    /// `per_transaction_response_byte_stream_buffer_size`. In the worst case, this total can
    /// be: `(per_transaction_response_buffer_size +
    /// per_transaction_response_byte_stream_buffer_size) * 64KiB`.
    ///
    /// **Default:** `32`.
    ///
    /// The default maximum memory usage per transaction is `16 + 32 = 48 * 64KiB = 3MiB`.
    pub per_transaction_response_byte_stream_buffer_size: NonZero<usize>,

    /// Enable or disable `no_delay` on the underlying stream.
    /// Enabling `no_delay` sends stream items immediately, which can reduce latency but may
    /// decrease throughput due to higher per-packet overhead.
    /// Disabling `no_delay` minimizes packet overhead but can increase latency due to buffering.
    ///
    /// **Default:** `false`.
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
