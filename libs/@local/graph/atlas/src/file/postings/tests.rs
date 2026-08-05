#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use hashql_core::id::Id as _;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    FileHeader, PaddedFileHeader,
    read::{OpenPostingsError, PostingsFile},
    write::{Regions, write_regions},
};
use crate::{
    bitset::{
        DenseBitSlice, DenseBitSliceArray, ParseDenseBitSliceArrayError, ParseDenseBitSliceError,
    },
    file::region::{PAGE_BYTES, header::HeaderError},
    identity::{BasePosition, OntologyRowId},
};

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-postings-file-{}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

/// A hand-built fixture of three types over ten base positions.
///
/// ```text
/// type 0: list  {0, 3, 9}; no parents
/// type 1: dense {1, 2, 5}; no parents
/// type 2: list  {} (empty run); parents {0, 1}
/// ```
///
/// Flags set: {1}. List entries `[0, 3, 9]` (`L = 3`), posts `[0, 3, 3, 3]`. One dense set
/// (`D = 1`). Parent ids `[0, 1]` (`P = 2`), posts `[0, 0, 0, 2]`. The direct map transposes the
/// membership: runs `0:{0} 1:{1} 2:{1} 3:{0} 5:{1} 9:{0}` with the other positions empty, so the
/// direct ids are `[0, 1, 1, 0, 1, 0]` (`M = 6`).
const POINTS: u64 = 10;
const LIST_POSTS: [u64; 4] = [0, 3, 3, 3];
const PARENT_POSTS: [u64; 4] = [0, 0, 0, 2];
const DIRECT_POSTS: [u64; 11] = [0, 1, 2, 3, 4, 4, 5, 5, 5, 5, 6];

fn fixture_flags() -> Box<DenseBitSlice<OntologyRowId>> {
    let mut flags = DenseBitSlice::new_empty(3);
    flags.insert(OntologyRowId::new(1));
    flags
}

fn fixture_dense() -> Box<DenseBitSliceArray<BasePosition>> {
    let mut sets = DenseBitSliceArray::new_empty(10, 1);
    sets[0].insert(BasePosition::from_u32(1));
    sets[0].insert(BasePosition::from_u32(2));
    sets[0].insert(BasePosition::from_u32(5));
    sets
}

fn fixture_list_entries() -> [BasePosition; 3] {
    [0, 3, 9].map(BasePosition::from_u32)
}

fn fixture_parent_ids() -> [OntologyRowId; 2] {
    [0, 1].map(OntologyRowId::new)
}

fn fixture_direct_ids() -> [OntologyRowId; 6] {
    [0, 1, 1, 0, 1, 0].map(OntologyRowId::new)
}

