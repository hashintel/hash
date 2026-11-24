//! CLI and environment configuration for cross-origin requests to the Graph APIs.

use alloc::sync::Arc;
use core::{fmt, str::FromStr, time::Duration};

use http::{
    HeaderName, HeaderValue,
    header::{LINK, RETRY_AFTER, WWW_AUTHENTICATE},
};
use tower_http::cors::{AllowCredentials, AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use url::Url;

use super::Audience;

/// How long a browser may reuse the answer to a preflight request.
const PREFLIGHT_MAX_AGE: Duration = Duration::from_hours(1);

/// The origins browsers may call the public and the internal APIs from.
///
/// With both lists empty, no response carries CORS headers.
#[derive(Debug, Clone, Default)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct CorsConfig {
    /// Origins a browser may call the public APIs from, separated by commas.
    ///
    /// The browser sends no cookies to the public APIs, a request authenticates with an API
    /// token. Each origin is exact, like `https://hash.dev`, or starts its host with a wildcard
    /// for a single label over a domain of at least two labels, like `https://*.stage.hash.ai`,
    /// which admits every host one label below that domain.
    #[cfg_attr(
        feature = "clap",
        clap(
            long = "public-api-cors-origins",
            env = "HASH_GRAPH_PUBLIC_API_CORS_ORIGINS",
            default_value = "",
            hide_default_value = true
        )
    )]
    public_api_origins: CorsOrigins,

    /// Origins a browser may call the internal API from with its cookies, separated by commas.
    ///
    /// A page on such an origin can act as the signed-in user. Takes the same forms as
    /// `--public-api-cors-origins`.
    #[cfg_attr(
        feature = "clap",
        clap(
            long = "internal-api-cors-origins",
            env = "HASH_GRAPH_INTERNAL_API_CORS_ORIGINS",
            default_value = "",
            hide_default_value = true
        )
    )]
    internal_api_origins: CorsOrigins,
}

impl CorsConfig {
    /// The configuration admitting the comma-separated `public` origins to the public APIs and
    /// `internal` to the internal API.
    #[cfg(test)]
    pub(crate) fn parse(public: &str, internal: &str) -> Result<Self, InvalidCorsOrigin> {
        Ok(Self {
            public_api_origins: public.parse()?,
            internal_api_origins: internal.parse()?,
        })
    }

    /// The layer answering cross-origin requests to the APIs under `prefixes`, each checked
    /// against the origins of its audience; [`None`] if both lists are empty.
    ///
    /// The layer answers every `OPTIONS` request itself, on any path, and adds its headers to
    /// every other response. Credentials are allowed for the internal API only.
    pub(super) fn layer(&self, prefixes: Vec<(&'static str, Audience)>) -> Option<CorsLayer> {
        if self.public_api_origins.is_empty() && self.internal_api_origins.is_empty() {
            tracing::info!("no CORS origins configured, responses carry no CORS headers");
            return None;
        }
        tracing::info!(
            public_api_origins = %self.public_api_origins,
            internal_api_origins = %self.internal_api_origins,
            "answering cross-origin requests"
        );

        let rules = Arc::new(CorsRules {
            prefixes,
            public: self.public_api_origins.clone(),
            internal: self.internal_api_origins.clone(),
        });
        let origin_rules = Arc::clone(&rules);

        Some(
            CorsLayer::new()
                .allow_origin(AllowOrigin::predicate(move |origin, request| {
                    origin_rules.audience(origin, request.uri.path()).is_some()
                }))
                .allow_credentials(AllowCredentials::predicate(move |origin, request| {
                    rules.audience(origin, request.uri.path()) == Some(Audience::Internal)
                }))
                .allow_methods(AllowMethods::mirror_request())
                .allow_headers(AllowHeaders::mirror_request())
                .expose_headers([
                    LINK,
                    HeaderName::from_static("ratelimit"),
                    HeaderName::from_static("ratelimit-policy"),
                    RETRY_AFTER,
                    WWW_AUTHENTICATE,
                ])
                .max_age(PREFLIGHT_MAX_AGE),
        )
    }
}

struct CorsRules {
    prefixes: Vec<(&'static str, Audience)>,
    public: CorsOrigins,
    internal: CorsOrigins,
}

impl CorsRules {
    /// The audience of the API serving `path`, if `origin` may call it.
    fn audience(&self, origin: &HeaderValue, path: &str) -> Option<Audience> {
        let &(_, audience) = self.prefixes.iter().find(|(prefix, _)| {
            path.strip_prefix(prefix)
                .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        })?;
        let origins = match audience {
            Audience::Public => &self.public,
            Audience::Internal => &self.internal,
        };
        origins.matches(origin.to_str().ok()?).then_some(audience)
    }
}

/// Origins separated by commas. Blank entries are skipped, so an empty value configures none.
#[derive(Debug, Clone, Default)]
pub(crate) struct CorsOrigins(Vec<CorsOrigin>);

impl CorsOrigins {
    const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn matches(&self, origin: &str) -> bool {
        self.0.iter().any(|allowed| allowed.matches(origin))
    }
}

impl fmt::Display for CorsOrigins {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, origin) in self.0.iter().enumerate() {
            if index > 0 {
                fmt.write_str(",")?;
            }
            fmt::Display::fmt(origin, fmt)?;
        }
        Ok(())
    }
}

