//! Row identity persistence for source ids and display payloads.
//!
//! [`IdentityTable`] collects one domain's source ids in row order during the dataset drain and
//! writes them as one identity file, with the display payloads streaming into the write call
//! rather than residing in the table. [`IdentityTableArchive`] reopens a written file as the
//! typed lookup surface: `row → id` by indexing the id column, `id → row` by one index lookup,
//! and `row → payload` by slicing the payload region through the span table.
//!
//! The id type is the dataset's ([`Dataset::NodeId`] / [`Dataset::EdgeId`]): byte-level stable,
//! opaque to the pipeline, ordered by its bytes since source identifiers carry no other order.
//! The payload is the row's display bytes, a label for node and edge rows and an icon for
//! ontology rows, empty when the row displays nothing. The file format is
//! [`file::identity`](crate::file::identity)'s, and the row domain a file covers travels in
//! its header, so a file reopens only under the row type that wrote it.
//!
//! This module owns the table's domain invariants. The index holds exactly one entry per row and
//! every entry agrees with the id column, which makes the index and the column two views of one
//! bijection, every span lies inside the payload region, and every span's bytes cast as the id
//! type's payload. One `O(N)` pass validates all of that on open, so a lookup afterwards never
//! reports a malformed file.
//!
//! [`Dataset::NodeId`]: crate::dataset::Dataset::NodeId
//! [`Dataset::EdgeId`]: crate::dataset::Dataset::EdgeId

use core::{error::Error, fmt, marker::PhantomData};
use std::io;

use fst::Streamer as _;
use hashql_core::id::{IdSlice, IdVec};
use zerocopy::{FromBytes as _, TryFromBytes as _};

use crate::{
    file::identity::{
        Key, KeyKind, Kind, PayloadSpan, Row, read::IdentityFile, write::write_regions,
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

/// One domain's source ids, collected in row order.
///
/// Push one id per row as the dataset stream yields rows. The table is the id column resident,
/// with the index derived and the display payloads supplied at [`write_into`](Self::write_into).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IdentityTable<R, K> {
    ids: IdVec<R, K>,
}

impl<R, K> IdentityTable<R, K>
where
    R: Row,
    K: Key,
{
    /// Creates an empty table.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self { ids: IdVec::new() }
    }

    /// Appends the next row's id, returning the row it occupies.
    #[inline]
    pub(crate) fn push(&mut self, id: K) -> R {
        self.ids.push(id)
    }

    /// Returns the number of rows collected.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> u64 {
        self.ids.len() as u64
    }

    /// Writes the table as one identity file, returning the digest of the written bytes.
    ///
    /// `payloads` yields each row's display payload in row order, with each payload's bytes
    /// entering the payload region verbatim. Every region streams in file order. Wrap a raw
    /// [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter).
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when `payloads` does not yield exactly one payload per row, or when two rows
    /// carry one id, which the dataset row contract excludes. The check runs before any byte
    /// reaches the writer.
    pub(crate) fn write_into<'a>(
        &self,
        payloads: impl IntoIterator<Item = &'a K::Payload>,
        write: impl io::Write,
    ) -> io::Result<Sha256Digest>
    where
        K: Key<Payload: 'a>,
    {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };
        write_regions(R::KIND, self.ids.as_slice(), payloads, &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

/// A structurally valid identity file whose contents violate the table's domain invariants.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InvalidIdentityFile {
    /// The file covers a different row domain.
    Domain { expected: Kind, actual: Kind },
    /// The file's key kind is not the id type's.
    KeyKind { expected: KeyKind, actual: KeyKind },
    /// The index holds a different number of entries than the file has rows.
    IndexSize { rows: u64, entries: u64 },
    /// An index entry references a row outside the domain.
    RowOutOfDomain { row: u64 },
    /// An index entry's id disagrees with the id column at its row.
    ColumnDisagreement { row: u64 },
    /// A span reaches beyond the payload region.
    SpanOutOfBounds { row: u64 },
    /// A span's bytes do not cast as the id type's payload.
    Payload { row: u64 },
}

