use alloc::collections::BTreeSet;
use core::assert_matches;
use std::fs;

use camino::Utf8PathBuf;
use hashql_core::id::{Id, IdSlice, IdVec};
use proptest::{prop_assert, prop_assert_eq, property_test};
use smallvec::{SmallVec, smallvec};
use zerocopy::{LE, U64};

use super::{
    artifact::{InvalidPostingsFile, Membership, PostingsArchive},
    build::{Postings, PostingsError},
    closure::{ClosureMap, IconSource},
};
use crate::{
    bitset::{DenseBitSlice, DenseBitSliceArray},
    file::{
        WriteInto as _,
        postings::{
            FileHeader,
            read::PostingsFile,
            write::{Regions, write_regions},
        },
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    runs::Runs,
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

fn types<R: Id>(lists: &[&[u64]]) -> IdVec<R, SmallVec<OntologyRowId, 2>> {
    lists
        .iter()
        .map(|list| list.iter().copied().map(OntologyRowId::new).collect())
        .collect()
}

/// Builds the dense set over `domain` positions admitting exactly `members`.
fn dense_set(domain: usize, members: &[u32]) -> Box<DenseBitSlice<BasePosition>> {
    let mut set = DenseBitSlice::new_empty(domain);
    for &member in members {
        set.insert(BasePosition::from_u32(member));
    }
    set
}

/// Builds a fencepost column at its persisted little-endian width.
fn le_posts<I: Id>(raw: &[u64]) -> IdVec<I, U64<LE>> {
    IdVec::from_raw(raw.iter().copied().map(U64::new).collect())
}

/// Builds a lawful run structure for a fixture's regions.
fn runs<I: Id, T>(posts: &[u64], items: Vec<T>) -> Runs<I, T> {
    Runs::from_parts(le_posts(posts), items).expect("the fixture posts satisfy the fencepost law")
}

/// The hand fixture has eight rows over four types, gathered through a permutation.
///
/// Row-order direct types: `0:{0} 1:{0,2} 2:{1} 3:{2} 4:{0} 5:{1,2} 6:{0} 7:{0}`;
/// `row_of_position = [3, 1, 4, 0, 6, 2, 7, 5]`. Member positions per type, hand-derived: type 0
/// `[1, 2, 3, 4, 6]`, type 1 `[5, 7]`, type 2 `[0, 1, 7]`, type 3 `[]`. Parents: `1 <- 0`,
/// `2 <- 0`, `3 <- {1, 2}`.
///
/// The split follows the size comparison alone: over eight points a dense set costs 16 bytes, so
/// five members (20 list bytes) go dense and three (12) stay a list. Type 0 is the fixture's dense
/// type. Every other type stays a list.
const ROW_OF_POSITION: [u32; 8] = [3, 1, 4, 0, 6, 2, 7, 5];

fn fixture_types() -> IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> {
    types(&[&[0], &[0, 2], &[1], &[2], &[0], &[1, 2], &[0], &[0]])
}

fn fixture_parents() -> IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>> {
    types(&[&[], &[0], &[0], &[1, 2]])
}

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
    let range = BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end);
    membership
        .positions_in(range)
        .map(BasePosition::as_u32)
        .collect()
}

