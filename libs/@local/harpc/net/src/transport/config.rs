use core::{num::NonZero, time::Duration};

use libp2p::{
    core::upgrade,
    ping, swarm,
    yamux::{self, WindowUpdateMode},
};

use crate::macros::non_zero;

/// The configuration for outbound pings.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PingConfig {
    /// The timeout of an outbound ping.
    pub timeout: Duration,
    /// The duration between outbound pings.
    pub interval: Duration,
}

impl From<PingConfig> for ping::Config {
    fn from(value: PingConfig) -> Self {
        Self::new()
            .with_timeout(value.timeout)
            .with_interval(value.interval)
    }
}

impl Default for PingConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(20),
            interval: Duration::from_secs(15),
        }
    }
}

/// Configuration for the Yamux multiplexer protocol.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct YamuxConfig {
    /// Maximum buffer size for the Yamux protocol, in bytes.
    ///
    /// **Default:** `16 * 1024 * 1024` (16 MiB).
    pub max_buffer_size: usize,
}

impl From<YamuxConfig> for yamux::Config {
    #[expect(
        deprecated,
        reason = "yamux 0.13 leads to deadlocks, see: https://github.com/libp2p/rust-libp2p/issues/5410"
    )]
    fn from(value: YamuxConfig) -> Self {
        let mut this = Self::default();

        this.set_window_update_mode(WindowUpdateMode::on_receive())
            .set_max_buffer_size(value.max_buffer_size);

        this
    }
}

impl Default for YamuxConfig {
    fn default() -> Self {
        Self {
            max_buffer_size: 16 * 1024 * 1024, // 16 MiB
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct SwarmConfig {
    /// Configures the number of events from the [`NetworkBehaviour`] in
    /// destination to the [`ConnectionHandler`] that can be buffered before
    /// the [`Swarm`] has to wait. An individual buffer with this number of
    /// events exists for each individual connection.
    ///
    /// The ideal value depends on the executor used, the CPU speed, and the
    /// volume of events. If this value is too low, then the [`Swarm`] will
    /// be sleeping more often than necessary. Increasing this value increases
    /// the overall memory usage.
    ///
    /// **Default:** `32`.
    ///
    /// [`NetworkBehaviour`]: libp2p::swarm::NetworkBehaviour
    /// [`ConnectionHandler`]: libp2p::swarm::ConnectionHandler
    /// [`Swarm`]: libp2p::swarm::Swarm
    pub notify_handler_buffer_size: Option<NonZero<usize>>,

    /// Configures the size of the buffer for events sent by a [`ConnectionHandler`] to the
    /// [`NetworkBehaviour`].
    ///
    /// Each connection has its own buffer.
    ///
    /// The ideal value depends on the executor used, the CPU speed and the volume of events.
    /// If this value is too low, then the [`ConnectionHandler`]s will be sleeping more often
    /// than necessary. Increasing this value increases the overall memory
    /// usage, and more importantly the latency between the moment when an
    /// event is emitted and the moment when it is received by the
    /// [`NetworkBehaviour`].
    ///
    /// Each connection has a guaranteed buffer of one event per connection.
    ///
    /// **Default:** `7`.
    ///
    /// [`ConnectionHandler`]: libp2p::swarm::ConnectionHandler
    /// [`NetworkBehaviour`]: libp2p::swarm::NetworkBehaviour
    pub per_connection_event_buffer_size: Option<usize>,

    /// Number of addresses concurrently dialed for a single outbound connection attempt.
    ///
    /// **Default:** `8`.
    pub dial_concurrency_factor: Option<NonZero<u8>>,

    /// Configures an override for the substream upgrade protocol to use.
    ///
    /// The subtream upgrade protocol is the multistream-select protocol
    /// used for protocol negotiation on substreams. Since a listener
    /// supports all existing versions, the choice of upgrade protocol
    /// only effects the "dialer", i.e. the peer opening a substream.
    ///
    /// > **Note**: If configured, specific upgrade protocols for
    /// > individual [`SubstreamProtocol`]s emitted by the `NetworkBehaviour`
    /// > are ignored.
    ///
    /// **Default:** `None`.
    ///
    /// [`SubstreamProtocol`]: libp2p::swarm::SubstreamProtocol
    pub substream_upgrade_protocol_override: Option<upgrade::Version>,

    /// The maximum number of inbound streams concurrently negotiating on a
    /// connection. New inbound streams exceeding the limit are dropped and thus
    /// reset.
    ///
    /// Note: This only enforces a limit on the number of concurrently
    /// negotiating inbound streams. The total number of inbound streams on a
    /// connection is the sum of negotiating and negotiated streams. A limit on
    /// the total number of streams can be enforced at the
    /// [`StreamMuxerBox`] level.
    ///
    /// **Default:** `128`.
    ///
    /// [`StreamMuxerBox`]: libp2p::core::muxing::StreamMuxerBox
    pub max_negotiating_inbound_streams: Option<usize>,

    /// How long to keep a connection alive once it is idling.
    ///
    /// **Default:** `32s`.
    pub idle_connection_timeout: Option<Duration>,
}

impl SwarmConfig {
    pub(crate) fn apply(self, mut config: swarm::Config) -> swarm::Config {
        let Self {
            notify_handler_buffer_size,
            per_connection_event_buffer_size,
            dial_concurrency_factor,
            substream_upgrade_protocol_override,
            max_negotiating_inbound_streams,
            idle_connection_timeout,
        } = self;

        if let Some(notify_handler_buffer_size) = notify_handler_buffer_size {
            config = config.with_notify_handler_buffer_size(notify_handler_buffer_size);
        }

        if let Some(per_connection_event_buffer_size) = per_connection_event_buffer_size {
            config = config.with_per_connection_event_buffer_size(per_connection_event_buffer_size);
        }

        if let Some(dial_concurrency_factor) = dial_concurrency_factor {
            config = config.with_dial_concurrency_factor(dial_concurrency_factor);
        }

        if let Some(substream_upgrade_protocol_override) = substream_upgrade_protocol_override {
            config = config
                .with_substream_upgrade_protocol_override(substream_upgrade_protocol_override);
        }

        if let Some(max_negotiating_inbound_streams) = max_negotiating_inbound_streams {
            config = config.with_max_negotiating_inbound_streams(max_negotiating_inbound_streams);
        }

        if let Some(idle_connection_timeout) = idle_connection_timeout {
            config = config.with_idle_connection_timeout(idle_connection_timeout);
        } else {
            // See: https://github.com/libp2p/rust-libp2p/issues/5060
            config = config.with_idle_connection_timeout(Duration::from_secs(32));
        }

        config
    }
}

/// Configuration for the transport layer.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TransportConfig {
    /// Configuration for the ping protocol.
    pub ping: PingConfig,

    /// Configuration for the swarm.
    pub swarm: SwarmConfig,

    /// Configuration for the yamux protocol.
    pub yamux: YamuxConfig,

    /// Size of the buffer for IPC (Inter-Process Communication) messages to the transport task
    /// driving the swarm.
    ///
    /// **Default:** `16`.
    pub ipc_buffer_size: NonZero<usize>,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            ping: PingConfig::default(),
            swarm: SwarmConfig::default(),
            yamux: YamuxConfig::default(),
            ipc_buffer_size: non_zero!(16),
        }
    }
}
