use hashql_core::id::{Id as _, IdSlice};

use super::{DeliveredNodes, DeliverySchedule};
use crate::{
    file::{WriteInto as _, array::SizedColumn, generation::Generation, morton::read::MortonFile},
    identity::{BasePosition, Column, NodeRowId},
    math::Vec2,
    morton::{Depth, MortonCell, MortonKey, Zoom},
    serve2::{
        tests::fixture::{NODES, TamperFixture, secret},
        world::World,
    },
};

fn records(generation: &Generation) -> impl IntoIterator<Item = (Depth, MortonKey, NodeRowId)> {
    let files = &generation.repository().files;
    let morton: MortonFile = files
        .morton
        .open(generation)
        .expect("should open the recorded keys");
    let rows: Column<BasePosition, NodeRowId> = files
        .row_of_position
        .open(generation)
        .expect("should open the row permutation");

    (0..morton.count())
        .map(|index| {
            let position = BasePosition::from_u64(index);
            (
                morton.bucket_of(position),
                morton.code(position),
                rows.view()[position],
            )
        })
        .collect::<Vec<_>>()
}

#[track_caller]
fn assert_delivery(
    schedule: DeliverySchedule<'_>,
    records: &[(Depth, MortonKey, NodeRowId)],
    zoom: Zoom,
    cell: MortonCell,
) {
    let cut = schedule.cut_of(zoom);
    let first_delta = if zoom == Zoom::MIN { Depth::MIN } else { cut };
    for (actual, first) in [
        (schedule.total(zoom, cell), Depth::MIN),
        (schedule.delta(zoom, cell), first_delta),
    ] {
        let rows = records
            .iter()
            .filter(|&&(bucket, key, _)| first <= bucket && bucket <= cut && cell.contains(key))
            .map(|&(_, _, node)| node)
            .collect();
        let runs = (first..=cut)
            .map(|bucket| {
                records
                    .iter()
                    .filter(|&&(held, key, _)| held == bucket && cell.contains(key))
                    .count()
            })
            .collect();
        assert_eq!(
            actual,
            DeliveredNodes {
                rows,
                first_bucket: first,
                runs
            }
        );
    }

    let mut children = 0;
    if cut < schedule.deepest()
        && let Some(cells) = cell.children()
    {
        for (index, child) in cells.into_iter().enumerate() {
            if records
                .iter()
                .any(|&(bucket, key, _)| bucket > cut && child.contains(key))
            {
                children |= 1 << index;
            }
        }
    }
    assert_eq!(schedule.children(zoom, cell), children);
}

#[test]
fn corpus_recorded_delivery() {
    let fixture = TamperFixture::publish("corpus-recorded-delivery");
    let world =
        World::open(fixture.generation().clone(), &secret()).expect("should open the world");
    let records: Vec<_> = records(fixture.generation()).into_iter().collect();
    let schedule = DeliverySchedule::corpus(&world);
    let buckets = world.schedule();

    assert_eq!(schedule.deepest(), buckets.deepest());
    assert_eq!(
        schedule.root_delivered(),
        records
            .iter()
            .filter(|&&(bucket, _, _)| bucket <= buckets.cut(Zoom::MIN))
            .count()
    );
    assert_eq!(
        schedule.min_resolution(),
        records
            .iter()
            .map(|&(bucket, _, _)| bucket)
            .max()
            .expect("should contain fitted rows")
    );
    assert_eq!(schedule.bucket_of(NodeRowId::MAX), None);
    assert_eq!(schedule.first_zoom(NodeRowId::MAX), None);

    for &(bucket, key, node) in &records {
        assert_eq!(schedule.bucket_of(node), Some(bucket));
        assert_eq!(schedule.first_zoom(node), Some(buckets.first_zoom(bucket)));
        for zoom in 0..=buckets.max_tile_depth().get() {
            let zoom = Zoom::new(zoom).expect("should lie in the served zoom range");
            assert_delivery(schedule, &records, zoom, key.cell(Depth::from_zoom(zoom)));
        }
    }
}

#[test]
fn corpus_recorded_keys() {
    let fixture = TamperFixture::publish("corpus-recorded-keys");
    let records: Vec<_> = records(fixture.generation()).into_iter().collect();
    assert!(
        records
            .iter()
            .any(|&(_, key, _)| key != MortonKey::new(0, 0)),
        "should exercise nonzero recorded keys"
    );
    let name = fixture
        .generation()
        .repository()
        .files
        .wire_coordinates
        .name();
    let changed = fixture.tamper(&name, |path| {
        let positions =
            vec![Vec2::ZERO; usize::try_from(NODES).expect("should fit the node count")];
        let replacement = path.with_extension("replacement");
        let mut file =
            std::fs::File::create(&replacement).expect("should create replacement coordinates");
        SizedColumn::new(IdSlice::<BasePosition, Vec2>::from_raw(&positions))
            .write_into(&mut file)
            .expect("should write replacement coordinates");
        drop(file);
        std::fs::rename(replacement, path).expect("should replace the coordinate artifact");
    });
    let world = World::open(changed, &secret()).expect("should open structurally valid artifacts");
    let schedule = DeliverySchedule::corpus(&world);
    let zoom = world.schedule().max_tile_depth();

    for &(_, key, _) in &records {
        assert_delivery(schedule, &records, zoom, key.cell(Depth::from_zoom(zoom)));
    }
}