#[test]
fn build_matches_the_hand_computed_runs() {
    let dir = scratch("hand-computed");
    let postings = Postings::build(
        &fixture_types(),
        IdSlice::from_raw(&ROW_OF_POSITION.map(NodeRowId::from_u32)),
        &fixture_parents(),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    assert_eq!(mapped.types(), 4);
    assert_eq!(mapped.points(), 8);

    // Type 0 went dense: five members over eight points.
    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    assert_matches!(type0, Membership::Dense(set) if *set == *dense_set(8, &[1, 2, 3, 4, 6]));
    assert_eq!(type0.count(), 5);
    assert_eq!(collect(&type0, 0..8), [1, 2, 3, 4, 6]);

    // Type 1 stayed a list.
    let type1 = mapped.membership(id(1)).expect("type 1 is in domain");
    assert_matches!(type1, Membership::List(list) if *list == [5, 7].map(BasePosition::from_u32));
    assert_eq!(type1.count(), 2);

    // Type 2 stayed a list: three members cost fewer bytes than the dense set.
    let type2 = mapped.membership(id(2)).expect("type 2 is in domain");
    assert_matches!(
        type2,
        Membership::List(list) if *list == [0, 1, 7].map(BasePosition::from_u32)
    );
    assert_eq!(collect(&type2, 0..8), [0, 1, 7]);

    // Type 3 is the empty list.
    let type3 = mapped.membership(id(3)).expect("type 3 is in domain");
    assert_matches!(type3, Membership::List(&[]));
    assert_eq!(type3.count(), 0);

    // Beyond the type domain there is no membership.
    assert!(mapped.membership(id(4)).is_none());

    // Parents restate the input lists.
    assert_eq!(mapped.parents(id(0)), Some([].as_slice()));
    assert_eq!(mapped.parents(id(1)), Some([id(0)].as_slice()));
    assert_eq!(mapped.parents(id(3)), Some([id(1), id(2)].as_slice()));
    assert!(mapped.parents(id(4)).is_none());

    // The direct map is the gathered type column: each position's run restates its row's types.
    let direct = |position: u32| mapped.direct_types(BasePosition::from_u32(position));
    assert_eq!(direct(0), Some([id(2)].as_slice()), "position 0 is row 3");
    assert_eq!(
        direct(1),
        Some([id(0), id(2)].as_slice()),
        "position 1 is row 1"
    );
    assert_eq!(direct(4), Some([id(0)].as_slice()), "position 4 is row 6");
    assert_eq!(
        direct(7),
        Some([id(1), id(2)].as_slice()),
        "position 7 is row 5"
    );
    assert!(
        direct(8).is_none(),
        "beyond the point domain there is no run"
    );
}

#[test]
fn membership_lookups_agree_across_representations() {
    let dir = scratch("lookups");
    let postings = Postings::build(
        &fixture_types(),
        IdSlice::from_raw(&ROW_OF_POSITION.map(NodeRowId::from_u32)),
        &fixture_parents(),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    // contains at both representations, including absences and the
    // out-of-domain position.
    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    let type1 = mapped.membership(id(1)).expect("type 1 is in domain");
    assert!(type0.contains(BasePosition::from_u32(1)) && type0.contains(BasePosition::from_u32(6)));
    assert!(
        !type0.contains(BasePosition::from_u32(0)) && !type0.contains(BasePosition::from_u32(7))
    );
    assert!(!type0.contains(BasePosition::from_u32(200)));
    assert!(
        type1.contains(BasePosition::from_u32(5)) && !type1.contains(BasePosition::from_u32(6))
    );
    assert!(!type1.contains(BasePosition::from_u32(200)));

    // Sub-range slicing at both representations: half-open ends and
    // empty ranges.
    assert_eq!(collect(&type0, 2..6), [2, 3, 4]);
    assert_eq!(collect(&type0, 3..7), [3, 4, 6]);
    assert_eq!(collect(&type0, 4..4), [] as [u32; 0]);
    assert_eq!(collect(&type1, 6..8), [7]);
    assert_eq!(collect(&type1, 0..5), [] as [u32; 0]);
}

/// The membership contract demands ascending ranges from every caller, so an inverted range
/// panics at the list representation.
#[test]
#[should_panic(expected = "an inverted position range matches no delivered run")]
fn inverted_list_ranges_are_a_caller_bug() {
    let dir = scratch("inverted-list");
    let postings = Postings::build(
        &fixture_types(),
        IdSlice::from_raw(&ROW_OF_POSITION.map(NodeRowId::from_u32)),
        &fixture_parents(),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    let type1 = mapped.membership(id(1)).expect("type 1 is in domain");
    #[expect(
        clippy::reversed_empty_ranges,
        reason = "the inverted range IS the case under test"
    )]
    let _positions = collect(&type1, 6..2);
}

/// The dense representation delegates the same contract to the set's own cursor.
#[test]
#[should_panic(expected = "an inverted row range admits no iteration order")]
fn inverted_dense_ranges_are_a_caller_bug() {
    let dir = scratch("inverted-dense");
    let postings = Postings::build(
        &fixture_types(),
        IdSlice::from_raw(&ROW_OF_POSITION.map(NodeRowId::from_u32)),
        &fixture_parents(),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    #[expect(
        clippy::reversed_empty_ranges,
        reason = "the inverted range IS the case under test"
    )]
    let _positions = collect(&type0, 6..2);
}

#[test]
fn dense_iteration_crosses_word_boundaries() {
    // Members {0, 63, 64, 79} over eighty positions in two words.
    let set = dense_set(80, &[0, 63, 64, 79]);
    let membership = Membership::Dense(&set);

    assert_eq!(collect(&membership, 0..80), [0, 63, 64, 79]);
    assert_eq!(collect(&membership, 1..79), [63, 64]);
    assert_eq!(collect(&membership, 63..65), [63, 64]);
    assert_eq!(collect(&membership, 64..64), [] as [u32; 0]);
    assert_eq!(collect(&membership, 65..80), [79]);
}

