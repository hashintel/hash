use core::num::NonZero;
use std::collections::HashSet;

use hashql_core::id::Id as _;
use proptest::{prop_assert, prop_assert_eq, property_test};

use super::{DensityBand, DensityPolicy, DensityPolicyError, ViewOccupancy};
use crate::{
    math::{Log2, nz},
    morton::{Depth, MortonCell, MortonKey, Zoom},
};

/// The fixtures' span exponent.
///
/// A view's cut at offset `k` is depth `1 + k`.
const SPAN: Log2 = Log2::new(1).unwrap();

/// The fixtures' deepest served zoom.
const MAX_TILE_DEPTH: Zoom = Zoom::new(4).unwrap();

/// The fixture schedule's offset ceiling: 32 − (4 + 1) = 27.
const CEILING: Zoom = Zoom::new(27).unwrap();

fn policy(lower: NonZero<u64>, upper: NonZero<u64>) -> DensityPolicy {
    let band = DensityBand::new(lower, upper).expect("the fixture band is ordered");

    DensityPolicy::new(band, SPAN, MAX_TILE_DEPTH).expect("the fixture policy is admissible")
}

/// A view with one additional occupied cell per depth through depth 24.
///
/// Key i has one set bit at position 64 − 2i for 1 ≤ i ≤ 24. Together with the zero key, these give
/// exactly one adjacent separation at every depth from 1 through 24: C(d, V) = 1 + d for 0 ≤ d ≤ 24
/// and Q(V) = 25.
fn deep_view() -> ViewOccupancy {
    let mut keys = vec![MortonKey::from_bits(0)];
    keys.extend((1..=24_u32).map(|index| MortonKey::from_bits(1_u64 << (64 - 2 * index))));

    ViewOccupancy::of(&mut keys)
}

/// The corner key of one cell of the depth's grid.
fn key(depth: u8, x: u32, y: u32) -> MortonKey {
    MortonCell::new(
        Depth::try_new(depth).expect("the fixture depth lies within the key width"),
        x,
        y,
    )
    .expect("the fixture cell lies on the depth's grid")
    .min_key()
}

/// A view whose occupancy plateaus once and then splits.
///
/// The depth-3 cells `(0,0)` and `(1,0)` share one depth-1 quadrant, while `(4,0)` and `(5,0)`
/// share another. Each pair shares a depth-2 cell and separates at depth 3. The counts are C(1, V)
/// = 2, C(2, V) = 2 and C(3, V) = Q(V) = 4, with saturation at depth 3.
fn plateau_view() -> ViewOccupancy {
    ViewOccupancy::of(&mut [key(3, 0, 0), key(3, 1, 0), key(3, 4, 0), key(3, 5, 0)])
}

#[test]
fn band_inverted_bounds() {
    let lower = nz!(2_000);
    let upper = nz!(4_000);

    assert!(DensityBand::new(lower, upper).is_some());
    assert_eq!(DensityBand::new(upper, lower), None);
    assert!(
        DensityBand::new(lower, lower).is_some(),
        "a single-count band is ordered"
    );
}

#[test]
fn band_endpoints() {
    let band = DensityBand::new(nz!(2_000), nz!(4_000)).expect("the fixture band is ordered");

    assert_eq!(band.distance(2_000), 0);
    assert_eq!(band.distance(4_000), 0);
    assert_eq!(band.distance(1_999), 1);
    assert_eq!(band.distance(4_001), 1);
}

#[test]
fn band_distance_gaps() {
    let band = DensityBand::new(nz!(2_000), nz!(4_000)).expect("the fixture band is ordered");

    assert_eq!(band.distance(3_000), 0);
    assert_eq!(band.distance(1_500), 500);
    assert_eq!(band.distance(4_500), 500);
}

/// The schedule ceiling limits resolution before the view saturates.
///
/// Span 6 and deepest zoom 18 leave ceiling 32 − (18 + 6) = 8. The deepest bucket is 18 + 6 + 8 =
/// 32, while the view cut is 6 + 8 = 14. The deep view saturates at depth 24, giving saturation
/// offset 24 − 6 = 18. Every candidate count is below the band and increases with depth, making
/// offset 8 the unique minimum within the ceiling.
#[test]
fn resolve_key_width_ceiling() {
    let policy = DensityPolicy::new(
        DensityBand::new(nz!(100), nz!(200)).expect("the fixture band is ordered"),
        Log2::new(6).expect("the fixture span lies below the shift width"),
        Zoom::new(18).expect("the fixture zoom lies within the key width"),
    )
    .expect("a span-6 schedule serving 18 zooms is admissible");
    let view = deep_view();

    assert_eq!(
        view.saturation_depth(),
        Depth::new(24),
        "k_sat is 24 - 6 = 18"
    );
    assert_eq!(
        view.occupied_cells(Depth::new(14)),
        15,
        "the cut the ceiling gives"
    );
    assert_eq!(
        view.occupied_cells(Depth::new(24)),
        25,
        "the cut k_sat would give"
    );

    assert_eq!(
        policy.resolve(&view).get(),
        8,
        "the key-width ceiling limits the offset before saturation"
    );
}

