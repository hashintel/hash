//! Controlled proof that the visible set's key assignment is corpus-dependent.
//!
//! The delivery contract's fixed-view comparison keeps visible row identity, visible Morton keys,
//! and relative importance order among visible rows identical across two worlds. The scope cascade
//! closes the channel that runs through the *bucket assignment*; this module is about the channel
//! one layer further up, in the keys the cascade reads.
//!
//! Keys are not row-local. `salt/lod/stage.rs` fits the world frame from every corpus coordinate
//! (`Bounds2::from_slice_par`), maps that frame onto the fixed `[-1, 1]` wire frame
//! (`Bounds2::normalize_into`), and quantizes the mapped column (`key::keys`). Each step is a
//! function of the frame, so a corpus row *outside* the visible rows' bounding box widens the frame
//! and rescales the visible rows' wire coordinates. An unchanged frame is sufficient for unchanged
//! keys; a widened frame is a demonstrated cause of movement rather than a guarantee of it - the
//! rescaling fixes whichever row sits at the frame's own lower corner, and finite quantization can
//! absorb a small widening for the rest. Morton cell membership reads absolute bit prefixes rather
//! than order, so where coordinates move, cells the visible rows occupy merge and split: the
//! occupied-cell curve `C(d, V)` moves with them.
//!
//! That curve is the delivery policy's own input. A view-wide cut chosen from `C(m + k, V)` is
//! therefore a function of the corpus bounding box, not of the visible set alone.
//!
//! These witnesses need two corpora, for the same reason the metadata channel does. One corpus
//! under two proofs shares one frame, so no comparison that varies the mask alone can observe this.
//!
//! Scope of these witnesses: they establish what the *key assignment* does. They assert nothing
//! about bucket assignment, which is [`super::metadata_channel`]'s subject and which an interior
//! hidden row also moves when it outranks a visible row for a contested cell.

use hashql_core::id::IdSlice;

use crate::{
    identity::NodeRowId,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonKey},
    salt::lod::{
        cascade, key,
        rank::{RankInputs, Ranking},
    },
};

/// The deepest cascade grid of these fixtures.
const DEEPEST: u8 = 6;

/// The fixed wire frame every generation normalizes onto, mirroring `stage::WIRE_FRAME`.
fn wire_frame() -> Bounds2 {
    Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0)).expect("the wire frame is ordered")
}

/// One world's reading of the first `visible` rows.
#[derive(Debug, PartialEq, Eq)]
struct Reading {
    /// The visible rows' quantized keys, in row order.
    keys: Vec<[u32; 2]>,
    /// Occupied cells of the visible set at depths `0..=4`: `C(d, V)`.
    occupied: Vec<usize>,
}

/// Reproduces the production key assignment over `points`, then reads the first `visible` rows.
///
/// The staged steps are `stage.rs`'s own: fit the frame over every coordinate, normalize onto the
/// wire frame, quantize. The ranking ranks row `r` at position `r`, and the cascade runs only to
/// confirm the columns agree - no expectation here reads a bucket.
fn read(points: &[Vec2], visible: usize) -> (Bounds2, Reading) {
    let world = Bounds2::from_slice_par(points).expect("the fixtures are finite and non-empty");
    let wire = world.normalize_into(wire_frame(), points);
    let keys = key::keys(&wire, wire_frame());

    let importance: Vec<f32> = (0..points.len())
        .map(|row| -f32::from(u16::try_from(row).expect("fixture rows fit u16")))
        .collect();
    let priority = vec![0.0_f32; points.len()];
    let identities: Vec<u64> =
        (0..u64::try_from(points.len()).expect("fixture rows fit u64")).collect();
    let inputs = RankInputs::new(
        IdSlice::from_raw(&importance),
        IdSlice::from_raw(&priority),
        IdSlice::from_raw(&identities),
    )
    .expect("the columns agree in length");
    let ranking = Ranking::new(inputs, 0);
    let _buckets = cascade::buckets(
        IdSlice::<NodeRowId, _>::from_raw(&keys),
        &ranking,
        depth(DEEPEST),
    );

    let occupied = (0..=4)
        .map(|level| {
            let mut cells: Vec<u64> = keys[..visible]
                .iter()
                .map(|key: &MortonKey| key.prefix(depth(level)))
                .collect();
            cells.sort_unstable();
            cells.dedup();
            cells.len()
        })
        .collect();

    (
        world,
        Reading {
            keys: keys[..visible]
                .iter()
                .map(|key| key.coordinates())
                .collect(),
            occupied,
        },
    )
}

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("fixture depths lie within the key width")
}

/// The visible rows every world here shares, in world coordinates.
///
/// Their bounding box is `[0, 3]^2`, and the array lists them in rank order.
const VISIBLE: [Vec2; 3] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(1.0, 1.0),
    Vec2::new(3.0, 3.0),
];

