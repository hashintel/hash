#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]

use core::assert_matches;
use std::{fs, path::PathBuf};

use proptest::prelude::*;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    FileHeader, Node, TypeSets,
    read::{OpenQuadError, QuadFile},
    write::write_regions,
};
use crate::morton::{Depth, MortonCell};

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("test depths lie within the documented domain")
}

fn cell(depth_value: u8, x: u32, y: u32) -> MortonCell {
    MortonCell::new(depth(depth_value), x, y).expect("test cells lie within the depth's grid")
}

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

fn fixture_sets() -> TypeSets {
    TypeSets::from_sets(&[vec![1, 2, 5, 7], vec![1, 5], vec![1, 2, 7], vec![2]])
}

fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    write_regions(&fixture_nodes(), &fixture_sets(), &mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn header_wire_layout() {
    let header = FileHeader::new(4, 10);
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTQUAD");
    assert_eq!(bytes[8..12], 1_u32.to_le_bytes(), "version 1");
    assert_eq!(bytes[12..20], 4_u64.to_le_bytes(), "node count");
    assert_eq!(bytes[20..28], 10_u64.to_le_bytes(), "type-id entries");
    assert!(bytes[28..].iter().all(|&byte| byte == 0));
}

#[test]
fn header_parse_pins_identity() {
    let mut bytes = [0_u8; FileHeader::SIZE];
    bytes.copy_from_slice(FileHeader::new(4, 10).as_bytes());
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.nodes(), 4);
    assert_eq!(parsed.type_ids(), 10);

    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    FileHeader::try_read_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    // Version 0 is the retired layout; its bytes must not parse as V1.
    let mut wrong_version = bytes;
    wrong_version[8] = 0;
    FileHeader::try_read_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

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

    // The empty cover: one anchoring post, no ids.
    let empty = TypeSets::from_sets(&[]);
    assert_eq!(empty.node_count(), 0);
    assert_eq!(empty.posts(), &[0]);

    // An empty set is a zero-width segment, not a violation.
    let hollow = TypeSets::from_sets(&[vec![]]);
    assert_eq!(hollow.set(0), &[] as &[u32]);
}

#[test]
#[should_panic(expected = "type set must ascend strictly")]
fn type_sets_reject_unsorted_sets() {
    drop(TypeSets::from_sets(&[vec![2, 1]]));
}

#[test]
#[should_panic(expected = "type set must ascend strictly")]
fn type_sets_reject_duplicate_ids() {
    drop(TypeSets::from_sets(&[vec![3, 3]]));
}

#[test]
fn region_geometry() {
    // Four nodes: a 128-byte table padded to one page, five posts
    // padded to one page, ten ids behind them.
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

#[test]
fn locate_walks_the_prefix_digits() {
    let path = scratch("locate.quad");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");
    let file = QuadFile::open(&path).expect("the written file reopens");

    // The root owns the whole-domain cell.
    assert_eq!(file.locate(cell(0, 0, 0)), Some(0));

    // Depth 1: quadrants 0 and 2 have nodes, 1 and 3 do not.
    assert_eq!(file.locate(cell(1, 0, 0)), Some(1));
    assert_eq!(file.locate(cell(1, 0, 1)), Some(2));
    assert_eq!(file.locate(cell(1, 1, 0)), None);
    assert_eq!(file.locate(cell(1, 1, 1)), None);

    // Node 3 sits in quadrant 1 (x1y0) of node 2's cell (0, 1): its
    // depth-2 grid coordinates are (2*0 + 1, 2*1 + 0) = (1, 2).
    assert_eq!(file.locate(cell(2, 1, 2)), Some(3));

    // Sibling quadrants of node 3 have no nodes.
    assert_eq!(file.locate(cell(2, 0, 2)), None);

    // Below a leaf nothing locates.
    assert_eq!(file.locate(cell(2, 0, 0)), None);
    assert_eq!(file.locate(cell(3, 2, 4)), None);
}

#[test]
fn empty_tree_reopens() {
    let path = scratch("empty.quad");
    let mut bytes = Vec::new();
    write_regions(&[], &TypeSets::from_sets(&[]), &mut bytes)
        .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = QuadFile::open(&path).expect("the empty file reopens");
    assert!(file.nodes().is_empty());
    assert_eq!(file.locate(cell(0, 0, 0)), None);
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.quad");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        QuadFile::open(&undersized),
        Err(OpenQuadError::Undersized { actual: 16 }),
    );

    let foreign = scratch("foreign.quad");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(QuadFile::open(&foreign), Err(OpenQuadError::Header));

    let retired = scratch("retired-version.quad");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&retired, &bytes).expect("the scratch file is writable");
    assert_matches!(QuadFile::open(&retired), Err(OpenQuadError::Header));

    // A node count colliding with the sentinel is rejected before the
    // length equation could demand a table that size.
    let saturated = scratch("saturated.quad");
    fs::write(
        &saturated,
        FileHeader::new(u64::from(u32::MAX), 0).as_bytes(),
    )
    .expect("the scratch file is writable");
    assert_matches!(QuadFile::open(&saturated), Err(OpenQuadError::Nodes { .. }));

    let torn = scratch("torn.quad");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(QuadFile::open(&torn), Err(OpenQuadError::Length { .. }));
}

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

    // Node 0's first child redirected at itself fails the
    // point-deeper rule; redirected beyond the table it escapes.
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

/// Reference locate: the same prefix-digit walk over the in-memory
/// table.
fn locate_reference(nodes: &[Node], cell: MortonCell) -> Option<u32> {
    if nodes.is_empty() {
        return None;
    }
    let mut node = 0_u32;
    let prefix = cell.min_key().prefix(cell.depth());
    for step in (0..cell.depth().get()).rev() {
        let quadrant = (prefix >> (2 * u64::from(step))) & 0b11;
        node = nodes[node as usize].child(quadrant as usize)?;
    }
    Some(node)
}

proptest! {
    /// Every valid table and set cover roundtrips verbatim, and the
    /// mapped locate agrees with the in-memory reference walk.
    #[test]
    fn written_tables_roundtrip(
        // Children generated strictly deeper, so the pre-order rule
        // holds by construction; the format admits shared children.
        seeds in prop::collection::vec(
            (
                any::<u64>(),
                prop::array::uniform4(prop::option::of(any::<prop::sample::Index>())),
                0_u8..5,
            ),
            0..12,
        ),
        probe: u64,
        probe_depth in 0_u8..=4,
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

        let cell = crate::morton::MortonKey::from_bits(probe).cell(depth(probe_depth));
        prop_assert_eq!(file.locate(cell), locate_reference(&nodes, cell));
    }
}
