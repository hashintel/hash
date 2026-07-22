use core::assert_matches;
use std::fs;

use camino::Utf8PathBuf;
use proptest::prelude::*;
use smallvec::{SmallVec, smallvec};

use super::{
    build::{Postings, PostingsConfig, PostingsError},
    closure::ClosureMap,
    mapped::{InvalidPostingsFile, Membership, PostingsArchive},
};
use crate::{
    dataset::OntologyRowId,
    file::{
        WriteInto as _,
        postings::{read::PostingsFile, write::write_regions},
    },
};

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-salt-postings-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("the scratch directory should create");
    dir
}

fn id(row: u64) -> OntologyRowId {
    OntologyRowId::new(row)
}

fn types(lists: &[&[u64]]) -> Vec<SmallVec<OntologyRowId, 2>> {
    lists
        .iter()
        .map(|list| list.iter().copied().map(OntologyRowId::new).collect())
        .collect()
}

/// The hand fixture: eight rows over four types, gathered through a permutation.
///
/// Row-order direct types: `0:{0} 1:{0,2} 2:{1} 3:{2} 4:{0} 5:{1,2} 6:{} 7:{0}`; `row_of_position =
/// [3, 1, 4, 0, 6, 2, 7, 5]`. Member positions per type, hand-derived: type 0 `[1, 2, 3, 6]`, type
/// 1 `[5, 7]`, type 2 `[0, 1, 7]`, type 3 `[]`. Parents: `1 <- 0`, `2 <- 0`, `3 <- {1, 2}`.
const ROW_OF_POSITION: [u32; 8] = [3, 1, 4, 0, 6, 2, 7, 5];

fn fixture_types() -> Vec<SmallVec<OntologyRowId, 2>> {
    types(&[&[0], &[0, 2], &[1], &[2], &[0], &[1, 2], &[], &[0]])
}

fn fixture_parents() -> Vec<SmallVec<OntologyRowId, 2>> {
    types(&[&[], &[0], &[0], &[1, 2]])
}

/// The fixture's split at `dense_threshold_log2 = 2` (threshold 2).
///
/// Types 0 (count 4) and 2 (count 3) go dense, types 1 and 3 stay lists.
const FIXTURE_CONFIG: PostingsConfig = PostingsConfig {
    dense_threshold_log2: 2,
};

fn mapped(dir: &Utf8PathBuf, name: &str, postings: &Postings) -> PostingsArchive {
    let path = dir.join(name);
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    postings
        .write_into(&mut file)
        .expect("the postings should write");
    drop(file);

    PostingsArchive::new(PostingsFile::open(&path).expect("the fixture file should open"))
        .expect("the fixture postings should validate")
}

fn collect(membership: &Membership<'_>, range: core::ops::Range<u32>) -> Vec<u32> {
    membership.positions_in(range).collect()
}

#[test]
fn the_build_matches_the_hand_computed_runs() {
    let dir = scratch("hand-computed");
    let postings = Postings::build(
        &fixture_types(),
        &ROW_OF_POSITION,
        &fixture_parents(),
        FIXTURE_CONFIG,
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    assert_eq!(mapped.types(), 4);
    assert_eq!(mapped.points(), 8);

    // Type 0 went dense: bits {1, 2, 3, 6} in one word.
    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    assert_matches!(type0, Membership::Dense(&[0b0100_1110]));
    assert_eq!(type0.count(), 4);
    assert_eq!(collect(&type0, 0..8), [1, 2, 3, 6]);

    // Type 1 stayed a list.
    let type1 = mapped.membership(id(1)).expect("type 1 is in domain");
    assert_matches!(type1, Membership::List(&[5, 7]));
    assert_eq!(type1.count(), 2);

    // Type 2 went dense: bits {0, 1, 7}.
    let type2 = mapped.membership(id(2)).expect("type 2 is in domain");
    assert_matches!(type2, Membership::Dense(&[0b1000_0011]));
    assert_eq!(collect(&type2, 0..8), [0, 1, 7]);

    // Type 3 is the empty list.
    let type3 = mapped.membership(id(3)).expect("type 3 is in domain");
    assert_matches!(type3, Membership::List(&[]));
    assert_eq!(type3.count(), 0);

    // Beyond the type domain there is no membership.
    assert!(mapped.membership(id(4)).is_none());

    // Parents restate the input lists.
    assert_eq!(mapped.parents(id(0)), Some([].as_slice()));
    assert_eq!(mapped.parents(id(1)), Some([0_u32].as_slice()));
    assert_eq!(mapped.parents(id(3)), Some([1_u32, 2].as_slice()));
    assert!(mapped.parents(id(4)).is_none());
}

#[test]
fn membership_lookups_agree_across_representations() {
    let dir = scratch("lookups");
    let postings = Postings::build(
        &fixture_types(),
        &ROW_OF_POSITION,
        &fixture_parents(),
        FIXTURE_CONFIG,
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    // contains at both representations, including absences and the
    // out-of-domain position.
    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    let type1 = mapped.membership(id(1)).expect("type 1 is in domain");
    assert!(type0.contains(1) && type0.contains(6));
    assert!(!type0.contains(0) && !type0.contains(7));
    assert!(!type0.contains(200));
    assert!(type1.contains(5) && !type1.contains(6));
    assert!(!type1.contains(200));

    // Sub-range slicing at both representations: half-open ends,
    // empty and inverted ranges.
    assert_eq!(collect(&type0, 2..6), [2, 3]);
    assert_eq!(collect(&type0, 3..7), [3, 6]);
    assert_eq!(collect(&type0, 4..4), [] as [u32; 0]);
    #[expect(
        clippy::reversed_empty_ranges,
        reason = "the inverted range IS the case under test"
    )]
    let inverted = collect(&type0, 6..2);
    assert_eq!(inverted, [] as [u32; 0]);
    assert_eq!(collect(&type1, 6..8), [7]);
    assert_eq!(collect(&type1, 0..5), [] as [u32; 0]);
}