impl fmt::Display for InvalidIdentityFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Domain { expected, actual } => write!(
                fmt,
                "the file covers the {actual} row domain where the table covers {expected}",
            ),
            Self::KeyKind { expected, actual } => write!(
                fmt,
                "the file holds {actual} ids where the id type is {expected}",
            ),
            Self::IndexSize { rows, entries } => write!(
                fmt,
                "the index holds {entries} entries where the file has {rows} rows",
            ),
            Self::RowOutOfDomain { row } => {
                write!(
                    fmt,
                    "an index entry references row {row} outside the domain"
                )
            }
            Self::ColumnDisagreement { row } => {
                write!(
                    fmt,
                    "the index entry for row {row} disagrees with the id column"
                )
            }
            Self::SpanOutOfBounds { row } => {
                write!(
                    fmt,
                    "the span of row {row} reaches beyond the payload region"
                )
            }
            Self::Payload { row } => {
                write!(
                    fmt,
                    "the payload bytes of row {row} do not cast as the id type's payload"
                )
            }
        }
    }
}

impl Error for InvalidIdentityFile {}

/// A written identity table reopened as its mapped lookup surface.
///
/// Construction validates the domain invariants in one pass, so the lookups skip validation
/// afterwards: [`id`](Self::id) indexes the id column, [`row_of`](Self::row_of) resolves one
/// index lookup, and [`payload_of`](Self::payload_of) slices the payload region through the span
/// table. The table translates between one id domain and one row domain: `K` is the source id
/// type and `R` the row identity its lookups answer.
#[derive(Debug)]
pub(crate) struct IdentityTableArchive<K, R> {
    file: IdentityFile,
    id: PhantomData<K>,
    row: PhantomData<R>,
}

