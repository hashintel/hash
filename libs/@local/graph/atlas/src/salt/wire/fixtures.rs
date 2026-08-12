//! The cross-language fixture corpus: `fixtures/wire/`.
//!
//! Each fixture is one encoded response checked in as fixture bytes plus a JSON sidecar of the
//! expected decoded values (floats as u32 bit patterns), the envelope prefix, and the directory -
//! so the padding sweep is assertable client-side from the sidecar alone. The Rust side proves the
//! encoder reproduces the pinned bytes; the TypeScript decoder consumes the same files and asserts
//! field-for-field equality - "matches the Rust side" is never asserted by eye. The decoder derives
//! its request echo context from the sidecar `HEAD`; a request field the `HEAD` does not echo joins
//! the sidecar the day a fixture needs one.
//!
//! Pinning a fixture waits on a ratified schema and a serving endpoint, because pinning bytes
//! before the schema exists pins an invention. The end-to-end fixture over a real published
//! generation is separate, and it covers a whole artifact tree instead of one envelope. Every
//! fixture here uses `spanLog2 = 2`, so the cut rule reads `bucket = z + 2` and the root spans
//! buckets `0..=2`.
//!
//! Regenerate with `ATLAS_WIRE_BLESS=1` in the environment; the default run compares response bytes
//! byte-for-byte and sidecars by parsed value - the sidecar contract is structural (decoders parse
//! it, never byte-compare it), so repository JSON formatting passes over the checked-in fixtures
//! are not drift.
#![expect(
    clippy::little_endian_bytes,
    reason = "the fixtures write the contract's little-endian wire integers"
)]
#![expect(
    clippy::single_range_in_vec_init,
    reason = "a delta tile's delivered set really is one contiguous range"
)]

use alloc::borrow::Cow;
use std::fs;

use camino::Utf8PathBuf;
use hashql_core::id::{Id, IdSlice};
use serde_json::{Value, json};

use super::{
    Kind, Mode,
    edges::{EdgesResponse, EdgesTrailer},
    envelope::EnvelopeWriter,
    locate::{LocateResponse, LocateTrailer, PropertyValue},
    tests::{directory, section},
    tile::{DeliveredSet, GlobalHead, TileCoordinate, TileHead, TileResponse, TileTrailer},
};
use crate::{
    bitset::DenseBitSlice,
    dataset::{
        auxiliary::{Icon, Label},
        postgres::id::ArchivedEntityId,
    },
    identity::{BasePosition, NodeRowId},
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::artifact::Membership,
    serve::{TableIndex, WireRow, hydrate::EdgeSlot},
};

/// One pinned fixture with its name, response bytes, and sidecar.
struct Fixture {
    name: &'static str,
    bytes: Vec<u8>,
    sidecar: Value,
}

#[test]
fn corpus_matches_the_checked_in_fixtures() {
    let dir = Utf8PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/wire");
    let bless = std::env::var_os("ATLAS_WIRE_BLESS").is_some();

    for fixture in corpus() {
        let bytes_path = dir.join(format!("{}.saltile", fixture.name));
        let sidecar_path = dir.join(format!("{}.json", fixture.name));
        let sidecar = format!(
            "{}\n",
            serde_json::to_string_pretty(&fixture.sidecar).expect("sidecars are plain JSON"),
        );

        if bless {
            fs::write(&bytes_path, &fixture.bytes).expect("the fixture directory is writable");
            fs::write(&sidecar_path, &sidecar).expect("the fixture directory is writable");
            continue;
        }

        let pinned = fs::read(&bytes_path).unwrap_or_else(|_| {
            panic!("{bytes_path} is missing; regenerate with ATLAS_WIRE_BLESS=1")
        });
        assert_eq!(
            fixture.bytes, pinned,
            "{} bytes drifted from the pinned fixture",
            fixture.name,
        );

        let pinned = fs::read_to_string(&sidecar_path).unwrap_or_else(|_| {
            panic!("{sidecar_path} is missing; regenerate with ATLAS_WIRE_BLESS=1")
        });
        let pinned: Value = serde_json::from_str(&pinned).unwrap_or_else(|error| {
            panic!(
                "{sidecar_path} does not parse as JSON ({error}); regenerate with \
                 ATLAS_WIRE_BLESS=1"
            )
        });
        assert_eq!(
            fixture.sidecar, pinned,
            "{} sidecar drifted from the pinned fixture",
            fixture.name,
        );
    }
}

