//! Row identity persistence: source ids per row, translated both ways.
//!
//! [`IdentityTable`] collects one domain's source ids in row order during the dataset drain and
//! writes them as one identity file; [`IdentityTableArchive`] reopens a written file as the typed
//! lookup surface: `row → id` by indexing, `id → row` by binary search over the file's sorted
//! pairs behind its index prelude, faulting two pages on a cold lookup.
//!
//! The id type is the dataset's ([`Dataset::NodeId`] / [`Dataset::EdgeId`]): byte-level stable,
//! opaque to the pipeline, ordered here by its bytes since source identifiers carry no other order.
//! The file format is `file::identity`'s; this module owns the table's domain invariants - strictly
//! ascending pair ids, rows inside the domain, pair agreement with the id column, index agreement
//! with the pairs - validated once on open with one `O(N)` pass, so every lookup after that is
//! unchecked.
//!
//! [`Dataset::NodeId`]: crate::dataset::Dataset::NodeId
//! [`Dataset::EdgeId`]: crate::dataset::Dataset::EdgeId
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{error::Error, fmt, marker::PhantomData};
use std::io;

use zerocopy::{FromBytes as _, IntoBytes as _, LE, U64};

use crate::{
    file::{
        WriteInto,
        identity::{read::IdentityFile, write::write_regions},
        region::ByteStable,
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

/// One domain's source ids, collected in row order.
///
/// Push ids as the dataset stream yields rows; the table is the whole column resident, sorted once
/// at [`write_into`](Self::write_into).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IdentityTable<I> {
    ids: Vec<I>,
}

impl<I> IdentityTable<I>
where
    I: ByteStable,
{
    /// Creates an empty table.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self { ids: Vec::new() }
    }

    /// Appends the id of the next row.
    #[inline]
    pub(crate) fn push(&mut self, id: I) {
        self.ids.push(id);
    }

    /// Returns the number of rows collected.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> u64 {
        self.ids.len() as u64
    }
}

impl<I> WriteInto for IdentityTable<I>
where
    I: ByteStable,
{
    type Error = io::Error;

    /// Writes the table as one identity file, returning the digest of the written bytes.
    ///
    /// Every region streams in file order; wrap a raw [`File`](std::fs::File) in a
    /// [`BufWriter`](io::BufWriter).
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// Panics when two rows carry one id, which the dataset row contract excludes.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries write failures; duplicate ids are an upstream contract \
                  violation, documented under Panics"
    )]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "a resident table's rows fit the address space, and an id width is a type's \
                  size, far below u32"
    )]
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        const {
            assert!(size_of::<I>() > 0, "a zero-sized id identifies nothing");
        }

        let mut order: Vec<u64> = (0..self.ids.len() as u64).collect();
        order.sort_unstable_by(|&left, &right| {
            self.ids[left as usize]
                .as_bytes()
                .cmp(self.ids[right as usize].as_bytes())
        });
        assert!(
            order.array_windows::<2>().all(|&[left, right]| {
                self.ids[left as usize].as_bytes() < self.ids[right as usize].as_bytes()
            }),
            "two rows carry one id",
        );

        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };
        write_regions(
            size_of::<I>() as u32,
            self.ids.as_bytes(),
            &order,
            &mut writer,
        )?;

        Ok(writer.accumulator.finalize())
    }
}

/// One lookup pair of the mapped file: an id and its row.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(C)]
struct Pair<I> {
    id: I,
    row: U64<LE>,
}

/// A structurally valid identity file whose contents violate the table's domain invariants.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InvalidIdentityFile {
    /// The file's id width is not the id type's.
    KeyWidth { expected: u32, actual: u32 },
    /// A pair's id is not strictly above its predecessor's.
    UnsortedPairs { position: u64 },
    /// A pair references a row outside the domain.
    RowOutOfDomain { position: u64, row: u64 },
    /// A pair's id disagrees with the id column at its row.
    ColumnDisagreement { row: u64 },
    /// An index key disagrees with the first pair of its stride.
    IndexDisagreement { key: u64 },
}

impl fmt::Display for InvalidIdentityFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::KeyWidth { expected, actual } => write!(
                fmt,
                "the file holds {actual}-byte ids where the id type is {expected} bytes wide",
            ),
            Self::UnsortedPairs { position } => {
                write!(fmt, "pair {position} is not strictly above its predecessor")
            }
            Self::RowOutOfDomain { position, row } => {
                write!(
                    fmt,
                    "pair {position} references row {row} outside the domain"
                )
            }
            Self::ColumnDisagreement { row } => {
                write!(fmt, "the pair for row {row} disagrees with the id column")
            }
            Self::IndexDisagreement { key } => {
                write!(
                    fmt,
                    "index key {key} disagrees with the first pair of its stride"
                )
            }
        }
    }
}

