use core::num::NonZero;
use std::collections::HashSet;

use proptest::{prop_assert, prop_assert_eq, property_test};

use super::{CutOffset, DensityBand, DensityPolicy, DensityPolicyError, ViewOccupancy};
use crate::{
    math::Log2,
    morton::{Depth, MortonCell, MortonKey},
};

/// The fixtures' span exponent.
///
/// A view's cut at offset `k` is depth `1 + k`.
const SPAN: u8 = 1;

/// The fixtures' deepest served zoom.
const MAX_TILE_DEPTH: u8 = 4;

/// The offset ceiling the fixtures' schedule leaves: `32 - (4 + 1)`, hand-derived.
const CEILING: u8 = 27;

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

fn policy(band: DensityBand) -> DensityPolicy {
    DensityPolicy::new(band, span(SPAN), MAX_TILE_DEPTH).expect("the fixture policy is admissible")
}

/// A view whose occupancy keeps climbing to depth 24.
///
/// Key `i` carries a single set bit at position `64 - 2i`, so it separates from every coarser key
/// at depth `i` exactly: sorted, the adjacent separations land one per depth over `1..=24`, giving
/// `C(d, V) = 1 + d` up to `d = 24` and `Q(V) = 25`. It is the shape the ceiling exists for - a
/// view that keeps paying for depth long past the room a deep schedule leaves.
fn deep_view() -> ViewOccupancy {
    let mut keys = vec![MortonKey::from_bits(0)];
    keys.extend((1..=24_u32).map(|index| MortonKey::from_bits(1_u64 << (64 - 2 * index))));

    occupancy(&keys)
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
/// The view occupies the depth-3 cells `(0,0)`, `(1,0)`, `(4,0)`, and `(5,0)`. The first two share
/// one depth-1 half and the last two share the other. Each pair shares one depth-2 cell and
/// separates at depth 3, so the counts run `C(1) = 2`, `C(2) = 2`, `C(3) = 4`, saturating at depth
/// 3.
fn plateau_view() -> ViewOccupancy {
    occupancy(&[key(3, 0, 0), key(3, 1, 0), key(3, 4, 0), key(3, 5, 0)])
}

/// An inverted band refuses construction rather than admitting no count.
///
/// The band's own ordering is the invariant every distance reading rests on: an unchecked `[4_000,
/// 2_000]` would report a positive distance for every count, including counts a correct
/// configuration calls perfect.
#[test]
fn inverted_band_refuses_construction() {
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
fn band_includes_its_bounds() {
    let band = band(2_000, 4_000);

    assert_eq!(band.distance(2_000), 0);
    assert_eq!(band.distance(4_000), 0);
    assert_eq!(band.distance(1_999), 1);
    assert_eq!(band.distance(4_001), 1);
}

/// Distance measures the shortfall below the band and the excess above it.
#[test]
fn band_distance_grows_with_the_gap_to_its_bounds() {
    let band = band(2_000, 4_000);

    assert_eq!(band.distance(3_000), 0);
    assert_eq!(band.distance(1_500), 500);
    assert_eq!(band.distance(4_500), 500);
}

/// The key width caps a resolution that would otherwise keep going deeper.
///
/// A span-6 schedule serving 18 zooms leaves room for 8. The deepest bucket `18 + 6 + 8` is exactly
/// the 32 subdivisions a 64-bit key resolves. One more would wrap a cut the walk then reads. The
/// deep view saturates at depth 24, so `k_sat = 18` and an unreachable band pulls the argmin toward
/// every deeper cut the search offers it. The ceiling alone stops it at 8.
#[test]
fn key_width_caps_a_resolution_that_would_otherwise_deepen() {
    let policy = DensityPolicy::new(band(100, 200), span(6), 18)
        .expect("a span-6 schedule serving 18 zooms is admissible");
    let view = deep_view();

    assert_eq!(view.saturation_depth(), depth(24), "k_sat is 24 - 6 = 18");
    assert_eq!(
        view.occupied_cells(depth(14)),
        15,
        "the cut the ceiling gives"
    );
    assert_eq!(
        view.occupied_cells(depth(24)),
        25,
        "the cut k_sat would give"
    );

    assert_eq!(
        policy.resolve(&view).get(),
        8,
        "the count climbs the whole way, so only the key width stops the search"
    );
}

/// Configuration refuses a terminal root and a schedule already past the key width.
///
/// Both are schedules no offset repairs, so they fail when a caller configures the policy rather
/// than when a view resolves.
#[test]
fn configuration_refuses_a_schedule_no_offset_deepens() {
    assert_eq!(
        DensityPolicy::new(band(2_000, 4_000), span(6), 0),
        Err(DensityPolicyError::TerminalRoot)
    );
    assert_eq!(
        DensityPolicy::new(band(2_000, 4_000), span(6), 30),
        Err(DensityPolicyError::Schedule {
            span: 6,
            max_tile_depth: 30
        })
    );
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
fn empty_view_occupies_no_cell() {
    let view = occupancy(&[]);

    assert!(view.is_empty());
    assert_eq!(view.distinct_keys(), 0);
    for depth in Depth::all() {
        assert_eq!(view.occupied_cells(depth), 0, "depth {}", depth.get());
    }
}

/// Occupancy saturates at the depth that first separates every distinct key.
///
/// The saturation depth caps the search: reading it one depth too shallow would drop a candidate
/// cut that still splits cells, and one too deep would keep cuts that buy nothing.
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
/// The same argmin produces this resolution as every other one. An empty view has nothing to aim
/// with, and falling back on a corpus quantity is the channel this policy exists to close.
#[test]
fn empty_view_resolves_to_the_base_offset() {
    assert_eq!(policy(band(2, 4)).resolve(&occupancy(&[])), CutOffset::ZERO);
}

/// A co-located view resolves to the base offset.
///
/// Its saturation depth is the whole domain, so every deeper cut leaves the search space: no cut
/// separates keys that share one complete key.
#[test]
fn co_located_view_resolves_to_the_base_offset() {
    let anchor = key(3, 2, 1);

    assert_eq!(
        policy(band(2, 4)).resolve(&occupancy(&[anchor, anchor])),
        CutOffset::ZERO
    );
}

/// The coarsest in-band offset wins when the band admits more than one.
///
/// Under the plateau view, offset 0 counts 2 and offset 2 counts 4; a band holding both must keep
/// the coarser cut, since a deeper one costs response bytes for no policy gain.
#[test]
fn coarsest_in_band_offset_wins() {
    assert_eq!(policy(band(2, 4)).resolve(&plateau_view()).get(), 0);
}

/// A plateau does not stop the search.
///
/// The plateau view counts 2 at offsets 0 and 1 and 4 at offset 2. A search that stopped at the
/// first offset failing to improve would resolve 0 and miss the only in-band cut - the reason the
/// argmin runs over the whole candidate range rather than the least positive offset.
#[test]
fn plateau_does_not_stop_the_search() {
    assert_eq!(policy(band(3, 4)).resolve(&plateau_view()).get(), 2);
}

/// An equal distance keeps the coarser offset.
///
/// Band `[3, 3]` puts offset 0 one below and offset 2 one above. The ordered pair's second
/// component decides it, and it decides for the coarser cut.
#[test]
fn equal_distance_keeps_the_coarser_offset() {
    assert_eq!(policy(band(3, 3)).resolve(&plateau_view()).get(), 0);
}

/// A view below the band takes the closest count it can reach.
///
/// Every reachable cut of the plateau view stays under a `[10, 20]` band, so the nearest is the
/// deepest reachable - the case where the band is unreachable and the policy still resolves.
#[test]
fn view_below_the_band_takes_the_closest_reachable_count() {
    assert_eq!(policy(band(10, 20)).resolve(&plateau_view()).get(), 2);
}

/// A view already above the band keeps the base offset.
///
/// Occupancy never falls with depth, so no deeper cut can come back toward the band: the coarsest
/// cut is the closest one, and the tie-break holds it.
#[test]
fn view_already_above_the_band_keeps_the_base_offset() {
    assert_eq!(policy(band(1, 1)).resolve(&plateau_view()).get(), 0);
}

/// No resolution cuts deeper than the view's saturation depth.
///
/// The plateau view saturates at depth 3, so with span 1 offset 2 is the deepest cut that separates
/// anything: a deeper one would deliver more buckets and more response for identical occupancy. The
/// band `[10, 20]` is unreachable from above, so nothing but this property stops the argmin at 2
/// rather than at [`CEILING`], which is 27 and therefore not what caps this resolution.
///
/// What the test pins is the property rather than one mechanism, and the deletion controls say so.
/// Over a contiguous candidate range two guards cover the resolution, `resolve`'s saturation cap
/// and the tie-break, and removing either one alone leaves this green. Both together resolve 27
/// here. Counts are constant past saturation, so no view and no band can separate the two guards -
/// the cap is unwitnessable through the output by construction, and it stays for the stated law
/// rather than for a behaviour a test could lose. The single-fault witness for the other cap is
/// [`the_ceiling_caps_a_resolution_at_the_key_width`].
#[test]
fn resolution_never_runs_deeper_than_saturation() {
    let view = plateau_view();

    assert_eq!(view.saturation_depth(), depth(3));
    assert_eq!(view.occupied_cells(depth(5)), view.occupied_cells(depth(3)));
    assert_eq!(policy(band(10, 20)).resolve(&view).get(), 2);
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

/// A resolution reads the band and the schedule, and nothing else about the view.
///
/// Views with identical count profiles resolve identically whatever key layout produced them, which
/// is the property a hidden row must not be able to break: it can only reach the resolution through
/// the aggregate the policy reads.
#[property_test]
fn resolution_is_a_function_of_the_count_profile(
    #[strategy = proptest::collection::vec(0_u64..1_u64 << 8, 1..16_usize)] bits: Vec<u64>,
) {
    let policy = policy(band(3, 5));

    let keys: Vec<MortonKey> = bits
        .iter()
        .map(|&bits| MortonKey::from_bits(bits << 48))
        .collect();
    let mut reversed: Vec<MortonKey> = keys.iter().rev().copied().collect();

    let resolved = policy.resolve(&occupancy(&keys));
    prop_assert_eq!(resolved, policy.resolve(&ViewOccupancy::of(&mut reversed)));

    // The resolved offset lies in the candidate range, and it is the argmin the law states.
    let cut = depth(SPAN + resolved.get());
    let view = occupancy(&keys);
    let distance = policy.band().distance(view.occupied_cells(cut));
    prop_assert!(resolved.get() <= CEILING);
    for offset in 0..=CEILING {
        if offset > view.saturation_depth().get().saturating_sub(SPAN) {
            continue;
        }

        let candidate = policy
            .band()
            .distance(view.occupied_cells(depth(SPAN + offset)));
        prop_assert!(
            distance < candidate || (distance == candidate && resolved.get() <= offset),
            "offset {} beats the resolved {}",
            offset,
            resolved.get()
        );
    }
}

/// A re-bind keeps the session's coarser cut when the new view resolves deeper.
///
/// The band is unreachable for the plateau view, whose deepest cut holds 4 cells, so its bootstrap
/// resolves the deepest offset it has: 2. The deep view reaches the band exactly at offset 18
/// (`C(19, V) = 20`), so re-optimizing would deepen the session by sixteen subdivisions and change
/// the detail every tile carries at a fixed zoom. The re-bind keeps 2.
#[test]
fn rebind_keeps_the_carried_cut_when_the_new_view_resolves_deeper() {
    let policy = policy(band(20, 20));
    let carried = policy.resolve(&plateau_view());
    assert_eq!(
        carried,
        CutOffset::new(2),
        "the plateau view's own resolution"
    );
    assert_eq!(
        policy.resolve(&deep_view()),
        CutOffset::new(18),
        "the deep view's own resolution, which the re-bind must not adopt"
    );

    assert_eq!(policy.rebind(carried, &deep_view()), carried);
}

/// A re-bind clamps the session down when the new view resolves coarser.
///
/// In the reverse pairing, a session bootstrapped on the deep view holds offset 18, and re-binding
/// to the plateau view would carry that cut into a view whose band asks for 2. Carrying it would
/// deliver a depth-19 cut over four cells, so the coarser resolution wins.
#[test]
fn rebind_clamps_down_when_the_new_view_resolves_coarser() {
    let policy = policy(band(20, 20));
    let carried = policy.resolve(&deep_view());

    assert_eq!(
        policy.rebind(carried, &plateau_view()),
        CutOffset::new(2),
        "the deep session kept its cut over a view the band serves shallower"
    );
}

/// A re-bind to an empty view clamps to the base offset.
///
/// An empty view resolves [`CutOffset::ZERO`], so the clamp takes it whatever the session held: a
/// view with no occupancy is never served at a depth an earlier view paid for.
#[test]
fn rebind_to_an_empty_view_clamps_to_the_base_offset() {
    let policy = policy(band(20, 20));

    assert_eq!(
        policy.rebind(policy.resolve(&deep_view()), &occupancy(&[])),
        CutOffset::ZERO
    );
}
