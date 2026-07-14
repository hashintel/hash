//! Generation, revision, operation, and snapshot identities.
//!
//! A read snapshot binds generation, authorization, base, and delta revisions
//! into one value. Callers pass that value through the complete read path so
//! data and cache metadata cannot silently mix revision heads.

use core::{error::Error, fmt, num::NonZero, str::FromStr};

use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Visitor};
use uuid::Uuid;

use super::hash::ContentHash;

/// The maximum number of variants accepted without a capacity review.
pub(crate) const MAX_PUBLISHED_VARIANTS: u16 = 8;

/// The content-addressed identity of one immutable atlas generation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(transparent)]
#[serde(transparent)]
pub(crate) struct GenerationId(ContentHash);

impl GenerationId {
    /// Creates a generation identity from its complete input/configuration hash.
    #[must_use]
    pub(crate) const fn new(hash: ContentHash) -> Self {
        Self(hash)
    }

    /// Returns the content hash that identifies the generation.
    #[must_use]
    pub(crate) const fn content_hash(self) -> ContentHash {
        self.0
    }
}

impl fmt::Display for GenerationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Identifies the revision counter that overflowed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RevisionKind {
    /// Immutable base-data revisions.
    Base,
    /// Append-only delta revisions.
    Delta,
}

impl fmt::Display for RevisionKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Base => formatter.write_str("base"),
            Self::Delta => formatter.write_str("delta"),
        }
    }
}

/// A revision counter that cannot advance.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RevisionOverflow {
    kind: RevisionKind,
    current: u64,
}

impl fmt::Display for RevisionOverflow {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{} revision {} cannot advance beyond u64::MAX",
            self.kind, self.current
        )
    }
}

impl Error for RevisionOverflow {}

macro_rules! revision {
    (
        $(#[$attribute:meta])*
        $visibility:vis struct $name:ident($kind:expr);
    ) => {
        $(#[$attribute])*
        #[derive(
            Debug,
            Copy,
            Clone,
            PartialEq,
            Eq,
            PartialOrd,
            Ord,
            Hash,
            Serialize,
            Deserialize,
        )]
        #[repr(transparent)]
        #[serde(transparent)]
        $visibility struct $name(u64);

        impl $name {
            /// The initial revision.
            $visibility const ZERO: Self = Self(0);

            /// Creates a revision from its persisted counter.
            #[must_use]
            $visibility const fn new(value: u64) -> Self {
                Self(value)
            }

            /// Returns the persisted revision counter.
            #[must_use]
            $visibility const fn get(self) -> u64 {
                self.0
            }

            /// Returns the following revision.
            ///
            /// # Errors
            ///
            /// This returns an error when the current counter is `u64::MAX`.
            $visibility const fn next(self) -> Result<Self, RevisionOverflow> {
                match self.0.checked_add(1) {
                    Some(next) => Ok(Self(next)),
                    None => Err(RevisionOverflow {
                        kind: $kind,
                        current: self.0,
                    }),
                }
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

revision! {
    /// The immutable base-data revision within one generation.
    pub(crate) struct BaseRevision(RevisionKind::Base);
}

revision! {
    /// The visible append-only delta revision within one generation.
    pub(crate) struct DeltaRevision(RevisionKind::Delta);
}

/// The authorization subsystem revision bound to a read snapshot.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(transparent)]
#[serde(transparent)]
pub(crate) struct AuthorizationRevision(ContentHash);

impl AuthorizationRevision {
    /// Creates an authorization revision from its canonical source identity.
    #[must_use]
    pub(crate) const fn new(hash: ContentHash) -> Self {
        Self(hash)
    }

    /// Returns the canonical authorization revision identity.
    #[must_use]
    pub(crate) const fn content_hash(self) -> ContentHash {
        self.0
    }
}

impl fmt::Display for AuthorizationRevision {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

/// The authorization scope identity used to isolate caches and cohorts.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(transparent)]
#[serde(transparent)]
pub(crate) struct ScopeFingerprint(ContentHash);

impl ScopeFingerprint {
    /// Creates a scope fingerprint from authorization-owned canonical bytes.
    #[must_use]
    pub(crate) const fn new(hash: ContentHash) -> Self {
        Self(hash)
    }

    /// Returns the canonical scope identity.
    #[must_use]
    pub(crate) const fn content_hash(self) -> ContentHash {
        self.0
    }
}

impl fmt::Display for ScopeFingerprint {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

/// An idempotency key for one typed mutation batch.
///
/// The UUID is supplied by the event adapter and remains stable across retries.
/// It orders no operations by itself; ingestion uses `(event_time,
/// operation_id)` when a deterministic order is required.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub(crate) struct OperationId(Uuid);

impl OperationId {
    /// Creates an operation identity from an externally stable UUID.
    #[must_use]
    pub(crate) const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    /// Returns the underlying UUID.
    #[must_use]
    pub(crate) const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for OperationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

/// A malformed or noncanonical operation identity.
#[derive(Debug)]
pub(crate) enum OperationIdParseError {
    /// The text is not a UUID.
    Invalid(uuid::Error),
    /// The UUID is not lowercase hyphenated text.
    NonCanonical,
}

impl fmt::Display for OperationIdParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(error) => write!(formatter, "invalid operation UUID: {error}"),
            Self::NonCanonical => {
                formatter.write_str("operation UUID must use lowercase hyphenated text")
            }
        }
    }
}

impl Error for OperationIdParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Invalid(error) => Some(error),
            Self::NonCanonical => None,
        }
    }
}

impl FromStr for OperationId {
    type Err = OperationIdParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let uuid = Uuid::from_str(value).map_err(OperationIdParseError::Invalid)?;
        if uuid.to_string() != value {
            return Err(OperationIdParseError::NonCanonical);
        }
        Ok(Self(uuid))
    }
}

