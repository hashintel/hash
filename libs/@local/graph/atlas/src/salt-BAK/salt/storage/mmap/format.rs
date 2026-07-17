//! Typed artifact and section metadata.

use crate::salt::hash::ContentHash;

/// Identifies an artifact schema.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub(crate) struct ArtifactKind(u16);

impl ArtifactKind {
    /// Creates an artifact kind from its persisted value.
    #[must_use]
    #[inline]
    pub(crate) const fn new(value: u16) -> Self {
        Self(value)
    }

    /// Returns the persisted value.
    #[must_use]
    #[inline]
    pub(crate) const fn as_u16(self) -> u16 {
        self.0
    }
}

/// Identifies one version of an artifact schema.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub(crate) struct FormatVersion(u16);

impl FormatVersion {
    /// Creates a format version from its persisted value.
    #[must_use]
    #[inline]
    pub(crate) const fn new(value: u16) -> Self {
        Self(value)
    }

    /// Returns the persisted value.
    #[must_use]
    #[inline]
    pub(crate) const fn as_u16(self) -> u16 {
        self.0
    }
}

/// The schema expected by an artifact consumer.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct ArtifactFormat {
    pub kind: ArtifactKind,
    pub version: FormatVersion,
}

/// Identifies one section within an artifact schema.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub(crate) struct SectionId(u16);

impl SectionId {
    /// Creates a section identifier from its persisted value.
    #[must_use]
    #[inline]
    pub(crate) const fn new(value: u16) -> Self {
        Self(value)
    }

    /// Returns the persisted value.
    #[must_use]
    #[inline]
    pub(crate) const fn as_u16(self) -> u16 {
        self.0
    }
}

/// The scalar representation of a section.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub(crate) enum ScalarType {
    U8 = 1,
    U32 = 2,
    U64 = 3,
    F32 = 4,
    F64 = 5,
}

impl ScalarType {
    pub(super) const fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(Self::U8),
            2 => Some(Self::U32),
            3 => Some(Self::U64),
            4 => Some(Self::F32),
            5 => Some(Self::F64),
            _ => None,
        }
    }

    pub(super) const fn width(self) -> u64 {
        match self {
            Self::U8 => 1,
            Self::U32 | Self::F32 => 4,
            Self::U64 | Self::F64 => 8,
        }
    }
}

/// Metadata shared by every section in an artifact.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SectionDescriptor {
    pub id: SectionId,
    pub scalar: ScalarType,
    pub rank: u8,
    pub alignment: u32,
    pub offset: u64,
    pub length: u64,
    pub shape: [u64; 3],
}

impl SectionDescriptor {
    /// Returns the number of scalars in this section.
    #[must_use]
    #[inline]
    pub(crate) fn element_count(self) -> u64 {
        self.shape[..usize::from(self.rank)].iter().product()
    }
}

/// Validated artifact header fields.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ArtifactHeader {
    pub format: ArtifactFormat,
    pub section_count: u32,
    pub total_bytes: u64,
    pub payload_hash: ContentHash,
}
