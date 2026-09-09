//! Derives storage keys from one validated [`Namespace`].
//!
//! Control records use `{namespace}/control/v1/...`. Artifacts use
//! `{namespace}/artifacts/{kind}/sha256/...`. Writers and validators use these
//! methods to agree on each record's location.
//!
//! The layout is part of the storage format. Domains build their record keys
//! from these prefixes so stored data stays discoverable across releases.

use core::fmt;

use crate::routing::{Shard, shard_path};

pub const MAX_NAMESPACE_BYTES: usize = 256;

/// Validated root prefix for one kernel instance. Segments use tenant-safe
/// characters, and `/` separates segments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Namespace(String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InvalidNamespace {
    Empty,
    TooLong { actual_bytes: usize },
    UnsafeSegment,
}

impl fmt::Display for InvalidNamespace {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("namespace must not be empty"),
            Self::TooLong { actual_bytes } => write!(
                formatter,
                "namespace is {actual_bytes} bytes; maximum is {MAX_NAMESPACE_BYTES}"
            ),
            Self::UnsafeSegment => formatter.write_str(
                "namespace segments must be non-empty, not dot navigation, and use tenant-safe \
                 characters",
            ),
        }
    }
}

impl core::error::Error for InvalidNamespace {}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && !matches!(segment, "." | "..")
        && segment.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'@' | b':')
        })
}

impl Namespace {
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

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Namespace {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
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

    // The kernel owns everything under the control root. Domains
    // must not mint keys here.

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
        format!("{}/{}.json", self.known_shards(), shard_path(shard))
    }

    #[must_use]
    pub fn ready(&self) -> String {
        format!("{}/ready", self.control_root())
    }

    #[must_use]
    pub fn ready_shard(&self, shard: Shard) -> String {
        format!("{}/{}", self.ready(), shard_path(shard))
    }

    #[must_use]
    pub fn requests(&self, shard: Shard) -> String {
        format!("{}/requests/{}", self.control_root(), shard_path(shard))
    }

    #[must_use]
    pub fn request_results(&self, shard: Shard) -> String {
        format!(
            "{}/request-results/{}",
            self.control_root(),
            shard_path(shard)
        )
    }

    #[must_use]
    pub fn lease(&self, shard: Shard) -> String {
        format!("{}/leases/{}.json", self.control_root(), shard_path(shard))
    }

    #[must_use]
    pub fn shard_root(&self, shard: Shard) -> String {
        format!("{}/shards/{}", self.control_root(), shard_path(shard))
    }

    #[must_use]
    pub fn shard_log(&self, shard: Shard) -> String {
        format!("{}/log", self.shard_root(shard))
    }

    #[must_use]
    pub fn shard_projection(&self, shard: Shard) -> String {
        format!("{}/projection", self.shard_root(shard))
    }

    // Content-addressed artifacts. Publishers append
    // `/sha256/{digest[..2]}/{digest}{ext}` under these prefixes. The
    // `artifact_digest_prefix` is the matching validation boundary.

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
    use super::*;

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
