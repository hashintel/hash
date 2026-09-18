//! CLI and environment configuration for Graph request limits.

use core::num::NonZeroU32;

use hash_middleware::rate_limit::{ClientIpSource, RateLimitMode};

/// Configuration for the request rate limits.
///
/// The address gate takes a per-second rate, the principal budgets take per-hour rates; each
/// pairs with a burst allowance naming how many requests a fresh key may send at once.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct RateLimitConfig {
    /// Whether a request over its budget is denied or served.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_RATE_LIMIT_MODE", default_value_t, value_enum)
    )]
    pub rate_limit_mode: RateLimitMode,

    /// Where the client address of a request is read from.
    ///
    /// A forwarded header is trustworthy only where a proxy owns the entry that is read; on
    /// traffic reaching the service directly, it lets a client pick its own budget. Reading from
    /// the connection instead keys every caller behind a proxy into one shared budget.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_CLIENT_IP_SOURCE", default_value_t, value_enum)
    )]
    pub client_ip_source: ClientIpSource,

    /// Sustained requests per second each client address may send ahead of authentication.
    ///
    /// IPv6 addresses share a budget per /64 prefix, here and for the anonymous budget.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_GATE_PER_SECOND",
            default_value = "10"
        )
    )]
    pub rate_limit_gate_per_second: NonZeroU32,

    /// Requests a fresh client address may send at once ahead of authentication.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_RATE_LIMIT_GATE_BURST", default_value = "50")
    )]
    pub rate_limit_gate_burst: NonZeroU32,

    /// Sustained requests per hour each client address may send anonymously.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_ANONYMOUS_PER_HOUR",
            default_value = "60"
        )
    )]
    pub rate_limit_anonymous_per_hour: NonZeroU32,

    /// Requests a fresh client address may send anonymously at once.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_ANONYMOUS_BURST",
            default_value = "50"
        )
    )]
    pub rate_limit_anonymous_burst: NonZeroU32,

    /// Sustained requests per hour each actor may send, counted across all its source addresses.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_ACTOR_PER_HOUR",
            default_value = "6000"
        )
    )]
    pub rate_limit_actor_per_hour: NonZeroU32,

    /// Requests a fresh actor may send at once.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_RATE_LIMIT_ACTOR_BURST", default_value = "100")
    )]
    pub rate_limit_actor_burst: NonZeroU32,
}

impl From<&RateLimitConfig> for hash_middleware::rate_limit::RateLimitConfig {
    fn from(config: &RateLimitConfig) -> Self {
        let &RateLimitConfig {
            rate_limit_mode,
            client_ip_source,
            rate_limit_gate_per_second,
            rate_limit_gate_burst,
            rate_limit_anonymous_per_hour,
            rate_limit_anonymous_burst,
            rate_limit_actor_per_hour,
            rate_limit_actor_burst,
        } = config;
        Self {
            rate_limit_mode,
            client_ip_source,
            rate_limit_gate_per_second,
            rate_limit_gate_burst,
            rate_limit_anonymous_per_hour,
            rate_limit_anonymous_burst,
            rate_limit_actor_per_hour,
            rate_limit_actor_burst,
        }
    }
}

#[cfg(test)]
mod tests {
    use core::num::NonZeroU32;

    use super::{ClientIpSource, RateLimitConfig, RateLimitMode};

    fn non_zero(value: u32) -> NonZeroU32 {
        NonZeroU32::new(value).expect("the value should be non-zero")
    }

    /// Converts a configuration whose fields all differ, so a swapped field cannot hide.
    #[test]
    fn conversion_maps_every_field_to_its_namesake() {
        let converted = hash_middleware::rate_limit::RateLimitConfig::from(&RateLimitConfig {
            rate_limit_mode: RateLimitMode::Enforce,
            client_ip_source: ClientIpSource::CfConnectingIp,
            rate_limit_gate_per_second: non_zero(11),
            rate_limit_gate_burst: non_zero(12),
            rate_limit_anonymous_per_hour: non_zero(13),
            rate_limit_anonymous_burst: non_zero(14),
            rate_limit_actor_per_hour: non_zero(15),
            rate_limit_actor_burst: non_zero(16),
        });

        assert_eq!(converted.rate_limit_mode, RateLimitMode::Enforce);
        assert_eq!(converted.client_ip_source, ClientIpSource::CfConnectingIp);
        assert_eq!(converted.rate_limit_gate_per_second, non_zero(11));
        assert_eq!(converted.rate_limit_gate_burst, non_zero(12));
        assert_eq!(converted.rate_limit_anonymous_per_hour, non_zero(13));
        assert_eq!(converted.rate_limit_anonymous_burst, non_zero(14));
        assert_eq!(converted.rate_limit_actor_per_hour, non_zero(15));
        assert_eq!(converted.rate_limit_actor_burst, non_zero(16));
    }
}