/// A membership whose list costs exactly the dense frame stays a list.
///
/// Over five points a dense frame costs 16 bytes and so do four list members, so type 0 sits
/// exactly on the boundary the size comparison draws. The ruled tie keeps it a list, which reads
/// without bit decoding, while type 1's five members cost 20 list bytes and tip dense. A drift
/// from strict to inclusive comparison flips type 0 dense and fails both assertions.
#[test]
fn equal_cost_membership_stays_a_list() {
    let dir = scratch("tie");
    let postings = Postings::build(
        &types(&[&[0, 1], &[0, 1], &[0, 1], &[0, 1], &[1]]),
        IdSlice::from_raw(&[0, 1, 2, 3, 4].map(NodeRowId::from_u32)),
        &types(&[&[], &[]]),
    )
    .expect("the fixture stays in domain");

    assert_eq!(
        postings.measurements().dense_types,
        1,
        "only the five-member type tips dense"
    );

    let mapped = mapped(&dir, "tie.post", &postings);
    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    assert_matches!(
        type0,
        Membership::List(list) if *list == [0, 1, 2, 3].map(BasePosition::from_u32)
    );
}

#[test]
fn evidence_counts_the_split() {
    let postings = Postings::build(
        &fixture_types(),
        IdSlice::from_raw(&ROW_OF_POSITION.map(NodeRowId::from_u32)),
        &fixture_parents(),
    )
    .expect("the fixture stays in domain");

    let evidence = postings.measurements();
    assert_eq!(evidence.types, 4);
    assert_eq!(evidence.dense_types, 1, "type 0 went dense");
    // Type 1's two list entries plus type 2's three.
    assert_eq!(evidence.list_entries, 5);
    assert_eq!(evidence.parent_edges, 4);
    // The direct total is one entry per position-type pair: the five list entries plus type 0's
    // five dense members.
    assert_eq!(evidence.direct_entries, 10);
}

/// An eighty-point corpus drives a dense frame across the word boundary through the whole file.
///
/// Type 0's eight members straddle position 64, so its frame holds two words and the path from
/// build through write to open exercises the multi-word header geometry, stride arithmetic, and
/// tail policing that the single-word fixtures never reach. Type 1 stays a two-member list whose
/// entries cross the same boundary.
#[test]
fn multi_word_dense_sets_roundtrip_through_the_file() {
    const MEMBERS: [u32; 8] = [0, 1, 62, 63, 64, 65, 78, 79];

    let dir = scratch("multi-word");
    let rows: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> = (0..80_u32)
        .map(|row| {
            let position = 79 - row;
            let mut list = SmallVec::new();
            if MEMBERS.contains(&position) {
                list.push(OntologyRowId::new(0));
            }
            if position == 5 || position == 70 {
                list.push(OntologyRowId::new(1));
            }
            list
        })
        .collect();
    let row_of_position: Vec<NodeRowId> = (0..80_u32).rev().map(NodeRowId::from_u32).collect();

    let postings = Postings::build(
        &rows,
        IdSlice::from_raw(&row_of_position),
        &types(&[&[], &[]]),
    )
    .expect("the fixture stays in domain");
    assert_eq!(
        postings.measurements().dense_types,
        1,
        "eight members over eighty points tip dense"
    );

    let mapped = mapped(&dir, "multi-word.post", &postings);
    assert_eq!(mapped.points(), 80);

    let type0 = mapped.membership(id(0)).expect("type 0 is in domain");
    assert_matches!(type0, Membership::Dense(set) if *set == *dense_set(80, &MEMBERS));
    assert_eq!(collect(&type0, 0..80), MEMBERS);
    assert_eq!(collect(&type0, 63..65), [63, 64]);
    assert_eq!(collect(&type0, 2..79), [62, 63, 64, 65, 78]);
    assert!(type0.contains(BasePosition::from_u32(64)));
    assert!(!type0.contains(BasePosition::from_u32(66)));

    let type1 = mapped.membership(id(1)).expect("type 1 is in domain");
    assert_matches!(
        type1,
        Membership::List(list) if *list == [5, 70].map(BasePosition::from_u32)
    );

    // The direct map crosses the boundary with the membership.
    let direct = |position: u32| mapped.direct_types(BasePosition::from_u32(position));
    assert_eq!(direct(64), Some([id(0)].as_slice()));
    assert_eq!(direct(70), Some([id(1)].as_slice()));
    assert_eq!(direct(2), Some([].as_slice()), "position 2 carries no type");
}