/// G9/G10 exist to sweep the padding widths.
///
/// Every width 1 through 7 must occur across the pair, counting the tail padding of the last
/// present slot.
#[test]
fn padding_sweep_covers_every_width() {
    let mut widths = [false; 8];
    for fixture in [g9_padding_low(), g10_padding_high()] {
        let slots = u16::from_le_bytes(
            fixture.bytes[12..14]
                .try_into()
                .expect("the prefix carries the slot count"),
        );
        for slot in 0..slots as usize {
            let (start, end) = directory(&fixture.bytes, slot);
            if (start, end) != (0, 0) {
                widths[(end as usize).next_multiple_of(8) - end as usize] = true;
            }
        }
    }

    assert_eq!(
        widths[1..],
        [true; 7],
        "G9/G10 must produce every padding width 1..=7",
    );
}

/// The whole corpus in fixture order.
fn corpus() -> Vec<Fixture> {
    vec![
        g1_minimal_tile(),
        g2_root_tile(),
        g3_total_tile(),
        g4_empty_root(),
        g5_trailer_tile(),
        g6_edges(),
        g7_locate(),
        g8_appended_slot(),
        g9_padding_low(),
        g10_padding_high(),
    ]
}

/// Renders a tile fixture's sidecar.
///
/// Prefix, directory, decoded `HEAD`, gathered columns, and trailer.
///
/// `colored` is the request's coloredTypeIds count; `type_mask` is the hand-derived expected column
/// (present iff `colored > 0`). `mass` and `appended` describe populated beyond-v1 slots (G8/G10),
/// which a v1 decoder ignores by contract.
fn tile_sidecar(
    name: &str,
    response: &TileResponse<'_>,
    bytes: &[u8],
    colored: u64,
    type_mask: Option<&[u8]>,
    mass: Option<&[u32]>,
    appended: &Value,
) -> Value {
    assert_eq!(
        type_mask.is_some(),
        colored > 0,
        "TYPE_MASK rides exactly the requests that color types",
    );
    let head = &response.head;

    let mut positions_bits = Vec::new();
    let mut row_ids = Vec::new();
    response.delivered.for_each(|position| {
        let point = response.positions[position];
        positions_bits.push(point.x().to_bits());
        positions_bits.push(point.y().to_bits());
        row_ids.push(response.rows[position]);
    });

    let global = head.global.as_ref().map_or(Value::Null, |global| {
        let bounds_bits = global.bounds.as_ref().map_or(Value::Null, |bounds| {
            json!([
                bounds.min().x().to_bits(),
                bounds.min().y().to_bits(),
                bounds.max().x().to_bits(),
                bounds.max().y().to_bits(),
            ])
        });
        json!({
            "visibleAtZoom": global.visible,
            "boundsBits": bounds_bits,
            "minResolution": global.min_resolution,
        })
    });

    let trailer = response.trailer.as_ref().map_or(Value::Null, |trailer| {
        json!({
            "labels": details_sidecar(trailer.labels),
            "icons": details_sidecar(trailer.icons),
        })
    });

    let head_json = json!({
        "generation": head.generation.to_string(),
        "variant": head.variant,
        "coordinate": [head.coordinate.z, head.coordinate.x, head.coordinate.y],
        "mode": head.mode.code(),
        "delivered": row_ids.len(),
        "visible": head.visible,
        "firstBucket": head.first_bucket,
        "runs": head.runs,
        "global": global,
        "children": head.children,
        "trailer": response.trailer.is_some(),
    });

    json!({
        "golden": name,
        "layer": "tile",
        "prefix": prefix_sidecar(bytes),
        "directory": directory_sidecar(bytes),
        "head": head_json,
        "positions": positions_bits,
        "rowIds": row_ids,
        "typeMask": type_mask.map_or(Value::Null, |mask| json!(mask)),
        "mass": mass.map_or(Value::Null, |values| json!(values)),
        "appended": appended,
        "trailer": trailer,
    })
}

/// Renders the envelope prefix fields.
fn prefix_sidecar(bytes: &[u8]) -> Value {
    assert!(
        bytes.len() >= 16,
        "every envelope opens with a 16-byte prefix"
    );
    let magic = core::str::from_utf8(&bytes[0..8]).expect("the magic is ASCII");
    json!({
        "magic": magic,
        "wireVersion": u16::from_le_bytes(bytes[8..10].try_into().expect("two bytes")),
        "flags": u16::from_le_bytes(bytes[10..12].try_into().expect("two bytes")),
        "slotCount": u16::from_le_bytes(bytes[12..14].try_into().expect("two bytes")),
        "reserved": u16::from_le_bytes(bytes[14..16].try_into().expect("two bytes")),
    })
}

/// Renders the directory as `[[start, end], ...]`.
fn directory_sidecar(bytes: &[u8]) -> Value {
    let slots = u16::from_le_bytes(bytes[12..14].try_into().expect("two bytes"));
    Value::Array(
        (0..slots as usize)
            .map(|slot| {
                let (start, end) = directory(bytes, slot);
                json!([start, end])
            })
            .collect(),
    )
}