/// A hidden row outside the visible bounding box can move the visible rows' keys and `C(d, V)`.
///
/// One witness of the channel, exact in its own numbers rather than a law over every outside row.
/// `V0` is the counterexample to the stronger reading: it sits at the fitted frame's lower corner,
/// so it keys to zero in both worlds while its neighbours move.
///
/// Both worlds contain the same three visible rows with the same identities and the same relative
/// importance order. `read` ranks row `r` at position `r` in either world, so the comparison fixes
/// the rank inputs alongside the identities. The blocked world adds one hidden row at `(7, 7)`,
/// widening the fitted frame from `[0, 3]^2` to `[0, 7]^2`. Each axis then maps `world -> [-1, 1]`
/// with a different scale, so the visible unit coordinates change from `{0, 1/3, 1}` to `{0, 1/7,
/// 3/7}`:
///
/// | Row  | World  | Unit, sparse | Key `x`, sparse | Unit, blocked | Key `x`, blocked |
/// | ---- | ------ | ------------ | --------------- | ------------- | ---------------- |
/// | `V0` | `0, 0` | `0`          | `0x0000_0000`   | `0`           | `0x0000_0000`    |
/// | `V1` | `1, 1` | `1/3`        | `0x5555_5540`   | `1/7`         | `0x2492_4900`    |
/// | `V2` | `3, 3` | `1`          | `0xffff_ffff`   | `3/7`         | `0x6db6_db60`    |
///
/// The low bits carry the one f32 rounding the normalization admits. The cell prefixes are exact.
/// Because prefixes move, occupancy moves with them: at depth 1 the sparse world holds `V0`, `V1`
/// in one cell and `V2` in another, while the blocked world holds all three in one, so `C(1, V)`
/// reads 2 and then 1. `C(d, V)` is the cut policy's input, so the corpus bounding box is an input
/// to a scope-local delivery decision.
#[test]
fn a_hidden_row_outside_the_visible_frame_changes_the_visible_key_assignment() {
    let (sparse_frame, sparse) = read(&VISIBLE, VISIBLE.len());
    assert_eq!(
        sparse_frame,
        Bounds2::new(Vec2::new(0.0, 0.0), Vec2::new(3.0, 3.0)).expect("ordered"),
        "the sparse world's frame is the visible rows' own bounding box",
    );
    assert_eq!(
        sparse,
        Reading {
            keys: vec![
                [0, 0],
                [0x5555_5540, 0x5555_5540],
                [0xFFFF_FFFF, 0xFFFF_FFFF]
            ],
            occupied: vec![1, 2, 3, 3, 3],
        },
    );

    let mut blocked_points = VISIBLE.to_vec();
    blocked_points.push(Vec2::new(7.0, 7.0));
    let (blocked_frame, blocked) = read(&blocked_points, VISIBLE.len());
    assert_eq!(
        blocked_frame,
        Bounds2::new(Vec2::new(0.0, 0.0), Vec2::new(7.0, 7.0)).expect("ordered"),
        "the hidden row widened the fitted frame",
    );
    assert_eq!(
        blocked,
        Reading {
            keys: vec![
                [0, 0],
                [0x2492_4900, 0x2492_4900],
                [0x6DB6_DB60, 0x6DB6_DB60]
            ],
            occupied: vec![1, 1, 2, 3, 3],
        },
    );

    assert_ne!(
        sparse, blocked,
        "the hidden row moved the visible key assignment"
    );
}

/// A hidden row inside the visible bounding box leaves the visible key assignment fixed.
///
/// This is the other half of the condition, and it is what makes the fixed-view premise
/// constructible: the frame is the tight box over every corpus coordinate, so a hidden row at
/// `(1.5, 1.5)` - interior to `[0, 3]^2` - leaves the frame, the visible keys, and `C(d, V)`
/// exactly as the sparse world reads them.
///
/// It asserts nothing about buckets. An interior hidden row still moves the bucket assignment when
/// it outranks a visible row for a contested cell, which is [`super::metadata_channel`]'s witness;
/// asserting bucket equality here would generalize one lucky instance into a false rule.
#[test]
fn an_interior_hidden_row_leaves_the_visible_key_assignment_fixed() {
    let (sparse_frame, sparse) = read(&VISIBLE, VISIBLE.len());

    let mut interior_points = VISIBLE.to_vec();
    interior_points.push(Vec2::new(1.5, 1.5));
    let (interior_frame, interior) = read(&interior_points, VISIBLE.len());

    assert_eq!(
        interior_frame, sparse_frame,
        "an interior row cannot widen the tight bounding box",
    );
    assert_eq!(
        interior, sparse,
        "the visible keys and C(d, V) are invariant to interior hidden rows",
    );
}