#[test]
fn build_rejects_out_of_domain_rows() {
    // A node row naming a type beyond the domain.
    assert_eq!(
        Postings::build(
            &types(&[&[4]]),
            IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
            &fixture_parents(),
        ),
        Err(PostingsError::NodeType {
            row: NodeRowId::from_u32(0),
            id: id(4),
        }),
    );

    // A parent naming a type beyond the domain.
    assert_eq!(
        Postings::build(
            &types(&[&[0]]),
            IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
            &types(&[&[7]]),
        ),
        Err(PostingsError::Parent {
            type_row: id(0),
            id: id(7),
        }),
    );
}

/// The gather asserts the dataset's ascent contract, so a defective stream fails the build
/// instead of publishing a file the next open refuses.
#[test]
#[should_panic(expected = "a row's direct types ascend strictly")]
fn unsorted_direct_types_are_a_producer_bug() {
    let _: Result<Postings, PostingsError> = Postings::build(
        &types(&[&[1, 0]]),
        IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
        &types(&[&[], &[]]),
    );
}

/// The parent regions assert the same contract for the type graph's stream.
#[test]
#[should_panic(expected = "a type's direct parents ascend strictly")]
fn unsorted_parents_are_a_producer_bug() {
    let _: Result<Postings, PostingsError> = Postings::build(
        &types(&[&[0]]),
        IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
        &types(&[&[], &[1, 0]]),
    );
}

#[test]
fn empty_domains_roundtrip() {
    let dir = scratch("empty");

    // An empty corpus has no rows and no types.
    let postings = Postings::build(
        &types::<NodeRowId>(&[]),
        IdSlice::from_raw(&[]),
        &types::<OntologyRowId>(&[]),
    )
    .expect("the empty build stays in domain");
    let empty = mapped(&dir, "empty.post", &postings);
    assert_eq!(empty.types(), 0);
    assert_eq!(empty.points(), 0);
    assert!(empty.membership(id(0)).is_none());

    // Rows without types: every membership is an empty list.
    let postings = Postings::build(
        &types(&[&[], &[]]),
        IdSlice::from_raw(&[1, 0].map(NodeRowId::from_u32)),
        &types(&[&[]]),
    )
    .expect("the hollow build stays in domain");
    let hollow = mapped(&dir, "hollow.post", &postings);
    assert_eq!(hollow.points(), 2);
    let membership = hollow.membership(id(0)).expect("type 0 is in domain");
    assert_matches!(membership, Membership::List(&[]));
}

/// Writes lawful regions and returns the error their opening surfaces.
fn open_invalid(path: impl AsRef<camino::Utf8Path>, regions: Regions<'_>) -> InvalidPostingsFile {
    let path = path.as_ref();
    let mut file = fs::File::create(path).expect("the fixture file should create");
    write_regions(regions, &mut file).expect("the regions should write");
    drop(file);

    PostingsArchive::new(PostingsFile::open(path).expect("the fixture file should open"))
        .expect_err("the contract violation must surface")
}

/// The helper writes lawful regions and overwrites one byte of the persisted file before returning
/// the error surfaced during reopening.
///
/// The writer's fencepost columns arrive as validated [`Runs`], so a file with a broken fencepost
/// region can no longer be written; corrupting the bytes on disk is the remaining road to one,
/// and it is exactly the corruption class the open checks guard against.
fn open_corrupted(
    path: impl AsRef<camino::Utf8Path>,
    regions: Regions<'_>,
    offset: u64,
    value: u8,
) -> InvalidPostingsFile {
    let path = path.as_ref();
    let mut bytes = Vec::new();
    write_regions(regions, &mut bytes).expect("writing into a vector cannot fail");
    bytes[usize::try_from(offset).expect("fixture offsets fit usize")] = value;
    fs::write(path, &bytes).expect("the scratch file is writable");

    PostingsArchive::new(PostingsFile::open(path).expect("the fixture file should open"))
        .expect_err("the contract violation must surface")
}