/// Renders a detail array: strings and nulls.
fn details_sidecar<T: AsRef<str> + ?Sized>(entries: &[&T]) -> Value {
    Value::Array(
        entries
            .iter()
            .map(|entry| {
                Option::Some(entry.as_ref())
                    .filter(|entry| !entry.is_empty())
                    .map_or(Value::Null, |text| json!(text))
            })
            .collect(),
    )
}

/// G1.
///
/// A non-root delta tile - one run, three points, all columns, `TYPE_MASK` over three requested
/// types (stride 1, `n % 8 != 0`), a multi-bit point carrying types 0 and 2, an all-zero point, a
/// single children bit.
fn g1_minimal_tile() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..12)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.125, -0.5),
                f32::from(index).mul_add(-0.125, 0.75),
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..12)
        .map(|index| WireRow::pinned(3 * index + 7))
        .collect();
    let ranges = [8_u32..11]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    // Type 0 delivers base positions 8 and 9, while 3 and 11 lie outside the run. Type 1 uses a
    // dense representation whose single bit (bit 2) lies outside the run, so it delivers nothing.
    // Type 2 delivers position 9, which makes point 9 the multi-bit point (types 0 and 2). Point 10
    // matches nothing.
    let t0 = [3_u32, 8, 9, 11].map(BasePosition::from_u32);
    let t1_dense = dense_set(12, &[2]);
    let t2 = [9_u32].map(BasePosition::from_u32);
    let masks = [
        Membership::List(&t0),
        Membership::Dense(&t1_dense),
        Membership::List(&t2),
    ];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x11; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 2, x: 3, y: 1 },
            mode: Mode::Delta,
            visible: 17,
            first_bucket: 4,
            runs: &[3],
            global: None,
            children: 0b0100,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: Some(&masks),
        trailer: None,
    };
    let bytes = response.encode();

    let expected_mask = [0b001_u8, 0b101, 0b000];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G1 masks must match the encoder",
    );

    let sidecar = tile_sidecar(
        "g1-minimal-tile",
        &response,
        &bytes,
        3,
        Some(&expected_mask),
        None,
        &Value::Null,
    );
    Fixture {
        name: "g1-minimal-tile",
        bytes,
        sidecar,
    }
}

/// G2.
///
/// The delta root - buckets `0..=2` with the middle run zero-length, one contiguous multi-segment
/// range, no coloredTypeIds (`TYPE_MASK` absent), the required global map with bounds present, all
/// four children.
fn g2_root_tile() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..4)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.25, -0.875),
                f32::from(index).mul_add(0.125, -0.5),
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..4)
        .map(|index| WireRow::pinned(90 - 10 * index))
        .collect();
    // The root's runs are bucket fencepost differences; its delivered
    // set is one contiguous range.
    let ranges = [0_u32..3]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x22; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            visible: 4,
            first_bucket: 0,
            runs: &[1, 0, 2],
            global: Some(GlobalHead {
                visible: 3,
                bounds: Bounds2::new(Vec2::new(-0.875, -0.5), Vec2::new(0.9375, 0.5)),
                min_resolution: 5,
            }),
            children: 0b1111,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: None,
        trailer: None,
    };
    let bytes = response.encode();

    let sidecar = tile_sidecar(
        "g2-root-tile",
        &response,
        &bytes,
        0,
        None,
        None,
        &Value::Null,
    );
    Fixture {
        name: "g2-root-tile",
        bytes,
        sidecar,
    }
}

