//! Identity domains and explicit maps between them.
//!
//! Graph identities, generation rows, and artifact ordinals have different
//! lifetimes. This module makes every transition explicit and validates the
//! packed `u32` limit.
//!
//! [`IdentityDirectory`] assigns one canonical generation row to every durable
//! graph [`EntityId`]. The input sequence is part of generation identity: the
//! directory hash records each row together with web ID, entity UUID, draft
//! presence, and draft UUID. A different row permutation is therefore a
//! different frozen input even when the entity set is unchanged.
//!
//! Individual artifacts may contain a subset or delivery permutation of those
//! rows. [`ArtifactIdentityMap`] gives that artifact its own dense
//! [`ArtifactOrdinal`] domain and validates both directions against the
//! directory. Algorithms must not use an artifact ordinal as a generation row
//! or infer either one from vector position without the corresponding map.
//!
//! `u32::MAX` is reserved as the absent/unassigned sentinel used by persisted
//! indexes. Valid packed identities end at `u32::MAX - 1`, and constructors
//! reject corpora or artifacts that cannot preserve that distinction.
//!
//! [`EntityId`]: type_system::knowledge::entity::id::EntityId

use core::{error::Error, fmt};
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use type_system::knowledge::entity::id::EntityId;
use uuid::Uuid;

use crate::salt::hash::{ContentHash, ContentHasher};

/// The reserved `u32` value that never identifies a row or ordinal.
const RESERVED_PACKED_ID: u32 = u32::MAX;

/// The greatest number of rows representable by the packed `u32` encoding.
pub(crate) const MAX_GENERATION_ROWS: usize = u32::MAX as usize;

/// Identifies the packed domain that rejected an integer.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum PackedIdDomain {
    /// A generation-stable entity row.
    GenerationRow,
    /// A dense row in one artifact.
    ArtifactOrdinal,
}

impl fmt::Display for PackedIdDomain {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::GenerationRow => formatter.write_str("generation row"),
            Self::ArtifactOrdinal => formatter.write_str("artifact ordinal"),
        }
    }
}

/// An integer outside a packed identity domain.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PackedIdOverflow {
    domain: PackedIdDomain,
    value: u64,
}

impl PackedIdOverflow {
    const fn new(domain: PackedIdDomain, value: u64) -> Self {
        Self { domain, value }
    }
}

impl fmt::Display for PackedIdOverflow {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{} value {} exceeds the maximum packed value {}",
            self.domain,
            self.value,
            RESERVED_PACKED_ID - 1
        )
    }
}

impl Error for PackedIdOverflow {}

