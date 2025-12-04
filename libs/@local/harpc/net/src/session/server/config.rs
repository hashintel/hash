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

/// Configuration for the server session layer.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionConfig {
    /// Size of the event buffer. If the buffer is full, old events will be discarded.
    /// These messages are not critical for the operation of the session layer but signal
    /// events to the user.
    ///
    /// **Default:** `8`.
    pub event_buffer_size: NonZero<usize>,

    /// Size of the transaction buffer. If the buffer is full, new transactions will be
    /// discarded if the buffer hasn't made space within [`Self::transaction_delivery_deadline`].
    ///
    /// While tangentially related the number of concurrent transactions is not directly tied to
    /// this value, it only means that `n` unhandled transactions can be buffered at a time, not
    /// how many transactions are in flight.
    /// The total number of maximum transactions in flight is `concurrent_connection_limit *
    /// per_connection_concurrent_transaction_limit`.
    ///
    /// **Default:** `32`.
    pub transaction_buffer_size: NonZero<usize>,

    /// Maximum number of concurrent connections the server will allow. New connections
    /// will be rejected once this limit is reached.
    ///
    /// **Default:** `256`.
    ///
    /// Default maximum number of in flight transactions is `256 * 64 = 16384`.
    pub concurrent_connection_limit: ConcurrentConnectionLimit,

    /// Linger time for connection shutdown.
    ///
    /// After all existing connections are closed and the stream is closed, this is the
    /// duration the server will remain open to allow remaining packets in transit to be delivered.
    ///
    /// A duration of 0 will immediately stop the server after all connections are closed,
    /// likely resulting in lost packets still in transit.
    ///
    /// This is different from [`SwarmConfig::idle_connection_timeout`], which specifies the
    /// duration a connection will remain alive while idle, not the time the server will remain
    /// active once shutdown.
    ///
    /// [`SwarmConfig::idle_connection_timeout`]: crate::transport::SwarmConfig::idle_connection_timeout
    ///
    /// **Default:** `250ms`.
    pub connection_shutdown_linger: Duration,

    /// Time limit for a request to be delivered to a transaction when the transaction buffer is
    /// full. If the deadline is exceeded, the transaction will be dropped and an error
    /// response will be sent to the client.
    ///
    /// Note that during this wait, the connection cannot make any progress, potentially blocking
    /// other transactions.
    ///
    /// **Default:** `100ms`.
    pub request_delivery_deadline: Duration,

    /// Time limit for a transaction to be delivered to a connection when the session buffer is
    /// full. If the deadline is exceeded, the transaction will be dropped and an error
    /// response will be sent to the client.
    ///
    /// Note that during this wait, the connection cannot make any progress, potentially blocking
    /// other transactions.
    ///
    /// **Default:** `100ms`.
    pub transaction_delivery_deadline: Duration,

    /// Maximum number of concurrent transactions a connection can have. New transactions will
    /// be rejected once this limit is reached.
    ///
    /// **Default:** `64`.
    pub per_connection_concurrent_transaction_limit: usize,

    /// Maximum number of responses to be buffered before delivery to a transaction.
    /// If the buffer is full, the connection will stall, halting progress. Increasing this value
    /// can enhance throughput and memory usage, as tasks do not need to wake up as often.
    ///
    /// **Default:** `16`.
    pub per_connection_response_buffer_size: NonZero<usize>,

    /// Interval at which the transaction garbage collector will run.
    /// This will remove any transactions in a zombie state (i.e., completed but not removed).
    /// This is a safety measure to prevent memory leaks and should not typically occur.
    ///
    /// **Default:** `10s`.
    pub per_connection_transaction_garbage_collect_interval: Duration,

    /// Size of the request buffer for a transaction. If the buffer is full, the transaction
    /// will wait until [`Self::request_delivery_deadline`] for space to become available. If
    /// space does not become available, the transaction will be cancelled, and an error will be
    /// reported to the client.
    ///
    /// **Default:** `16`.
    pub per_transaction_request_buffer_size: NonZero<usize>,

    /// Size of the response buffer for a transaction. Increasing this might increase throughput,
    /// as tasks do not need to wake up as often to deliver the messages, but might increase
    /// latency due to buffering.
    ///
    /// This deals with the payload data of a packet, not a byte count. The maximum total memory
    /// usage per transaction is:
    /// `(per_transaction_request_buffer_size + per_transaction_response_byte_stream_buffer_size) *
    /// 64KiB`.
    ///
    /// **Default:** `16`.
    ///
    /// The default maximum memory usage per transaction is `16 + 16 = 32 * 64KiB = 2MiB`.
    pub per_transaction_response_byte_stream_buffer_size: NonZero<usize>,

    /// Enable or disable `no_delay` on the underlying stream.
    /// Enabling `no_delay` sends stream items immediately, reducing latency but potentially
    /// decreasing throughput due to higher per-packet overhead.
    /// Disabling `no_delay` minimizes packet overhead but may increase latency due to buffering.
    ///
    /// **Default:** `false`.
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

            per_transaction_response_byte_stream_buffer_size: non_zero!(16),

            no_delay: false,
        }
    }
}
