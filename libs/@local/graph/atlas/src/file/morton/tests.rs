#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
use core::{assert_matches, ops::Range};
use std::{fs, path::PathBuf};

use hashql_core::id::Id as _;
use proptest::{arbitrary::any, prop_assert_eq, property_test};
use zerocopy::{IntoBytes as _, TryFromBytes as _, U64};

use super::{
    FencepostError, Fenceposts, FileHeader, POSTS, PaddedFileHeader, SEGMENTS,
    read::{MortonFile, OpenMortonError},
    write::{PAGE_STRIDE, write_regions},
};
use crate::{
    file::region::{PAGE_BYTES, header::HeaderError, machine::Machine},
    identity::BasePosition,
    morton::{Depth, MortonCell, MortonKey},
};

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("test depths lie within the documented domain")
}

/// Fenceposts holding `lengths.len()` leading segments and empty ones behind them.
fn posts_of(lengths: &[u64]) -> Fenceposts<BasePosition> {
    let mut all = [0_u64; SEGMENTS];
    all[..lengths.len()].copy_from_slice(lengths);
    Fenceposts::from_lengths(&all).expect("test lengths fit u64")
}

/// A typed base-position range.
fn span(range: Range<u32>) -> Range<BasePosition> {
    BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end)
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-morton-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

#[test]
fn fenceposts_carry_the_structural_rules() {
    // Anchored, non-decreasing posts wrap; segment ranges and the
    // histogram read back what built them.
    let posts = posts_of(&[2, 0, 3]);
    assert_eq!(posts.count(), 5);
    assert_eq!(posts.segment(depth(0)), span(0..2));
    assert_eq!(posts.segment(depth(1)), span(2..2));
    assert_eq!(posts.segment(depth(2)), span(2..5));
    assert_eq!(posts.segment(depth(32)), span(5..5));
    let lengths = posts.lengths();
    assert_eq!(&lengths[..3], &[2, 0, 3]);
    assert!(lengths[3..].iter().all(|&length| length == 0));

    // A first post off zero breaks the anchor; a decreasing post
    // names its offender.
    let mut raw = *posts.as_raw();
    raw[0] = U64::new(1);
    assert_eq!(
        Fenceposts::<BasePosition>::new(raw),
        Err(FencepostError::Anchor),
    );

    let mut raw = *posts.as_raw();
    raw[2] = U64::new(1);
    assert_eq!(
        Fenceposts::<BasePosition>::new(raw),
        Err(FencepostError::Order { index: 2 }),
    );

    // Accumulation overflow matches no real column.
    let mut lengths = [0_u64; SEGMENTS];
    lengths[0] = u64::MAX;
    lengths[1] = 1;
    assert_eq!(Fenceposts::<BasePosition>::from_lengths(&lengths), None);
}

/// The borrowed door wraps a valid fencepost array in place and refuses the same structural
/// breaks the owning constructor refuses.
#[test]
fn try_from_ref_wraps_in_place_and_refuses_structural_breaks() {
    let posts = posts_of(&[2, 0, 3]);
    let raw = *posts.as_raw();

    let wrapped =
        Fenceposts::<BasePosition>::try_from_ref(&raw).expect("anchored, non-decreasing posts");
    assert_eq!(
        core::ptr::from_ref(wrapped).cast::<u8>(),
        core::ptr::from_ref(&raw).cast::<u8>(),
        "try_from_ref must reuse the source storage",
    );
    assert_eq!(*wrapped, posts);

    let mut anchor_broken = raw;
    anchor_broken[0] = U64::new(1);
    assert_eq!(
        Fenceposts::<BasePosition>::try_from_ref(&anchor_broken),
        Err(FencepostError::Anchor),
    );

    let mut descending = raw;
    descending[2] = U64::new(1);
    assert_eq!(
        Fenceposts::<BasePosition>::try_from_ref(&descending),
        Err(FencepostError::Order { index: 2 }),
    );
}

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(512, posts_of(&[600, 400])));
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTMRTN");
    assert_eq!(bytes[8..12], 2_u32.to_le_bytes(), "version 2");
    assert_eq!(
        &bytes[12..16],
        Machine::current().as_bytes(),
        "machine information"
    );
    assert_eq!(bytes[16..20], 512_u32.to_le_bytes(), "index stride");
    // Fenceposts: 0, 600, then 1000 repeated to the last post.
    assert_eq!(bytes[20..28], 0_u64.to_le_bytes());
    assert_eq!(bytes[28..36], 600_u64.to_le_bytes());
    for post in 2..POSTS {
        let offset = 20 + post * 8;
        assert_eq!(bytes[offset..offset + 8], 1000_u64.to_le_bytes());
    }
    assert!(bytes[20 + POSTS * 8..].iter().all(|&byte| byte == 0));
}

