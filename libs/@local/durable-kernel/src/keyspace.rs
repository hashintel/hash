//! Builds storage paths under a validated [`Namespace`].
//!
//! The kernel reserves `{namespace}/control/v1/...` for control records. Application artifacts
//! use `{namespace}/artifacts/{kind}/sha256/...`. These paths are part of the storage format
//! and must remain stable across releases.
//!
//! Parse a [`Namespace`], then use [`Keyspace`] to build paths for a [`Shard`].

use core::ascii::Char;

use crate::routing::Shard;

pub const MAX_NAMESPACE_BYTES: usize = 256;

/// A storage prefix made of `/`-separated segments.
///
/// Segments accept ASCII letters, digits, `-`, `_`, `.`, `@`, and `:`. Empty segments, `.` and
/// `..` are rejected.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub struct Namespace(String);

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidNamespace {
    #[display("namespace must not be empty")]
    Empty,
    #[display("namespace is {actual_bytes} bytes; maximum is {MAX_NAMESPACE_BYTES}")]
    TooLong { actual_bytes: usize },
    #[display(
        "namespace segments must contain ASCII letters, digits, -, _, ., @, or : and cannot be . \
         or .."
    )]
    UnsafeSegment,
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && !matches!(segment, "." | "..")
        && segment.as_ascii().is_some_and(|chars| {
            chars.iter().all(|char| {
                char.is_alphanumeric()
                    || matches!(
                        char,
                        Char::HyphenMinus
                            | Char::LowLine
                            | Char::FullStop
                            | Char::CommercialAt
                            | Char::Colon
                    )
            })
        })
}

impl Namespace {
    /// Parses a namespace and checks each path segment.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty or oversized namespace, or an unsafe path segment.
    pub fn parse(value: impl Into<String>) -> Result<Self, InvalidNamespace> {
        let value = value.into();
        if value.is_empty() {
            return Err(InvalidNamespace::Empty);
        }
        if value.len() > MAX_NAMESPACE_BYTES {
            return Err(InvalidNamespace::TooLong {
                actual_bytes: value.len(),
            });
        }
        if !value.split('/').all(valid_segment) {
            return Err(InvalidNamespace::UnsafeSegment);
        }
        Ok(Self(value))
    }
}

impl TryFrom<String> for Namespace {
    type Error = InvalidNamespace;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(value)
    }
}

impl AsRef<str> for Namespace {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl core::str::FromStr for Namespace {
    type Err = InvalidNamespace;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::parse(value)
    }
}

impl From<Namespace> for String {
    fn from(namespace: Namespace) -> Self {
        namespace.0
    }
}

/// Derives every durable key under one namespace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Keyspace {
    namespace: Namespace,
}

impl Keyspace {
    #[must_use]
    pub const fn new(namespace: Namespace) -> Self {
        Self { namespace }
    }

    #[must_use]
    pub const fn namespace(&self) -> &Namespace {
        &self.namespace
    }

    #[must_use]
    pub fn control_root(&self) -> String {
        format!("{}/control/v1", self.namespace)
    }

    #[must_use]
    pub fn baseline(&self) -> String {
        format!("{}/baseline.json", self.control_root())
    }

    #[must_use]
    pub fn known_shards(&self) -> String {
        format!("{}/known-shards", self.control_root())
    }

    #[must_use]
    pub fn known_shard(&self, shard: Shard) -> String {
        format!("{}/{}.json", self.known_shards(), shard.path_segment())
    }

    #[must_use]
    pub fn ready(&self) -> String {
        format!("{}/ready", self.control_root())
    }

    #[must_use]
    pub fn ready_shard(&self, shard: Shard) -> String {
        format!("{}/{}", self.ready(), shard.path_segment())
    }

    #[must_use]
    pub fn requests(&self, shard: Shard) -> String {
        format!("{}/requests/{}", self.control_root(), shard.path_segment())
    }

    #[must_use]
    pub fn request_results(&self, shard: Shard) -> String {
        format!(
            "{}/request-results/{}",
            self.control_root(),
            shard.path_segment()
        )
    }

    #[must_use]
    pub fn lease(&self, shard: Shard) -> String {
        format!(
            "{}/leases/{}.json",
            self.control_root(),
            shard.path_segment()
        )
    }

