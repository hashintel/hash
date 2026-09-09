use alloc::sync::Arc;

use arc_swap::Guard;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{ScheduleData, ViewSchedule};
use crate::{
    bitset::CompressedBitSet,
    identity::NodeRowId,
    morton::{Depth, MortonCell, MortonKey, Zoom},
    serve2::{
        delta::{Delta, epoch::Epoch},
        tests::fixture::{NODES, TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityKind, VisibilityMask},
        world::World,
    },
};

fn actor() -> VisibilityActor {
    VisibilityActor {
        id: ActorId::new(Uuid::nil(), ActorType::Machine),
        instance_admin: false,
    }
}

fn mask(first: u64) -> VisibilityMask {
    let mut nodes = CompressedBitSet::default();
    for index in first..NODES {
        nodes.insert(NodeRowId::new(index));
    }
    VisibilityMask::partial(actor(), nodes, CompressedBitSet::default())
}

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
    assert!(matches!(corpus.data, ScheduleData::Corpus { .. }));
    let (ScheduleData::Saturated { base: first, .. }, ScheduleData::Saturated { base: second, .. }) =
        (&first.data, &second.data)
    else {
        panic!("should share the saturated scoped cascade");
    };
    assert!(Arc::ptr_eq(first, second));
    assert!(Arc::ptr_eq(first, world.base_scope_schedule()));
    assert_eq!(
        corpus
            .cut(Zoom::MAX)
            .expect("should keep recorded cuts")
            .deepest(),
        world.schedule().deepest()
    );
    let error = first
        .cut(world.schedule(), Zoom::MAX)
        .expect_err("should refuse a scoped offset beyond the key width");
    assert_eq!(error.offset, Zoom::MAX);
    assert_eq!(error.schedule, world.schedule());
}

#[test]
fn dispatch_missing_row() {
    let (_fixture, world, epoch) = world("schedule-dispatch-missing-row");
    let view = ViewSchedule::of(Arc::clone(&world), &epoch, &mask(1));
    assert!(matches!(view.data, ScheduleData::Scoped(_)));
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

#[test]
#[should_panic(expected = "layout must belong to the epoch's world")]
fn dispatch_foreign_world() {
    let (_first_fixture, _first, epoch) = world("schedule-first-world");
    let (_second_fixture, second, _second_epoch) = world("schedule-second-world");
    ViewSchedule::of(second, &epoch, &mask(NODES));
}

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