#[test]
fn open_rejects_membership_violations() {
    let dir = scratch("membership-rejections");
    let positions = |values: &[u32]| -> Vec<BasePosition> {
        values.iter().copied().map(BasePosition::from_u32).collect()
    };

    // List posts not anchored at zero, then non-monotone. The writer's fencepost columns arrive
    // as validated run structures, so these files exist only through byte corruption.
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_corrupted(
            dir.join("posts-start.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 1], positions(&[0])),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(4, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0, 1, 1, 1, 1], vec![id(0)]),
            },
            FileHeader::new(1, 4, 1, 0, 0, 1)
                .list_posts_offset()
                .expect("the fixture geometry fits"),
            1,
        ),
        InvalidPostingsFile::ListPosts { position: 0 },
    );

    let flags = DenseBitSlice::new_empty(2);
    assert_eq!(
        open_corrupted(
            dir.join("posts-order.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 2, 2], positions(&[0, 1])),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(4, 0)),
                parents: &runs(&[0, 0, 0], Vec::new()),
                direct: &runs(&[0, 1, 2, 2, 2], vec![id(0), id(0)]),
            },
            // The third list fencepost, dropped below its predecessor.
            FileHeader::new(2, 4, 2, 0, 0, 2)
                .list_posts_offset()
                .expect("the fixture geometry fits")
                + 16,
            1,
        ),
        InvalidPostingsFile::ListPosts { position: 2 },
    );

    // A dense type carrying a non-empty list run.
    let mut flags = DenseBitSlice::new_empty(1);
    flags.insert(OntologyRowId::new(0));
    let dense_sets = DenseBitSliceArray::<BasePosition>::new_empty(4, 1);
    assert_eq!(
        open_invalid(
            dir.join("dense-list-run.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 1], positions(&[0])),
                dense_sets: &dense_sets,
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0, 1, 1, 1, 1], vec![id(0)]),
            },
        ),
        InvalidPostingsFile::DenseListRun { type_row: id(0) },
    );

    // A list run out of order, then out of the position domain.
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_invalid(
            dir.join("list-order.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 2], positions(&[3, 3])),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(10, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0; 11], Vec::new()),
            },
        ),
        InvalidPostingsFile::ListOrder { type_row: id(0) },
    );
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_invalid(
            dir.join("list-domain.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 1], positions(&[10])),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(10, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0; 11], Vec::new()),
            },
        ),
        InvalidPostingsFile::ListDomain { type_row: id(0) },
    );
}

#[test]
fn open_rejects_parent_violations() {
    let dir = scratch("parent-rejections");
    let parent_ids = |values: &[u64]| -> Vec<OntologyRowId> {
        values.iter().copied().map(OntologyRowId::new).collect()
    };

    // Broken parent fenceposts reach a reader only through corrupted bytes, exactly as for the
    // list fenceposts.
    let flags = DenseBitSlice::new_empty(2);
    assert_eq!(
        open_corrupted(
            dir.join("parent-posts.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 0, 0], Vec::new()),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(4, 0)),
                parents: &runs(&[0, 1, 1], parent_ids(&[0])),
                direct: &runs(&[0; 5], Vec::new()),
            },
            // The third parent fencepost, dropped below its predecessor.
            FileHeader::new(2, 4, 0, 0, 1, 0)
                .parent_posts_offset()
                .expect("the fixture geometry fits")
                + 16,
            0,
        ),
        InvalidPostingsFile::ParentPosts { position: 2 },
    );

    let flags = DenseBitSlice::new_empty(2);
    assert_eq!(
        open_invalid(
            dir.join("parent-order.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 0, 0], Vec::new()),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(4, 0)),
                parents: &runs(&[0, 2, 2], parent_ids(&[1, 1])),
                direct: &runs(&[0; 5], Vec::new()),
            },
        ),
        InvalidPostingsFile::ParentOrder { type_row: id(0) },
    );
    let flags = DenseBitSlice::new_empty(2);
    assert_eq!(
        open_invalid(
            dir.join("parent-domain.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 0, 0], Vec::new()),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(4, 0)),
                parents: &runs(&[0, 1, 1], parent_ids(&[5])),
                direct: &runs(&[0; 5], Vec::new()),
            },
        ),
        InvalidPostingsFile::ParentDomain { type_row: id(0) },
    );
}