impl Serialize for OperationId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for OperationId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(OperationIdVisitor)
    }
}

struct OperationIdVisitor;

impl Visitor<'_> for OperationIdVisitor {
    type Value = OperationId;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a canonical hyphenated UUID operation identity")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        OperationId::from_str(value).map_err(E::custom)
    }
}

/// Identifies a coordinate field within one generation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(transparent)]
#[serde(transparent)]
pub(crate) struct VariantId(u16);

impl VariantId {
    /// The canonical coordinate field.
    pub(crate) const CANONICAL: Self = Self(0);

    /// Creates a variant identity from its manifest value.
    #[must_use]
    pub(crate) const fn new(value: u16) -> Self {
        Self(value)
    }

    /// Returns the manifest value.
    #[must_use]
    pub(crate) const fn get(self) -> u16 {
        self.0
    }
}

impl fmt::Display for VariantId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

/// The bounded number of coordinate fields published by a generation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedVariantCount(NonZero<u16>);

impl PublishedVariantCount {
    /// A canonical-only variant count.
    pub(crate) const ONE: Self = Self(NonZero::new(1).expect("1 should be nonzero"));

    /// Validates a manifest variant count.
    ///
    /// # Errors
    ///
    /// This returns an error when `count` is zero or exceeds
    /// [`MAX_PUBLISHED_VARIANTS`].
    pub(crate) const fn new(count: u16) -> Result<Self, VariantCountError> {
        if count == 0 || count > MAX_PUBLISHED_VARIANTS {
            return Err(VariantCountError { count });
        }

        Ok(Self(
            NonZero::new(count).expect("count should be nonzero after validation"),
        ))
    }

    /// Returns the validated nonzero count.
    #[must_use]
    pub(crate) const fn get(self) -> u16 {
        self.0.get()
    }

    /// Returns whether `variant` is included in this dense variant domain.
    #[must_use]
    pub(crate) const fn contains(self, variant: VariantId) -> bool {
        variant.get() < self.get()
    }
}

impl Serialize for PublishedVariantCount {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u16(self.get())
    }
}

impl<'de> Deserialize<'de> for PublishedVariantCount {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let count = u16::deserialize(deserializer)?;
        Self::new(count).map_err(serde::de::Error::custom)
    }
}

/// A published variant count outside the configured capacity guard.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct VariantCountError {
    count: u16,
}

impl fmt::Display for VariantCountError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "published variant count {} is outside 1..={MAX_PUBLISHED_VARIANTS}",
            self.count
        )
    }
}

impl Error for VariantCountError {}

/// The base and delta head visible within one generation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DataRevision {
    base: BaseRevision,
    delta: DeltaRevision,
}

impl DataRevision {
    /// The initial immutable base with an empty delta.
    pub(crate) const ZERO: Self = Self {
        base: BaseRevision::ZERO,
        delta: DeltaRevision::ZERO,
    };

    /// Creates a data revision head.
    #[must_use]
    pub(crate) const fn new(base: BaseRevision, delta: DeltaRevision) -> Self {
        Self { base, delta }
    }

    /// Returns the bound base revision.
    #[must_use]
    pub(crate) const fn base(self) -> BaseRevision {
        self.base
    }

    /// Returns the bound delta revision.
    #[must_use]
    pub(crate) const fn delta(self) -> DeltaRevision {
        self.delta
    }
}

/// The complete revision tuple for one permission-filtered read.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadSnapshot {
    generation: GenerationId,
    authorization: AuthorizationRevision,
    scope: ScopeFingerprint,
    data: DataRevision,
}

impl ReadSnapshot {
    /// Binds the immutable generation, authorization state, and data head.
    #[must_use]
    pub(crate) const fn new(
        generation: GenerationId,
        authorization: AuthorizationRevision,
        scope: ScopeFingerprint,
        data: DataRevision,
    ) -> Self {
        Self {
            generation,
            authorization,
            scope,
            data,
        }
    }

    /// Returns the immutable generation identity.
    #[must_use]
    pub(crate) const fn generation(self) -> GenerationId {
        self.generation
    }

    /// Returns the bound authorization revision.
    #[must_use]
    pub(crate) const fn authorization(self) -> AuthorizationRevision {
        self.authorization
    }

    /// Returns the cache-isolating scope fingerprint.
    #[must_use]
    pub(crate) const fn scope(self) -> ScopeFingerprint {
        self.scope
    }

    /// Returns the bound base and delta revisions.
    #[must_use]
    pub(crate) const fn data(self) -> DataRevision {
        self.data
    }
}

#[cfg(test)]
mod tests;