/// G3.
///
/// A total tile - four runs from bucket 0 with a zero-length run interspersed, bucket-major
/// concatenation, nine requested types (two-byte mask stride), zero children.
fn g3_total_tile() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..10)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(-0.1875, 0.9),
                f32::from(index) * 0.0625,
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..10)
        .map(|index| WireRow::pinned(1000 + 7 * index))
        .collect();
    // Buckets 0..=3: one contiguous base slice each, the second
    // empty. Base positions 2, 3, and 7 belong to no run and never
    // deliver.
    let ranges = [0_u32..1, 1..1, 4..7, 8..10]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    // Stride 2 over nine types, with type 8's bit in the second byte.
    let t0 = [0_u32, 5, 9].map(BasePosition::from_u32);
    let t1_dense = dense_set(10, &[3, 5]);
    let t3 = [4_u32].map(BasePosition::from_u32);
    let t7 = [6_u32, 8].map(BasePosition::from_u32);
    let t8 = [9_u32].map(BasePosition::from_u32);
    let empty: [BasePosition; 0] = [];
    let masks = [
        Membership::List(&t0),
        Membership::Dense(&t1_dense),
        Membership::List(&empty),
        Membership::List(&t3),
        Membership::List(&empty),
        Membership::List(&empty),
        Membership::List(&empty),
        Membership::List(&t7),
        Membership::List(&t8),
    ];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x33; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 1, x: 1, y: 0 },
            mode: Mode::Total,
            visible: 6,
            first_bucket: 0,
            runs: &[1, 0, 3, 2],
            global: None,
            children: 0,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: Some(&masks),
        trailer: None,
    };
    let bytes = response.encode();

    // Delivered order 0, 4, 5, 6, 8, 9:
    // t0 | t3 | t0+t1 | t7 | t7 | t0+t8.
    let expected_mask = [
        0x01_u8, 0x00, 0x08, 0x00, 0x03, 0x00, 0x80, 0x00, 0x80, 0x00, 0x01, 0x01,
    ];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G3 masks must match the encoder",
    );

    let sidecar = tile_sidecar(
        "g3-total-tile",
        &response,
        &bytes,
        9,
        Some(&expected_mask),
        None,
        &Value::Null,
    );
    Fixture {
        name: "g3-total-tile",
        bytes,
        sidecar,
    }
}

/// G4.
///
/// The empty root - zero delivered, present-empty columns at one shared offset, `TYPE_MASK` absent,
/// zero children, and the required global map with `visibleAtZoom = 0` and bounds absent - the
/// bounds-absent-iff-empty rule, pinned.
fn g4_empty_root() -> Fixture {
    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x44; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            visible: 0,
            first_bucket: 0,
            runs: &[0, 0, 0],
            global: Some(GlobalHead {
                visible: 0,
                bounds: None,
                min_resolution: 0,
            }),
            children: 0,
        },
        delivered: DeliveredSet::Ranges(&[]),
        positions: IdSlice::from_raw(&[]),
        rows: IdSlice::from_raw(&[]),
        masks: None,
        trailer: None,
    };
    let bytes = response.encode();

    let sidecar = tile_sidecar(
        "g4-empty-root",
        &response,
        &bytes,
        0,
        None,
        None,
        &Value::Null,
    );
    Fixture {
        name: "g4-empty-root",
        bytes,
        sidecar,
    }
}

/// G5.
///
/// A delta trailer tile - labels and icons with null entries and non-ASCII UTF-8 (multi-byte
/// sequences and a combining mark), children bits 0 and 2.
fn g5_trailer_tile() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..8)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.125, -0.25),
                f32::from(index).mul_add(-0.25, 0.5),
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..8)
        .map(|index| WireRow::pinned(11 * index + 5))
        .collect();
    let ranges = [2_u32..6]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    let labels = [
        Label::new("Z\u{fc}rich"),
        Label::empty(),
        Label::new("e\u{301}"),
        Label::new("\u{1f980}"),
    ];
    let icons = [
        Icon::empty(),
        Icon::new("\u{6c34}\u{6238}"),
        Icon::new("\u{2192}"),
        Icon::empty(),
    ];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x55; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 1, x: 1, y: 0 },
            mode: Mode::Delta,
            visible: 8,
            first_bucket: 3,
            runs: &[4],
            global: None,
            children: 0b0101,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: None,
        trailer: Some(TileTrailer {
            labels: &labels,
            icons: &icons,
        }),
    };
    let bytes = response.encode();

    let sidecar = tile_sidecar(
        "g5-trailer-tile",
        &response,
        &bytes,
        0,
        None,
        None,
        &Value::Null,
    );
    Fixture {
        name: "g5-trailer-tile",
        bytes,
        sidecar,
    }
}

/// G6: an edges response - three columns.
///
/// `complete = false` (the cap flag is the point) and `EDGE_IDS` as raw identity records ascending
/// per the delivery-order pin, so the fixture matches the ratified contract rather than structure
/// alone. The interned detail trailer holds the type table plus labels with nulls and first-type
/// references including a store-absent `null`.
fn g6_edges() -> Fixture {
    let link_labels = [
        Label::new("\u{153}uvre"),
        Label::new("created by"),
        Label::empty(),
    ];
    let type_table = ["https://t.test/authored/v/1", "https://t.test/cites/v/2"].map(Cow::Borrowed);
    let link_type_ids = [Some(TableIndex::new(1)), Some(TableIndex::new(0)), None];
    let edge_ids = [
        identity_of(0xA0, 0xA1),
        identity_of(0xB0, 0xB1),
        identity_of(0xC0, 0xC1),
    ];

    let response = EdgesResponse {
        generation: Sha256Digest::from_bytes_unchecked([0x66; 32]),
        variant: 0,
        complete: false,
        sources: &[4, 4, 9].map(WireRow::pinned),
        targets: &[11, 7, 2].map(WireRow::pinned),
        edge_ids: &edge_ids,
        trailer: Some(EdgesTrailer {
            type_table: IdSlice::from_raw(&type_table),
            link_labels: &link_labels,
            link_type_ids: &link_type_ids,
        }),
    };
    let bytes = response.encode();

    let sidecar = json!({
        "golden": "g6-edges",
        "layer": "edges",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": {
            "generation": response.generation.to_string(),
            "variant": response.variant,
            "count": 3,
            "complete": false,
            "trailer": true,
        },
        "sources": response.sources,
        "targets": response.targets,
        "edgeIds": identities_sidecar(&edge_ids),
        "trailer": {
            "typeTable": type_table,
            "linkLabels": details_sidecar(&link_labels),
            "linkTypeIds": link_type_ids.map(|entry| entry.map(Id::as_u32)),
        },
    });

    Fixture {
        name: "g6-edges",
        bytes,
        sidecar,
    }
}