fn fixture_bytes() -> Vec<u8> {
    let flags = fixture_flags();
    let dense_sets = fixture_dense();
    let mut bytes = Vec::new();
    write_regions(
        Regions {
            points: POINTS,
            flags: &flags,
            list_posts: &LIST_POSTS,
            list_entries: &fixture_list_entries(),
            dense_sets: &dense_sets,
            parent_posts: &PARENT_POSTS,
            parent_ids: &fixture_parent_ids(),
            direct_posts: &DIRECT_POSTS,
            direct_ids: &fixture_direct_ids(),
        },
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(3, 10, 3, 1, 2, 6));
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTPOST");
    assert_eq!(bytes[8..12], 0_u32.to_le_bytes(), "version 0");
    assert_eq!(bytes[12..20], 3_u64.to_le_bytes(), "type count");
    assert_eq!(bytes[20..28], 10_u64.to_le_bytes(), "point count");
    assert_eq!(bytes[28..36], 3_u64.to_le_bytes(), "list entries");
    assert_eq!(bytes[36..44], 1_u64.to_le_bytes(), "dense sets");
    assert_eq!(bytes[44..52], 2_u64.to_le_bytes(), "parent edges");
    assert_eq!(bytes[52..60], 6_u64.to_le_bytes(), "direct entries");

    let mut wrong_magic = bytes.to_vec();
    wrong_magic[0] = b'W';
    PaddedFileHeader::try_ref_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    let mut wrong_version = bytes.to_vec();
    wrong_version[8] = 9;
    PaddedFileHeader::try_ref_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

#[test]
fn region_geometry() {
    // The geometry of three types over ten points - a 16-byte flags frame, two four-post regions,
    // two parent ids, an eleven-post direct region, six direct ids, one 16-byte dense set, three
    // list entries, every region padded to its own page.
    let header = FileHeader::new(3, 10, 3, 1, 2, 6);
    assert_eq!(header.fencepost_count(), Some(4));
    assert_eq!(header.direct_fencepost_count(), Some(11));
    assert_eq!(header.dense_sets_len(), Some(24));
    assert_eq!(header.list_posts_offset(), Some(0x2000));
    assert_eq!(header.parent_posts_offset(), Some(0x3000));
    assert_eq!(header.parent_ids_offset(), Some(0x4000));
    assert_eq!(header.direct_posts_offset(), Some(0x5000));
    assert_eq!(header.direct_ids_offset(), Some(0x6000));
    assert_eq!(header.dense_sets_offset(), Some(0x7000));
    assert_eq!(header.list_entries_offset(), Some(0x8000));
    assert_eq!(header.expected_file_len(), Some(0x8000 + 12));

    // The empty domain still carries its anchoring fenceposts, its (header-only) flags frame,
    // and the dense region's own domain header. The zero-size id and entry regions collapse onto
    // the next offset without disturbing alignment.
    let empty = FileHeader::new(0, 0, 0, 0, 0, 0);
    assert_eq!(empty.list_posts_offset(), Some(0x2000));
    assert_eq!(empty.parent_posts_offset(), Some(0x3000));
    assert_eq!(empty.parent_ids_offset(), Some(0x4000));
    assert_eq!(empty.direct_posts_offset(), Some(0x4000));
    assert_eq!(empty.direct_ids_offset(), Some(0x5000));
    assert_eq!(empty.dense_sets_offset(), Some(0x5000));
    assert_eq!(empty.dense_sets_len(), Some(8));
    assert_eq!(empty.list_entries_offset(), Some(0x6000));
    assert_eq!(empty.expected_file_len(), Some(0x6000));

    // Overflowing geometry matches no real file.
    assert_eq!(
        FileHeader::new(u64::MAX, 0, 0, 0, 0, 0).expected_file_len(),
        None
    );
    assert_eq!(
        FileHeader::new(0, u64::MAX, 0, 0, 0, 0).expected_file_len(),
        None
    );
    assert_eq!(
        FileHeader::new(0, 0, u64::MAX, 0, 0, 0).expected_file_len(),
        None
    );
    assert_eq!(
        FileHeader::new(0, 0, 0, u64::MAX, 0, 0).expected_file_len(),
        None
    );
    assert_eq!(
        FileHeader::new(0, 0, 0, 0, u64::MAX, 0).expected_file_len(),
        None
    );
    assert_eq!(
        FileHeader::new(0, 0, 0, 0, 0, u64::MAX).expected_file_len(),
        None
    );
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.post");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = PostingsFile::open(&path).expect("the written file reopens");
    assert_eq!(file.types(), 3);
    assert_eq!(file.points(), POINTS);
    assert_eq!(file.flags(), &*fixture_flags());
    assert_eq!(
        file.list_posts()
            .iter()
            .map(|post| post.get())
            .collect::<Vec<_>>(),
        LIST_POSTS,
    );
    assert_eq!(file.list_entries(), fixture_list_entries());
    assert_eq!(file.dense_sets(), &*fixture_dense());
    assert_eq!(
        file.parent_posts()
            .iter()
            .map(|post| post.get())
            .collect::<Vec<_>>(),
        PARENT_POSTS,
    );
    assert_eq!(file.parent_ids(), fixture_parent_ids());
    assert_eq!(
        file.direct_posts()
            .iter()
            .map(|post| post.get())
            .collect::<Vec<_>>(),
        DIRECT_POSTS,
    );
    assert_eq!(file.direct_ids(), fixture_direct_ids());
}

#[test]
fn empty_domain_reopens() {
    let path = scratch("empty.post");
    let flags = DenseBitSlice::new_empty(0);
    let mut bytes = Vec::new();
    write_regions(empty_regions(&flags), &mut bytes).expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = PostingsFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.types(), 0);
    assert_eq!(file.points(), 0);
    assert!(file.flags().is_empty());
    assert_eq!(file.list_posts().len(), 1);
    assert!(file.list_entries().is_empty());
    assert_eq!(file.parent_posts().len(), 1);
    assert!(file.parent_ids().is_empty());
    assert_eq!(file.direct_posts().len(), 1);
    assert!(file.direct_ids().is_empty());
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.post");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&undersized),
        Err(OpenPostingsError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.post");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&foreign),
        Err(OpenPostingsError::Header(_)),
    );

    let future = scratch("future-version.post");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&future),
        Err(OpenPostingsError::Header(_)),
    );

    let torn = scratch("torn.post");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&torn),
        Err(OpenPostingsError::Length { .. }),
    );
}

