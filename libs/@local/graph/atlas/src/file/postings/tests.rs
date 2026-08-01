#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    FileHeader,
    read::{OpenPostingsError, PostingsFile},
    write::{Regions, write_regions},
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
/// type 1: dense {1, 2, 5} = one word 0b100110 = 38; no parents
/// type 2: list  {} (empty run); parents {0, 1}
/// ```
///
/// Flags word: bit 1 set = 2. Membership entries `[0, 3, 9, 38]` (`M = 4`), posts `[0, 3, 4, 4]`.
/// Parent ids `[0, 1]` (`P = 2`), posts `[0, 0, 0, 2]`.
const POINTS: u64 = 10;
const FLAGS: [u64; 1] = [0b10];
const MEMBERSHIP_POSTS: [u64; 4] = [0, 3, 4, 4];
const ENTRIES: [u32; 4] = [0, 3, 9, 38];
const PARENT_POSTS: [u64; 4] = [0, 0, 0, 2];
const PARENT_IDS: [u64; 2] = [0, 1];

fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    write_regions(
        Regions {
            points: POINTS,
            flags: &FLAGS,
            membership_posts: &MEMBERSHIP_POSTS,
            entries: &ENTRIES,
            parent_posts: &PARENT_POSTS,
            parent_ids: &PARENT_IDS,
        },
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn header_wire_layout() {
    let header = FileHeader::new(3, 10, 4, 2);
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTPOST");
    assert_eq!(bytes[8..12], 0_u32.to_le_bytes(), "version 0");
    assert_eq!(bytes[12..20], 3_u64.to_le_bytes(), "type count");
    assert_eq!(bytes[20..28], 10_u64.to_le_bytes(), "point count");
    assert_eq!(bytes[28..36], 4_u64.to_le_bytes(), "membership entries");
    assert_eq!(bytes[36..44], 2_u64.to_le_bytes(), "parent edges");
    assert!(bytes[44..].iter().all(|&byte| byte == 0));
}

/// Pins the region bytes: little-endian words, dense bitmaps LSB-first.
///
/// Type 1's dense word `0b10_0110` (members {1, 2, 5}) must land as bytes `26 00 00 00`: the
/// low-order byte first (little endian) and position `p` at bit `p & 31` (LSB-first), so member 1
/// is bit 1 of byte 0.
#[test]
fn region_wire_layout() {
    let bytes = fixture_bytes();
    assert_eq!(
        bytes.len(),
        5 * 4096 + 16,
        "five 4096-byte regions and 16 entry bytes"
    );

    // Flags: one u64 word whose bit 1 marks type 1 as dense. The rest
    // of the region is zero padding.
    assert_eq!(bytes[4096..4104], 0b10_u64.to_le_bytes());
    assert!(bytes[4104..8192].iter().all(|&byte| byte == 0));

    // Membership fenceposts [0, 3, 4, 4], u64 words in little-endian bytes.
    for (index, post) in MEMBERSHIP_POSTS.iter().enumerate() {
        let at = 2 * 4096 + index * 8;
        assert_eq!(
            bytes[at..at + 8],
            post.to_le_bytes(),
            "membership post {index}"
        );
    }

    // Parent fenceposts [0, 0, 0, 2].
    for (index, post) in PARENT_POSTS.iter().enumerate() {
        let at = 3 * 4096 + index * 8;
        assert_eq!(bytes[at..at + 8], post.to_le_bytes(), "parent post {index}");
    }

    // Parent ids [0, 1], u64 little endian.
    let parent_ids_at = 4 * 4096;
    assert_eq!(bytes[parent_ids_at..parent_ids_at + 8], 0_u64.to_le_bytes());
    assert_eq!(
        bytes[parent_ids_at + 8..parent_ids_at + 16],
        1_u64.to_le_bytes(),
    );

    // Entries: type 0's list [0, 3, 9], then type 1's dense word.
    let entries_at = 5 * 4096;
    assert_eq!(bytes[entries_at..entries_at + 4], 0_u32.to_le_bytes());
    assert_eq!(bytes[entries_at + 4..entries_at + 8], 3_u32.to_le_bytes());
    assert_eq!(bytes[entries_at + 8..entries_at + 12], 9_u32.to_le_bytes());
    assert_eq!(bytes[entries_at + 12..entries_at + 16], [0x26, 0, 0, 0]);
}

#[test]
fn header_parse_pins_identity() {
    let mut bytes = [0_u8; FileHeader::SIZE];
    bytes.copy_from_slice(FileHeader::new(3, 10, 4, 2).as_bytes());
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.types(), 3);
    assert_eq!(parsed.points(), 10);
    assert_eq!(parsed.entries(), 4);
    assert_eq!(parsed.parent_edges(), 2);

    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    FileHeader::try_read_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    let mut wrong_version = bytes;
    wrong_version[8] = 9;
    FileHeader::try_read_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

#[test]
fn region_geometry() {
    // A three-type header describes one flags word, two four-post regions, two parent ids, and four
    // entries, with every region padded to its own page.
    let header = FileHeader::new(3, 10, 4, 2);
    assert_eq!(header.flags_words(), 1);
    assert_eq!(header.fencepost_count(), Some(4));
    assert_eq!(header.membership_posts_offset(), Some(0x2000));
    assert_eq!(header.parent_posts_offset(), Some(0x3000));
    assert_eq!(header.parent_ids_offset(), Some(0x4000));
    assert_eq!(header.entries_offset(), Some(0x5000));
    assert_eq!(header.expected_file_len(), Some(0x5000 + 16));

    // The empty domain still carries its anchoring fenceposts; the
    // zero-size flag, id, and entry regions collapse onto the next
    // offset without disturbing alignment.
    let empty = FileHeader::new(0, 0, 0, 0);
    assert_eq!(empty.flags_words(), 0);
    assert_eq!(empty.membership_posts_offset(), Some(0x1000));
    assert_eq!(empty.parent_posts_offset(), Some(0x2000));
    assert_eq!(empty.parent_ids_offset(), Some(0x3000));
    assert_eq!(empty.entries_offset(), Some(0x3000));
    assert_eq!(empty.expected_file_len(), Some(0x3000));

    // Overflowing geometry matches no real file.
    assert_eq!(FileHeader::new(u64::MAX, 0, 0, 0).expected_file_len(), None);
    assert_eq!(FileHeader::new(0, 0, u64::MAX, 0).expected_file_len(), None);
    assert_eq!(FileHeader::new(0, 0, 0, u64::MAX).expected_file_len(), None);
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.post");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = PostingsFile::open(&path).expect("the written file reopens");
    assert_eq!(file.types(), 3);
    assert_eq!(file.points(), POINTS);
    assert_eq!(file.flags(), &FLAGS);
    assert_eq!(file.membership_posts(), &MEMBERSHIP_POSTS);
    assert_eq!(file.entries(), &ENTRIES);
    assert_eq!(file.parent_posts(), &PARENT_POSTS);
    assert_eq!(file.parent_ids(), &PARENT_IDS);
}

#[test]
fn empty_domain_reopens() {
    let path = scratch("empty.post");
    let mut bytes = Vec::new();
    write_regions(EMPTY_REGIONS, &mut bytes).expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = PostingsFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.types(), 0);
    assert_eq!(file.points(), 0);
    assert!(file.flags().is_empty());
    assert_eq!(file.membership_posts(), &[0]);
    assert!(file.entries().is_empty());
    assert_eq!(file.parent_posts(), &[0]);
    assert!(file.parent_ids().is_empty());
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.post");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        PostingsFile::open(&undersized),
        Err(OpenPostingsError::Undersized { actual: 16 }),
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

/// The regions of an edgeless, typeless, pointless file: the smallest coherent write.
const EMPTY_REGIONS: Regions<'static> = Regions {
    points: 0,
    flags: &[],
    membership_posts: &[0],
    entries: &[],
    parent_posts: &[0],
    parent_ids: &[],
};

#[test]
#[should_panic(expected = "both fencepost regions cover the one type domain")]
fn writer_rejects_mismatched_post_regions() {
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            membership_posts: &[0, 0],
            ..EMPTY_REGIONS
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the flags region holds one bit per type")]
fn writer_rejects_missized_flags() {
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            flags: &[0, 0],
            ..EMPTY_REGIONS
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the final membership fencepost closes the entries array")]
fn writer_rejects_unclosed_membership_posts() {
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            membership_posts: &[1],
            ..EMPTY_REGIONS
        },
        &mut sink,
    );
}

#[test]
#[should_panic(expected = "the final parent fencepost closes the parent id array")]
fn writer_rejects_unclosed_parent_posts() {
    let mut sink = Vec::new();
    let _: std::io::Result<()> = write_regions(
        Regions {
            parent_posts: &[1],
            ..EMPTY_REGIONS
        },
        &mut sink,
    );
}
