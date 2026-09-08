use hashql_core::id::Id as _;
use proptest::{
    arbitrary::any, collection, prop_assert_eq, prop_oneof, property_test, strategy::Just,
};
use uuid::Uuid;

use super::{ScheduleNode, ScopeSchedule};
use crate::{
    identity::{ImportanceRank, NodeRowId},
    math::Log2,
    morton::{Depth, MortonCell, MortonKey, Zoom},
    postgres::id::ArchivedEntityId,
    salt::lod::stage::LodConfig,
    serve2::{
        schedule::{BucketSchedule, DeliveredNodes},
        world::node_importance::NodePriority,
    },
};

fn grid(span: u8, zoom: u8) -> BucketSchedule {
    BucketSchedule::new(LodConfig {
        span: Log2::new(span).expect("should fit the exponent domain"),
        max_tile_depth: Zoom::new(zoom).expect("should fit the zoom domain"),
    })
    .expect("should fit the key width")
}

fn rows(keys: &[u64]) -> Vec<ScheduleNode> {
    keys.iter()
        .enumerate()
        .map(|(index, &key)| {
            let priority = if index % 2 == 0 {
                NodePriority::Rank(ImportanceRank::from_usize(keys.len() - index))
            } else {
                NodePriority::Identity(ArchivedEntityId {
                    web_id: Uuid::from_u128((index % 3) as u128).into(),
                    entity_uuid: Uuid::from_u128(index as u128).into(),
                })
            };
            ScheduleNode {
                node: NodeRowId::from_u64(u64::from(u32::MAX) + index as u64),
                key: MortonKey::from_bits(key),
                priority,
            }
        })
        .collect()
}

fn prefix(key: MortonKey, depth: u8) -> u64 {
    if depth == 0 {
        0
    } else {
        key.to_bits() >> (64 - 2 * u32::from(depth))
    }
}

// The first depth without a better occupant is the natural bucket. Equal complete keys use 32.
fn natural(rows: &[ScheduleNode]) -> Vec<u8> {
    rows.iter()
        .map(|row| {
            (0..=32)
                .find(|&depth| {
                    !rows.iter().any(|other| {
                        other.priority < row.priority
                            && prefix(other.key, depth) == prefix(row.key, depth)
                    })
                })
                .unwrap_or(32)
        })
        .collect()
}

fn delivery(
    rows: &[ScheduleNode],
    natural: &[u8],
    deepest: u8,
    interval: core::ops::RangeInclusive<u8>,
    cell: MortonCell,
) -> DeliveredNodes {
    let first_bucket = Depth::new(*interval.start());
    let mut ordered: Vec<_> = rows
        .iter()
        .zip(natural)
        .filter(|&(row, &bucket)| interval.contains(&bucket.min(deepest)) && cell.contains(row.key))
        .map(|(row, &bucket)| (bucket.min(deepest), row))
        .collect();
    ordered.sort_unstable_by_key(|&(bucket, row)| (bucket, row.key, row.priority));
    let runs = interval
        .map(|bucket| ordered.iter().filter(|(held, _)| *held == bucket).count())
        .collect();
    DeliveredNodes {
        rows: ordered.into_iter().map(|(_, row)| row.node).collect(),
        first_bucket,
        runs,
    }
}

/// The best priority claims the root even when input and stable-row orders disagree.
#[test]
fn buckets_priority_order() {
    let rows = rows(&[0, 0, 0, 0]);
    let schedule = ScopeSchedule::over(rows.clone());
    let cut = schedule
        .cut(grid(0, 2), Zoom::MIN)
        .expect("should bind the cut");
    assert_eq!(cut.bucket_of(rows[2].node), Some(Depth::MIN));
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let total = cut.total(Zoom::new(2).expect("should fit the zoom"), root);
    assert_eq!(
        total.rows,
        [rows[2].node, rows[0].node, rows[3].node, rows[1].node]
    );
    assert_eq!(total.runs, [1, 0, 3]);
}

/// The catch-all restores key order across distinct natural buckets.
#[test]
fn delivery_catch_all_order() {
    let rows = rows(&[0, 1, 1 << 62, u64::MAX, 1 << 61]);
    let natural = natural(&rows);
    let schedule = ScopeSchedule::over(rows.clone());
    let cut = schedule
        .cut(grid(0, 1), Zoom::MIN)
        .expect("should bind the cut");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let zoom = Zoom::new(1).expect("should fit the zoom");
    assert_eq!(
        cut.total(zoom, root),
        delivery(&rows, &natural, 1, 0..=1, root)
    );
    assert_eq!(cut.children(zoom, root), 0);
    assert_eq!(cut.total(zoom, root).runs.iter().sum::<usize>(), rows.len());
}

/// Removing the best row promotes the next visible priority to the root.
#[test]
fn buckets_hidden_priority() {
    let rows = rows(&[0, 0, 0]);
    let full = ScopeSchedule::over(rows.clone());
    let narrow = ScopeSchedule::over(rows[..2].to_vec());
    assert_eq!(full.bucket_of(rows[0].node), Some(Depth::MAX));
    assert_eq!(narrow.bucket_of(rows[0].node), Some(Depth::MIN));
    assert_eq!(narrow.bucket_of(rows[2].node), None);
}

