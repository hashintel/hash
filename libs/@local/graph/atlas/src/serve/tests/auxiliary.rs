//! The detail trailer's payload hydration over a displaying fixture.
//!
//! The all-empty instance in `tile.rs` proves the trailer's encode path with details injected at
//! the transport splice. These cases instead feed real payloads through the production pipeline,
//! dataset labels and icons entering the published identity artifacts and coming out through the
//! tile arm's own hydration. They can therefore fail on what an all-empty instance cannot:
//! per-position alignment to the delivered order, icon-precedence selection across a point's
//! direct types, and non-empty auxiliary column encoding.
//!
//! Expectations derive from the fixture's own assignment tables and independently opened
//! artifacts, never from the assembly under test. The grid sweep spells its trailer expectation
//! byte-by-byte from the wire contract (`docs/wire.md`), independently of the producer's
//! encoder.

use std::collections::{HashMap, HashSet};

use hashql_core::id::{Id as _, IdSlice};
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{
    Artifacts, Bound, FIXTURE_EDGES, FIXTURE_LOD, FULL, NODES, ROW_IDS, decode_rows, fixture_nodes,
    fixture_row_ids, full_grid, open_artifacts, publish_dataset, test_codec,
};
use crate::{
    dataset::{
        Edge, Ontology,
        auxiliary::{Icon, Label, OwnedIcon, OwnedLabel},
        card::Card,
        memory::MemoryDataset,
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    math::{Bounds2, Vec2},
    salt::wire::{
        Mode,
        cbor::CborWriter,
        tests::section,
        tile::{DeliveredSet, GlobalHead, TileCoordinate, TileHead, TileResponse, TileTrailer},
    },
    serve::{CutOffset, TileLimits, TileQuery, TileRequest, tile::TileDetail},
};

/// Each ontology row's own icon, by row, empty for a row that displays none.
///
/// The rows build every icon-resolution shape the trailer serves:
///
/// | row | parents | icon           | memo (source, depth) |
/// |-----|---------|----------------|----------------------|
/// | 0   | -       | `icon-alpha`   | (0, 0)               |
/// | 1   | -       | `icon-beta`    | (1, 0)               |
/// | 2   | [1]     | -              | (1, 1)               |
/// | 3   | [2]     | -              | (1, 2)               |
/// | 4   | -       | `icon-gamma`   | (4, 0)               |
/// | 5   | -       | `icon-delta`   | (5, 0)               |
/// | 6   | -       | -              | none                 |
/// | 7   | -       | `icon-epsilon` | (7, 0)               |
/// | 8   | -       | -              | none, the link type  |
///
/// Rows 1 through 3 are one inheritance chain under row 1's icon. Rows 1 and 2 carry no
/// instances and exist as its interior.
const ICONS: [&str; 9] = [
    "icon-alpha",
    "icon-beta",
    "",
    "",
    "icon-gamma",
    "icon-delta",
    "",
    "icon-epsilon",
    "",
];

/// Returns the direct types node row `row` carries: the type list of case `row % 6`.
///
/// Each list is strictly ascending, as the dataset contract requires, and each case resolves a
/// different icon, so a resolution mixing up two cases changes bytes. Candidates read
/// `(index, icon, depth)` per direct type; the resolution law is the minimum over
/// `(depth, index)`.
///
/// | case | types  | candidates                      | resolved       | falsifies                |
/// |------|--------|---------------------------------|----------------|--------------------------|
/// | 0    | [0]    | (0, alpha, 0)                   | `icon-alpha`   | the depth-zero base case |
/// | 1    | [3]    | (0, beta, 2)                    | `icon-beta`    | inheritance at depth two |
/// | 2    | [3, 4] | (0, beta, 2), (1, gamma, 0)     | `icon-gamma`   | first-listed-type-wins   |
/// | 3    | [5, 7] | (0, delta, 0), (1, epsilon, 0)  | `icon-delta`   | last-wins on a depth tie |
/// | 4    | [6]    | -                               | empty          | an icon-free cone serves |
/// | 5    | [6, 7] | (1, epsilon, 0)                 | `icon-epsilon` | a skipped icon-free type |
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the modulus folds node rows onto the six-entry case table"
)]
fn case_types(row: usize) -> smallvec::SmallVec<OntologyRowId, 2> {
    match row % 6 {
        0 => smallvec![OntologyRowId::new(0)],
        1 => smallvec![OntologyRowId::new(3)],
        2 => smallvec![OntologyRowId::new(3), OntologyRowId::new(4)],
        3 => smallvec![OntologyRowId::new(5), OntologyRowId::new(7)],
        4 => smallvec![OntologyRowId::new(6)],
        _ => smallvec![OntologyRowId::new(6), OntologyRowId::new(7)],
    }
}

