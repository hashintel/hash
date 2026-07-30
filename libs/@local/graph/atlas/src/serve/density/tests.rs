use core::num::NonZero;
use std::collections::HashSet;

use proptest::{prop_assert, prop_assert_eq, property_test};

use super::{CutOffset, DensityBand, DensityPolicy, DensityPolicyError, ViewOccupancy};
use crate::{
    math::Log2,
    morton::{Depth, MortonCell, MortonKey},
};

/// The fixtures' span exponent: a view's cut at offset `k` is depth `1 + k`.
const SPAN: u8 = 1;

/// The fixtures' deepest served zoom, leaving offsets `0..=27` admissible.
const MAX_TILE_DEPTH: u8 = 4;

fn band(lower: u64, upper: u64) -> DensityBand {
    DensityBand::new(
        NonZero::new(lower).expect("the fixture band's bounds are positive"),
        NonZero::new(upper).expect("the fixture band's bounds are positive"),
    )
    .expect("the fixture band is ordered")
}

fn span(value: u8) -> Log2 {
    Log2::new(value).expect("the fixture span lies below the shift width")
}

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("the fixture depth lies within the key width")
}

fn policy(band: DensityBand, offsets: impl IntoIterator<Item = u8>) -> DensityPolicy {
    DensityPolicy::admit(band, offsets, span(SPAN), MAX_TILE_DEPTH)
        .expect("the fixture policy is admissible")
}

/// The corner key of one cell of the depth's grid.
fn key(depth: u8, x: u32, y: u32) -> MortonKey {
    MortonCell::new(
        Depth::new(depth).expect("the fixture depth lies within the key width"),
        x,
        y,
    )
    .expect("the fixture cell lies on the depth's grid")
    .min_key()
}

fn occupancy(keys: &[MortonKey]) -> ViewOccupancy {
    let mut keys = keys.to_vec();
    ViewOccupancy::of(&mut keys)
}

/// A view whose occupancy plateaus once and then splits.
///
/// Four depth-3 cells in two depth-1 halves: `(0,0)` with `(1,0)`, and `(4,0)` with `(5,0)`. Each
/// pair shares one depth-2 cell and separates at depth 3, so the counts run
/// `C(1) = 2`, `C(2) = 2`, `C(3) = 4`, saturating at depth 3.
fn plateau_view() -> ViewOccupancy {
    occupancy(&[key(3, 0, 0), key(3, 1, 0), key(3, 4, 0), key(3, 5, 0)])
}

/// An inverted band refuses construction rather than admitting no count.
///
/// The band's own ordering is the invariant every distance reading rests on: an unchecked
/// `[4_000, 2_000]` would report a positive distance for every count, including counts a correct
/// configuration calls perfect.
#[test]
fn a_band_refuses_an_inverted_configuration() {
    let lower = NonZero::new(2_000).expect("2,000 is positive");
    let upper = NonZero::new(4_000).expect("4,000 is positive");

    assert!(DensityBand::new(lower, upper).is_some());
    assert_eq!(DensityBand::new(upper, lower), None);
    assert!(
        DensityBand::new(lower, lower).is_some(),
        "a single-count band is ordered"
    );
}

/// The band's bounds count as inside it.
///
/// A half-open reading of the band would make the lower bound a shortfall of zero-plus-one and put
/// the selector one subdivision deeper than the policy asks for.
#[test]
fn the_bands_bounds_are_inside_it() {
    let band = band(2_000, 4_000);

    assert_eq!(band.distance(2_000), 0);
    assert_eq!(band.distance(4_000), 0);
    assert_eq!(band.distance(1_999), 1);
    assert_eq!(band.distance(4_001), 1);
}

/// The band defaults to the ratified public bounds.
#[test]
fn the_default_band_is_two_thousand_through_four_thousand() {
    assert_eq!(DensityBand::default().lower(), 2_000);
    assert_eq!(DensityBand::default().upper(), 4_000);
}

/// Admission refuses a set without the base offset.
///
/// Every view must have some offset it can always resolve; a set of deep offsets alone would leave
/// a saturation-capped view with an empty search space.
#[test]
fn admission_refuses_a_set_without_the_base_offset() {
    assert_eq!(
        DensityPolicy::admit(band(2_000, 4_000), [1, 2], span(6), 18),
        Err(DensityPolicyError::MissingBaseOffset)
    );
    DensityPolicy::admit(band(2_000, 4_000), [0, 1, 2], span(6), 18)
        .expect("a set carrying the base offset is admissible");
}

/// Admission refuses an offset that deepens the cascade past the key width.
///
/// A span-6 schedule serving 18 zooms leaves room for 8: the deepest bucket `18 + 6 + 8` is exactly
/// the 32 subdivisions a 64-bit key resolves, and one more would wrap a cut the walk then reads.
#[test]
fn admission_refuses_an_offset_past_the_key_width() {
    DensityPolicy::admit(band(2_000, 4_000), [0, 8], span(6), 18)
        .expect("the deepest offset the schedule leaves room for is admissible");
    assert_eq!(
        DensityPolicy::admit(band(2_000, 4_000), [0, 9], span(6), 18),
        Err(DensityPolicyError::KeyWidth {
            offset: 9,
            ceiling: 8
        })
    );
}