#[test]
fn open_rejects_incoherent_frames() {
    // The flags frame sits at the page boundary: domain header, then one word whose bit 1 is set.
    let excess = scratch("flags-excess.post");
    let mut bytes = fixture_bytes();
    bytes[PAGE_BYTES + 8] |= 0b1000;
    fs::write(&excess, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&excess),
        Err(OpenPostingsError::Flags(
            ParseDenseBitSliceError::ExcessBits
        )),
    );

    // A flags frame claiming a smaller domain parses cleanly on its own. Only the header check
    // refuses it.
    let shrunk = scratch("flags-domain.post");
    let mut bytes = fixture_bytes();
    bytes[PAGE_BYTES] = 2;
    fs::write(&shrunk, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&shrunk),
        Err(OpenPostingsError::FlagsDomain {
            types: 3,
            domain: 2
        }),
    );

    // A second flag bit contradicts the header's dense set count.
    let extra = scratch("flags-count.post");
    let mut bytes = fixture_bytes();
    bytes[PAGE_BYTES + 8] |= 0b1;
    fs::write(&extra, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&extra),
        Err(OpenPostingsError::DenseCount {
            header: 1,
            flagged: 2
        }),
    );

    // The dense region opens at 0x7000 with its own domain header. The frame at rank 0 follows
    // at 0x7008 with its restatement, then one word at 0x7010.
    let region_domain = scratch("dense-region-domain.post");
    let mut bytes = fixture_bytes();
    bytes[0x7000] = 9;
    fs::write(&region_domain, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&region_domain),
        Err(OpenPostingsError::DenseSets(
            ParseDenseBitSliceArrayError::Header {
                expected: 10,
                actual: 9
            }
        )),
    );

    let dense_domain = scratch("dense-domain.post");
    let mut bytes = fixture_bytes();
    bytes[0x7008] = 9;
    fs::write(&dense_domain, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&dense_domain),
        Err(OpenPostingsError::DenseSets(
            ParseDenseBitSliceArrayError::Domain {
                rank: 0,
                expected: 10,
                actual: 9
            }
        )),
    );

    let dense_excess = scratch("dense-excess.post");
    let mut bytes = fixture_bytes();
    bytes[0x7010 + 1] |= 0b1000_0000;
    fs::write(&dense_excess, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&dense_excess),
        Err(OpenPostingsError::DenseSets(
            ParseDenseBitSliceArrayError::Frame {
                rank: 0,
                error: ParseDenseBitSliceError::ExcessBits
            }
        )),
    );
}

/// The regions of an edgeless, typeless, pointless file: the smallest coherent write.
fn empty_regions(flags: &DenseBitSlice<OntologyRowId>) -> Regions<'_> {
    Regions {
        points: 0,
        flags,
        list_posts: &[0],
        list_entries: &[],
        // Leaked so the helper stays one-parameter. Each leaked empty array is 8 bytes.
        dense_sets: Box::leak(DenseBitSliceArray::new_empty(0, 0)),
        parent_posts: &[0],
        parent_ids: &[],
        direct_posts: &[0],
        direct_ids: &[],
    }
}

#[test]
#[should_panic(expected = "both fencepost regions cover the one type domain")]
fn writer_rejects_mismatched_post_regions() {
    let flags = DenseBitSlice::new_empty(0);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            list_posts: &[0, 0],
            ..empty_regions(&flags)
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the flags set covers the type domain")]
fn writer_rejects_missized_flags() {
    let flags = DenseBitSlice::new_empty(2);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(empty_regions(&flags), &mut sink);
}

#[test]
#[should_panic(expected = "the flags set marks one type per dense set")]
fn writer_rejects_unflagged_dense_sets() {
    let flags = DenseBitSlice::new_empty(0);
    let dense_sets = DenseBitSliceArray::<BasePosition>::new_empty(0, 1);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            dense_sets: &dense_sets,
            ..empty_regions(&flags)
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "every dense set covers the point domain")]
fn writer_rejects_missized_dense_sets() {
    let mut flags = DenseBitSlice::new_empty(1);
    flags.insert(OntologyRowId::new(0));
    let dense_sets = DenseBitSliceArray::<BasePosition>::new_empty(5, 1);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            points: 10,
            flags: &flags,
            list_posts: &[0, 0],
            list_entries: &[],
            dense_sets: &dense_sets,
            parent_posts: &[0, 0],
            parent_ids: &[],
            direct_posts: &[0; 11],
            direct_ids: &[],
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the final list fencepost closes the list entry array")]
fn writer_rejects_unclosed_list_posts() {
    let flags = DenseBitSlice::new_empty(0);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            list_posts: &[1],
            ..empty_regions(&flags)
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the final parent fencepost closes the parent id array")]
fn writer_rejects_unclosed_parent_posts() {
    let flags = DenseBitSlice::new_empty(0);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            parent_posts: &[1],
            ..empty_regions(&flags)
        },
        &mut sink,
    );
}

#[test]
#[should_panic(
    expected = "the direct fencepost region covers the point domain plus its closing post"
)]
fn writer_rejects_missized_direct_posts() {
    let flags = DenseBitSlice::new_empty(0);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            direct_posts: &[0, 0],
            ..empty_regions(&flags)
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the final direct fencepost closes the direct id array")]
fn writer_rejects_unclosed_direct_posts() {
    let flags = DenseBitSlice::new_empty(0);
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            direct_posts: &[1],
            ..empty_regions(&flags)
        },
        &mut sink,
    );
}