/// Returns the icon the trailer must deliver for node row `row`, hand-resolved from
/// [`case_types`]'s table, empty for the icon-free case.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the modulus folds node rows onto the six-entry case table"
)]
fn expected_icon(row: u32) -> &'static str {
    match row % 6 {
        0 => "icon-alpha",
        1 => "icon-beta",
        2 => "icon-gamma",
        3 => "icon-delta",
        4 => "",
        _ => "icon-epsilon",
    }
}

/// Returns the label node row `row` displays: distinct per row, empty at row 13.
///
/// Distinctness is what makes the alignment claim falsifiable: permuting any two delivered
/// labels changes bytes. Row 13 displays nothing, so exactly one label crosses the wire as
/// `null` at a position whose icon stays non-empty - a response swapping the two columns
/// cannot encode it.
fn expected_label(row: u32) -> String {
    if row == 13 {
        return String::new();
    }

    format!("entity {row:02}")
}

/// The displaying fixture: [`fixture_nodes`]'s geometry with display payloads assigned.
///
/// [`case_types`] types each node row and [`expected_label`] labels it. [`ICONS`] gives each
/// ontology row its icon, and the fixture edges take the instance-free link type row 8.
fn displaying_dataset() -> MemoryDataset {
    let (nodes, canonical) = fixture_nodes(case_types);

    let edges = FIXTURE_EDGES
        .into_iter()
        .map(|(id, source, target)| Edge {
            id: U64::<LE>::new(id),
            source: NodeRowId::new(source),
            target: NodeRowId::new(target),
            ontology: smallvec![OntologyRowId::new(8)],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        })
        .collect();

    let parents_of: [&[u64]; 9] = [&[], &[], &[1], &[2], &[], &[], &[], &[], &[]];
    let ontology = parents_of
        .into_iter()
        .enumerate()
        .map(|(row, parents)| Ontology {
            id: U64::<LE>::new(row as u64),
            parents: parents
                .iter()
                .map(|&parent| OntologyRowId::new(parent))
                .collect(),
        })
        .collect();

    let cards = (0..parents_of.len() as u64)
        .map(|row| (row, Card::verbatim(format!("Type {row} card"))))
        .collect();

    let mut dataset = MemoryDataset::new(nodes, edges, ontology, canonical, cards);
    let rows = u32::try_from(NODES).expect("fixture counts fit u32");
    dataset.node_labels = (0..rows)
        .map(|row| OwnedLabel::from(expected_label(row)))
        .collect();
    dataset.ontology_icons = ICONS.iter().map(|&icon| OwnedIcon::from(icon)).collect();

    dataset
}

/// Encodes the detail trailer the wire contract pins: one CBOR map of two arrays, text entries
/// with `null` for a row that displays nothing.
///
/// Spelled from `docs/wire.md`, so the expectation stays independent of the assembly under
/// test.
fn expected_trailer(labels: &[String], icons: &[&str]) -> Vec<u8> {
    fn details<'entry>(
        cbor: &mut CborWriter<'_>,
        entries: impl ExactSizeIterator<Item = &'entry str>,
    ) {
        cbor.array(entries.len() as u64);
        for entry in entries {
            if entry.is_empty() {
                cbor.null();
            } else {
                cbor.text(entry);
            }
        }
    }

    let mut bytes = Vec::new();
    let mut cbor = CborWriter::over(&mut bytes);
    cbor.map(2);
    cbor.uint(0);
    details(&mut cbor, labels.iter().map(String::as_str));
    cbor.uint(1);
    details(&mut cbor, icons.iter().copied());

    bytes
}