#[test]
fn open_rejects_direct_violations() {
    let dir = scratch("direct-rejections");
    let ids = |values: &[u64]| -> Vec<OntologyRowId> {
        values.iter().copied().map(OntologyRowId::new).collect()
    };

    // Broken direct fenceposts reach a reader only through corrupted bytes.
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_corrupted(
            dir.join("direct-posts.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 1], vec![BasePosition::from_u32(0)]),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(2, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0, 1, 1], ids(&[0])),
            },
            // The second direct fencepost, raised above its successor.
            FileHeader::new(1, 2, 1, 0, 0, 1)
                .direct_posts_offset()
                .expect("the fixture geometry fits")
                + 8,
            2,
        ),
        InvalidPostingsFile::DirectPosts { position: 2 },
    );

    // A direct run out of order, out of the type domain, and a direct map whose entry count
    // contradicts the membership total.
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_invalid(
            dir.join("direct-order.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 0], Vec::new()),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(1, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0, 2], ids(&[0, 0])),
            },
        ),
        InvalidPostingsFile::DirectOrder {
            position: BasePosition::from_u32(0)
        },
    );
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_invalid(
            dir.join("direct-domain.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 0], Vec::new()),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(1, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0, 1], ids(&[5])),
            },
        ),
        InvalidPostingsFile::DirectDomain {
            position: BasePosition::from_u32(0)
        },
    );
    let flags = DenseBitSlice::new_empty(1);
    assert_eq!(
        open_invalid(
            dir.join("pair-count.post"),
            Regions {
                flags: &flags,
                lists: &runs(&[0, 0], Vec::new()),
                dense_sets: Box::leak(DenseBitSliceArray::new_empty(1, 0)),
                parents: &runs(&[0, 0], Vec::new()),
                direct: &runs(&[0, 1], ids(&[0])),
            },
        ),
        InvalidPostingsFile::PairCount {
            direct: 1,
            membership: 0,
        },
    );
}

#[test]
fn closure_expands_the_fixture_graph() {
    let dir = scratch("closure");
    let postings = Postings::build(
        &fixture_types(),
        IdSlice::from_raw(&ROW_OF_POSITION.map(NodeRowId::from_u32)),
        &fixture_parents(),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "fixture.post", &postings);

    let closure = ClosureMap::new(&mapped, []).expect("the fixture graph is acyclic");
    assert_eq!(closure.types(), 4);

    // Descendant rows, hand-derived: 0 is everyone's ancestor, 3 is
    // everyone's leaf.
    let descendants = |row| {
        closure
            .descendants(row)
            .map(|descendants| descendants.iter().collect::<Vec<_>>())
    };
    assert_eq!(descendants(id(0)), Some(vec![id(0), id(1), id(2), id(3)]));
    assert_eq!(descendants(id(1)), Some(vec![id(1), id(3)]));
    assert_eq!(descendants(id(2)), Some(vec![id(2), id(3)]));
    assert_eq!(descendants(id(3)), Some(vec![id(3)]));
    assert!(descendants(id(4)).is_none());

    // A type descends from itself. Descent is not symmetric.
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

    // Types 0 and 1 parent each other. Type 2 stands free and
    // settles, so exactly two types stay entangled.
    let postings = Postings::build(
        &types(&[&[0]]),
        IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
        &types(&[&[1], &[0], &[]]),
    )
    .expect("the cyclic graph is still in domain");
    let mapped = mapped(&dir, "cycle.post", &postings);

    let error = ClosureMap::new(&mapped, []).expect_err("the parent cycle must surface");
    assert_eq!(error.entangled, 2);
}

/// The icon memo resolves the nearest icon-bearing ancestor, exactly where a request-time cache
/// went wrong.
///
/// The graph is the counterexample that killed the cross-position icon cache: parents `1 <- 3`,
/// `3 <- {4, 5}`, `{2, 5} <- 0`, icons on 0 and 4. A walk from direct types `{1, 2}` finds 0's
/// icon after visiting 3, so a cache keyed by visited types would poison 3 with 0's icon - yet
/// 3's own nearest icon is 4's at depth one. The memo resolves each type over the whole graph,
/// so 3 reads 4.
#[test]
fn icon_memo_resolves_the_nearest_ancestor_icon() {
    let dir = scratch("icon-memo");

    // Types 6 and 7 chain icon-free, so their cones record no source.
    let postings = Postings::build(
        &types(&[&[1, 2], &[3]]),
        IdSlice::from_raw(&[0, 1].map(NodeRowId::from_u32)),
        &types(&[&[], &[3], &[0], &[4, 5], &[], &[0], &[], &[6]]),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "icon-memo.post", &postings);

    let closure = ClosureMap::new(&mapped, [id(0), id(4)]).expect("the fixture graph is acyclic");

    let source = |source, depth| Some(IconSource { source, depth });
    assert_eq!(closure.icon_source(id(0)), source(id(0), 0));
    assert_eq!(closure.icon_source(id(1)), source(id(4), 2));
    assert_eq!(closure.icon_source(id(2)), source(id(0), 1));
    // The cell the request-time cache poisoned: 3's nearest icon is 4's, not 0's.
    assert_eq!(closure.icon_source(id(3)), source(id(4), 1));
    assert_eq!(closure.icon_source(id(4)), source(id(4), 0));
    assert_eq!(closure.icon_source(id(5)), source(id(0), 1));

    // An icon-free cone records no source, at any height.
    assert_eq!(closure.icon_source(id(6)), None);
    assert_eq!(closure.icon_source(id(7)), None);
}