#[test]
fn dense_iteration_crosses_word_boundaries() {
    // Two words over forty positions: members {0, 31, 32, 39}.
    let words = [0x8000_0001_u32, 0b1000_0001];
    let membership = Membership::Dense(&words);

    assert_eq!(collect(&membership, 0..40), [0, 31, 32, 39]);
    assert_eq!(collect(&membership, 1..39), [31, 32]);
    assert_eq!(collect(&membership, 31..33), [31, 32]);
    assert_eq!(collect(&membership, 32..32), [] as [u32; 0]);
    assert_eq!(collect(&membership, 33..40), [39]);
}

#[test]
fn evidence_counts_the_split() {
    let postings = Postings::build(
        &fixture_types(),
        &ROW_OF_POSITION,
        &fixture_parents(),
        FIXTURE_CONFIG,
    )
    .expect("the fixture stays in domain");

    let evidence = postings.evidence();
    assert_eq!(evidence.types, 4);
    assert_eq!(evidence.dense_types, 2, "types 0 and 2 went dense");
    // Two dense words plus the two list entries of type 1.
    assert_eq!(evidence.membership_entries, 4);
    assert_eq!(evidence.parent_edges, 4);
}

#[test]
fn build_rejects_out_of_domain_rows() {
    // A node row naming a type beyond the domain.
    assert_eq!(
        Postings::build(
            &types(&[&[4]]),
            &[0],
            &fixture_parents(),
            PostingsConfig::default(),
        ),
        Err(PostingsError::NodeType { row: 0, id: 4 }),
    );

    // A parent naming a type beyond the domain.
    assert_eq!(
        Postings::build(
            &types(&[&[0]]),
            &[0],
            &types(&[&[7]]),
            PostingsConfig::default(),
        ),
        Err(PostingsError::Parent { type_row: 0, id: 7 }),
    );
}

#[test]
fn empty_domains_roundtrip() {
    let dir = scratch("empty");

    // No rows, no types.
    let postings = Postings::build(&[], &[], &[], PostingsConfig::default())
        .expect("the empty build stays in domain");
    let empty = mapped(&dir, "empty.post", &postings);
    assert_eq!(empty.types(), 0);
    assert_eq!(empty.points(), 0);
    assert!(empty.membership(id(0)).is_none());

    // Rows without types: every membership is an empty list.
    let postings = Postings::build(
        &types(&[&[], &[]]),
        &[1, 0],
        &types(&[&[]]),
        PostingsConfig::default(),
    )
    .expect("the hollow build stays in domain");
    let hollow = mapped(&dir, "hollow.post", &postings);
    assert_eq!(hollow.points(), 2);
    let membership = hollow.membership(id(0)).expect("type 0 is in domain");
    assert_matches!(membership, Membership::List(&[]));
}

