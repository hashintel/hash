//! Certificates for the quad file's format.
//!
//! The tests pin the header's and node's wire layouts byte by byte, the type-set structural
//! rules, the region geometry, the writer-to-reader round trip, and every structural rule the
//! open enforces - with a property test holding the round trip over arbitrary trees.
#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]

use core::assert_matches;
use std::{fs, path::PathBuf};

use proptest::{arbitrary::any, prop_assert_eq, property_test};
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    FileHeader, Node, PaddedFileHeader, TypeSets,
    read::{OpenQuadError, QuadFile},
    write::write_regions,
};
use crate::file::{
    ArtifactFile as _,
    region::{PAGE_BYTES, header::HeaderError, machine::Machine},
};

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("hash-graph-atlas-quad-file-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

/// The hand fixture, a four-node tree in depth-first pre-order:
///
/// ```text
/// node 0: root; children in quadrants 0 (x0y0) and 2 (x0y1);
///         run 0..3, 9 subtree points, types {1, 2, 5, 7}
/// node 1: depth-1 cell (0, 0); leaf; run 3..5, 4 points, types {1, 5}
/// node 2: depth-1 cell (0, 1); child in quadrant 1 (x1y0);
///         run 5..6, 5 points, types {1, 2, 7}
/// node 3: depth-2 cell (1, 2) - quadrant 1 of node 2's cell; leaf;
///         run 6..9, 4 points, types {2}
/// ```
fn fixture_nodes() -> Vec<Node> {
    vec![
        Node::new([Some(1), None, Some(2), None], 0, 3, 9),
        Node::new([None; 4], 3, 2, 4),
        Node::new([None, Some(3), None, None], 5, 1, 5),
        Node::new([None; 4], 6, 3, 4),
    ]
}

/// The direct-type set of each fixture node, in node order.
fn fixture_sets() -> TypeSets {
    TypeSets::from_sets(&[vec![1, 2, 5, 7], vec![1, 5], vec![1, 2, 7], vec![2]])
}

/// The fixture tree and its type sets, written out as a quad file's bytes.
fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    write_regions(&fixture_nodes(), &fixture_sets(), &mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

/// The header's bytes sit where the format's table says: magic, little-endian version 2, this
/// machine's information, the node count and type-id entry count as little-endian `u64`s, and zero
/// padding out to 4096.
#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(4, 10));
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTQUAD");
    assert_eq!(bytes[8..12], 2_u32.to_le_bytes(), "version 2");
    assert_eq!(
        &bytes[12..16],
        Machine::current().as_bytes(),
        "machine information"
    );
    assert_eq!(bytes[16..24], 4_u64.to_le_bytes(), "node count");
    assert_eq!(bytes[24..32], 10_u64.to_le_bytes(), "type-id entries");
    assert!(bytes[32..].iter().all(|&byte| byte == 0));
}

#[test]
fn header_parse_pins_identity() {
    let page = PaddedFileHeader::new(FileHeader::new(4, 10));
    let bytes: [u8; PAGE_BYTES] = page
        .as_bytes()
        .try_into()
        .expect("a padded header is exactly one page");

    let parsed =
        PaddedFileHeader::try_ref_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.nodes(), 4);
    assert_eq!(parsed.type_ids(), 10);

    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    PaddedFileHeader::try_ref_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    // Version 0 is a retired layout. Its bytes must not parse as V2.
    let mut wrong_version = bytes;
    wrong_version[8] = 0;
    PaddedFileHeader::try_ref_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

/// A node occupies 32 bytes in the order the format fixes - four child indexes, run start, run
/// length, subtree points - with an absent child stored as the `u32` sentinel. The accessors
/// read back the children, the run as a range, the point count, and leafness from those bytes.
#[test]
fn node_wire_layout() {
    let node = Node::new([Some(1), Some(2), None, Some(4)], 0x2A, 256, 1000);
    let bytes = node.as_bytes();
    assert_eq!(bytes.len(), 32);
    assert_eq!(bytes[0..4], 1_u32.to_le_bytes());
    assert_eq!(bytes[4..8], 2_u32.to_le_bytes());
    assert_eq!(bytes[8..12], u32::MAX.to_le_bytes(), "absent child");
    assert_eq!(bytes[12..16], 4_u32.to_le_bytes());
    assert_eq!(bytes[16..24], 0x2A_u64.to_le_bytes(), "run start");
    assert_eq!(bytes[24..28], 256_u32.to_le_bytes(), "run length");
    assert_eq!(bytes[28..32], 1000_u32.to_le_bytes(), "subtree points");

    assert_eq!(node.children(), [Some(1), Some(2), None, Some(4)]);
    assert_eq!(node.run(), 0x2A..0x2A + 256);
    assert_eq!(node.points(), 1000);
    assert!(!node.is_leaf());
    assert!(Node::new([None; 4], 0, 0, 1).is_leaf());
}

#[test]
fn type_sets_carry_the_structural_rules() {
    let sets = fixture_sets();
    assert_eq!(sets.node_count(), 4);
    assert_eq!(sets.posts(), &[0, 4, 6, 9, 10]);
    assert_eq!(sets.ids().len(), 10);
    assert_eq!(sets.set(0), &[1, 2, 5, 7]);
    assert_eq!(sets.set(1), &[1, 5]);
    assert_eq!(sets.set(3), &[2]);

    // The empty cover has one anchoring post and no ids.
    let empty = TypeSets::from_sets(&[]);
    assert_eq!(empty.node_count(), 0);
    assert_eq!(empty.posts(), &[0]);

    // An empty set is a zero-width segment that the writer accepts.
    let hollow = TypeSets::from_sets(&[vec![]]);
    assert_eq!(hollow.set(0), &[] as &[u32]);
}

#[test]
#[should_panic(expected = "type set must ascend strictly")]
fn type_sets_reject_unsorted_sets() {
    drop(TypeSets::from_sets(&[vec![2, 1]]));
}

/// A repeated id in one set panics at construction too: the order rule is strict, so equal
/// neighbours are as malformed as descending ones.
#[test]
#[should_panic(expected = "type set must ascend strictly")]
fn type_sets_reject_duplicate_ids() {
    drop(TypeSets::from_sets(&[vec![3, 3]]));
}

/// The header's region offsets and expected file length agree with the geometry computed by hand,
/// an empty tree still places its anchoring fencepost region, and counts whose arithmetic
/// overflows `u64` report no expected length because they match no real file.
#[test]
fn region_geometry() {
    // A 128-byte table for four nodes pads to one page, and the five posts pad to a second page.
    // The last 40 bytes hold ten ids.
    let header = FileHeader::new(4, 10);
    assert_eq!(header.posts_offset(), Some(8192));
    assert_eq!(header.ids_offset(), Some(12288));
    assert_eq!(header.expected_file_len(), Some(12288 + 40));

    // An empty tree still carries its anchoring fencepost.
    let empty = FileHeader::new(0, 0);
    assert_eq!(empty.posts_offset(), Some(4096));
    assert_eq!(empty.ids_offset(), Some(8192));
    assert_eq!(empty.expected_file_len(), Some(8192));

    // Overflowing geometry matches no real file.
    assert_eq!(FileHeader::new(u64::MAX, 0).expected_file_len(), None);
    assert_eq!(FileHeader::new(0, u64::MAX).expected_file_len(), None);
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.quad");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = QuadFile::open(&path).expect("the written file reopens");
    assert_eq!(file.nodes(), fixture_nodes().as_slice());

    let sets = fixture_sets();
    for node in 0..4 {
        let stored: Vec<u32> = file.type_set(node).iter().map(|id| id.get()).collect();
        assert_eq!(stored, sets.set(node as usize), "node {node}'s set");
    }
}

/// An empty tree is valid geometry: it writes and reopens with no nodes at all.
#[test]
fn empty_tree_reopens() {
    let path = scratch("empty.quad");
    let mut bytes = Vec::new();
    write_regions(&[], &TypeSets::from_sets(&[]), &mut bytes)
        .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = QuadFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.nodes(), []);
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.quad");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&undersized),
        Err(OpenQuadError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.quad");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&foreign),
        Err(OpenQuadError::Header(HeaderError::Invalid)),
    );

    let retired = scratch("retired-version.quad");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&retired, &bytes).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&retired),
        Err(OpenQuadError::Header(HeaderError::Version {
            found: 0,
            expected: 2,
        })),
    );

    // Open rejects a node count colliding with the sentinel before the length equation could demand
    // a table that size.
    let saturated = scratch("saturated.quad");
    fs::write(
        &saturated,
        PaddedFileHeader::new(FileHeader::new(u64::from(u32::MAX), 0)).as_bytes(),
    )
    .expect("the scratch file is writable");
    assert_matches!(QuadFile::open(&saturated), Err(OpenQuadError::Nodes { .. }));

    let torn = scratch("torn.quad");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(QuadFile::open(&torn), Err(OpenQuadError::Length { .. }));
}

