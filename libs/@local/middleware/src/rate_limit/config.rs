//! Configuration for the request rate limits.

use core::num::NonZeroU32;

use http::HeaderName;

static X_FORWARDED_FOR: HeaderName = HeaderName::from_static("x-forwarded-for");
static CF_CONNECTING_IP: HeaderName = HeaderName::from_static("cf-connecting-ip");

/// Whether a request over its budget is denied or served.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum RateLimitMode {
    /// Deny the request with `429 Too Many Requests`.
    Enforce,
    /// Serve the request unchanged, counting the denial in the interval report.
    #[default]
    Observe,
}

/// Where the client address of a request is read from.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum ClientIpSource {
    /// The address of the connection.
    #[default]
    ConnectInfo,
    /// The rightmost address of the last `X-Forwarded-For` header, as appended by the closest
    /// proxy.
    XForwardedFor,
    /// The last `CF-Connecting-IP` header, as written by Cloudflare.
    CfConnectingIp,
}

impl ClientIpSource {
    /// Returns the header carrying the address, or [`None`] when the connection itself does.
    #[must_use]
    pub(super) const fn header(self) -> Option<&'static HeaderName> {
        match self {
            Self::ConnectInfo => None,
            Self::XForwardedFor => Some(&X_FORWARDED_FOR),
            Self::CfConnectingIp => Some(&CF_CONNECTING_IP),
        }
    }
}

/// Configuration for the request rate limits.
///
/// The address gate takes a per-second rate, the principal budgets take per-hour rates; each
/// pairs with a burst allowance naming how many requests a fresh key may send at once.
///
/// How a deployment reads these values — command line, environment, file — is the service's own
/// layer over this struct.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Whether a request over its budget is denied or served.
    pub rate_limit_mode: RateLimitMode,

    /// Where the client address of a request is read from.
    ///
    /// A forwarded header is trustworthy only where a proxy owns the entry that is read; on
    /// traffic reaching the service directly, it lets a client pick its own budget. Reading from
    /// the connection instead keys every caller behind a proxy into one shared budget.
    pub client_ip_source: ClientIpSource,

    /// Sustained requests per second each client address may send ahead of authentication.
    ///
    /// IPv6 addresses share a budget per /64 prefix, here and for the anonymous budget.
    pub rate_limit_gate_per_second: NonZeroU32,

    /// Requests a fresh client address may send at once ahead of authentication.
    pub rate_limit_gate_burst: NonZeroU32,

    /// Sustained requests per hour each client address may send anonymously.
    pub rate_limit_anonymous_per_hour: NonZeroU32,

    /// Requests a fresh client address may send anonymously at once.
    pub rate_limit_anonymous_burst: NonZeroU32,

    /// Sustained requests per hour each actor may send, counted across all its source addresses.
    pub rate_limit_actor_per_hour: NonZeroU32,

    /// Requests a fresh actor may send at once.
    pub rate_limit_actor_burst: NonZeroU32,
}