/// Depth beats run order, and run order breaks equal-depth ties.
///
/// Type 3's earlier parent resolves deeper (0 through 1, depth two) than its later parent (2's
/// own icon, depth one), so the shallower source wins over the run order. Type 4's parents both
/// resolve at depth one, so the earlier parent in the run - ascending rows, the artifact
/// contract - decides.
#[test]
fn icon_memo_ties_resolve_by_depth_then_run_order() {
    let dir = scratch("icon-ties");
    let postings = Postings::build(
        &types(&[&[3, 4]]),
        IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
        &types(&[&[], &[0], &[], &[1, 2], &[0, 2]]),
    )
    .expect("the fixture stays in domain");
    let mapped = mapped(&dir, "icon-ties.post", &postings);

    let closure = ClosureMap::new(&mapped, [id(0), id(2)]).expect("the fixture graph is acyclic");

    // Via 1 the source is 0 at depth two, via 2 it is 2 at depth one, and the shallower
    // resolution wins.
    assert_eq!(
        closure.icon_source(id(3)),
        Some(IconSource {
            source: id(2),
            depth: 1,
        }),
    );
    // Via 0 and via 2 both resolve at depth one. The earlier parent in the run wins.
    assert_eq!(
        closure.icon_source(id(4)),
        Some(IconSource {
            source: id(0),
            depth: 1,
        }),
    );
}

/// Reference resolution: recurse over the raw parent lists with the memo's tie rule.
fn reference_icon_source(
    parents: &IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>>,
    icons: &BTreeSet<u64>,
    type_row: OntologyRowId,
) -> Option<IconSource> {
    if icons.contains(&type_row.as_u64()) {
        return Some(IconSource {
            source: type_row,
            depth: 0,
        });
    }

    let mut best: Option<IconSource> = None;
    for &parent in &parents[type_row] {
        let Some(IconSource { source, depth }) = reference_icon_source(parents, icons, parent)
        else {
            continue;
        };
        let depth = depth + 1;
        if best.is_none_or(|held| depth < held.depth) {
            best = Some(IconSource { source, depth });
        }
    }

    best
}

/// The icon memo agrees with direct recursive resolution over random downward graphs.
///
/// Each type's parents draw from strictly smaller rows, so every graph is acyclic and every
/// parent run ascends by construction. The reference resolves each type recursively over the raw
/// lists with the same tie rule, so agreement pins the memo's topological pass and its archive
/// plumbing against an order-free restatement.
#[property_test]
fn icon_memo_matches_recursive_resolution(
    #[strategy = proptest::collection::vec(proptest::collection::btree_set(0_u64..12, 0..4), 1..12)]
    parent_seeds: Vec<BTreeSet<u64>>,
    #[strategy = proptest::collection::btree_set(0_u64..12, 0..5)] icon_seeds: BTreeSet<u64>,
) {
    let parents: IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>> = parent_seeds
        .iter()
        .enumerate()
        .map(|(row, seed)| {
            seed.iter()
                .copied()
                .filter(|&parent| parent < row as u64)
                .map(OntologyRowId::new)
                .collect()
        })
        .collect();
    let domain = parents.len() as u64;
    let icons: BTreeSet<u64> = icon_seeds.into_iter().filter(|&row| row < domain).collect();

    let postings = Postings::build(
        &types::<NodeRowId>(&[&[]]),
        IdSlice::from_raw(&[0].map(NodeRowId::from_u32)),
        &parents,
    )
    .expect("downward parents stay in domain");

    let dir = scratch(&format!("icon-prop-{}", uuid::Uuid::now_v7()));
    let mapped = mapped(&dir, "icon-prop.post", &postings);
    // The mapping keeps the unlinked file's bytes alive, so failing
    // assertions cannot strand scratch files.
    fs::remove_dir_all(&dir).expect("the scratch directory is removable");

    let closure = ClosureMap::new(&mapped, icons.iter().copied().map(OntologyRowId::new))
        .expect("downward parents are acyclic");

    for type_row in 0..domain {
        prop_assert_eq!(
            closure.icon_source(OntologyRowId::new(type_row)),
            reference_icon_source(&parents, &icons, OntologyRowId::new(type_row)),
            "type {}'s memo entry",
            type_row,
        );
    }
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
        .any(|id| id.as_u64() == type_row)
}