/// The open validates the structural rules a traversal then relies on, and names the offender:
/// fenceposts that decrease or fail to close at the header's entry count report their index, and a
/// child index that points at its own node or past the table reports the node and the child slot.
#[test]
fn open_rejects_malformed_posts_and_children() {
    // The fixture's posts region starts at 8192. Post 1 raised beyond
    // post 2 breaks the ordering rule at index 2.
    let decreasing = scratch("decreasing-posts.quad");
    let mut bytes = fixture_bytes();
    bytes[8200..8208].copy_from_slice(&7_u64.to_le_bytes());
    fs::write(&decreasing, &bytes).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&decreasing),
        Err(OpenQuadError::Posts { index: 2 }),
    );

    // The closing post must equal the header's entry count.
    let unclosed = scratch("unclosed-posts.quad");
    let mut bytes = fixture_bytes();
    bytes[8224..8232].copy_from_slice(&11_u64.to_le_bytes());
    fs::write(&unclosed, &bytes).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&unclosed),
        Err(OpenQuadError::Posts { index: 4 }),
    );

    // Node 0's first child redirected at itself fails the point-deeper rule. Redirected beyond the
    // table, it escapes.
    let shallow = scratch("shallow-child.quad");
    let mut bytes = fixture_bytes();
    bytes[4096..4100].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&shallow, &bytes).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&shallow),
        Err(OpenQuadError::Child { node: 0, child: 0 }),
    );

    let escaped = scratch("escaped-child.quad");
    let mut bytes = fixture_bytes();
    bytes[4096..4100].copy_from_slice(&4_u32.to_le_bytes());
    fs::write(&escaped, &bytes).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&escaped),
        Err(OpenQuadError::Child { node: 0, child: 4 }),
    );
}