impl<K, R> IdentityTableArchive<K, R>
where
    K: Key,
    R: Row,
{
    /// Validates a mapped identity file as a lookup table over `K` covering `R`'s row domain.
    ///
    /// # Errors
    ///
    /// Returns an error when the file covers a different row domain, when its key kind is not
    /// `K`'s, or when the index or a span violates the invariants listed on
    /// [`InvalidIdentityFile`].
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: IdentityFile) -> Result<Self, InvalidIdentityFile> {
        if file.kind() != R::KIND {
            return Err(InvalidIdentityFile::Domain {
                expected: R::KIND,
                actual: file.kind(),
            });
        }

        if file.key_kind() != K::KIND {
            return Err(InvalidIdentityFile::KeyKind {
                expected: K::KIND,
                actual: file.key_kind(),
            });
        }

        let table = Self {
            file,
            id: PhantomData,
            row: PhantomData,
        };

        let ids = table.ids().as_raw();
        let index = table.file.index();
        if index.len() as u64 != table.file.rows() {
            return Err(InvalidIdentityFile::IndexSize {
                rows: table.file.rows(),
                entries: index.len() as u64,
            });
        }

        // One entry per row plus column agreement makes the index a bijection: the map's keys
        // are pairwise distinct, so two entries agreeing with one row's column bytes would be
        // one key twice.
        let mut entries = index.stream();
        while let Some((id, row)) = entries.next() {
            let Some(column) = ids.get(usize::try_from(row).unwrap_or(usize::MAX)) else {
                return Err(InvalidIdentityFile::RowOutOfDomain { row });
            };
            if column.as_bytes() != id {
                return Err(InvalidIdentityFile::ColumnDisagreement { row });
            }
        }

        let payload = table.file.payload();
        for (row, span) in table.file.spans().iter().enumerate() {
            let end = span.offset().checked_add(span.length());
            if end.is_none_or(|end| end > payload.len() as u64) {
                return Err(InvalidIdentityFile::SpanOutOfBounds { row: row as u64 });
            }

            #[expect(
                clippy::cast_possible_truncation,
                reason = "the check above bounded the span by the payload region, whose length is \
                          a `usize`"
            )]
            let (offset, length) = (span.offset() as usize, span.length() as usize);
            if <K::Payload>::try_ref_from_bytes(&payload[offset..offset + length]).is_err() {
                return Err(InvalidIdentityFile::Payload { row: row as u64 });
            }
        }

        Ok(table)
    }

    /// Views the id column, in row order.
    #[must_use]
    pub(crate) fn ids(&self) -> &IdSlice<R, K> {
        IdSlice::from_raw(
            <[K]>::ref_from_bytes(self.file.keys())
                .expect("open validated the key kind and `K` is unaligned"),
        )
    }

    /// Views the span table, one payload-relative span per row.
    fn spans(&self) -> &IdSlice<R, PayloadSpan> {
        IdSlice::from_raw(self.file.spans())
    }

    /// Returns the number of rows.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> u64 {
        self.file.rows()
    }

    /// Returns the id of `row`, or [`None`] beyond the domain.
    #[must_use]
    pub(crate) fn id(&self, row: R) -> Option<K> {
        self.ids().get(row).copied()
    }

    /// Returns the row carrying `id`, or [`None`] when no row does.
    #[must_use]
    pub(crate) fn row_of(&self, id: K) -> Option<R> {
        self.file.index().get(id.as_bytes()).map(R::from_u64)
    }

    /// Returns the display payload of `row`, or [`None`] beyond the domain.
    ///
    /// A row without a display value returns the empty payload.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "`Self::new` bounded every span by the payload region, whose length is a `usize`"
    )]
    #[must_use]
    pub(crate) fn payload_of(&self, row: R) -> Option<&K::Payload> {
        let span = self.spans().get(row)?;
        let offset = span.offset() as usize;
        let length = span.length() as usize;

        let bytes = &self.file.payload()[offset..offset + length];
        // SAFETY: `Self::new` cast every span's bytes as `K::Payload` and rejected the file
        // otherwise, and the mapped file is immutable under the `crate::file` publish contract,
        // so the bytes validated there are the bytes sliced here.
        Some(unsafe { <K::Payload>::try_ref_from_bytes(bytes).unwrap_unchecked() })
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;
    use std::{fs, path::PathBuf};

    use fst::MapBuilder;
    use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

    use super::{IdentityTable, IdentityTableArchive, InvalidIdentityFile};
    use crate::{
        dataset::{
            auxiliary::{Icon, Label},
            memory::{MemoryNodeId, MemoryOntologyId},
            postgres::id::ArchivedOntologyTypeUuid,
        },
        file::{
            identity::{FileHeader, KeyKind, Kind, PaddedFileHeader, read::IdentityFile},
            region::write_region,
        },
        identity::{NodeRowId, OntologyRowId},
        integrity::Sha256Digest,
    };

    /// A per-test scratch file path under the system temp directory.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "hash-graph-atlas-prepare-identity-{}",
            std::process::id(),
        ));
        fs::create_dir_all(&dir).expect("the temp directory is writable");
        dir.join(name)
    }

    /// Borrows `text` as a label.
    fn label(text: &str) -> &Label {
        Label::try_ref_from_bytes(text.as_bytes()).expect("UTF-8 text is a valid label")
    }

    // Ids in row order; ascending id-byte order is rows 2, 0, 1.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the fixture pins ids whose little-endian bytes sort unlike their values"
    )]
    const IDS: [MemoryNodeId; 3] = [
        MemoryNodeId::new(u64::from_le_bytes([9, 0, 0, 1, 0, 0, 0, 0])),
        MemoryNodeId::new(u64::from_le_bytes([9, 0, 0, 2, 0, 0, 0, 0])),
        MemoryNodeId::new(u64::from_le_bytes([3, 7, 7, 7, 0, 0, 0, 0])),
    ];

    /// Writes a three-row node table, returning the path and the digest `write_into` reported.
    fn written_fixture(name: &str) -> (PathBuf, Sha256Digest) {
        let mut table = IdentityTable::<NodeRowId, _>::new();
        assert_eq!(table.push(IDS[0]), NodeRowId::new(0));
        assert_eq!(table.push(IDS[1]), NodeRowId::new(1));
        assert_eq!(table.push(IDS[2]), NodeRowId::new(2));
        assert_eq!(table.len(), 3);

        let mut bytes = Vec::new();
        let digest = table
            .write_into([label("beta"), label("alpha"), label("")], &mut bytes)
            .expect("writing into a vector cannot fail");

        let path = scratch(name);
        fs::write(&path, &bytes).expect("the scratch file is writable");
        (path, digest)
    }

    #[test]
    fn written_table_reopens_with_all_three_translations() {
        let (path, digest) = written_fixture("roundtrip.idnt");

        // The digest is the digest of the written bytes.
        let bytes = fs::read(&path).expect("the scratch file reads back");
        assert_eq!(digest, Sha256Digest::of(&bytes));

        let table = IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
            IdentityFile::open(&path).expect("the written file reopens"),
        )
        .expect("the written table validates");

        assert_eq!(table.len(), 3);

        // row → id → row round-trips for every row, and misses answer `None`.
        for (position, id) in IDS.iter().enumerate() {
            let row = NodeRowId::new(position as u64);
            assert_eq!(table.id(row), Some(*id));
            assert_eq!(table.row_of(*id), Some(row));
        }
        assert_eq!(table.id(NodeRowId::new(3)), None);
        assert_eq!(table.row_of(MemoryNodeId::new(0)), None);

        // row → payload slices the interned region, empty bytes included.
        assert_eq!(table.payload_of(NodeRowId::new(0)), Some(label("beta")));
        assert_eq!(table.payload_of(NodeRowId::new(1)), Some(label("alpha")));
        assert_eq!(table.payload_of(NodeRowId::new(2)), Some(label("")));
        assert_eq!(table.payload_of(NodeRowId::new(3)), None);
    }

    #[test]
    fn empty_table_round_trips() {
        let table = IdentityTable::<OntologyRowId, MemoryOntologyId>::new();
        let mut bytes = Vec::new();
        let _digest = table
            .write_into(core::iter::empty::<&Icon>(), &mut bytes)
            .expect("writing into a vector cannot fail");

        let path = scratch("empty.idnt");
        fs::write(&path, &bytes).expect("the scratch file is writable");

        let table = IdentityTableArchive::<MemoryOntologyId, OntologyRowId>::new(
            IdentityFile::open(&path).expect("the empty file reopens"),
        )
        .expect("the empty table validates");
        assert_eq!(table.len(), 0);
        assert_eq!(table.row_of(MemoryOntologyId::new(0)), None);
    }

    #[test]
    #[should_panic(expected = "two rows carry one key")]
    fn table_refuses_duplicate_ids_at_write() {
        let mut table = IdentityTable::<NodeRowId, _>::new();
        table.push(MemoryNodeId::new(7));
        table.push(MemoryNodeId::new(7));

        let _result = table.write_into(core::iter::repeat_n(label(""), 2), &mut Vec::new());
    }

    #[test]
    fn lookups_hold_at_six_hundred_rows() {
        // Little-endian bytes of 0..600 sort unlike the values, so the write path's ordering
        // and the index lookups both face a non-monotone id column.
        let mut table = IdentityTable::<NodeRowId, _>::new();
        for id in 0..600_u64 {
            table.push(MemoryNodeId::new(id));
        }
        let mut bytes = Vec::new();
        let _digest = table
            .write_into(core::iter::repeat_n(label(""), 600), &mut bytes)
            .expect("writing into a vector cannot fail");

        let path = scratch("six-hundred.idnt");
        fs::write(&path, &bytes).expect("the scratch file is writable");

        let table = IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
            IdentityFile::open(&path).expect("the written file reopens"),
        )
        .expect("the written table validates");

        for row in [0_u64, 255, 256, 257, 511, 512, 599] {
            assert_eq!(
                table.row_of(MemoryNodeId::new(row)),
                Some(NodeRowId::new(row)),
                "row {row}"
            );
            assert_eq!(table.id(NodeRowId::new(row)), Some(MemoryNodeId::new(row)));
        }
        assert_eq!(table.row_of(MemoryNodeId::new(600)), None);
    }

    #[test]
    fn archive_refuses_a_foreign_row_domain() {
        let (path, _digest) = written_fixture("foreign-domain.idnt");

        assert_matches!(
            IdentityTableArchive::<MemoryNodeId, OntologyRowId>::new(
                IdentityFile::open(&path).expect("the written file reopens"),
            ),
            Err(InvalidIdentityFile::Domain {
                expected: Kind::Ontology,
                actual: Kind::Nodes,
            }),
        );
    }

    #[test]
    fn archive_refuses_a_foreign_id_type() {
        let (path, _digest) = written_fixture("foreign-id.idnt");

        assert_matches!(
            IdentityTableArchive::<ArchivedOntologyTypeUuid, NodeRowId>::new(
                IdentityFile::open(&path).expect("the written file reopens"),
            ),
            Err(InvalidIdentityFile::KeyKind {
                expected: KeyKind::OntologyTypeUuid,
                actual: KeyKind::U64Le,
            }),
        );
    }

    #[test]
    fn archive_refuses_a_disagreeing_id_column() {
        let (path, _digest) = written_fixture("disagreeing-column.idnt");

        // Row 0's first column byte moves under the index: the file stays structurally valid
        // and the index entry for row 0 no longer matches the column.
        let mut bytes = fs::read(&path).expect("the scratch file reads back");
        bytes[4096] = 8;
        fs::write(&path, &bytes).expect("the scratch file is writable");

        assert_matches!(
            IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
                IdentityFile::open(&path).expect("the patched file still reopens"),
            ),
            Err(InvalidIdentityFile::ColumnDisagreement { row: 0 }),
        );
    }

    #[test]
    fn archive_refuses_a_span_beyond_the_payload() {
        let (path, _digest) = written_fixture("overreaching-span.idnt");

        // Three eight-byte ids pad to one region unit each for column and index, so the span
        // table starts at 12288. Row 0's length field is its second eight-byte word.
        let mut bytes = fs::read(&path).expect("the scratch file reads back");
        bytes[12296..12304].fill(0xFF);
        fs::write(&path, &bytes).expect("the scratch file is writable");

        assert_matches!(
            IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
                IdentityFile::open(&path).expect("the patched file still reopens"),
            ),
            Err(InvalidIdentityFile::SpanOutOfBounds { row: 0 }),
        );
    }

    #[test]
    fn archive_refuses_a_payload_that_is_not_utf8() {
        let (path, _digest) = written_fixture("invalid-payload.idnt");

        // The payload region starts at 0x4000 and row 0's span selects its first four bytes.
        // 0xFF appears in no UTF-8 sequence, so the typed cast refuses.
        let mut bytes = fs::read(&path).expect("the scratch file reads back");
        bytes[0x4000] = 0xFF;
        fs::write(&path, &bytes).expect("the scratch file is writable");

        assert_matches!(
            IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
                IdentityFile::open(&path).expect("the patched file still reopens"),
            ),
            Err(InvalidIdentityFile::Payload { row: 0 }),
        );
    }

    #[test]
    fn archive_refuses_an_index_missing_a_row() {
        // Hand-crafted geometry the writer refuses to produce: two rows whose index carries one
        // entry. The format accepts it, and the typed open is what refuses.
        let keys = [U64::<LE>::new(1), U64::<LE>::new(2)];
        let mut builder = MapBuilder::memory();
        builder
            .insert(keys[0].as_bytes(), 0)
            .expect("one insert cannot collide");
        let index = builder
            .into_inner()
            .expect("an in-memory index build performs no io");

        let header = FileHeader::new(Kind::Nodes, KeyKind::U64Le, 2, index.len() as u64, 0);
        let mut bytes = Vec::new();
        bytes.extend_from_slice(PaddedFileHeader::new(header).as_bytes());
        write_region(&mut bytes, keys.as_bytes()).expect("writing into a vector cannot fail");
        write_region(&mut bytes, &index).expect("writing into a vector cannot fail");
        write_region(&mut bytes, [0_u8; 32].as_slice()).expect("writing into a vector cannot fail");

        let path = scratch("missing-row.idnt");
        fs::write(&path, &bytes).expect("the scratch file is writable");

        assert_matches!(
            IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
                IdentityFile::open(&path).expect("the crafted file reopens"),
            ),
            Err(InvalidIdentityFile::IndexSize {
                rows: 2,
                entries: 1,
            }),
        );
    }
}