/// Built postings roundtrip through the file and agree with the row-order reference.
///
/// Agreement holds at every (type, position) pair. The size comparison picks each type's
/// representation from the drawn counts, so both representations recur across cases. Corpora
/// reach past one word of positions, so multi-word dense frames recur too.
#[property_test]
fn built_postings_uphold_the_membership_contract(
    #[strategy = proptest::collection::vec(proptest::collection::btree_set(0_u64..5, 0..3), 0..100)]
    seeds: Vec<BTreeSet<u64>>,
) {
    let domain = 5_usize;
    let rows: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> = seeds
        .iter()
        .map(|set| set.iter().copied().map(OntologyRowId::new).collect())
        .collect();

    let points = u32::try_from(rows.len()).expect("test corpora stay far below u32");

    // A deterministic permutation other than the identity: reversal.
    let row_of_position: Vec<u32> = (0..points).rev().collect();

    // Parents point strictly downward, so the graph is acyclic by
    // construction: a type's parent is its predecessor for odd rows.
    let parents: IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>> = (0..domain as u64)
        .map(|type_row| {
            if type_row & 1 == 1 {
                smallvec![OntologyRowId::new(type_row - 1)]
            } else {
                smallvec![]
            }
        })
        .collect();

    let typed_row_of_position: Vec<NodeRowId> = row_of_position
        .iter()
        .copied()
        .map(NodeRowId::from_u32)
        .collect();
    let postings = Postings::build(&rows, IdSlice::from_raw(&typed_row_of_position), &parents)
        .expect("generated rows stay in domain");

    let dir = scratch(&format!("prop-{}", uuid::Uuid::now_v7()));
    let path = dir.join("prop.post");
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    postings
        .write_into(&mut file)
        .expect("the postings should write");
    drop(file);
    let mapped =
        PostingsArchive::new(PostingsFile::open(&path).expect("the fixture file should open"))
            .expect("built postings always validate");
    // The mapping keeps the unlinked file's bytes alive, so failing
    // assertions cannot strand scratch files.
    fs::remove_dir_all(&dir).expect("the scratch directory is removable");

    prop_assert_eq!(mapped.points(), rows.len() as u64);

    // The direct map restates each position's row types verbatim: the forward direction of the
    // one relation the membership inverts, so agreement with the same reference pins both.
    for position in 0..points {
        let expected: Vec<OntologyRowId> = rows.as_raw()
            [row_of_position[position as usize] as usize]
            .iter()
            .copied()
            .collect();
        prop_assert_eq!(
            mapped
                .direct_types(BasePosition::from_u32(position))
                .expect("the loop iterates the point domain"),
            expected.as_slice(),
            "position {}'s direct run",
            position,
        );
    }
    prop_assert!(
        mapped
            .direct_types(BasePosition::from_u32(points))
            .is_none()
    );

    for type_row in 0..domain as u64 {
        let membership = mapped
            .membership(OntologyRowId::new(type_row))
            .expect("the loop iterates the type domain");

        let expected: Vec<u32> = (0..points)
            .filter(|&position| {
                reference_contains(rows.as_raw(), &row_of_position, position, type_row)
            })
            .collect();
        let full: Vec<u32> = membership
            .positions_in(BasePosition::from_u32(0)..BasePosition::from_u32(points))
            .map(BasePosition::as_u32)
            .collect();
        prop_assert_eq!(&full, &expected, "type {}'s member positions", type_row);
        prop_assert_eq!(membership.count(), expected.len() as u64);

        for position in 0..points {
            prop_assert_eq!(
                membership.contains(BasePosition::from_u32(position)),
                reference_contains(rows.as_raw(), &row_of_position, position, type_row),
                "type {} at position {}",
                type_row,
                position,
            );
        }
    }

    // The closure agrees with reachability over the downward
    // parent chains: odd types descend from their even parent.
    let closure = ClosureMap::new(&mapped, []).expect("downward parents are acyclic");
    for ancestor in 0..domain as u64 {
        for descendant in 0..domain as u64 {
            let expected =
                ancestor == descendant || (descendant & 1 == 1 && descendant - 1 == ancestor);
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