impl FromStr for CorsOrigins {
    type Err = InvalidCorsOrigin;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value
            .split(',')
            .map(str::trim)
            .filter(|entry| !entry.is_empty())
            .map(CorsOrigin::from_str)
            .collect::<Result<_, _>>()
            .map(Self)
    }
}

/// An origin a browser may send requests from, like `https://hash.dev`, or one whose host starts
/// with a wildcard for a single label, like `https://*.stage.hash.ai`.
#[derive(Debug, Clone, derive_more::Display)]
pub(crate) struct CorsOrigin(OriginPattern);

#[derive(Debug, Clone, derive_more::Display)]
enum OriginPattern {
    /// The whole origin, in lowercase.
    #[display("{_0}")]
    Exact(Box<str>),
    /// The scheme with its separator, and everything after the wildcard label, starting with its
    /// dot, in lowercase.
    #[display("{scheme}*{suffix}")]
    Subdomain {
        scheme: &'static str,
        suffix: Box<str>,
    },
}

impl CorsOrigin {
    fn matches(&self, origin: &str) -> bool {
        match &self.0 {
            OriginPattern::Exact(exact) => origin.eq_ignore_ascii_case(exact),
            OriginPattern::Subdomain { scheme, suffix } => origin
                .split_at_checked(scheme.len())
                .filter(|(prefix, _)| prefix.eq_ignore_ascii_case(scheme))
                .and_then(|(_, host)| host.split_at_checked(host.len().checked_sub(suffix.len())?))
                .is_some_and(|(label, rest)| {
                    rest.eq_ignore_ascii_case(suffix)
                        && !label.is_empty()
                        && label
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                }),
        }
    }
}

