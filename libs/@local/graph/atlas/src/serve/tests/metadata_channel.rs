//! Controlled schedule proof for hidden occupancy in restricted response metadata.
//!
//! A restricted root response publishes two scalars the corpus cascade derives: the visible count
//! of the root's cumulative schedule, and the deepest bucket holding a visible row. Both read the
//! bucket assignment, and that assignment is a function of every corpus row, so a hidden row moves
//! them while the visible view stays fixed.
//!
//! The comparison holds the visible view fixed in the sense the delivery contract names: identical
//! visible row identity, identical visible Morton keys, identical relative importance order among
//! visible rows. The two worlds differ only in rows the proof hides.
//!
//! Two corpora are required. One corpus under two proofs shares one bucket assignment, so the
//! channel is invisible to any comparison that varies the mask alone.

use crate::{
    morton::{Depth, MortonKey},
    salt::lod::{cascade, rank::Ranking},
};

/// The fixture's span exponent: the root's cumulative schedule is buckets `0..=2`.
const SPAN: u8 = 2;

/// The fixture's deepest cascade grid.
const DEEPEST: u8 = 4;

/// One world's cascade reading over the rows a proof admits.
#[derive(Debug, PartialEq, Eq)]
struct Reading {
    /// The visible row's bucket.
    bucket: u8,
    /// Visible rows of the root's cumulative schedule: bucket at or below the cut.
    visible_at_cut: usize,
    /// The deepest bucket holding a visible row.
    deepest_visible: u8,
}

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("test depths lie within the key width")
}

/// Builds the ranking that ranks row `r` at position `r`.
///
/// The fixture names its rows in rank order, so rank and row index coincide.
fn ranking_by_row(rows: usize) -> Ranking {
    let order: Vec<u32> = (0..u32::try_from(rows).expect("test rows fit u32")).collect();

    Ranking {
        row_of_rank: order.clone().into_boxed_slice(),
        rank_of_row: order.into_boxed_slice(),
    }
}

/// Reads one world: the production cascade over `keys`, then the two published scalars over the
/// rows `visible` admits.
fn read(keys: &[MortonKey], visible: &[u32], subject: u32) -> Reading {
    let ranking = ranking_by_row(keys.len());
    let buckets = cascade::buckets(keys, &ranking, depth(DEEPEST));

    let bucket_of = |row: u32| buckets[row as usize].get();
    let visible_at_cut = visible
        .iter()
        .filter(|&&row| bucket_of(row) <= SPAN)
        .count();
    let deepest_visible = visible
        .iter()
        .map(|&row| bucket_of(row))
        .max()
        .expect("the fixture admits at least one row");

    Reading {
        bucket: bucket_of(subject),
        visible_at_cut,
        deepest_visible,
    }
}

/// A hidden row changes the authorized root response's published metadata with visible inputs
/// fixed.
///
/// Row `V` keys to the origin in both worlds and is the only row the proof admits, so the visible
/// row identity, the visible key set, and the (single-element) visible importance order are equal
/// across the comparison. The sparse world holds `V` alone. The blocked world adds three
/// better-ranked hidden rows that claim `V`'s cell at depths 0, 1, and 2 in turn:
///
/// | Row  | Axis `x`      | Claimed cell        | Bucket |
/// | ---- | ------------- | ------------------- | -----: |
/// | `H0` | `0x8000_0000` | depth 1, `x` bit 1  |    `0` |
/// | `H1` | `0x4000_0000` | depth 1, `x` bit 0  |    `1` |
/// | `H2` | `0x2000_0000` | depth 2, `x` bits 0 |    `2` |
/// | `V`  | `0`           | depth 3, `x` bits 0 |    `3` |
///
/// `V` therefore sits at bucket 0 in the sparse world and bucket 3 in the blocked world. The root
/// cut is bucket 2, so the visible count of the root's cumulative schedule reads 1 and then 0, and
/// the deepest visible bucket reads 0 and then 3.
///
/// This is the negative control for the metadata arm of the fixed-view comparison: the corpus-
/// derived readings disagree, so a candidate derivation that agrees is doing work an inert
/// comparator would not.
///
/// Scope: the witness establishes the property of the derivation the root response publishes. The
/// delivered row identities and their order are the selector's own arm of the comparison.
#[test]
fn a_hidden_row_changes_the_authorized_root_metadata() {
    let subject = MortonKey::new(0, 0);
    let claims_depth_one = MortonKey::new(0x8000_0000, 0);
    let shares_depth_one = MortonKey::new(0x4000_0000, 0);
    let shares_depth_two = MortonKey::new(0x2000_0000, 0);

    // The sparse world: the visible row alone, first occupant of the root cell.
    let sparse = read(&[subject], &[0], 0);
    assert_eq!(
        sparse,
        Reading {
            bucket: 0,
            visible_at_cut: 1,
            deepest_visible: 0,
        },
    );

    // The blocked world: the same visible row, named last in rank order behind three hidden rows.
    let blocked = read(
        &[
            claims_depth_one,
            shares_depth_one,
            shares_depth_two,
            subject,
        ],
        &[3],
        3,
    );
    assert_eq!(
        blocked,
        Reading {
            bucket: 3,
            visible_at_cut: 0,
            deepest_visible: 3,
        },
    );

    assert_ne!(
        sparse, blocked,
        "the hidden rows moved the published metadata"
    );
}