#[test]
fn header_parse_pins_identity() {
    let page = PaddedFileHeader::new(FileHeader::new(512, posts_of(&[1000])));
    let bytes: [u8; PAGE_BYTES] = page
        .as_bytes()
        .try_into()
        .expect("a padded header is exactly one page");

    let parsed =
        PaddedFileHeader::try_ref_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.stride(), 512);
    assert_eq!(parsed.count(), 1000);

    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    PaddedFileHeader::try_ref_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    // Version 0 is a retired layout. Its bytes must not parse as V2.
    let mut wrong_version = bytes;
    wrong_version[8] = 0;
    PaddedFileHeader::try_ref_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

#[test]
fn region_geometry() {
    // 1000 codes at stride 512 need two keys. Padding the 16-byte index to one page puts codes at
    // 8192, with 8000 code bytes behind them.
    let header = FileHeader::new(512, posts_of(&[1000]));
    assert_eq!(header.index_keys(), Some(2));
    assert_eq!(header.codes_offset(), Some(8192));
    assert_eq!(header.expected_file_len(), Some(8192 + 8000));

    // An empty file is exactly its header, with zero keys and no index page.
    let empty = FileHeader::new(512, posts_of(&[]));
    assert_eq!(empty.index_keys(), Some(0));
    assert_eq!(empty.codes_offset(), Some(4096));
    assert_eq!(empty.expected_file_len(), Some(4096));

    // A full stride of codes still needs exactly one key.
    let exact = FileHeader::new(512, posts_of(&[512]));
    assert_eq!(exact.index_keys(), Some(1));

    // A zero stride and overflowing geometry match no real file.
    assert_eq!(FileHeader::new(0, posts_of(&[1000])).index_keys(), None);
    assert_eq!(
        FileHeader::new(0, posts_of(&[1000])).expected_file_len(),
        None,
    );
    assert_eq!(
        FileHeader::new(512, posts_of(&[u64::MAX])).expected_file_len(),
        None,
    );
}

/// Depth-1 quadrant prefixes of a 64-bit key: bit 62 is the x axis's top bit, bit 63 the y axis's.
const Q10: u64 = 0x4000_0000_0000_0000;
const Q01: u64 = 0x8000_0000_0000_0000;
const Q11: u64 = 0xC000_0000_0000_0000;
/// A depth-2 sub-cell of quadrant (0, 0): top four key bits 0001.
const SUB: u64 = 0x1000_0000_0000_0000;

/// The hand fixture.
///
/// Segments of length one, three, and five make up nine codes, non-decreasing within each, with a
/// duplicated key in the deepest segment standing for catch-all co-location.
///
/// ```text
/// position: 0        1  2       3       4  5    6    7       8
/// bucket:   0        1  1       1       2  2    2    2       2
/// code:     Q10|5    2  Q10|6   Q11|9   1  SUB|3 SUB|3 Q01|8  Q11|14
/// ```
fn fixture_codes() -> Vec<MortonKey> {
    [
        Q10 | 0x5,
        2,
        Q10 | 0x6,
        Q11 | 0x9,
        1,
        SUB | 0x3,
        SUB | 0x3,
        Q01 | 0x8,
        Q11 | 0xE,
    ]
    .into_iter()
    .map(MortonKey::from_bits)
    .collect()
}

fn fixture_posts() -> Fenceposts<BasePosition> {
    posts_of(&[1, 3, 5])
}

/// Writes the fixture at a stride short enough that queries walk a multi-key index.
fn fixture_bytes(stride: u32) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_regions(stride, &fixture_posts(), &fixture_codes(), &mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.mrtn");
    fs::write(&path, fixture_bytes(2)).expect("the scratch file is writable");

    let file = MortonFile::open(&path).expect("the written file reopens");
    assert_eq!(file.count(), 9);
    assert_eq!(file.fenceposts(), &fixture_posts());

    let codes: Vec<u64> = file.codes().iter().map(|code| code.get()).collect();
    let expected: Vec<u64> = fixture_codes().iter().map(|key| key.to_bits()).collect();
    assert_eq!(codes, expected);

    // Each position's bucket is the segment it falls in.
    let buckets: Vec<u8> = (0..9)
        .map(|pos| file.bucket_of(BasePosition::from_u32(pos)).get())
        .collect();
    assert_eq!(buckets, [0, 1, 1, 1, 2, 2, 2, 2, 2]);
}