    #[must_use]
    pub fn shard_root(&self, shard: Shard) -> String {
        format!("{}/shards/{}", self.control_root(), shard.path_segment())
    }

    #[must_use]
    pub fn shard_log(&self, shard: Shard) -> String {
        format!("{}/log", self.shard_root(shard))
    }

    #[must_use]
    pub fn shard_projection(&self, shard: Shard) -> String {
        format!("{}/projection", self.shard_root(shard))
    }

    /// # Errors
    ///
    /// Returns an error when the artifact kind is an unsafe path segment.
    pub fn artifact_prefix(&self, kind: &str) -> Result<String, InvalidNamespace> {
        if !valid_segment(kind) {
            return Err(InvalidNamespace::UnsafeSegment);
        }
        Ok(format!("{}/artifacts/{kind}", self.namespace))
    }

    /// # Errors
    ///
    /// Returns an error when the artifact kind is an unsafe path segment.
    pub fn artifact_digest_prefix(&self, kind: &str) -> Result<String, InvalidNamespace> {
        Ok(format!("{}/sha256/", self.artifact_prefix(kind)?))
    }
}

#[cfg(test)]
mod tests {
    use super::{InvalidNamespace, Keyspace, MAX_NAMESPACE_BYTES, Namespace};
    use crate::routing::Shard;

    fn keyspace() -> Keyspace {
        Keyspace::new(Namespace::parse("tenants/alice").expect("namespace should be valid"))
    }

    #[test]
    fn namespace_segments_are_validated() {
        Namespace::parse("tenants/alice").expect("nested namespace should be valid");
        Namespace::parse("flat-domain").expect("flat namespace should be valid");
        assert_eq!(Namespace::parse(""), Err(InvalidNamespace::Empty));
        for invalid in [
            "tenants//alice",
            "a/../b",
            "a/",
            "/a",
            "sp ace",
            "back\\slash",
        ] {
            assert_eq!(
                Namespace::parse(invalid),
                Err(InvalidNamespace::UnsafeSegment),
                "{invalid:?}"
            );
        }
        assert!(
            Namespace::parse("x".repeat(MAX_NAMESPACE_BYTES)).is_ok(),
            "a namespace of exactly {MAX_NAMESPACE_BYTES} bytes should parse"
        );
        assert!(matches!(
            Namespace::parse("x".repeat(MAX_NAMESPACE_BYTES + 1)),
            Err(InvalidNamespace::TooLong { .. })
        ));
    }

    #[test]
    fn control_keys_match_the_frozen_layout() {
        let keyspace = keyspace();
        let shard = Shard::try_from(15).expect("shard should be valid");
        assert_eq!(keyspace.control_root(), "tenants/alice/control/v1");
        assert_eq!(
            keyspace.baseline(),
            "tenants/alice/control/v1/baseline.json"
        );
        assert_eq!(
            keyspace.known_shard(shard),
            "tenants/alice/control/v1/known-shards/00f.json"
        );
        assert_eq!(
            keyspace.lease(shard),
            "tenants/alice/control/v1/leases/00f.json"
        );
        assert_eq!(
            keyspace.shard_log(shard),
            "tenants/alice/control/v1/shards/00f/log"
        );
        assert_eq!(
            keyspace.shard_projection(shard),
            "tenants/alice/control/v1/shards/00f/projection"
        );
        assert_eq!(keyspace.ready(), "tenants/alice/control/v1/ready");
        assert_eq!(
            keyspace.ready_shard(shard),
            "tenants/alice/control/v1/ready/00f"
        );
        assert_eq!(
            keyspace.requests(shard),
            "tenants/alice/control/v1/requests/00f"
        );
        assert_eq!(
            keyspace.request_results(shard),
            "tenants/alice/control/v1/request-results/00f"
        );
    }

    #[test]
    fn artifact_keys_match_the_frozen_layout() {
        let keyspace = keyspace();
        assert_eq!(
            keyspace
                .artifact_prefix("run-inputs")
                .expect("kind should be valid"),
            "tenants/alice/artifacts/run-inputs"
        );
        assert_eq!(
            keyspace
                .artifact_digest_prefix("run-inputs")
                .expect("kind should be valid"),
            "tenants/alice/artifacts/run-inputs/sha256/"
        );
        keyspace
            .artifact_prefix("no/slash")
            .expect_err("artifact kind should reject slashes");
    }
}
