//! Borrowed base, delta, and merged read views.

use core::{error::Error, fmt, iter, marker::PhantomData};

use serde::{Deserialize, Serialize};

use crate::salt::revision::{BaseRevision, DataRevision, DeltaRevision};

/// Controls whether mutation may create nonempty delta revisions.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum IncrementalMode {
    /// Accept immutable base data and expose an empty delta.
    #[default]
    Disabled,
    /// Permit revisioned delta mutation.
    Enabled,
}

/// A stored record with a stable lookup key.
pub(crate) trait KeyedRecord {
    /// The key type shared by base, delta, and merged indexes.
    type Key: Eq;

    /// Borrows this record's lookup key.
    fn key(&self) -> &Self::Key;
}

/// An immutable view of one base revision.
pub(crate) trait BaseReader {
    /// The record stored in this base.
    type Record: KeyedRecord;

    /// A borrowed iterator in deterministic storage order.
    type Iter<'reader>: ExactSizeIterator<Item = &'reader Self::Record> + Clone
    where
        Self: 'reader;

    /// Returns the immutable base revision.
    fn revision(&self) -> BaseRevision;

    /// Returns the number of visible base records.
    fn len(&self) -> usize;

    /// Returns whether the base contains no visible records.
    #[inline]
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Looks up one base record by its stable key.
    fn get(&self, key: &<Self::Record as KeyedRecord>::Key) -> Option<&Self::Record>;

    /// Iterates over all base records in deterministic storage order.
    fn iter(&self) -> Self::Iter<'_>;
}

/// A borrowed delta operation visible at one revision.
#[derive(Debug, Copy, Clone)]
pub(crate) enum DeltaEntry<'reader, Record>
where
    Record: KeyedRecord,
{
    /// A record inserted into or superseded within the delta.
    Upsert(&'reader Record),
    /// A key masking a base or earlier-delta record.
    Tombstone(&'reader Record::Key),
}

impl<'reader, Record> DeltaEntry<'reader, Record>
where
    Record: KeyedRecord,
{
    /// Borrows the affected stable key.
    #[inline]
    pub(crate) fn key(self) -> &'reader Record::Key {
        match self {
            Self::Upsert(record) => record.key(),
            Self::Tombstone(key) => key,
        }
    }
}

/// An immutable view of an append-only delta revision.
pub(crate) trait DeltaReader {
    /// The record shared with the generation's base.
    type Record: KeyedRecord;

    /// A borrowed iterator in deterministic delta-log order.
    type Iter<'reader>: Iterator<Item = DeltaEntry<'reader, Self::Record>> + Clone
    where
        Self: 'reader;

    /// Returns the visible delta revision.
    fn revision(&self) -> DeltaRevision;

    /// Returns the number of visible delta operations.
    fn len(&self) -> usize;

    /// Returns whether the delta contains no visible operations.
    #[inline]
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Looks up the latest visible delta operation for `key`.
    fn get(&self, key: &<Self::Record as KeyedRecord>::Key)
    -> Option<DeltaEntry<'_, Self::Record>>;

    /// Iterates over visible delta operations in deterministic log order.
    fn iter(&self) -> Self::Iter<'_>;
}

/// A zero-allocation [`DeltaRevision`] zero view.
#[derive(Debug, Copy, Clone)]
pub(crate) struct EmptyDelta<Record> {
    marker: PhantomData<fn() -> Record>,
}

impl<Record> EmptyDelta<Record> {
    /// Creates an empty initial delta.
    #[must_use]
    #[inline]
    pub(crate) const fn new() -> Self {
        Self {
            marker: PhantomData,
        }
    }
}

impl<Record> Default for EmptyDelta<Record> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl<Record> DeltaReader for EmptyDelta<Record>
where
    Record: KeyedRecord,
{
    type Iter<'reader>
        = iter::Empty<DeltaEntry<'reader, Record>>
    where
        Self: 'reader;
    type Record = Record;

    #[inline]
    fn revision(&self) -> DeltaRevision {
        DeltaRevision::ZERO
    }

    #[inline]
    fn len(&self) -> usize {
        0
    }

    #[inline]
    fn get(&self, _key: &Record::Key) -> Option<DeltaEntry<'_, Record>> {
        None
    }

    #[inline]
    fn iter(&self) -> Self::Iter<'_> {
        iter::empty()
    }
}

