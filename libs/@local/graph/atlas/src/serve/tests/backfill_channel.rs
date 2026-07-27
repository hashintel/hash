//! Controlled schedule proof for hidden occupancy in restricted backfill.

use std::collections::HashSet;

use super::{CborReader, HEAD, ROW_IDS, decode_rows, head_counts};
use crate::{
    identity::NodeRowId,
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonKey},
    salt::{
        lod::{cascade, order::BaseOrder, rank::Ranking},
        wire::{
            Mode,
            tests::section,
            tile::{DeliveredSet, GlobalHead, TileCoordinate, TileHead, TileResponse},
        },
    },
    serve::WireRow,
};

#[derive(Debug)]
struct Columns {
    codes: Vec<u64>,
    segments: [(usize, usize); 3],
    rows: Vec<u32>,
}

#[derive(Debug)]
struct Delivery {
    budget: u64,
    positions: Vec<u32>,
    runs: Vec<u64>,
    backfilled: u64,
}

#[derive(Debug, PartialEq, Eq)]
struct Observation {
    budget: u64,
    delivered: u64,
    rows: Vec<u32>,
    runs: Vec<u64>,
    backfilled: u64,
    children: u64,
}

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("test depths lie within the key width")
}

fn ranking_of(row_of_rank: &[u32]) -> Ranking {
    let mut rank_of_row = vec![0_u32; row_of_rank.len()];
    for (rank, &row) in row_of_rank.iter().enumerate() {
        rank_of_row[usize::try_from(row).expect("test rows fit usize")] =
            u32::try_from(rank).expect("test ranks fit u32");
    }

    Ranking {
        row_of_rank: row_of_rank.into(),
        rank_of_row: rank_of_row.into_boxed_slice(),
    }
}

fn columns_of(keys: &[MortonKey], buckets: &[Depth], ranking: &Ranking) -> Columns {
    let order = BaseOrder::new(keys, buckets, ranking);
    let rows = order.row_of_position.to_vec();
    let codes = rows
        .iter()
        .map(|&row| keys[usize::try_from(row).expect("test rows fit usize")].to_bits())
        .collect();

    let mut segments = [(0_usize, 0_usize); 3];
    let mut start = 0_usize;
    for bucket in 0_u8..=2 {
        let count = rows
            .iter()
            .filter(|&&row| {
                buckets[usize::try_from(row).expect("test rows fit usize")] == depth(bucket)
            })
            .count();
        segments[usize::from(bucket)] = (start, start + count);
        start += count;
    }
    assert_eq!(
        start,
        rows.len(),
        "the fixture occupies buckets 0 through 2"
    );

    Columns {
        codes,
        segments,
        rows,
    }
}

fn root_delivery(columns: &Columns, visible: &[bool]) -> Delivery {
    let budget = columns.segments[..=1]
        .iter()
        .map(|&(start, end)| end - start)
        .sum::<usize>();
    let mut positions = Vec::new();
    let mut runs = Vec::new();

    for &(start, end) in &columns.segments[..=1] {
        let before = positions.len();
        for position in start..end {
            let row = usize::try_from(columns.rows[position]).expect("test rows fit usize");
            if visible[row] {
                positions.push(u32::try_from(position).expect("test positions fit u32"));
            }
        }
        runs.push(u64::try_from(positions.len() - before).expect("test run lengths fit u64"));
    }

    let mut backfilled = 0_u64;
    let (start, end) = columns.segments[2];
    for position in start..end {
        if positions.len() == budget {
            break;
        }
        let row = usize::try_from(columns.rows[position]).expect("test rows fit usize");
        if visible[row] {
            positions.push(u32::try_from(position).expect("test positions fit u32"));
            backfilled += 1;
        }
    }

    Delivery {
        budget: u64::try_from(budget).expect("test budgets fit u64"),
        positions,
        runs,
        backfilled,
    }
}

fn children_of(head: &[u8]) -> u64 {
    let mut reader = CborReader { bytes: head, at: 0 };
    let entries = reader.head(5);
    for _ in 0..entries {
        let key = reader.uint();
        if key == 9 {
            return reader.uint();
        }
        reader.skip();
    }

    panic!("every tile HEAD carries the children bitmask")
}