/// G7's detail-trailer pins.
struct G7Trailer {
    /// The type intern table, bytewise-sorted.
    type_table: [Cow<'static, str>; 3],
    /// The property intern table, bytewise-sorted.
    property_table: [Cow<'static, str>; 4],
    /// The source's property map, covering text, a negative integer, a double, and a boolean.
    source_map: [(TableIndex, PropertyValue<'static>); 4],
    /// One edge's property map, covering a positive integer, an explicit `null`, and a negative
    /// double.
    link_map: [(TableIndex, PropertyValue<'static>); 3],
    /// Node labels: non-ASCII, an empty label (a wire `null`), an astral plane character, a
    /// combining mark.
    labels: [&'static Label; 4],
    /// Each node's first direct type as a type-table index, one store-absent `null` among them.
    type_ids: [Option<TableIndex>; 4],
    /// Link labels: non-ASCII, an empty label (a wire `null`), ASCII.
    link_labels: [&'static Label; 3],
    /// Each edge's direct types as type-table indexes, one list empty.
    ///
    /// Canonical direct-type order is the store's, never sorted: the first list pins a descending
    /// pair on purpose.
    link_type_ids: [Vec<TableIndex>; 3],
    /// The delivered edges whose type list is complete.
    link_type_ids_complete: Box<DenseBitSlice<EdgeSlot>>,
    /// The delivered edges whose property map is complete.
    link_properties_complete: Box<DenseBitSlice<EdgeSlot>>,
}

/// Builds G7's detail-trailer pins.
fn g7_trailer() -> G7Trailer {
    G7Trailer {
        type_table: [
            "https://t.test/authored/v/1",
            "https://t.test/person/v/3",
            "https://t.test/work/v/2",
        ]
        .map(Cow::Borrowed),
        property_table: [
            "https://x.test/age/",
            "https://x.test/name/",
            "https://x.test/ok/",
            "https://x.test/score/",
        ]
        .map(Cow::Borrowed),
        source_map: [
            (TableIndex::new(0), PropertyValue::Integer(-3)),
            (TableIndex::new(1), PropertyValue::Text("Ada")),
            (TableIndex::new(2), PropertyValue::Boolean(true)),
            (TableIndex::new(3), PropertyValue::Float(0.5)),
        ],
        link_map: [
            (TableIndex::new(0), PropertyValue::Integer(977)),
            (TableIndex::new(1), PropertyValue::Null),
            (TableIndex::new(3), PropertyValue::Float(-2.5)),
        ],
        labels: [
            Label::new("Caf\u{e9}"),
            Label::empty(),
            Label::new("\u{1d50a}"),
            Label::new("e\u{301}"),
        ],
        type_ids: [
            Some(TableIndex::new(1)),
            None,
            Some(TableIndex::new(2)),
            Some(TableIndex::new(0)),
        ],
        link_labels: [
            Label::new("\u{153}uvre"),
            Label::empty(),
            Label::new("cites"),
        ],
        link_type_ids: [
            vec![TableIndex::new(1), TableIndex::new(0)],
            vec![TableIndex::new(0)],
            Vec::new(),
        ],
        // Slot 0's type list is complete, and slots 0 and 2 carry whole property maps, over the
        // three delivered edges.
        link_type_ids_complete: dense_set(3, &[0]),
        link_properties_complete: dense_set(3, &[0, 2]),
    }
}

/// G7.
///
/// A locate response - the source first over an arbitrary delivered list (nothing contiguous),
/// `TYPE_MASK` probed per point, `complete = false` (the locate edge cap flag is the point), and
/// both source completeness flags exercised in opposite states.
///
/// The full detail trailer holds both intern tables, labels with nulls and non-ASCII, node
/// first-type references including a `null`, the property maps covering every scalar value shape
/// between them (text, positive and negative integers, doubles, booleans, explicit null), link type
/// lists in non-ascending canonical order with an empty entry, link property maps covering map,
/// `null`, and empty shapes, and both completeness bitmasks. The trailer's own pins live in
/// [`G7Trailer`].
fn g7_locate() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..8)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.25, -0.875),
                f32::from(index).mul_add(-0.125, 0.5),
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..8)
        .map(|index| WireRow::pinned(10 * index + 1))
        .collect();
    // Source at base position 6, then partners ascending by wire row id per the delivery pin. Row
    // 61 comes first, then 11 < 21 < 41, so the fixture matches the ratified order, not the
    // envelope structure alone.
    let delivered = [6_u32, 1, 2, 4].map(BasePosition::from_u32);

    // type 0: list members at 1 and 6; type 1: dense bit at 4 over
    // N = 8. Delivered order 6, 1, 2, 4:
    // t0 | t0 | none | t1.
    let t0 = [1_u32, 6].map(BasePosition::from_u32);
    let t1_dense = dense_set(8, &[4]);
    let masks = [Membership::List(&t0), Membership::Dense(&t1_dense)];

    let trailer = g7_trailer();
    let link_properties: [Option<&[(TableIndex, PropertyValue<'_>)]>; 3] =
        [Some(&trailer.link_map), None, Some(&[])];
    let edge_ids = [
        identity_of(0xD0, 0xD1),
        identity_of(0xE0, 0xE1),
        identity_of(0xF0, 0xF1),
    ];

    let response = LocateResponse {
        generation: Sha256Digest::from_bytes_unchecked([0x77; 32]),
        variant: 0,
        cell: TileCoordinate { z: 3, x: 5, y: 2 },
        complete: false,
        entity_id: identity_of(0x42, 0x24),
        type_ids_complete: true,
        properties_complete: false,
        delivered: &delivered,
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: Some(&masks),
        sources: &[61, 41, 21].map(WireRow::pinned),
        targets: &[11, 61, 41].map(WireRow::pinned),
        edge_ids: &edge_ids,
        trailer: LocateTrailer {
            type_table: IdSlice::from_raw(&trailer.type_table),
            property_table: IdSlice::from_raw(&trailer.property_table),
            labels: &trailer.labels,
            type_ids: &trailer.type_ids,
            properties: Some(&trailer.source_map),
            link_labels: &trailer.link_labels,
            link_type_ids: &trailer.link_type_ids,
            link_type_ids_complete: &trailer.link_type_ids_complete,
            link_properties: &link_properties,
            link_properties_complete: &trailer.link_properties_complete,
        },
    };
    let bytes = response.encode();

    let expected_mask = [0b01_u8, 0b01, 0b00, 0b10];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G7 masks must match the encoder",
    );

    let sidecar = locate_sidecar(
        "g7-locate",
        &response,
        &bytes,
        &expected_mask,
        &g7_properties_sidecar(),
        &g7_link_properties_sidecar(),
    );
    Fixture {
        name: "g7-locate",
        bytes,
        sidecar,
    }
}

/// Renders G7's source property map.
///
/// Property values ride the sidecar as plain JSON: every pinned double is exactly representable,
/// and none renders integral, so the number forms stay unambiguous (`serde_json` round-trips
/// `f64`).
fn g7_properties_sidecar() -> Value {
    json!({
        "https://x.test/age/": -3,
        "https://x.test/name/": "Ada",
        "https://x.test/ok/": true,
        "https://x.test/score/": 0.5,
    })
}

/// Renders G7's per-edge link property maps: a populated map, `null`, and an empty map.
fn g7_link_properties_sidecar() -> Value {
    json!([
        {
            "https://x.test/age/": 977,
            "https://x.test/name/": Value::Null,
            "https://x.test/score/": -2.5,
        },
        Value::Null,
        {},
    ])
}

/// Renders a locate fixture's sidecar.
///
/// Prefix, directory, decoded `HEAD`, gathered columns, and the detail trailer. The property maps
/// arrive pre-rendered because the fixture itself pins their JSON forms alongside the wire values.
/// The completeness bitmasks render as their logical boolean lists.
fn locate_sidecar(
    name: &str,
    response: &LocateResponse<'_>,
    bytes: &[u8],
    type_mask: &[u8],
    properties: &Value,
    link_properties: &Value,
) -> Value {
    let mut positions_bits = Vec::new();
    let mut row_ids = Vec::new();
    for &position in response.delivered {
        let point = response.positions[position];
        positions_bits.push(point.x().to_bits());
        positions_bits.push(point.y().to_bits());
        row_ids.push(response.rows[position]);
    }

    let trailer = &response.trailer;
    json!({
        "golden": name,
        "layer": "locate",
        "prefix": prefix_sidecar(bytes),
        "directory": directory_sidecar(bytes),
        "head": {
            "generation": response.generation.to_string(),
            "variant": response.variant,
            "count": response.delivered.len(),
            "zoom": response.cell.z,
            "cell": [response.cell.z, response.cell.x, response.cell.y],
            "edges": response.sources.len(),
            "complete": response.complete,
            "entityId": identities_sidecar(&[response.entity_id]).remove(0),
            "typeIdsComplete": response.type_ids_complete,
            "propertiesComplete": response.properties_complete,
        },
        "positions": positions_bits,
        "rowIds": row_ids,
        "typeMask": type_mask,
        "sources": response.sources,
        "targets": response.targets,
        "edgeIds": identities_sidecar(response.edge_ids),
        "trailer": {
            "typeTable": trailer.type_table.as_raw(),
            "propertyTable": trailer.property_table.as_raw(),
            "labels": details_sidecar(trailer.labels),
            "typeIds": trailer
                .type_ids
                .iter()
                .map(|entry| entry.map(Id::as_u32))
                .collect::<Vec<_>>(),
            "properties": properties,
            "linkLabels": details_sidecar(trailer.link_labels),
            "linkTypeIds": trailer
                .link_type_ids
                .iter()
                .map(|list| list.iter().copied().map(Id::as_u32).collect::<Vec<_>>())
                .collect::<Vec<_>>(),
            "linkTypeIdsComplete": flag_row(trailer.link_type_ids_complete),
            "linkProperties": link_properties,
            "linkPropertiesComplete": flag_row(trailer.link_properties_complete),
        },
    })
}

/// Renders one completeness set as the sidecar's bool row.
fn flag_row(flags: &DenseBitSlice<EdgeSlot>) -> Vec<bool> {
    (0..flags.domain_size())
        .map(|edge| flags.contains(EdgeSlot::from_u64(edge)))
        .collect()
}

/// Builds the dense membership set over `domain` rows admitting exactly `members`.
fn dense_set<T: Id>(domain: usize, members: &[u32]) -> Box<DenseBitSlice<T>> {
    let mut set = DenseBitSlice::new_empty(domain);
    for &member in members {
        set.insert(T::from_u32(member));
    }
    set
}

/// Builds one hand-pinned identity: sixteen web bytes then sixteen entity bytes.
fn identity_of(web: u8, entity: u8) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: uuid::Uuid::from_bytes([web; 16]).into(),
        entity_uuid: uuid::Uuid::from_bytes([entity; 16]).into(),
    }
}

/// Renders one identity column as lowercase hex strings.
fn identities_sidecar(ids: &[ArchivedEntityId]) -> Vec<String> {
    use core::fmt::Write as _;

    use zerocopy::IntoBytes as _;

    ids.iter()
        .map(|id| {
            id.as_bytes()
                .iter()
                .fold(String::with_capacity(64), |mut hex, byte| {
                    write!(hex, "{byte:02x}").expect("writing to a string cannot fail");
                    hex
                })
        })
        .collect()
}

/// G8: the evolution scenario proven in advance - a slot count one past the v1 tile table.
///
/// A populated appended slot, and a populated `MASS` slot; a v1 decoder ignores both by contract,
/// so the sidecar's expectations cover only the v1 surface.
fn g8_appended_slot() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..6)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.25, -0.5),
                f32::from(index) * 0.125,
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> =
        (0..6).map(|index| WireRow::pinned(2 * index + 1)).collect();
    let ranges = [2_u32..5]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x88; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 3, x: 5, y: 2 },
            mode: Mode::Delta,
            visible: 6,
            first_bucket: 5,
            runs: &[3],
            global: None,
            children: 0b0001,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: None,
        trailer: None,
    };
    let encoded = response.encode();

    // Reassemble the same sections into a six-slot envelope with a
    // populated MASS column and one appended opaque slot.
    let mass = [7_u32, 1, 9];
    let mut mass_column = Vec::new();
    for value in mass {
        mass_column.extend_from_slice(&value.to_le_bytes());
    }
    let appended = [0xDE_u8, 0xAD, 0xBE, 0xEF, 0x01];

    let mut envelope = EnvelopeWriter::new(Kind::Tile, 6);
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 0).expect("HEAD is present")));
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 1).expect("POSITIONS is present")));
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 2).expect("ROW_IDS is present")));
    envelope.absent();
    envelope.slot(|buf| buf.extend_from_slice(&mass_column));
    envelope.slot(|buf| buf.extend_from_slice(&appended));
    let bytes = envelope.finish();

    let sidecar = tile_sidecar(
        "g8-appended-slot",
        &response,
        &bytes,
        0,
        None,
        Some(&mass),
        &json!({ "5": appended }),
    );
    Fixture {
        name: "g8-appended-slot",
        bytes,
        sidecar,
    }
}