#[test]
fn runs_slice_hand_computed_cells() {
    let path = scratch("runs.mrtn");
    fs::write(&path, fixture_bytes(2)).expect("the scratch file is writable");
    let file = MortonFile::open(&path).expect("the written file reopens");

    // The root cell spans each whole segment.
    let root = MortonCell::new(depth(0), 0, 0).expect("the root cell exists");
    assert_eq!(file.run(depth(0), root), span(0..1));
    assert_eq!(file.run(depth(1), root), span(1..4));
    assert_eq!(file.run(depth(2), root), span(4..9));

    // Quadrant (0, 0): bucket 1 holds code 2 there; bucket 2 holds
    // 1 and the SUB pair - the duplicate lands inside one run.
    let cell = MortonCell::new(depth(1), 0, 0).expect("the quadrant exists");
    assert_eq!(file.run(depth(1), cell), span(1..2));
    assert_eq!(file.run(depth(2), cell), span(4..7));

    // Quadrant (1, 0): bucket 0's only code and bucket 1's Q10|6.
    let cell = MortonCell::new(depth(1), 1, 0).expect("the quadrant exists");
    assert_eq!(file.run(depth(0), cell), span(0..1));
    assert_eq!(file.run(depth(1), cell), span(2..3));

    // Quadrant (0, 1): bucket 1 skips it entirely - the empty run
    // lands between its neighbours - while bucket 2 holds Q01|8.
    let cell = MortonCell::new(depth(1), 0, 1).expect("the quadrant exists");
    assert_eq!(file.run(depth(1), cell), span(3..3));
    assert_eq!(file.run(depth(2), cell), span(7..8));

    // The SUB depth-2 cell isolates the duplicated pair.
    let cell = MortonKey::from_bits(SUB | 3).cell(depth(2));
    assert_eq!(file.run(depth(2), cell), span(5..7));

    // A cell no code occupies yields the empty run.
    let cell = MortonKey::from_bits(0x2000_0000_0000_0000).cell(depth(2));
    assert_eq!(file.run(depth(2), cell), span(7..7));
}

#[test]
fn empty_column_reopens() {
    let path = scratch("empty.mrtn");
    let mut bytes = Vec::new();
    write_regions(PAGE_STRIDE, &posts_of(&[]), &[], &mut bytes)
        .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = MortonFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.count(), 0);
    assert!(file.codes().is_empty());

    let root = MortonCell::new(depth(0), 0, 0).expect("the root cell exists");
    assert_eq!(file.run(depth(0), root), span(0..0));
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.mrtn");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        MortonFile::open(&undersized),
        Err(OpenMortonError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.mrtn");
    let mut bytes = fixture_bytes(2);
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(MortonFile::open(&foreign), Err(OpenMortonError::Header(_)),);

    let retired = scratch("retired-version.mrtn");
    let mut bytes = fixture_bytes(2);
    bytes[8..12].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&retired, &bytes).expect("the scratch file is writable");
    assert_matches!(
        MortonFile::open(&retired),
        Err(OpenMortonError::Header(HeaderError::Version {
            found: 0,
            expected: 2,
        })),
    );

    // Decreasing fenceposts parse as a header but fail validation.
    let malformed = scratch("malformed-posts.mrtn");
    let mut bytes = fixture_bytes(2);
    bytes[28..36].copy_from_slice(&u64::MAX.to_le_bytes());
    fs::write(&malformed, &bytes).expect("the scratch file is writable");
    assert_matches!(
        MortonFile::open(&malformed),
        Err(OpenMortonError::Fenceposts(FencepostError::Order {
            index: 2
        })),
    );

    let torn = scratch("torn.mrtn");
    let mut bytes = fixture_bytes(2);
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(MortonFile::open(&torn), Err(OpenMortonError::Length { .. }),);
}

/// `run` agrees with a linear scan of the segment for every code column, cell, and stride.
#[property_test]
fn runs_agree_with_a_linear_scan(
    #[strategy = proptest::collection::vec(any::<u64>(), 0..64)] mut bits: Vec<u64>,
    #[strategy = proptest::collection::vec(any::<proptest::sample::Index>(), 2)] cuts: Vec<
        proptest::sample::Index,
    >,
    #[strategy = 1_u32..8] stride: u32,
    probe: u64,
    #[strategy = 0_u8..=6] probe_depth: u8,
) {
    // Cutting a sorted column twice leaves each of the three segments non-decreasing.
    bits.sort_unstable();
    let mut cuts: Vec<usize> = cuts.iter().map(|cut| cut.index(bits.len() + 1)).collect();
    cuts.sort_unstable();
    let lengths = [
        cuts[0] as u64,
        (cuts[1] - cuts[0]) as u64,
        (bits.len() - cuts[1]) as u64,
    ];
    let posts = posts_of(&lengths);
    let codes: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();

    let mut bytes = Vec::new();
    write_regions(stride, &posts, &codes, &mut bytes).expect("writing into a vector cannot fail");
    let path = scratch(&format!("prop-{}.mrtn", uuid::Uuid::now_v7()));
    fs::write(&path, bytes).expect("the scratch file is writable");
    let file = MortonFile::open(&path).expect("the written file reopens");
    // The mapping keeps the unlinked file's bytes alive, so failing
    // assertions cannot strand scratch files.
    fs::remove_file(&path).expect("the scratch file is removable");

    let cell = MortonKey::from_bits(probe).cell(depth(probe_depth));

    for bucket in 0_u8..3 {
        let bucket = depth(bucket);
        let run = file.run(bucket, cell);

        // A linear scan over the segment gives the reference result.
        let expected: Vec<BasePosition> = posts
            .segment(bucket)
            .filter(|&position| cell.contains(codes[position.as_usize()]))
            .collect();

        prop_assert_eq!(
            run.collect::<Vec<BasePosition>>(),
            expected,
            "bucket {} of cell {:?}",
            bucket.get(),
            cell,
        );
    }
}