/// Admission refuses a terminal root and a schedule already past the key width.
///
/// Both are configurations no offset repairs, so they fail where the policy is configured rather
/// than where a view resolves.
#[test]
fn admission_refuses_a_schedule_no_offset_deepens() {
    assert_eq!(
        DensityPolicy::admit(band(2_000, 4_000), [0], span(6), 0),
        Err(DensityPolicyError::TerminalRoot)
    );
    assert_eq!(
        DensityPolicy::admit(band(2_000, 4_000), [0], span(6), 30),
        Err(DensityPolicyError::Schedule {
            span: 6,
            max_tile_depth: 30
        })
    );
}

/// The admitted set is the whole search space, gaps included.
///
/// A contiguous-range reading of `K` would search offsets the owner never admitted.
#[test]
fn the_admitted_set_keeps_its_gaps() {
    let offsets: Vec<u8> = policy(band(2_000, 4_000), [5, 0, 2, 2])
        .admitted()
        .map(CutOffset::get)
        .collect();

    assert_eq!(offsets, vec![0, 2, 5], "duplicates collapse, order ascends");
}

/// Occupancy counts cells, not rows.
///
/// Co-located rows share one complete key, so a row-counting aggregate would report a view as
/// denser than its geometry and resolve a coarser cut than the band asks for.
#[test]
fn occupancy_counts_cells_not_rows() {
    let anchor = key(3, 2, 1);
    let view = occupancy(&[anchor, anchor, anchor]);

    assert!(!view.is_empty());
    assert_eq!(view.distinct_keys(), 1);
    assert_eq!(view.occupied_cells(Depth::MAX), 1);
    assert_eq!(view.saturation_depth(), Depth::MIN);
}

/// An empty view occupies no cell at any depth.
///
/// The aggregate's counts start at one for a non-empty view, so an empty view that shared that
/// floor would manufacture an occupied cell out of nothing.
#[test]
fn an_empty_view_occupies_no_cell() {
    let view = occupancy(&[]);

    assert!(view.is_empty());
    assert_eq!(view.distinct_keys(), 0);
    for depth in Depth::all() {
        assert_eq!(view.occupied_cells(depth), 0, "depth {}", depth.get());
    }
}

/// Occupancy saturates at the depth that first separates every distinct key.
///
/// The saturation depth caps the search: reading it one depth too shallow would drop an admitted
/// cut that still splits cells, and one too deep would admit cuts that buy nothing.
#[test]
fn occupancy_saturates_at_the_separating_depth() {
    let view = plateau_view();

    assert_eq!(view.occupied_cells(depth(0)), 1);
    assert_eq!(view.occupied_cells(depth(1)), 2);
    assert_eq!(view.occupied_cells(depth(2)), 2);
    assert_eq!(view.occupied_cells(depth(3)), 4);
    assert_eq!(view.occupied_cells(depth(4)), 4);
    assert_eq!(view.distinct_keys(), 4);
    assert_eq!(view.saturation_depth(), depth(3));
}

/// An empty view resolves to the base offset.
///
/// The resolution with no occupancy behind it, reached through the same argmin as every other: an
/// empty view has nothing to aim with, and the alternative - falling back on a corpus quantity - is
/// the channel this policy exists to close.
#[test]
fn an_empty_view_resolves_to_the_base_offset() {
    assert_eq!(
        policy(band(2, 4), [0, 1, 2]).resolve(&occupancy(&[])),
        CutOffset::ZERO
    );
}

/// A co-located view resolves to the base offset.
///
/// Its saturation depth is the whole domain, so every deeper admitted cut leaves the search space:
/// no cut separates keys that share one complete key.
#[test]
fn a_co_located_view_resolves_to_the_base_offset() {
    let anchor = key(3, 2, 1);

    assert_eq!(
        policy(band(2, 4), [0, 1, 2]).resolve(&occupancy(&[anchor, anchor])),
        CutOffset::ZERO
    );
}

/// The coarsest in-band offset wins when several land inside.
///
/// Under the plateau view, offset 0 counts 2 and offset 2 counts 4; a band holding both must keep
/// the coarser cut, since a deeper one costs response bytes for no policy gain.
#[test]
fn the_coarsest_in_band_offset_wins() {
    assert_eq!(
        policy(band(2, 4), [0, 1, 2]).resolve(&plateau_view()).get(),
        0
    );
}

