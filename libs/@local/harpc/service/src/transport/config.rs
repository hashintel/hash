use core::{num::NonZero, time::Duration};

use libp2p::{
    core::upgrade,
    ping, swarm,
    yamux::{self, WindowUpdateMode},
};

use crate::macros::non_zero;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct YamuxConfig {
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

#[derive(Debug, Clone, Default)]
pub struct SwarmConfig {
    pub notify_handler_buffer_size: Option<NonZero<usize>>,
    pub per_connection_event_buffer_size: Option<usize>,
    pub dial_concurrency_factor: Option<NonZero<u8>>,
    pub substream_upgrade_protocol_override: Option<upgrade::Version>,
    pub max_negotiating_inbound_streams: Option<usize>,
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

pub struct TransportConfig {
    pub ping: ping::Config,
    pub swarm: SwarmConfig,
    pub yamux: YamuxConfig,
    pub ipc_buffer_size: NonZero<usize>,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            ping: ping::Config::default(),
            swarm: SwarmConfig::default(),
            yamux: YamuxConfig::default(),
            ipc_buffer_size: non_zero!(16),
        }
    }
}
