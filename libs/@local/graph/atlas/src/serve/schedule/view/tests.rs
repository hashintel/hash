//! Cases covering the three view schedules: corpus, saturated scope and narrow scope.

use alloc::sync::Arc;
use core::assert_matches;

use arc_swap::Guard;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{ScheduleData, ViewSchedule};
use crate::{
    bitset::CompressedBitSet,
    identity::NodeRowId,
    math::Bounds2,
    morton::{Depth, MortonCell, MortonKey, Zoom},
    salt::lod::stage::WIRE_FRAME,
    serve::{
        delta::{Delta, epoch::Epoch},
        density::ViewOccupancy,
        tests::fixture::{NODES, TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityKind, VisibilityMask},
        world::World,
    },
};

/// Returns a non-administrator principal, the standing every case here resolves under.
fn actor() -> VisibilityActor {
    VisibilityActor {
        id: ActorId::new(Uuid::nil(), ActorType::Machine),
        instance_admin: false,
    }
}

/// Builds a scoped mask admitting rows `first..NODES`.
///
/// `first` of zero admits every row and reaches the saturated schedule, and `NODES` admits none.
fn mask(first: u64) -> VisibilityMask {
    let mut nodes = CompressedBitSet::default();
    for index in first..NODES {
        nodes.insert(NodeRowId::new(index));
    }
    VisibilityMask::partial(actor(), nodes, CompressedBitSet::default())
}

/// Publishes a fixture generation and opens its world with one captured publication.
///
/// # Panics
///
/// Panics if publishing or opening the generation fails, or constructing the delta does.
fn world(name: &str) -> (TamperFixture, Arc<World>, Epoch) {
    let fixture = TamperFixture::publish(name);
    let world = Arc::new(
        World::open(fixture.generation().clone(), &secret()).expect("should open the world"),
    );
    let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(17))
        .expect("should construct the delta");
    let epoch = Epoch::from(Guard::from_inner(Arc::new(delta)));
    (fixture, world, epoch)
}

/// A corpus mask and a scope admitting every row reach different schedules.
///
/// The saturated scope shares the generation's one base cascade.
#[test]
fn dispatch_saturated_partial() {
    let (_fixture, world, epoch) = world("schedule-dispatch-saturated");
    let full = VisibilityMask::full(actor());
    let partial = mask(0);
    assert_eq!(full.kind(), VisibilityKind::Corpus);
    assert_eq!(partial.kind(), VisibilityKind::Scope);
    let corpus = ViewSchedule::of(Arc::clone(&world), &epoch, &full);
    let first = ViewSchedule::of(Arc::clone(&world), &epoch, &partial);
    let second = ViewSchedule::of(Arc::clone(&world), &epoch, &partial);
    assert_matches!(corpus.data, ScheduleData::Corpus { .. });
    assert_eq!(corpus.occupancy(), None);
    assert!(first.occupancy().is_some());
    let (ScheduleData::Saturated { base: first, .. }, ScheduleData::Saturated { base: second, .. }) =
        (&first.data, &second.data)
    else {
        panic!("should share the saturated scoped cascade");
    };
    assert!(Arc::ptr_eq(first, second));
    assert!(Arc::ptr_eq(first, world.base_scope_schedule()));
    let cut = corpus.cut(Zoom::MAX).expect("should keep recorded cuts");
    assert_eq!(cut.offset(), Zoom::MIN);
    assert_eq!(cut.buckets(), world.schedule());
    assert_eq!(cut.deepest(), world.schedule().deepest());
    let error = first
        .cut(world.schedule(), Zoom::MAX)
        .expect_err("should refuse a scoped offset beyond the key width");
    assert_eq!(error.offset, Zoom::MAX);
    assert_eq!(error.schedule, world.schedule());
}

/// Withholding one row reaches the narrow schedule.
///
/// The schedule then delivers neither that row nor a bucket for it.
#[test]
fn dispatch_missing_row() {
    let (_fixture, world, epoch) = world("schedule-dispatch-missing-row");
    let view = ViewSchedule::of(Arc::clone(&world), &epoch, &mask(1));
    assert_matches!(view.data, ScheduleData::Scoped(_));
    let cut = view.cut(Zoom::MIN).expect("should bind the scope");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    assert_eq!(cut.bucket_of(NodeRowId::MIN), None);
    assert_eq!(
        cut.total(world.schedule().max_tile_depth(), root)
            .rows
            .len(),
        usize::try_from(NODES).expect("should fit the fixture count") - 1
    );
}