macro_rules! packed_id {
    (
        $(#[$attribute:meta])*
        $visibility:vis struct $name:ident($domain:expr);
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
        #[serde(try_from = "u32", into = "u32")]
        $visibility struct $name(u32);

        impl $name {
            /// The greatest valid packed value.
            $visibility const MAX: Self = Self(RESERVED_PACKED_ID - 1);

            /// Creates an identifier from its packed representation.
            ///
            /// # Errors
            ///
            /// This returns an error when `value` is the reserved `u32::MAX`
            /// sentinel.
            #[inline]
            $visibility const fn from_u32(value: u32) -> Result<Self, PackedIdOverflow> {
                if value == RESERVED_PACKED_ID {
                    Err(PackedIdOverflow::new($domain, value as u64))
                } else {
                    Ok(Self(value))
                }
            }

            /// Returns the packed `u32` representation.
            #[inline]
            $visibility const fn as_u32(self) -> u32 {
                self.0
            }

            /// Returns the value as an in-process slice index.
            #[inline]
            $visibility const fn as_usize(self) -> usize {
                self.0 as usize
            }
        }

        impl TryFrom<u32> for $name {
            type Error = PackedIdOverflow;

            #[inline]
            fn try_from(value: u32) -> Result<Self, Self::Error> {
                Self::from_u32(value)
            }
        }

        impl TryFrom<usize> for $name {
            type Error = PackedIdOverflow;

            #[inline]
            fn try_from(value: usize) -> Result<Self, Self::Error> {
                let packed = u32::try_from(value).map_err(|_| {
                    PackedIdOverflow::new(
                        $domain,
                        u64::try_from(value).unwrap_or(u64::MAX),
                    )
                })?;
                Self::from_u32(packed)
            }
        }

        impl From<$name> for u32 {
            #[inline]
            fn from(value: $name) -> Self {
                value.as_u32()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

packed_id! {
    /// A stable entity row within one atlas generation.
    ///
    /// Values are assigned by the generation's [`IdentityDirectory`]. They
    /// remain stable across base and delta revisions of that generation, but
    /// have no meaning in another generation.
    pub(crate) struct GenerationRowId(PackedIdDomain::GenerationRow);
}

packed_id! {
    /// A dense row index local to one persisted or in-memory artifact.
    ///
    /// An ordinal is meaningful only with the [`ArtifactIdentityMap`] that
    /// assigned it. Numeric kernels use ordinals for contiguous access and
    /// translate them back to generation rows before crossing an artifact
    /// boundary.
    pub(crate) struct ArtifactOrdinal(PackedIdDomain::ArtifactOrdinal);
}

/// An invalid generation or artifact identity map.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum IdentityError {
    /// A generation exceeds the declared `u32` row encoding.
    TooManyRows { count: usize },
    /// The same graph identity occurs more than once.
    DuplicateEntity {
        entity_id: EntityId,
        first: GenerationRowId,
        duplicate: GenerationRowId,
    },
    /// An artifact refers to a row absent from its generation directory.
    UnknownGenerationRow { row: GenerationRowId, rows: usize },
    /// One generation row occurs more than once in an artifact map.
    DuplicateArtifactRow {
        row: GenerationRowId,
        first: ArtifactOrdinal,
        duplicate: ArtifactOrdinal,
    },
}

impl fmt::Display for IdentityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooManyRows { count } => write!(
                formatter,
                "generation contains {count} rows but the u32 encoding supports at most \
                 {MAX_GENERATION_ROWS}"
            ),
            Self::DuplicateEntity {
                entity_id,
                first,
                duplicate,
            } => write!(
                formatter,
                "entity {entity_id} occurs at generation rows {first} and {duplicate}"
            ),
            Self::UnknownGenerationRow { row, rows } => write!(
                formatter,
                "artifact refers to generation row {row}, but the identity directory contains \
                 {rows} rows"
            ),
            Self::DuplicateArtifactRow {
                row,
                first,
                duplicate,
            } => write!(
                formatter,
                "generation row {row} occurs at artifact ordinals {first} and {duplicate}"
            ),
        }
    }
}

impl Error for IdentityError {}

/// The bidirectional identity map for one generation.
///
/// The input order defines row assignment and must therefore be deterministic.
/// Construction rejects duplicate entities and generations that do not fit the
/// declared `u32` row encoding.
#[derive(Debug, Clone)]
pub(crate) struct IdentityDirectory {
    entities: Box<[EntityId]>,
    rows: HashMap<EntityId, GenerationRowId>,
}

impl IdentityDirectory {
    /// Builds a directory using `entities` as the canonical row order.
    ///
    /// # Errors
    ///
    /// This returns an error when the row count reaches the reserved `u32::MAX`
    /// value or when an [`EntityId`] occurs more than once.
    ///
    /// # Complexity
    ///
    /// Construction runs in expected `O(n)` time and uses `O(n)` additional
    /// memory. Lookups in either direction are constant time.
    pub(crate) fn new(entities: Vec<EntityId>) -> Result<Self, IdentityError> {
        if entities.len() > MAX_GENERATION_ROWS {
            return Err(IdentityError::TooManyRows {
                count: entities.len(),
            });
        }

        let mut rows = HashMap::with_capacity(entities.len());
        for (index, entity_id) in entities.iter().enumerate() {
            let row = GenerationRowId::try_from(index)
                .expect("should fit GenerationRowId after validating the row count");
            if let Some(first) = rows.insert(*entity_id, row) {
                return Err(IdentityError::DuplicateEntity {
                    entity_id: *entity_id,
                    first,
                    duplicate: row,
                });
            }
        }

        Ok(Self {
            entities: entities.into_boxed_slice(),
            rows,
        })
    }

    /// Returns the number of identities in the generation.
    #[inline]
    pub(crate) const fn len(&self) -> usize {
        self.entities.len()
    }

    /// Returns whether the generation contains no identities.
    #[inline]
    pub(crate) const fn is_empty(&self) -> bool {
        self.entities.is_empty()
    }

    /// Resolves a graph identity to its generation row.
    #[inline]
    pub(crate) fn row(&self, entity_id: &EntityId) -> Option<GenerationRowId> {
        self.rows.get(entity_id).copied()
    }

    /// Resolves a generation row to its graph identity.
    #[inline]
    pub(crate) fn entity(&self, row: GenerationRowId) -> Option<&EntityId> {
        self.entities.get(row.as_usize())
    }

    /// Iterates over graph identities in generation-row order.
    pub(crate) fn iter(
        &self,
    ) -> impl ExactSizeIterator<Item = (GenerationRowId, &EntityId)> + Clone {
        self.entities.iter().enumerate().map(|(index, entity)| {
            let row = GenerationRowId::try_from(index)
                .expect("should fit because construction validated every row index");
            (row, entity)
        })
    }

    /// Returns the canonical identity of every row assignment.
    #[must_use]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.identity-directory.v1");
        for (row, entity) in self.iter() {
            hasher.update(&row.as_u32().to_le_bytes());
            let web_id: Uuid = entity.web_id.into();
            let entity_uuid: Uuid = entity.entity_uuid.into();
            hasher.update(web_id.as_bytes());
            hasher.update(entity_uuid.as_bytes());
            if let Some(draft_id) = entity.draft_id {
                let draft_id: Uuid = draft_id.into();
                hasher.update(&[1]);
                hasher.update(draft_id.as_bytes());
            } else {
                hasher.update(&[0]);
                hasher.update(&[0; 16]);
            }
        }
        hasher.finish()
    }
}

