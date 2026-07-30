//! The visible-view occupancy census over a real published generation.
//!
//! The aggregate a delivery-cut policy reads is a statement about the authorized view. These cases
//! prove it over the fixture's own artifacts: expectations count distinct key prefixes with a set,
//! independently of the histogram derivation the census uses.
//!
//! The fixture's 48 rows share 8 distinct keys, so which rows a mask hides decides whether the
//! aggregate can move at all - the two cases below are exactly those two regimes.

use std::collections::{HashMap, HashSet};

use super::{FULL, mask_hiding, publish};
use crate::{
    morton::{Depth, MortonKey},
    serve::{Atlas, ViewOccupancy, walk::Walk},
};

/// The keys of the rows a mask leaves visible, read straight from the code column.
fn visible_keys(atlas: &Atlas, hidden: &HashSet<u32>) -> Vec<MortonKey> {
    let rows = atlas.row_ids();
    (0..rows.len())
        .filter(|&position| !hidden.contains(&rows[position]))
        .map(|position| {
            atlas
                .morton
                .code(u64::try_from(position).expect("a fixture position fits u64"))
        })
        .collect()
}

/// Groups the generation's rows by the complete key they occupy.
fn clusters(atlas: &Atlas) -> HashMap<u64, Vec<u32>> {
    let rows = atlas.row_ids();
    let mut clusters: HashMap<u64, Vec<u32>> = HashMap::new();
    for (position, &row) in rows.iter().enumerate() {
        let key = atlas
            .morton
            .code(u64::try_from(position).expect("a fixture position fits u64"));
        clusters.entry(key.to_bits()).or_default().push(row);
    }

    clusters
}

/// Counts the distinct depth-`depth` cells of `keys` with a set, not a histogram.
fn prefix_census(keys: &[MortonKey], depth: Depth) -> u64 {
    let cells: HashSet<u64> = keys.iter().map(|key| key.prefix(depth)).collect();

    u64::try_from(cells.len()).expect("a fixture cell count fits u64")
}

/// Asserts a census matches the independent prefix count at every depth.
fn assert_census(occupancy: &ViewOccupancy, keys: &[MortonKey]) {
    let distinct: HashSet<u64> = keys.iter().map(|key| key.to_bits()).collect();
    assert_eq!(
        occupancy.distinct_keys(),
        u64::try_from(distinct.len()).expect("a fixture key count fits u64")
    );
    assert_eq!(occupancy.is_empty(), keys.is_empty());

    for depth in Depth::all() {
        assert_eq!(
            occupancy.occupied_cells(depth),
            prefix_census(keys, depth),
            "depth {}",
            depth.get()
        );
    }
}

/// Hiding a whole cluster removes its cell from every depth's count.
///
/// The bug class is the one the delivery-cut policy rests on: a census reaching past the mask would
/// let a hidden row choose how deep an authorized view is served. The mask must therefore move the
/// aggregate, and it must move it by exactly the cell the hidden cluster occupied - which is why
/// the case hides every row sharing one key rather than an arbitrary subset.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hiding_a_cluster_removes_its_cell() {
    let (_generation, atlas) = publish("cluster-occupancy").await;

    let full = Walk::of(&atlas, &FULL).visible_occupancy();
    assert_census(&full, &visible_keys(&atlas, &HashSet::new()));

    let clusters = clusters(&atlas);
    assert_eq!(
        full.distinct_keys(),
        u64::try_from(clusters.len()).expect("a fixture cluster count fits u64"),
        "one occupied cell per distinct key at the deepest depth"
    );

    // The cluster of the first position's key: hiding a whole cluster is what vacates a cell,
    // since the rows sharing a key occupy one cell between them.
    let key = atlas.morton.code(0);
    let mut hidden_rows = clusters
        .get(&key.to_bits())
        .expect("the first position's key holds its own rows")
        .clone();
    hidden_rows.sort_unstable();
    let hidden: HashSet<u32> = hidden_rows.iter().copied().collect();

    let proof = mask_hiding(&atlas, &hidden_rows);
    let masked = Walk::of(&atlas, &proof).visible_occupancy();
    assert_census(&masked, &visible_keys(&atlas, &hidden));

    // The mask moved the aggregate: exactly one cell fewer at the depths that separated the
    // vacated cell, and never one more at any depth.
    assert_eq!(masked.distinct_keys() + 1, full.distinct_keys());
    for depth in Depth::all() {
        assert!(
            masked.occupied_cells(depth) <= full.occupied_cells(depth),
            "the mask grew occupancy at depth {}",
            depth.get()
        );
    }
    assert!(masked.saturation_depth() <= full.saturation_depth());
}

/// Hiding rows that share their cells with visible rows moves no count.
///
/// Occupancy counts cells, not rows: a row-counting aggregate would resolve a coarser cut for a
/// scope than for the operator over identical geometry, and every count the policy reads would
/// drift with permissions that changed nothing about the view's shape. The fixture's clusters make
/// this observable - every third row leaves each cell still occupied.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hiding_co_located_rows_moves_no_count() {
    let (_generation, atlas) = publish("co-located-occupancy").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    let hidden_rows: Vec<u32> = (0..universe).filter(|row| row.is_multiple_of(3)).collect();
    let hidden: HashSet<u32> = hidden_rows.iter().copied().collect();
    let survivors = visible_keys(&atlas, &hidden);
    let all = visible_keys(&atlas, &HashSet::new());
    assert!(
        survivors.len() < all.len(),
        "the mask hides rows even though it vacates no cell"
    );

    let proof = mask_hiding(&atlas, &hidden_rows);
    let masked = Walk::of(&atlas, &proof).visible_occupancy();
    let full = Walk::of(&atlas, &FULL).visible_occupancy();

    assert_census(&masked, &survivors);
    assert_eq!(masked, full);
}

/// A proof admitting nothing yields an empty aggregate.
///
/// The degenerate view a scope with no permissions presents. An aggregate carrying the domain's
/// floor of one occupied cell would report geometry to a caller who may see none.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_proof_admitting_nothing_occupies_nothing() {
    let (_generation, atlas) = publish("empty-occupancy").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    let hidden: Vec<u32> = (0..universe).collect();
    let proof = mask_hiding(&atlas, &hidden);
    let occupancy = Walk::of(&atlas, &proof).visible_occupancy();

    assert!(occupancy.is_empty());
    assert_eq!(occupancy.distinct_keys(), 0);
    assert_eq!(occupancy.saturation_depth(), Depth::MIN);
}