fn observe(columns: &Columns, visible: &[bool]) -> Observation {
    let delivery = root_delivery(columns, visible);
    let delivered_set: HashSet<u32> = delivery.positions.iter().copied().collect();

    let mut children = 0_u8;
    for (position, (&code, &row)) in columns.codes.iter().zip(&columns.rows).enumerate() {
        if visible[usize::try_from(row).expect("test rows fit usize")]
            && !delivered_set.contains(&u32::try_from(position).expect("test positions fit u32"))
        {
            let child = MortonKey::from_bits(code).prefix(depth(1));
            children |= 1_u8 << u32::try_from(child).expect("depth-1 prefixes fit u32");
        }
    }

    let points: Vec<Vec2> = columns
        .rows
        .iter()
        .map(|&row| match row {
            0 => Vec2::new(-1.0, -1.0),
            1 => Vec2::new(-0.5, -1.0),
            2 => Vec2::new(1.0, -1.0),
            _ => unreachable!("the fixture has three row identities"),
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = columns
        .rows
        .iter()
        .map(|&row| WireRow::pinned(row))
        .collect();
    let runs: Vec<u32> = delivery
        .runs
        .iter()
        .map(|&count| u32::try_from(count).expect("test counts fit u32"))
        .collect();
    let visible_count = u64::try_from(visible.iter().filter(|&&admitted| admitted).count())
        .expect("test counts fit u64");
    let bytes = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            visible: visible_count,
            first_bucket: 0,
            runs: &runs,
            global: Some(GlobalHead {
                visible: delivery.runs.iter().sum(),
                bounds: Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(-0.5, -1.0)),
                min_resolution: 2,
            }),
            children,
            backfilled: delivery.backfilled,
        },
        delivered: DeliveredSet::Positions(&delivery.positions),
        positions: &points,
        rows: &rows,
        masks: None,
        trailer: None,
    }
    .encode();

    let head = section(&bytes, HEAD).expect("HEAD is present");
    let (delivered, runs, backfilled) = head_counts(head);
    Observation {
        budget: delivery.budget,
        delivered,
        rows: decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present")),
        runs,
        backfilled,
        children: children_of(head),
    }
}

/// A worst-ranked hidden row changes the authorized root response with visible inputs fixed.
///
/// Rows A and B keep the same keys, relative ranks, and cascade buckets in both worlds. Adding H
/// last in rank assigns only H to the root schedule's bucket 1. The proof admits A and B in both
/// worlds and hides H, so H is the sole changed input to the response law.
#[test]
fn a_worst_ranked_hidden_row_changes_the_authorized_root_response() {
    let anchor = MortonKey::new(0, 0);
    let deeper = MortonKey::new(0x4000_0000, 0);
    let hidden = MortonKey::new(0x8000_0000, 0);

    let visible_keys = [anchor, deeper];
    let hidden_keys = [anchor, deeper, hidden];
    let visible_ranking = ranking_of(&[0, 1]);
    let hidden_ranking = ranking_of(&[0, 1, 2]);
    let visible_buckets = cascade::buckets(&visible_keys, &visible_ranking, depth(2));
    let hidden_buckets = cascade::buckets(&hidden_keys, &hidden_ranking, depth(2));

    assert_eq!(&hidden_keys[..2], &visible_keys);
    assert_eq!(
        &hidden_ranking.row_of_rank[..2],
        &*visible_ranking.row_of_rank
    );
    assert_eq!(&hidden_buckets[..2], &*visible_buckets);
    assert_eq!(*visible_buckets, [depth(0), depth(2)]);
    assert_eq!(*hidden_buckets, [depth(0), depth(2), depth(1)]);

    let without_hidden = observe(
        &columns_of(&visible_keys, &visible_buckets, &visible_ranking),
        &[true, true],
    );
    let with_hidden = observe(
        &columns_of(&hidden_keys, &hidden_buckets, &hidden_ranking),
        &[true, true, false],
    );

    assert_eq!(
        without_hidden,
        Observation {
            budget: 1,
            delivered: 1,
            rows: vec![0],
            runs: vec![1, 0],
            backfilled: 0,
            children: 1,
        },
    );
    assert_eq!(
        with_hidden,
        Observation {
            budget: 2,
            delivered: 2,
            rows: vec![0, 1],
            runs: vec![1, 0],
            backfilled: 1,
            children: 0,
        },
    );
    assert_eq!(
        with_hidden.delivered - with_hidden.runs.iter().sum::<u64>(),
        with_hidden.backfilled,
        "key 4 minus the sum of key 7 recovers an omitted key 11",
    );
}