/// G9.
///
/// Padding sweep, low widths - `HEAD` sized for pad 1, `TYPE_MASK` for pad 3, `ROW_IDS` for pad 4
/// (odd delivered).
fn g9_padding_low() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..10)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.1875, -0.75),
                f32::from(index) * 0.09375,
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..10)
        .map(|index| WireRow::pinned(5 * index + 2))
        .collect();
    let ranges = [3_u32..8]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    // Stride 1 over three types, so five mask bytes pad with 3.
    let t0 = [3_u32, 6].map(BasePosition::from_u32);
    let t1 = [4_u32, 5, 6].map(BasePosition::from_u32);
    let empty: [BasePosition; 0] = [];
    let masks = [
        Membership::List(&t0),
        Membership::List(&t1),
        Membership::List(&empty),
    ];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x99; 32]),
            variant: 0,
            // x = 1000 and visible = 1200 take two-byte arguments and
            // y = 30 a one-byte argument, sizing the HEAD to 63
            // bytes: pad 1.
            coordinate: TileCoordinate {
                z: 10,
                x: 1000,
                y: 30,
            },
            mode: Mode::Delta,
            visible: 1200,
            first_bucket: 12,
            runs: &[5],
            global: None,
            children: 0b0011,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: Some(&masks),
        trailer: None,
    };
    let bytes = response.encode();

    // Delivered positions 3..8; t0 at 3, 6; t1 at 4, 5, 6.
    let expected_mask = [0b01_u8, 0b10, 0b10, 0b11, 0b00];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G9 masks must match the encoder",
    );

    let sidecar = tile_sidecar(
        "g9-padding-low",
        &response,
        &bytes,
        3,
        Some(&expected_mask),
        None,
        &Value::Null,
    );
    Fixture {
        name: "g9-padding-low",
        bytes,
        sidecar,
    }
}