/// Measures the tight extent of rows `first..NODES` from the layout rather than the schedule.
fn extent(world: &World, epoch: &Epoch, first: u64) -> Option<Bounds2> {
    Bounds2::from_points(
        (first..NODES).filter_map(|index| world.layout.position(epoch, NodeRowId::new(index))),
    )
}

/// Each view kind's bounds come from the source its construction names.
///
/// The corpus view returns the recorded base bounds. This epoch has no added rows, and the
/// saturated view returns those same bounds. Its assertion compares them with an independent
/// measurement of every base placement. The narrow scope measures exactly the rows it admits, and
/// the empty scope has none.
#[test]
fn bounds_admission() {
    let (_fixture, world, epoch) = world("schedule-bounds");

    let corpus = ViewSchedule::of(Arc::clone(&world), &epoch, &VisibilityMask::full(actor()));
    assert_eq!(corpus.bounds(), world.layout.base_bounds());
    assert!(corpus.bounds().is_some());

    let saturated = ViewSchedule::of(Arc::clone(&world), &epoch, &mask(0));
    assert_matches!(saturated.data, ScheduleData::Saturated { .. });
    assert_eq!(saturated.bounds(), extent(&world, &epoch, 0));

    let scoped = ViewSchedule::of(Arc::clone(&world), &epoch, &mask(NODES - 2));
    assert_matches!(scoped.data, ScheduleData::Scoped(_));
    assert_eq!(scoped.bounds(), extent(&world, &epoch, NODES - 2));
    assert_ne!(scoped.bounds(), saturated.bounds());

    let empty = ViewSchedule::of(Arc::clone(&world), &epoch, &mask(NODES));
    assert_eq!(empty.bounds(), None);
}

/// A scope's occupancy profile counts exactly the keys it admits, an empty scope included.
#[test]
fn occupancy_admission() {
    let (_fixture, world, epoch) = world("schedule-occupancy");
    for first in [0, 1, NODES] {
        let view = ViewSchedule::of(Arc::clone(&world), &epoch, &mask(first));
        let occupancy = view
            .occupancy()
            .expect("a scope should have an occupancy profile");
        let mut keys: Vec<_> = (first..NODES)
            .filter_map(|index| world.layout.position(&epoch, NodeRowId::new(index)))
            .map(|position| {
                let [x, y] = WIRE_FRAME.quantize(position);
                MortonKey::new(x, y)
            })
            .collect();
        assert_eq!(occupancy, ViewOccupancy::of(&mut keys));
    }
}

/// Building a schedule from one generation's world against another's publication is refused.
#[test]
#[should_panic(expected = "layout must belong to the epoch's world")]
fn dispatch_foreign_world() {
    let (_first_fixture, _first, epoch) = world("schedule-first-world");
    let (_second_fixture, second, _second_epoch) = world("schedule-second-world");
    ViewSchedule::of(second, &epoch, &mask(NODES));
}

/// The recorded keys' shared-prefix lookup agrees with the maximum over every recorded key.
///
/// The queries lie inside the set, outside it and one bit away from it.
#[test]
fn shared_depth_recorded_keys() {
    let (_fixture, world, _epoch) = world("schedule-shared-depth");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let keys: Vec<_> = (Depth::MIN..=world.schedule().deepest())
        .flat_map(|bucket| world.layout.base_run(bucket, root).map(|(key, _)| key))
        .collect();
    let queries = [MortonKey::from_bits(0), MortonKey::from_bits(u64::MAX)]
        .into_iter()
        .chain(keys.iter().copied())
        .chain(
            keys.iter()
                .map(|key| MortonKey::from_bits(key.to_bits() ^ 1)),
        );
    for query in queries {
        assert_eq!(
            world.layout.base_shared_depth(query),
            keys.iter().map(|&key| query.shared_depth(key)).max()
        );
    }
}