/// Writes raw regions and returns the error their opening surfaces.
fn open_invalid(
    path: impl AsRef<camino::Utf8Path>,
    points: u64,
    flags: &[u64],
    membership_posts: &[u64],
    entries: &[u32],
    parent_posts: &[u64],
    parent_ids: &[u32],
) -> InvalidPostingsFile {
    let path = path.as_ref();
    let mut file = fs::File::create(path).expect("the fixture file should create");
    write_regions(
        points,
        flags,
        membership_posts,
        entries,
        parent_posts,
        parent_ids,
        &mut file,
    )
    .expect("the regions should write");
    drop(file);

    PostingsArchive::new(PostingsFile::open(path).expect("the fixture file should open"))
        .expect_err("the contract violation must surface")
}

#[test]
fn open_rejects_membership_violations() {
    let dir = scratch("membership-rejections");
    let open = |name: &str, points: u64, flags: &[u64], posts: &[u64], entries: &[u32]| {
        open_invalid(dir.join(name), points, flags, posts, entries, &[0, 0], &[])
    };

    // A flags bit beyond the single type.
    assert_eq!(
        open("flags-tail.post", 4, &[0b10], &[0, 0], &[]),
        InvalidPostingsFile::FlagsTail,
    );

    // Membership posts not anchored at zero, then non-monotone.
    assert_eq!(
        open("posts-start.post", 4, &[0], &[1, 1], &[0]),
        InvalidPostingsFile::MembershipPosts { position: 0 },
    );
    assert_eq!(
        open_invalid(
            dir.join("posts-order.post"),
            4,
            &[0],
            &[0, 2, 1],
            &[0],
            &[0, 0, 0],
            &[],
        ),
        InvalidPostingsFile::MembershipPosts { position: 2 },
    );

    // A dense run must hold exactly the bitmap word count: at 64
    // points that is two words, not one.
    assert_eq!(
        open("dense-length.post", 64, &[1], &[0, 1], &[0]),
        InvalidPostingsFile::DenseLength { type_row: 0 },
    );

    // A dense bit at or beyond the five points.
    assert_eq!(
        open("dense-tail.post", 5, &[1], &[0, 1], &[0b10_0000]),
        InvalidPostingsFile::DenseTail { type_row: 0 },
    );

    // A list run out of order, then out of the position domain.
    assert_eq!(
        open("list-order.post", 10, &[0], &[0, 2], &[3, 3]),
        InvalidPostingsFile::ListOrder { type_row: 0 },
    );
    assert_eq!(
        open("list-domain.post", 10, &[0], &[0, 1], &[10]),
        InvalidPostingsFile::ListDomain { type_row: 0 },
    );
}

#[test]
fn open_rejects_parent_violations() {
    let dir = scratch("parent-rejections");
    let open = |name: &str, parent_posts: &[u64], parent_ids: &[u32]| {
        open_invalid(
            dir.join(name),
            4,
            &[0],
            &[0, 0, 0],
            &[],
            parent_posts,
            parent_ids,
        )
    };

    assert_eq!(
        open("parent-posts.post", &[0, 2, 1], &[0]),
        InvalidPostingsFile::ParentPosts { position: 2 },
    );
    assert_eq!(
        open("parent-order.post", &[0, 2, 2], &[1, 1]),
        InvalidPostingsFile::ParentOrder { type_row: 0 },
    );
    assert_eq!(
        open("parent-domain.post", &[0, 1, 1], &[5]),
        InvalidPostingsFile::ParentDomain { type_row: 0 },
    );
}

