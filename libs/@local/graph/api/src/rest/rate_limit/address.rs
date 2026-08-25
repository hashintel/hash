//! Resolving the client address a request is budgeted against.

use core::{
    fmt,
    net::{IpAddr, Ipv6Addr, SocketAddr},
};

use axum::extract::{ConnectInfo, Request};
use http::HeaderName;

/// The key an address-keyed budget is charged against.
///
/// Canonicalizes the address it wraps: a v4-mapped v6 address shares the key of the v4 address it
/// names, and every address in an IPv6 /64 shares one key. `::/64` is one such prefix, so IPv6
/// loopback shares a key with every IPv4-compatible address, and a NAT64 `64:ff9b::/96`
/// deployment puts all translated clients in one budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct BucketKey(IpAddr);

impl BucketKey {
    pub(super) fn new(address: IpAddr) -> Self {
        Self(match address.to_canonical() {
            v4 @ IpAddr::V4(_) => v4,
            IpAddr::V6(v6) => IpAddr::V6(Ipv6Addr::from_bits(v6.to_bits() & !u128::from(u64::MAX))),
        })
    }
}

impl fmt::Display for BucketKey {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(fmt)
    }
}

/// The outcome of resolving a request's client address, stored as a request extension.
///
/// Visible only within `rate_limit`, so no other module can insert one: axum keys extensions by
/// type. Its presence says the gate ran.
#[derive(Debug, Clone, Copy)]
pub(super) enum ResolvedClientAddress {
    Bucketed(BucketKey),
    Unknown,
}

impl ResolvedClientAddress {
    pub(super) const fn key(self) -> Option<BucketKey> {
        match self {
            Self::Bucketed(key) => Some(key),
            Self::Unknown => None,
        }
    }
}

/// Why the configured header could not supply the address.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Fallback {
    HeaderMissing,
    HeaderNotAscii,
    Unparsable,
}

impl Fallback {
    /// Returns the reason.
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::HeaderMissing => "header_missing",
            Self::HeaderNotAscii => "header_not_ascii",
            Self::Unparsable => "unparsable",
        }
    }
}

/// Reads the client address from `header`, or names why it is unusable.
///
/// Takes the rightmost entry of the header's last instance. Under a proxy that appends, that is
/// the address the closest proxy saw and the only entry outside the client's control; under one
/// that overwrites, it is the whole value. Behind two or more appending proxies it is the address
/// the closest proxy received from, so every client behind that one shares a budget.
///
/// Accepts a bare address or an `address:port` pair.
pub(super) fn from_header(request: &Request, header: &HeaderName) -> Result<BucketKey, Fallback> {
    let Some(value) = request.headers().get_all(header).iter().next_back() else {
        return Err(Fallback::HeaderMissing);
    };
    let value = value.to_str().map_err(|_error| Fallback::HeaderNotAscii)?;
    let last = value.rsplit_once(',').map_or(value, |(_, last)| last);
    parse(last.trim()).ok_or(Fallback::Unparsable)
}

/// Returns the address of the connection the request arrived on.
///
/// [`None`] when the router was served without [`ConnectInfo`], which leaves nothing to key a
/// budget by.
pub(super) fn peer(request: &Request) -> Option<BucketKey> {
    request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(address)| BucketKey::new(address.ip()))
}

fn parse(address: &str) -> Option<BucketKey> {
    address
        .parse::<IpAddr>()
        .or_else(|_error| address.parse::<SocketAddr>().map(|address| address.ip()))
        .ok()
        .map(BucketKey::new)
}

#[cfg(test)]
mod tests {
    use core::net::{IpAddr, Ipv4Addr, SocketAddr};

    use axum::{body::Body, extract::ConnectInfo};
    use http::{HeaderName, HeaderValue, Request};

    use super::{BucketKey, Fallback, from_header, parse, peer};
    use crate::rest::rate_limit::config::ClientIpSource;