/// The detailed-tile production path, hydrating real generation payloads.
///
/// One `Atlas::tile` call with `detail: "auxiliary"` over the displaying fixture, byte-compared
/// against the wire document built directly over the fixture's own assignment tables: each
/// delivered position's label is its row's, each icon its row's case resolution.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
#[expect(
    clippy::single_range_in_vec_init,
    reason = "an array of one range is what a root delta delivery IS"
)]
async fn detailed_tiles_hydrate_labels_and_icons_from_the_generation() {
    let (generation, atlas) = publish_dataset("auxiliary-trailer", &displaying_dataset()).await;
    let Artifacts {
        quad,
        morton,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    // The arm under test: assembly, in-process payload resolution, and encoding through
    // `Atlas::tile` itself in one call.
    let detailed = TileRequest {
        coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
        query: TileQuery {
            mode: Mode::Delta,
            detail: TileDetail::Auxiliary,
            ..TileQuery::default()
        },
    };
    let bytes = atlas
        .tile(
            &detailed,
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
        )
        .expect("the detailed root tile serves");

    let delivered: u64 = morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let delivered = usize::try_from(delivered).expect("fixture counts fit usize");

    // The trailer columns the response must carry: the delivered prefix's rows, each mapped
    // through the fixture's own assignment.
    let labels_text: Vec<String> = row_ids[..delivered]
        .iter()
        .map(|&row| expected_label(row))
        .collect();
    let labels: Vec<&Label> = labels_text.iter().map(|text| Label::new(text)).collect();
    let icons: Vec<&Icon> = row_ids[..delivered]
        .iter()
        .map(|&row| Icon::new(expected_icon(row)))
        .collect();

    let end = u32::try_from(delivered).expect("fixture counts fit u32");
    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            visible: morton.count(),
            first_bucket: 0,
            runs: &morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
                .iter()
                .map(|&length| u32::try_from(length).expect("fixture counts fit u32"))
                .collect::<Vec<_>>(),
            global: Some(GlobalHead {
                visible: delivered as u64,
                // Normalization maps each attained world axis onto the frame edges, so the
                // extent anchors at the full wire square.
                bounds: Some(
                    Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
                        .expect("the wire square is a valid extent"),
                ),
                min_resolution: morton
                    .fenceposts()
                    .lengths()
                    .iter()
                    .rposition(|&length| length > 0)
                    .map_or(0, |bucket| bucket as u64),
            }),
            children: (0..4).fold(0_u8, |bits, quadrant| {
                bits | (u8::from(quad.nodes()[0].child(quadrant).is_some()) << quadrant)
            }),
        },
        delivered: DeliveredSet::Ranges(&[BasePosition::from_u32(0)..BasePosition::from_u32(end)]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&{
            let node_codec = test_codec(&atlas);
            row_ids
                .iter()
                .map(|&row| node_codec.encode(NodeRowId::from_u32(row)))
                .collect::<Vec<_>>()
        }),
        masks: None,
        trailer: Some(TileTrailer {
            labels: &labels,
            icons: &icons,
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the hydrated trailer path is byte-exact");
}

/// Every icon-precedence case, witnessed over the whole corpus.
///
/// The deepest grid's cut reaches the catch-all bucket, so total-mode tiles over it deliver
/// every node exactly once - all 48 rows, eight instances of each of [`case_types`]'s six
/// cases, whatever the fit placed where. Per tile, the envelope's tail must be exactly the
/// trailer the delivered rows' assignments encode. The envelope writes the trailer last, so the
/// tail comparison addresses it.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn deepest_grid_tiles_align_every_icon_precedence_case() {
    let (_generation, atlas) = publish_dataset("auxiliary-grid", &displaying_dataset()).await;

    // Wire row id to fixture row, through the independently derived codec.
    let node_codec = test_codec(&atlas);
    let rows = u32::try_from(NODES).expect("fixture counts fit u32");
    let decode: HashMap<u32, u32> = (0..rows)
        .map(|row| (node_codec.encode(NodeRowId::from_u32(row)).get(), row))
        .collect();

    let mut seen: HashSet<u32> = HashSet::new();
    for coordinate in full_grid() {
        let detailed = TileRequest {
            coordinate,
            query: TileQuery {
                mode: Mode::Total,
                detail: TileDetail::Auxiliary,
                ..TileQuery::default()
            },
        };
        let bytes = atlas
            .tile(
                &detailed,
                TileLimits::default(),
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            )
            .expect("every deepest tile serves");

        let delivered: Vec<u32> = decode_rows(section(&bytes, ROW_IDS).unwrap_or(&[]))
            .into_iter()
            .map(|wire| {
                *decode
                    .get(&wire)
                    .expect("every delivered id decodes to a fixture row")
            })
            .collect();
        for &row in &delivered {
            assert!(
                seen.insert(row),
                "row {row} is delivered by exactly one deepest tile",
            );
        }

        let labels: Vec<String> = delivered.iter().map(|&row| expected_label(row)).collect();
        let icons: Vec<&str> = delivered.iter().map(|&row| expected_icon(row)).collect();
        let tail = expected_trailer(&labels, &icons);
        assert!(
            bytes.len() >= tail.len() && bytes[bytes.len() - tail.len()..] == tail[..],
            "tile {coordinate:?} ends with the trailer its delivered rows encode",
        );
    }

    assert_eq!(
        seen.len(),
        NODES,
        "the deepest grid delivers the whole corpus",
    );
}