#[test]
fn policy_inadmissible_schedules() {
    let band = DensityBand::new(nz!(2_000), nz!(4_000)).expect("the fixture band is ordered");
    let span = Log2::new(6).expect("the fixture span lies below the shift width");
    let max_tile_depth = Zoom::new(30).expect("the fixture zoom lies within the key width");

    assert_eq!(
        DensityPolicy::new(band, span, Zoom::MIN),
        Err(DensityPolicyError::TerminalRoot)
    );
    assert_eq!(
        DensityPolicy::new(band, span, max_tile_depth),
        Err(DensityPolicyError::Schedule {
            span,
            max_tile_depth
        })
    );
}

#[test]
fn occupancy_duplicate_keys() {
    let anchor = key(3, 2, 1);
    let view = ViewOccupancy::of(&mut [anchor, anchor, anchor]);

    assert_ne!(view.occupied_cells(Depth::MIN), 0);
    assert_eq!(view.distinct_keys(), 1);
    assert_eq!(view.occupied_cells(Depth::MAX), 1);
    assert_eq!(view.saturation_depth(), Depth::MIN);
}

#[test]
fn occupancy_empty_view() {
    let view = ViewOccupancy::of(&mut []);

    assert_eq!(view.occupied_cells(Depth::MIN), 0);
    assert_eq!(view.distinct_keys(), 0);
    for depth in Depth::all() {
        assert_eq!(view.occupied_cells(depth), 0, "depth {}", depth.get());
    }
}

#[test]
fn occupancy_plateau_saturation() {
    let view = plateau_view();

    assert_eq!(view.occupied_cells(Depth::new(0)), 1);
    assert_eq!(view.occupied_cells(Depth::new(1)), 2);
    assert_eq!(view.occupied_cells(Depth::new(2)), 2);
    assert_eq!(view.occupied_cells(Depth::new(3)), 4);
    assert_eq!(view.occupied_cells(Depth::new(4)), 4);
    assert_eq!(view.distinct_keys(), 4);
    assert_eq!(view.saturation_depth(), Depth::new(3));
}

#[test]
fn resolve_empty_view() {
    assert_eq!(
        policy(nz!(2), nz!(4)).resolve(&ViewOccupancy::of(&mut [])),
        Zoom::MIN
    );
}

/// Saturation at depth 0 admits only offset 0, whose cut has depth 1 under this span.
#[test]
fn resolve_duplicate_keys() {
    let anchor = key(3, 2, 1);

    assert_eq!(
        policy(nz!(2), nz!(4)).resolve(&ViewOccupancy::of(&mut [anchor, anchor])),
        Zoom::MIN
    );
}

/// Offsets 0 and 1 count 2 cells, and offset 2 counts 4. All are in band.
#[test]
fn resolve_in_band_tie() {
    assert_eq!(policy(nz!(2), nz!(4)).resolve(&plateau_view()).get(), 0);
}

/// Offsets 0 and 1 count 2 cells, while offset 2 counts 4 and is the only in-band cut.
#[test]
fn resolve_plateau() {
    assert_eq!(policy(nz!(3), nz!(4)).resolve(&plateau_view()).get(), 2);
}

/// Band `[3, 3]` puts offsets 0 and 1 one cell below and offset 2 one cell above.
#[test]
fn resolve_equal_distance() {
    assert_eq!(policy(nz!(3), nz!(3)).resolve(&plateau_view()).get(), 0);
}

/// Every candidate count is below `[10, 20]`, with the closest count at offset 2.
#[test]
fn resolve_below_band() {
    assert_eq!(policy(nz!(10), nz!(20)).resolve(&plateau_view()).get(), 2);
}

/// Counts never decrease with depth. Offsets 0 and 1 tie for the smallest excess over `[1, 1]`.
#[test]
fn resolve_above_band() {
    assert_eq!(policy(nz!(1), nz!(1)).resolve(&plateau_view()).get(), 0);
}