#[test]
fn closure_expands_the_fixture_graph() {
    let dir = scratch("closure");
    let postings = Postings::build(
        &fixture_types(),
        &ROW_OF_POSITION,
        &fixture_parents(),
        FIXTURE_CONFIG,
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    let closure = ClosureMap::new(&mapped).expect("the fixture graph is acyclic");
    assert_eq!(closure.types(), 4);
    assert_eq!(closure.stride(), 1);

    // Descendant rows, hand-derived: 0 is everyone's ancestor, 3 is
    // everyone's leaf.
    assert_eq!(closure.descendants(id(0)), Some(&[0b1111_u64] as &[u64]));
    assert_eq!(closure.descendants(id(1)), Some(&[0b1010_u64] as &[u64]));
    assert_eq!(closure.descendants(id(2)), Some(&[0b1100_u64] as &[u64]));
    assert_eq!(closure.descendants(id(3)), Some(&[0b1000_u64] as &[u64]));
    assert!(closure.descendants(id(4)).is_none());

    // A type descends from itself; descent is not symmetric.
    assert_eq!(closure.contains(id(0), id(0)), Some(true));
    assert_eq!(closure.contains(id(0), id(3)), Some(true));
    assert_eq!(closure.contains(id(3), id(0)), Some(false));
    assert_eq!(closure.contains(id(1), id(2)), Some(false));
    assert_eq!(closure.contains(id(9), id(0)), None);
    assert_eq!(closure.contains(id(0), id(9)), None);
}

#[test]
fn closure_rejects_parent_cycles() {
    let dir = scratch("cycle");

    // Types 0 and 1 parent each other; type 2 stands free and
    // settles, so exactly two types stay entangled.
    let postings = Postings::build(
        &types(&[&[0]]),
        &[0],
        &types(&[&[1], &[0], &[]]),
        PostingsConfig::default(),
    )
    .expect("the cyclic graph is still in domain");
    let mapped = mapped(&dir, "cycle.post", &postings);

    let error = ClosureMap::new(&mapped).expect_err("the parent cycle must surface");
    assert_eq!(error.entangled, 2);
}

/// Reference membership: does `position`'s row carry `type_row` directly?
fn reference_contains(
    types: &[SmallVec<OntologyRowId, 2>],
    row_of_position: &[u32],
    position: u32,
    type_row: u64,
) -> bool {
    types[row_of_position[position as usize] as usize]
        .iter()
        .any(|id| id.get() == type_row)
}

proptest! {
    /// Built postings roundtrip through the file and agree with the row-order reference.
    ///
    /// Agreement holds at every (type, position) pair, at every representation split the threshold
    /// knob can pick.
    #[test]
    fn built_postings_uphold_the_membership_contract(
        seeds in prop::collection::vec(prop::collection::btree_set(0_u64..5, 0..3), 0..40),
        threshold_log2 in 0_u8..8,
    ) {
        let domain = 5_usize;
        let rows: Vec<SmallVec<OntologyRowId, 2>> = seeds
            .iter()
            .map(|set| set.iter().copied().map(OntologyRowId::new).collect())
            .collect();

        let points = u32::try_from(rows.len()).expect("test corpora stay far below u32");

        // A deterministic non-trivial permutation: reversal.
        let row_of_position: Vec<u32> = (0..points).rev().collect();

        // Parents point strictly downward, so the graph is acyclic by
        // construction: a type's parent is its predecessor for odd rows.
        let parents: Vec<SmallVec<OntologyRowId, 2>> = (0..domain as u64)
            .map(|type_row| {
                if type_row & 1 == 1 {
                    smallvec![OntologyRowId::new(type_row - 1)]
                } else {
                    smallvec![]
                }
            })
            .collect();

        let postings = Postings::build(
            &rows,
            &row_of_position,
            &parents,
            PostingsConfig { dense_threshold_log2: threshold_log2 },
        )
        .expect("generated rows stay in domain");

        let dir = scratch(&format!("prop-{}", uuid::Uuid::now_v7()));
        let path = dir.join("prop.post");
        let mut file = fs::File::create(&path).expect("the fixture file should create");
        postings.write_into(&mut file).expect("the postings should write");
        drop(file);
        let mapped = PostingsArchive::new(
            PostingsFile::open(&path).expect("the fixture file should open"),
        )
        .expect("built postings always validate");
        // The mapping keeps the unlinked file's bytes alive, so failing
        // assertions cannot strand scratch files.
        fs::remove_dir_all(&dir).expect("the scratch directory is removable");

        prop_assert_eq!(mapped.points(), rows.len() as u64);
        for type_row in 0..domain as u64 {
            let membership = mapped
                .membership(OntologyRowId::new(type_row))
                .expect("the loop iterates the type domain");

            let expected: Vec<u32> = (0..points)
                .filter(|&position| {
                    reference_contains(&rows, &row_of_position, position, type_row)
                })
                .collect();
            let full: Vec<u32> = membership.positions_in(0..points).collect();
            prop_assert_eq!(&full, &expected, "type {}'s member positions", type_row);
            prop_assert_eq!(membership.count(), expected.len() as u64);

            for position in 0..points {
                prop_assert_eq!(
                    membership.contains(position),
                    reference_contains(&rows, &row_of_position, position, type_row),
                    "type {} at position {}",
                    type_row,
                    position,
                );
            }
        }

        // The closure agrees with reachability over the downward
        // parent chains: odd types descend from their even parent.
        let closure = ClosureMap::new(&mapped).expect("downward parents are acyclic");
        for ancestor in 0..domain as u64 {
            for descendant in 0..domain as u64 {
                let expected = ancestor == descendant
                    || (descendant & 1 == 1 && descendant - 1 == ancestor);
                prop_assert_eq!(
                    closure.contains(OntologyRowId::new(ancestor), OntologyRowId::new(descendant)),
                    Some(expected),
                    "descent {} -> {}",
                    ancestor,
                    descendant,
                );
            }
        }
    }
}