/// A CORS origin that is neither an exact origin nor one with a single wildcard label.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display(
    "`{_0}` is not an origin like `https://hash.dev`, or one with a wildcard label like \
     `https://*.stage.hash.ai`: it takes `http` or `https`, a host and an optional port, and \
     nothing else"
)]
pub(crate) struct InvalidCorsOrigin(#[error(not(source))] String);

impl FromStr for CorsOrigin {
    type Err = InvalidCorsOrigin;

    fn from_str(input: &str) -> Result<Self, Self::Err> {
        let invalid = || InvalidCorsOrigin(input.to_owned());
        let value = input.trim().to_ascii_lowercase();

        let (scheme, authority) = value.split_once("://").ok_or_else(invalid)?;
        let scheme = match scheme {
            "http" => "http://",
            "https" => "https://",
            _ => return Err(invalid()),
        };
        let (pattern, checked) = match authority.strip_prefix("*.") {
            // The domain after a wildcard has at least two labels: `*.hash.ai`, never `*.ai`.
            Some(domain) if domain.contains('.') => (
                OriginPattern::Subdomain {
                    scheme,
                    suffix: format!(".{domain}").into_boxed_str(),
                },
                format!("{scheme}wildcard.{domain}"),
            ),
            Some(_) => return Err(invalid()),
            None => (
                OriginPattern::Exact(Box::from(value.as_str())),
                value.clone(),
            ),
        };

        // URLs admit `*` in a host, so any `*` but a leading `*.` is refused here.
        if checked.contains('*') {
            return Err(invalid());
        }
        // An origin is what the URL serializes as its origin, so this also refuses a path, a
        // trailing slash, credentials and a default port. A host with an empty label, like
        // `hash.dev.` or `hash..dev`, is refused as well.
        let is_origin = Url::parse(&checked).is_ok_and(|url| {
            url.origin().ascii_serialization() == checked
                && url
                    .host_str()
                    .is_some_and(|host| host.split('.').all(|label| !label.is_empty()))
        });
        if !is_origin {
            return Err(invalid());
        }

        Ok(Self(pattern))
    }
}

#[cfg(test)]
mod tests {
    use super::{CorsOrigin, CorsOrigins};

    fn origin(value: &str) -> CorsOrigin {
        value.parse().expect("the origin should parse")
    }

    #[test]
    fn origin_exact() {
        let allowed = origin("https://hash.dev");
        assert!(
            allowed.matches("https://hash.dev"),
            "the same origin should match"
        );
        assert!(
            allowed.matches("HTTPS://Hash.Dev"),
            "case should not matter"
        );
        for other in [
            "http://hash.dev",
            "https://hash.dev:8443",
            "https://hash.dev.example.com",
            "https://www.hash.dev",
        ] {
            assert!(!allowed.matches(other), "{other} should not match");
        }
    }

    #[test]
    fn origin_wildcard() {
        let allowed = origin("https://*.stage.hash.ai");
        for matching in [
            "https://site-hashdev-o4izdf2q4.stage.hash.ai",
            "HTTPS://Site.Stage.Hash.AI",
        ] {
            assert!(
                allowed.matches(matching),
                "{matching} should match as a host one label below the domain"
            );
        }
        for other in [
            "https://stage.hash.ai",
            "https://a.b.stage.hash.ai",
            "https://evilstage.hash.ai",
            "https://site.stage.hash.ai.example.com",
            "http://site.stage.hash.ai",
            "https://hash.dev",
        ] {
            assert!(!allowed.matches(other), "{other} should not match");
        }
    }

    #[test]
    fn origin_normalized() {
        assert!(
            origin(" HTTPS://Hash.Dev ").matches("https://hash.dev"),
            "surrounding blanks and case should not matter"
        );
    }

    #[test]
    fn origin_invalid() {
        for value in [
            "",
            "hash.dev",
            "ftp://hash.dev",
            "https://hash.dev/",
            "https://hash.dev/docs",
            "https://user@hash.dev",
            "https://hash.dev:443",
            "https://hash.dev.",
            "https://hash..dev",
            "https://*",
            "https://*.ai",
            "https://*.ai.",
            "https://*..hash.ai",
            "https://site.*.hash.ai",
            "https://*.*.hash.ai",
            "*",
        ] {
            assert!(
                value.parse::<CorsOrigin>().is_err(),
                "{value} should be refused"
            );
        }
    }

    #[test]
    fn origin_error_input() {
        let error = "HTTPS://Hash.dev/"
            .parse::<CorsOrigin>()
            .expect_err("a trailing slash should be refused");
        assert!(
            error.to_string().contains("`HTTPS://Hash.dev/`"),
            "the error should name the origin as it was given, not {error}"
        );
    }

    #[test]
    fn origins_blank_entries() {
        let origins = " https://hash.dev , https://*.stage.hash.ai,"
            .parse::<CorsOrigins>()
            .expect("the origins should parse");
        assert_eq!(origins.0.len(), 2, "blank entries should be skipped");
        assert!(
            origins.matches("https://hash.dev") && origins.matches("https://site.stage.hash.ai"),
            "both origins should match"
        );
        assert!(
            "".parse::<CorsOrigins>()
                .expect("an empty value should parse")
                .is_empty(),
            "an empty value should configure no origin"
        );
    }
}