/// The plateau view's saturation offset is below the schedule ceiling.
///
/// Saturation at depth 3 with span 1 limits the offset to 3 − 1 = 2, below [`CEILING`] = 27. The
/// band `[10, 20]` exceeds every count in this view.
#[test]
fn resolve_saturation_above_span() {
    let view = plateau_view();

    assert_eq!(view.saturation_depth(), Depth::new(3));
    assert_eq!(
        view.occupied_cells(Depth::new(5)),
        view.occupied_cells(Depth::new(3))
    );
    assert_eq!(policy(nz!(10), nz!(20)).resolve(&view).get(), 2);
}

#[property_test]
fn occupied_cells_prefix_census(
    #[strategy = proptest::collection::vec(0_u64..1_u64 << 12, 0..24_usize)] bits: Vec<u64>,
) {
    // Shifting 12 bits left by 40 confines varying bits to positions 40 through 51. Distinct keys
    // can separate only at depths 7 through 12.
    let keys: Vec<MortonKey> = bits
        .iter()
        .map(|&bits| MortonKey::from_bits(bits << 40))
        .collect();
    let view = ViewOccupancy::of(&mut keys.clone());

    let distinct: HashSet<u64> = keys.iter().map(|key| key.to_bits()).collect();
    prop_assert_eq!(view.distinct_keys(), distinct.len() as u64);
    prop_assert_eq!(view.occupied_cells(Depth::MIN) == 0, keys.is_empty());

    let mut previous = 0;
    for depth in Depth::all() {
        let census: HashSet<u64> = keys.iter().map(|key| key.prefix(depth)).collect();
        let expected = if keys.is_empty() {
            0
        } else {
            census.len() as u64
        };

        prop_assert_eq!(
            view.occupied_cells(depth),
            expected,
            "depth {}",
            depth.get()
        );
        prop_assert!(
            view.occupied_cells(depth) >= previous,
            "occupancy fell at depth {}",
            depth.get()
        );
        previous = view.occupied_cells(depth);

        // The saturation depth is the coarsest depth reaching the distinct-key count.
        prop_assert_eq!(
            depth >= view.saturation_depth(),
            view.occupied_cells(depth) == view.distinct_keys(),
            "depth {} against saturation {}",
            depth.get(),
            view.saturation_depth().get()
        );
    }
}

#[property_test]
fn resolve_order_invariance_argmin(
    #[strategy = proptest::collection::vec(0_u64..1_u64 << 8, 1..16_usize)] bits: Vec<u64>,
) {
    let policy = policy(nz!(3), nz!(5));

    let mut keys: Vec<MortonKey> = bits
        .iter()
        .map(|&bits| MortonKey::from_bits(bits << 48))
        .collect();
    let mut reversed: Vec<MortonKey> = keys.iter().rev().copied().collect();

    let view = ViewOccupancy::of(&mut keys);
    let resolved = policy.resolve(&view);
    prop_assert_eq!(resolved, policy.resolve(&ViewOccupancy::of(&mut reversed)));

    let cut = resolved.saturating_depth(SPAN);
    let distance = policy.band.distance(view.occupied_cells(cut));
    prop_assert!(resolved <= CEILING);
    for offset in Zoom::MIN..=CEILING {
        if offset > view.saturation_depth().zoom(SPAN) {
            continue;
        }

        let candidate = policy
            .band
            .distance(view.occupied_cells(offset.saturating_depth(SPAN)));
        prop_assert!(
            distance < candidate || (distance == candidate && resolved <= offset),
            "offset {} beats the resolved {}",
            offset,
            resolved
        );
    }
}

/// The plateau view reaches 4 cells at offset 2, below the band `[20, 20]`.
///
/// The deep view reaches the band exactly at offset 18: C(19, V) = 20. Rebinding retains offset 2
/// instead of adding 16 subdivisions.
#[test]
fn rebind_deeper_view() {
    let policy = policy(nz!(20), nz!(20));
    let carried = policy.resolve(&plateau_view());
    assert_eq!(carried.get(), 2, "the plateau view's own resolution");
    assert_eq!(
        policy.resolve(&deep_view()).get(),
        18,
        "the deep view's own resolution, which the re-bind must not adopt"
    );

    assert_eq!(policy.rebind(carried, &deep_view()), carried);
}

/// The deep view resolves offset 18, while the plateau view resolves offset 2.
#[test]
fn rebind_coarser_view() {
    let policy = policy(nz!(20), nz!(20));
    let carried = policy.resolve(&deep_view());

    assert_eq!(
        policy.rebind(carried, &plateau_view()).get(),
        2,
        "the deep session kept its cut over a view the band serves shallower"
    );
}

#[test]
fn rebind_empty_view() {
    let policy = policy(nz!(20), nz!(20));

    assert_eq!(
        policy.rebind(policy.resolve(&deep_view()), &ViewOccupancy::of(&mut [])),
        Zoom::MIN
    );
}