/// A plateau does not stop the search.
///
/// The plateau view counts 2 at offsets 0 and 1 and 4 at offset 2. A search that stopped at the
/// first offset failing to improve would resolve 0 and miss the only in-band cut - the reason the
/// argmin runs over the whole admitted set rather than the least positive offset.
#[test]
fn a_plateau_does_not_stop_the_search() {
    assert_eq!(
        policy(band(3, 4), [0, 1, 2]).resolve(&plateau_view()).get(),
        2
    );
}

/// An equal distance keeps the coarser offset.
///
/// Band `[3, 3]` puts offset 0 one below and offset 2 one above. The ordered pair's second
/// component decides it, and it decides for the coarser cut.
#[test]
fn an_equal_distance_keeps_the_coarser_offset() {
    assert_eq!(policy(band(3, 3), [0, 2]).resolve(&plateau_view()).get(), 0);
}

/// A view below the band takes the closest count it can reach.
///
/// Every admitted cut of the plateau view stays under a `[10, 20]` band, so the nearest is the
/// deepest reachable - the case where the band is unreachable and the policy still resolves.
#[test]
fn a_view_below_the_band_takes_the_closest_reachable_count() {
    assert_eq!(
        policy(band(10, 20), [0, 1, 2])
            .resolve(&plateau_view())
            .get(),
        2
    );
}

/// A view already above the band keeps the base offset.
///
/// Occupancy never falls with depth, so no deeper cut can come back toward the band: the coarsest
/// cut is the closest one, and the tie-break holds it.
#[test]
fn a_view_above_the_band_keeps_the_base_offset() {
    assert_eq!(
        policy(band(1, 1), [0, 1, 2]).resolve(&plateau_view()).get(),
        0
    );
}

/// Saturation caps the admitted set.
///
/// The plateau view saturates at depth 3, so with span 1 no offset above 2 belongs to the search
/// space. Offset 4 counts exactly what offset 2 counts, and admitting it would deliver a deeper
/// cut - more buckets, more response - for identical occupancy.
#[test]
fn saturation_caps_the_admitted_set() {
    let view = plateau_view();

    assert_eq!(view.occupied_cells(depth(5)), view.occupied_cells(depth(3)));
    assert_eq!(policy(band(10, 20), [0, 4]).resolve(&view).get(), 0);
    assert_eq!(policy(band(10, 20), [0, 2, 4]).resolve(&view).get(), 2);
}

/// The aggregate's counts agree with a direct prefix census at every depth.
///
/// The histogram derivation replaces one distinct-prefix count per depth with a single pass over
/// sorted keys. The bug class is the derivation itself - an off-by-one in the separation depth
/// would shift whole columns of the count profile, and every count above feeds a cut the client
/// receives.
#[property_test]
fn occupied_cells_match_a_direct_prefix_census(
    #[strategy = proptest::collection::vec(0_u64..1_u64 << 12, 0..24_usize)] bits: Vec<u64>,
) {
    // A narrow key domain packs the sample into few high-depth cells, so separations land across
    // the whole depth range instead of only at the deepest bins.
    let keys: Vec<MortonKey> = bits
        .iter()
        .map(|&bits| MortonKey::from_bits(bits << 40))
        .collect();
    let view = occupancy(&keys);

    let distinct: HashSet<u64> = keys.iter().map(|key| key.to_bits()).collect();
    prop_assert_eq!(view.distinct_keys(), distinct.len() as u64);
    prop_assert_eq!(view.is_empty(), keys.is_empty());

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

/// A resolution reads the band and the admitted set, and nothing else about the view.
///
/// Two views with identical count profiles resolve identically however their keys are arranged,
/// which is the property a hidden row must not be able to break: it can only reach the resolution
/// through the aggregate the policy reads.
#[property_test]
fn resolution_is_a_function_of_the_count_profile(
    #[strategy = proptest::collection::vec(0_u64..1_u64 << 8, 1..16_usize)] bits: Vec<u64>,
) {
    let policy = policy(band(3, 5), [0, 1, 2, 3]);

    let keys: Vec<MortonKey> = bits
        .iter()
        .map(|&bits| MortonKey::from_bits(bits << 48))
        .collect();
    let mut reversed: Vec<MortonKey> = keys.iter().rev().copied().collect();

    let resolved = policy.resolve(&occupancy(&keys));
    prop_assert_eq!(resolved, policy.resolve(&ViewOccupancy::of(&mut reversed)));

    // The resolved offset is admitted, and it is the argmin the law states.
    let cut = depth(SPAN + resolved.get());
    let view = occupancy(&keys);
    let distance = policy.band().distance(view.occupied_cells(cut));
    for offset in policy.admitted() {
        if offset.get() > view.saturation_depth().get().saturating_sub(SPAN) {
            continue;
        }

        let candidate = policy
            .band()
            .distance(view.occupied_cells(depth(SPAN + offset.get())));
        prop_assert!(
            distance < candidate || (distance == candidate && resolved <= offset),
            "offset {} beats the resolved {}",
            offset.get(),
            resolved.get()
        );
    }
}