/// A root-only schedule delivers every row through its catch-all, at every valid offset.
#[test]
fn delivery_terminal_root() {
    let rows = rows(&[0, 1, u64::MAX, u64::MAX]);
    let schedule = ScopeSchedule::over(rows.clone());
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    for offset in [0, 1, 32] {
        let cut = schedule
            .cut(
                grid(0, 0),
                Zoom::new(offset).expect("should fit the offset"),
            )
            .expect("should bind the cut");
        assert_eq!(cut.root_delivered(), rows.len());
        assert_eq!(cut.total(Zoom::MIN, root), cut.delta(Zoom::MIN, root));
        assert_eq!(cut.children(Zoom::MIN, root), 0);
        for row in &rows {
            assert_eq!(cut.first_zoom(row.node), Some(Zoom::MIN));
        }
    }
}

#[test]
fn delivery_empty() {
    let schedule = ScopeSchedule::over(Vec::new());
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let cut = schedule
        .cut(grid(2, 2), Zoom::MIN)
        .expect("should bind the cut");
    assert_eq!(cut.root_delivered(), 0);
    assert_eq!(cut.min_resolution(), Depth::MIN);
    assert_eq!(cut.children(Zoom::MIN, root), 0);
    assert_eq!(cut.first_zoom(NodeRowId::MIN), None);
    assert_eq!(
        cut.total(Zoom::MIN, root),
        DeliveredNodes {
            rows: Vec::new(),
            first_bucket: Depth::MIN,
            runs: vec![0, 0, 0]
        }
    );
}

#[test]
fn cut_width_boundaries() {
    let schedule = ScopeSchedule::over(Vec::new());
    for (span, zoom, offset, valid) in [
        (0, 0, 32, true),
        (32, 0, 0, true),
        (0, 32, 0, true),
        (31, 0, 1, true),
        (31, 0, 2, false),
        (1, 31, 1, false),
        (32, 0, 32, false),
    ] {
        let buckets = grid(span, zoom);
        let offset = Zoom::new(offset).expect("should fit the offset");
        match schedule.cut(buckets, offset) {
            Ok(cut) => {
                assert!(valid, "should accept only cuts within the key width");
                assert_eq!(cut.deepest().get(), span + zoom + offset.get());
            }
            Err(error) => {
                assert!(!valid, "should refuse only cuts beyond the key width");
                assert_eq!(error.schedule, buckets);
                assert_eq!(error.offset, offset);
            }
        }
    }
}

#[test]
#[should_panic(expected = "the schedule serves zooms 0..=max_tile_depth")]
fn cut_zoom_outside_schedule() {
    let schedule = ScopeSchedule::over(Vec::new());
    let cut = schedule
        .cut(grid(0, 0), Zoom::MIN)
        .expect("should bind the cut");
    cut.cut_of(Zoom::MAX);
}

/// Each delivery query agrees with direct first-occupant assignment over mixed priorities.
#[property_test]
fn delivery_laws(
    #[strategy = collection::vec(prop_oneof![Just(0), Just(u64::MAX), any::<u64>()], 0..40)]
    keys: Vec<u64>,
    #[strategy = 0_u8..5] span: u8,
    #[strategy = 0_u8..5] max_zoom: u8,
    #[strategy = 0_u8..5] offset: u8,
) {
    let rows = rows(&keys);
    let natural = natural(&rows);
    let schedule = ScopeSchedule::over(rows.clone());
    let cut = schedule
        .cut(
            grid(span, max_zoom),
            Zoom::new(offset).expect("should fit the offset"),
        )
        .expect("should bind the cut");
    let deepest = span + max_zoom + offset;
    let root_cut = span + offset;
    prop_assert_eq!(
        cut.root_delivered(),
        natural
            .iter()
            .filter(|&&bucket| bucket.min(deepest) <= root_cut)
            .count()
    );
    prop_assert_eq!(
        cut.min_resolution().get(),
        natural.iter().copied().max().unwrap_or(0).min(deepest)
    );
    prop_assert_eq!(cut.bucket_of(NodeRowId::MIN), None);
    for (row, &bucket) in rows.iter().zip(&natural) {
        prop_assert_eq!(
            cut.bucket_of(row.node).map(Depth::get),
            Some(bucket.min(deepest))
        );
        prop_assert_eq!(
            cut.first_zoom(row.node).map(Zoom::get),
            Some(bucket.min(deepest).saturating_sub(span + offset))
        );
    }
    for zoom in 0..=max_zoom {
        let depth = Depth::new(zoom);
        let mut cells =
            vec![MortonCell::new(depth, 0, 0).expect("should construct the origin cell")];
        cells.extend(rows.iter().map(|row| row.key.cell(depth)));
        let cut_depth = zoom + span + offset;
        let typed_zoom = Zoom::new(zoom).expect("should fit the zoom");
        for cell in cells {
            let total = cut.total(typed_zoom, cell);
            prop_assert_eq!(total.runs.iter().sum::<usize>(), total.rows.len());
            prop_assert_eq!(
                total,
                delivery(&rows, &natural, deepest, 0..=cut_depth, cell)
            );
            let first = if zoom == 0 { 0 } else { cut_depth };
            prop_assert_eq!(
                cut.delta(typed_zoom, cell),
                delivery(&rows, &natural, deepest, first..=cut_depth, cell)
            );
            let mut expected = 0;
            if cut_depth < deepest {
                for (index, child) in cell
                    .children()
                    .expect("should have children below the key width")
                    .iter()
                    .enumerate()
                {
                    if rows.iter().zip(&natural).any(|(row, &bucket)| {
                        bucket.min(deepest) > cut_depth && child.contains(row.key)
                    }) {
                        expected |= 1 << index;
                    }
                }
            }
            prop_assert_eq!(cut.children(typed_zoom, cell), expected);
        }
    }
}