impl Error for InvalidIdentityFile {}

/// A written identity table reopened as its mapped lookup surface.
///
/// Construction validates the domain invariants in one pass, so the lookups are unchecked
/// afterwards: [`id`](Self::id) indexes the id column and [`row_of`](Self::row_of) binary-searches
/// the sorted pairs behind the file's index prelude.
#[derive(Debug)]
pub(crate) struct IdentityTableArchive<I> {
    // TODO: have this be typed
    file: IdentityFile,
    id: PhantomData<I>,
}

impl<I> IdentityTableArchive<I>
where
    I: ByteStable,
{
    /// Validates a mapped identity file as a lookup table over `I`.
    ///
    /// # Errors
    ///
    /// Returns an error when the file's id width is not `I`'s, or when any pair, row reference, or
    /// index key violates the invariants listed on [`InvalidIdentityFile`].
    #[expect(
        clippy::cast_possible_truncation,
        reason = "an id width is a type's size, far below u32"
    )]
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "stride-block arithmetic is exact: pair `i` belongs to index key `i / stride`"
    )]
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: IdentityFile) -> Result<Self, InvalidIdentityFile> {
        let expected = size_of::<I>() as u32;
        if file.key_width() != expected {
            return Err(InvalidIdentityFile::KeyWidth {
                expected,
                actual: file.key_width(),
            });
        }

        let table = Self {
            file,
            id: PhantomData,
        };
        let ids = table.ids();
        let pairs = table.pairs();
        let keys = table.index_keys();
        let stride = table.file.stride() as usize;

        let mut predecessor: Option<&[u8]> = None;
        for (position, pair) in pairs.iter().enumerate() {
            let id = pair.id.as_bytes();
            if predecessor.is_some_and(|predecessor| predecessor >= id) {
                return Err(InvalidIdentityFile::UnsortedPairs {
                    position: position as u64,
                });
            }
            predecessor = Some(id);

            let row = pair.row.get();
            let Some(column) = ids.get(usize::try_from(row).unwrap_or(usize::MAX)) else {
                return Err(InvalidIdentityFile::RowOutOfDomain {
                    position: position as u64,
                    row,
                });
            };
            if column.as_bytes() != id {
                return Err(InvalidIdentityFile::ColumnDisagreement { row });
            }

            if position % stride == 0 && keys[position / stride].as_bytes() != id {
                return Err(InvalidIdentityFile::IndexDisagreement {
                    key: (position / stride) as u64,
                });
            }
        }

        Ok(table)
    }

    /// Views the id column, in row order.
    #[must_use]
    pub(crate) fn ids(&self) -> &[I] {
        <[I]>::ref_from_bytes(self.file.ids())
            .expect("open validated the region size and `I` is unaligned")
    }

    /// Views the lookup pairs, ascending by id bytes.
    fn pairs(&self) -> &[Pair<I>] {
        <[Pair<I>]>::ref_from_bytes(self.file.pairs())
            .expect("open validated the region size and the pair is unaligned")
    }

    /// Views the index keys, one per stride of pairs.
    fn index_keys(&self) -> &[I] {
        <[I]>::ref_from_bytes(self.file.index_keys())
            .expect("open validated the region size and `I` is unaligned")
    }

    /// Returns the number of rows.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> u64 {
        self.file.rows()
    }

    /// Returns the id of `row`, or [`None`] beyond the domain.
    #[must_use]
    pub(crate) fn id(&self, row: u64) -> Option<I> {
        self.ids().get(usize::try_from(row).ok()?).copied()
    }

    /// Returns the row carrying `id`, or [`None`] when no row does.
    ///
    /// The index prelude narrows the search to one stride of pairs, so a cold lookup faults two
    /// pages instead of `log2(N)` scattered ones.
    #[must_use]
    pub(crate) fn row_of(&self, id: I) -> Option<u64> {
        let bytes = id.as_bytes();
        let keys = self.index_keys();

        // The last stride whose first id is at or below the probe; a
        // probe below every key precedes every pair.
        let block = keys
            .partition_point(|key| key.as_bytes() <= bytes)
            .checked_sub(1)?;

        let pairs = self.pairs();
        let stride = self.file.stride() as usize;
        let start = block * stride;
        let window = &pairs[start..usize::min(start + stride, pairs.len())];

        let position = window
            .binary_search_by(|pair| pair.id.as_bytes().cmp(bytes))
            .ok()?;

        Some(window[position].row.get())
    }
}