/// An explicit bidirectional map between generation rows and artifact ordinals.
#[derive(Debug)]
pub(crate) struct ArtifactIdentityMap {
    rows: Box<[GenerationRowId]>,
    ordinals: HashMap<GenerationRowId, ArtifactOrdinal>,
}

impl ArtifactIdentityMap {
    /// Assigns dense ordinals to `rows` in the supplied order.
    ///
    /// # Errors
    ///
    /// This returns an error when a row is absent from `directory`, occurs more
    /// than once, or the artifact exceeds the packed ordinal limit.
    ///
    /// # Complexity
    ///
    /// Construction runs in expected `O(n)` time and uses `O(n)` additional
    /// memory. Lookups in either direction are constant time.
    pub(crate) fn new(
        directory: &IdentityDirectory,
        rows: Vec<GenerationRowId>,
    ) -> Result<Self, IdentityError> {
        if rows.len() > MAX_GENERATION_ROWS {
            return Err(IdentityError::TooManyRows { count: rows.len() });
        }

        let mut ordinals = HashMap::with_capacity(rows.len());
        for (index, &row) in rows.iter().enumerate() {
            if directory.entity(row).is_none() {
                return Err(IdentityError::UnknownGenerationRow {
                    row,
                    rows: directory.len(),
                });
            }

            let ordinal = ArtifactOrdinal::try_from(index)
                .expect("should fit ArtifactOrdinal after validating the artifact row count");
            if let Some(first) = ordinals.insert(row, ordinal) {
                return Err(IdentityError::DuplicateArtifactRow {
                    row,
                    first,
                    duplicate: ordinal,
                });
            }
        }

        Ok(Self {
            rows: rows.into_boxed_slice(),
            ordinals,
        })
    }

    /// Returns the number of rows in the artifact.
    #[inline]
    pub(crate) const fn len(&self) -> usize {
        self.rows.len()
    }

    /// Returns whether the artifact contains no rows.
    #[inline]
    pub(crate) const fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    /// Resolves a generation row to its artifact ordinal.
    #[inline]
    pub(crate) fn ordinal(&self, row: GenerationRowId) -> Option<ArtifactOrdinal> {
        self.ordinals.get(&row).copied()
    }

    /// Resolves an artifact ordinal to its generation row.
    #[inline]
    pub(crate) fn row(&self, ordinal: ArtifactOrdinal) -> Option<GenerationRowId> {
        self.rows.get(ordinal.as_usize()).copied()
    }
}

#[cfg(test)]
mod tests;