/// A deterministic view after applying visible delta operations to a base.
pub(crate) trait MergedReader {
    /// The record shared by base and delta storage.
    type Record: KeyedRecord;

    /// A borrowed iterator in deterministic merged order.
    type Iter<'reader>: ExactSizeIterator<Item = &'reader Self::Record> + Clone
    where
        Self: 'reader;

    /// Returns the bound base and delta revisions.
    fn revision(&self) -> DataRevision;

    /// Returns the number of visible merged records.
    fn len(&self) -> usize;

    /// Returns whether the merged snapshot contains no visible records.
    #[inline]
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Looks up one visible merged record by stable key.
    fn get(&self, key: &<Self::Record as KeyedRecord>::Key) -> Option<&Self::Record>;

    /// Iterates over all visible records in deterministic merged order.
    fn iter(&self) -> Self::Iter<'_>;
}

/// A revision-zero base reader paired with an empty delta.
///
/// Construction accepts only [`IncrementalMode::Disabled`] and
/// [`BaseRevision`] zero.
#[derive(Debug)]
pub(crate) struct DisabledMergedReader<Base> {
    base: Base,
}

impl<Base> DisabledMergedReader<Base>
where
    Base: BaseReader,
{
    /// Binds an initial base to an empty delta.
    ///
    /// # Errors
    ///
    /// This returns an error when incremental mode is enabled or `base` is not
    /// [`BaseRevision`] zero.
    pub(crate) fn new(base: Base, mode: IncrementalMode) -> Result<Self, DisabledReadError> {
        if mode != IncrementalMode::Disabled {
            return Err(DisabledReadError::IncrementalModeEnabled);
        }
        if base.revision() != BaseRevision::ZERO {
            return Err(DisabledReadError::NonInitialBase {
                revision: base.revision(),
            });
        }
        Ok(Self { base })
    }

    /// Borrows the immutable base reader.
    #[inline]
    pub(crate) const fn base(&self) -> &Base {
        &self.base
    }

    /// Returns the empty initial delta view.
    #[inline]
    pub(crate) const fn delta(&self) -> EmptyDelta<Base::Record> {
        EmptyDelta::new()
    }

    /// Recovers the underlying base reader.
    #[inline]
    pub(crate) fn into_base(self) -> Base {
        self.base
    }
}

impl<Base> MergedReader for DisabledMergedReader<Base>
where
    Base: BaseReader,
{
    type Iter<'reader>
        = Base::Iter<'reader>
    where
        Self: 'reader;
    type Record = Base::Record;

    #[inline]
    fn revision(&self) -> DataRevision {
        DataRevision::ZERO
    }

    #[inline]
    fn len(&self) -> usize {
        self.base.len()
    }

    #[inline]
    fn get(&self, key: &<Self::Record as KeyedRecord>::Key) -> Option<&Self::Record> {
        self.base.get(key)
    }

    #[inline]
    fn iter(&self) -> Self::Iter<'_> {
        self.base.iter()
    }
}

/// An invalid disabled-mode merged reader.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum DisabledReadError {
    /// The caller requested a nonempty delta-capable mode.
    IncrementalModeEnabled,
    /// The base has already advanced beyond the initial revision.
    NonInitialBase { revision: BaseRevision },
}

impl fmt::Display for DisabledReadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IncrementalModeEnabled => {
                formatter.write_str("the reader requires incremental mode to be disabled")
            }
            Self::NonInitialBase { revision } => write!(
                formatter,
                "the reader requires base revision 0, found {revision}"
            ),
        }
    }
}

impl Error for DisabledReadError {}

#[cfg(test)]
mod tests;