/// Every valid table and set cover roundtrips verbatim.
#[property_test]
fn written_tables_roundtrip(
    // Children generated strictly deeper, so construction preserves the pre-order rule. The format
    // admits shared children.
    #[strategy = proptest::collection::vec(
        (
            any::<u64>(),
            proptest::array::uniform4(proptest::option::of(any::<proptest::sample::Index>())),
            0_u8..5,
        ),
        0..12,
    )]
    seeds: Vec<(u64, [Option<proptest::sample::Index>; 4], u8)>,
) {
    let count = seeds.len();
    let nodes: Vec<Node> = seeds
        .iter()
        .enumerate()
        .map(|(index, &(start, picks, _))| {
            let children = picks.map(|child| {
                child
                    .map(|pick| index + 1 + pick.index(count - index))
                    .filter(|&deeper| deeper < count)
                    .map(|deeper| {
                        u32::try_from(deeper).expect("test tables stay far below u32 indexes")
                    })
            });
            Node::new(children, start, 2, 3)
        })
        .collect();
    let sets = TypeSets::from_sets(
        &seeds
            .iter()
            .map(|&(_, _, set_len)| (0..set_len).map(u32::from).collect())
            .collect::<Vec<Vec<u32>>>(),
    );

    let mut bytes = Vec::new();
    write_regions(&nodes, &sets, &mut bytes).expect("writing into a vector cannot fail");
    let path = scratch(&format!("prop-{}.quad", uuid::Uuid::now_v7()));
    fs::write(&path, bytes).expect("the scratch file is writable");
    let file = QuadFile::open(&path).expect("the written file reopens");
    // The mapping keeps the unlinked file's bytes alive, so failing
    // assertions cannot strand scratch files.
    fs::remove_file(&path).expect("the scratch file is removable");

    prop_assert_eq!(file.nodes(), nodes.as_slice());
    for node in 0..count {
        let index = u32::try_from(node).expect("test tables stay far below u32 indexes");
        let stored: Vec<u32> = file.type_set(index).iter().map(|id| id.get()).collect();
        prop_assert_eq!(stored, sets.set(node), "node {}'s set", node);
    }
}