    fn key(address: &str) -> BucketKey {
        BucketKey::new(address.parse().expect("the address should parse"))
    }

    fn forwarded_for() -> &'static HeaderName {
        ClientIpSource::XForwardedFor
            .header()
            .expect("the source should name a header")
    }

    fn request(peer: IpAddr) -> Request<Body> {
        let mut request = Request::builder()
            .uri("/entities")
            .body(Body::empty())
            .expect("the request should build");
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::new(peer, 4000)));
        request
    }

    fn with_header(name: &'static str, values: &[&str]) -> Request<Body> {
        let mut request = request(IpAddr::V4(Ipv4Addr::LOCALHOST));
        for value in values {
            request
                .headers_mut()
                .append(name, value.parse().expect("the header should parse"));
        }
        request
    }

    #[test]
    fn ipv6_addresses_in_one_prefix_share_a_key() {
        assert_eq!(
            key("2001:db8:1:2:aaaa::1"),
            key("2001:db8:1:2:bbbb::2"),
            "a /64 is one allocation, so it should hold one budget"
        );
        assert_ne!(
            key("2001:db8:1:2::1"),
            key("2001:db8:1:3::1"),
            "the mask should keep the /64 prefix, not a shorter one"
        );
    }

    #[test]
    fn ipv4_addresses_keep_their_own_keys() {
        assert_ne!(key("192.0.2.1"), key("192.0.2.2"));
        assert_eq!(
            key("::ffff:192.0.2.1"),
            key("192.0.2.1"),
            "a v4-mapped v6 address should not open a second budget for one client"
        );
    }

    #[test]
    fn x_forwarded_for_reads_the_rightmost_entry_of_the_last_instance() {
        let request = with_header(
            "x-forwarded-for",
            &["203.0.113.9", "192.0.2.1, 198.51.100.7"],
        );

        assert_eq!(
            from_header(&request, forwarded_for()),
            Ok(key("198.51.100.7")),
            "only the entry the closest proxy appended is outside the client's control"
        );
    }

    #[test]
    fn cf_connecting_ip_reads_the_last_instance() {
        let request = with_header("cf-connecting-ip", &["192.0.2.1", "203.0.113.9"]);

        assert_eq!(
            from_header(
                &request,
                ClientIpSource::CfConnectingIp
                    .header()
                    .expect("the source should name a header")
            ),
            Ok(key("203.0.113.9")),
            "the last instance is the one the closest proxy wrote"
        );
    }

    #[test]
    fn unusable_headers_name_their_reason() {
        assert_eq!(
            from_header(&request(IpAddr::V4(Ipv4Addr::LOCALHOST)), forwarded_for()),
            Err(Fallback::HeaderMissing)
        );
        assert_eq!(
            from_header(
                &with_header("x-forwarded-for", &["unknown"]),
                forwarded_for()
            ),
            Err(Fallback::Unparsable)
        );

        let mut binary = request(IpAddr::V4(Ipv4Addr::LOCALHOST));
        binary.headers_mut().insert(
            "x-forwarded-for",
            HeaderValue::from_bytes(b"\xff").expect("the header should hold arbitrary bytes"),
        );
        assert_eq!(
            from_header(&binary, forwarded_for()),
            Err(Fallback::HeaderNotAscii)
        );
    }

    #[test]
    fn forwarded_addresses_accept_a_port_suffix() {
        assert_eq!(parse("192.0.2.1:5678"), Some(key("192.0.2.1")));
        assert_eq!(parse("[2001:db8::1]:443"), Some(key("2001:db8::1")));
        assert_eq!(parse("unknown"), None);
    }

    #[test]
    fn peer_reads_the_connection_address() {
        assert_eq!(
            peer(&request(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1)))),
            Some(key("192.0.2.1"))
        );
        assert_eq!(
            peer(
                &Request::builder()
                    .uri("/entities")
                    .body(Body::empty())
                    .expect("the request should build")
            ),
            None,
            "a router served without connect info should leave the address unknown"
        );
    }
}