/// G10.
///
/// Padding sweep, high widths - `HEAD` sized for pad 2, `TYPE_MASK` for pad 5, two appended opaque
/// slots for pads 6 and 7.
fn g10_padding_high() -> Fixture {
    let positions: Vec<Vec2> = (0_u16..6)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(-0.125, 0.625),
                f32::from(index).mul_add(0.25, -0.5),
            )
        })
        .collect();
    let rows: Vec<WireRow<NodeRowId>> = (0..6).map(|index| WireRow::pinned(13 * index)).collect();
    let ranges = [1_u32..4]
        .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

    // One type, stride 1: three mask bytes pad with 5.
    let t0 = [2_u32, 3].map(BasePosition::from_u32);
    let masks = [Membership::List(&t0)];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0xAA; 32]),
            variant: 0,
            // x = 300 and visible = 400 take two-byte arguments and
            // y = 17 rides inline, sizing the HEAD to 62 bytes:
            // pad 2.
            coordinate: TileCoordinate {
                z: 9,
                x: 300,
                y: 17,
            },
            mode: Mode::Delta,
            visible: 400,
            first_bucket: 11,
            runs: &[3],
            global: None,
            children: 0b1000,
        },
        delivered: DeliveredSet::Ranges(&ranges),
        positions: IdSlice::from_raw(&positions),
        rows: IdSlice::from_raw(&rows),
        masks: Some(&masks),
        trailer: None,
    };
    let encoded = response.encode();

    let expected_mask = [0b0_u8, 0b1, 0b1];
    assert_eq!(
        section(&encoded, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G10 masks must match the encoder",
    );

    // Reassemble with two appended opaque slots: 10 bytes (pad 6)
    // and 9 bytes (pad 7).
    let six = [0x60_u8; 10];
    let seven = [0x70_u8; 9];

    let mut envelope = EnvelopeWriter::new(Kind::Tile, 7);
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 0).expect("HEAD is present")));
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 1).expect("POSITIONS is present")));
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 2).expect("ROW_IDS is present")));
    envelope.slot(|buf| buf.extend_from_slice(section(&encoded, 3).expect("TYPE_MASK is present")));
    envelope.absent();
    envelope.slot(|buf| buf.extend_from_slice(&six));
    envelope.slot(|buf| buf.extend_from_slice(&seven));
    let bytes = envelope.finish();

    let sidecar = tile_sidecar(
        "g10-padding-high",
        &response,
        &bytes,
        1,
        Some(&expected_mask),
        None,
        &json!({ "5": six, "6": seven }),
    );
    Fixture {
        name: "g10-padding-high",
        bytes,
        sidecar,
    }
}
