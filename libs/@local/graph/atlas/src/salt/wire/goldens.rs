//! The cross-language golden corpus: `fixtures/wire/`.
//!
//! Each golden is one encoded response checked in as fixture bytes plus a JSON sidecar of the
//! expected decoded values (floats as u32 bit patterns), the envelope prefix, and the directory -
//! so the padding sweep is assertable client-side from the sidecar alone. The Rust side proves the
//! encoder reproduces the pinned bytes; the TypeScript decoder consumes the same files and asserts
//! field-for-field equality - "matches the Rust side" is never asserted by eye
//! (`SPEC-ADDENDUM-WIRE.md` section 8). The decoder derives its request echo context from the
//! sidecar `HEAD`; a request field the `HEAD` does not echo joins the sidecar the day a golden
//! needs one (settled with Hannah, 2026-07-19 - her request-block proposal was superseded by this
//! shape the same day). The coverage spread is Hannah's, folded 2026-07-19.
//!
//! The corpus follows the addendum's enumeration; G7 (locate) joined once the locate schema was
//! ratified and its endpoint landed (2026-07-20) - pinning bytes before the schema exists would
//! have pinned an invention. The end-to-end golden over a real published generation is separate: it
//! waits on the fit-pipeline postings wiring and pins a whole artifact tree, not an envelope. Every
//! golden here uses `spanLog2 = 2`, so the cut rule reads `bucket = z + 2` and the root spans
//! buckets `0..=2`.
//!
//! Regenerate with `ATLAS_WIRE_BLESS=1` in the environment; the default run compares response bytes
//! byte-for-byte and sidecars by parsed value - the sidecar contract is structural (decoders parse
//! it, never byte-compare it), so repository JSON formatting passes over the checked-in fixtures
//! are not drift.
#![expect(
    clippy::little_endian_bytes,
    reason = "the goldens write the contract's little-endian wire integers"
)]
#![expect(
    clippy::single_range_in_vec_init,
    reason = "a delta tile's delivered set really is one contiguous range"
)]

use std::fs;

use camino::Utf8PathBuf;
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
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::mapped::Membership,
};

/// One pinned golden: fixture name, response bytes, sidecar.
struct Golden {
    name: &'static str,
    bytes: Vec<u8>,
    sidecar: Value,
}

#[test]
fn goldens_match_the_checked_in_fixtures() {
    let dir = Utf8PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/wire");
    let bless = std::env::var_os("ATLAS_WIRE_BLESS").is_some();

    for golden in corpus() {
        let bytes_path = dir.join(format!("{}.saltile", golden.name));
        let sidecar_path = dir.join(format!("{}.json", golden.name));
        let sidecar = format!(
            "{}\n",
            serde_json::to_string_pretty(&golden.sidecar).expect("sidecars are plain JSON"),
        );

        if bless {
            fs::write(&bytes_path, &golden.bytes).expect("the fixture directory is writable");
            fs::write(&sidecar_path, &sidecar).expect("the fixture directory is writable");
            continue;
        }

        let pinned = fs::read(&bytes_path).unwrap_or_else(|_| {
            panic!("{bytes_path} is missing; regenerate with ATLAS_WIRE_BLESS=1")
        });
        assert_eq!(
            golden.bytes, pinned,
            "{} bytes drifted from the pinned fixture",
            golden.name,
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
            golden.sidecar, pinned,
            "{} sidecar drifted from the pinned fixture",
            golden.name,
        );
    }
}

/// G9/G10 exist to sweep the padding widths.
///
/// Every width 1 through 7 must occur across the pair, counting the tail padding of the last
/// present slot.
#[test]
fn the_padding_sweep_covers_every_width() {
    let mut widths = [false; 8];
    for golden in [g9_padding_low(), g10_padding_high()] {
        let slots = u16::from_le_bytes(
            golden.bytes[12..14]
                .try_into()
                .expect("the prefix carries the slot count"),
        );
        for slot in 0..slots as usize {
            let (start, end) = directory(&golden.bytes, slot);
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
fn corpus() -> Vec<Golden> {
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

/// Renders a tile golden's sidecar.
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
        let point = response.positions[position as usize];
        positions_bits.push(point.x().to_bits());
        positions_bits.push(point.y().to_bits());
        row_ids.push(response.rows[position as usize]);
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

    json!({
        "golden": name,
        "layer": "tile",
        "prefix": prefix_sidecar(bytes),
        "directory": directory_sidecar(bytes),
        "head": {
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
        },
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
fn details_sidecar(entries: &[Option<&str>]) -> Value {
    Value::Array(
        entries
            .iter()
            .map(|entry| entry.map_or(Value::Null, |text| json!(text)))
            .collect(),
    )
}

/// G1.
///
/// A non-root delta tile - one run, three points, all columns, `TYPE_MASK` over three requested
/// types (stride 1, `n % 8 != 0`), a multi-bit point carrying types 0 and 2, an all-zero point, a
/// single children bit.
fn g1_minimal_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..12)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.125, -0.5),
                f32::from(index).mul_add(-0.125, 0.75),
            )
        })
        .collect();
    let rows: Vec<u32> = (0..12).map(|index| 3 * index + 7).collect();
    let ranges = [8_u32..11];

    // type 0: base positions 8 and 9 deliver; 3 and 11 lie outside
    // the run. type 1: dense representation, no delivered bit (bit 2
    // is outside the run). type 2: position 9, making point 9 the
    // multi-bit point (types 0 and 2). Point 10 matches nothing.
    let t0 = [3_u32, 8, 9, 11];
    let t1_dense = [1_u32 << 2];
    let t2 = [9_u32];
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
        positions: &positions,
        rows: &rows,
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
    Golden {
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
fn g2_root_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..4)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.25, -0.875),
                f32::from(index).mul_add(0.125, -0.5),
            )
        })
        .collect();
    let rows: Vec<u32> = (0..4).map(|index| 90 - 10 * index).collect();
    // The root's runs are bucket fencepost differences; its delivered
    // set is one contiguous range.
    let ranges = [0_u32..3];

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
        positions: &positions,
        rows: &rows,
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
    Golden {
        name: "g2-root-tile",
        bytes,
        sidecar,
    }
}

/// G3.
///
/// A total tile - four runs from bucket 0 with a zero-length run interspersed, bucket-major
/// concatenation, nine requested types (two-byte mask stride), zero children.
fn g3_total_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..10)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(-0.1875, 0.9),
                f32::from(index) * 0.0625,
            )
        })
        .collect();
    let rows: Vec<u32> = (0..10).map(|index| 1000 + 7 * index).collect();
    // Buckets 0..=3: one contiguous base slice each, the second
    // empty. Base positions 2, 3, and 7 belong to no run and never
    // deliver.
    let ranges = [0_u32..1, 1..1, 4..7, 8..10];

    // Nine types: stride 2, type 8's bit lands in the second byte.
    let t0 = [0_u32, 5, 9];
    let t1_dense = [(1_u32 << 5) | (1 << 3)];
    let t3 = [4_u32];
    let t7 = [6_u32, 8];
    let t8 = [9_u32];
    let empty: [u32; 0] = [];
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
        positions: &positions,
        rows: &rows,
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
    Golden {
        name: "g3-total-tile",
        bytes,
        sidecar,
    }
}

/// G4.
///
/// The empty root - zero delivered, present-empty columns at one shared offset, `TYPE_MASK` absent,
/// zero children, and the required global map with `visibleAtZoom = 0` and bounds ABSENT - the
/// bounds-absent-iff-empty rule, pinned.
fn g4_empty_root() -> Golden {
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
        positions: &[],
        rows: &[],
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
    Golden {
        name: "g4-empty-root",
        bytes,
        sidecar,
    }
}

/// G5.
///
/// A delta trailer tile - labels and icons with null entries and non-ASCII UTF-8 (multi-byte
/// sequences and a combining mark), children bits 0 and 2.
fn g5_trailer_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..8)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.125, -0.25),
                f32::from(index).mul_add(-0.25, 0.5),
            )
        })
        .collect();
    let rows: Vec<u32> = (0..8).map(|index| 11 * index + 5).collect();
    let ranges = [2_u32..6];

    let labels = [
        Some("Z\u{fc}rich"),
        None,
        Some("e\u{301}"),
        Some("\u{1f980}"),
    ];
    let icons = [None, Some("\u{6c34}\u{6238}"), Some("\u{2192}"), None];

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
        positions: &positions,
        rows: &rows,
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
    Golden {
        name: "g5-trailer-tile",
        bytes,
        sidecar,
    }
}

/// G6: an edges response - three columns, `complete = false` (the cap flag is the point), the
/// four-array detail trailer with nulls. Edge rows ascend per the 6a delivery-order pin - goldens
/// conform to ratified contracts, not just structure (re-blessed 2026-07-20; the original predated
/// the pin).
fn g6_edges() -> Golden {
    let link_labels = [Some("\u{153}uvre"), Some("created by"), None];
    let link_icons = [Some("\u{1f517}"), None, None];
    let link_type_labels = [None, Some("authored"), Some("authored")];
    let link_type_icons = [None, None, None];

    let response = EdgesResponse {
        generation: Sha256Digest::from_bytes_unchecked([0x66; 32]),
        variant: 0,
        complete: false,
        sources: &[4, 4, 9],
        targets: &[11, 7, 2],
        edge_rows: &[3, 100, 205],
        trailer: Some(EdgesTrailer {
            link_labels: &link_labels,
            link_icons: &link_icons,
            link_type_labels: &link_type_labels,
            link_type_icons: &link_type_icons,
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
        "edgeRowIds": response.edge_rows,
        "trailer": {
            "linkLabels": details_sidecar(&link_labels),
            "linkIcons": details_sidecar(&link_icons),
            "linkTypeLabels": details_sidecar(&link_type_labels),
            "linkTypeIcons": details_sidecar(&link_type_icons),
        },
    });

    Golden {
        name: "g6-edges",
        bytes,
        sidecar,
    }
}

/// G7.
///
/// A locate response - the source first over an arbitrary delivered list (nothing contiguous),
/// `TYPE_MASK` probed per point, `complete = false` (the locate edge cap flag is the point), and
/// the full detail trailer: labels and icons with nulls and non-ASCII, the interned property-name
/// table shared across nodes, per-node maps covering every simple value shape (text, positive and
/// NEGATIVE integers, doubles, booleans, explicit null), a `null` unresolved entry, an empty
/// resolved map, and the four link arrays.
fn g7_locate() -> Golden {
    let positions: Vec<Vec2> = (0_u16..8)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.25, -0.875),
                f32::from(index).mul_add(-0.125, 0.5),
            )
        })
        .collect();
    let rows: Vec<u32> = (0..8).map(|index| 10 * index + 1).collect();
    // Source at base position 6, neighbours at 1, 4, 2: delivered
    // rows 61, 11, 41, 21.
    let delivered = [6_u32, 1, 4, 2];

    // type 0: list members at 1 and 6; type 1: dense bit at 4 over
    // N = 8 (one word). Delivered order 6, 1, 4, 2:
    // t0 | t0 | t1 | none.
    let t0 = [1_u32, 6];
    let t1_dense = [1_u32 << 4];
    let masks = [Membership::List(&t0), Membership::Dense(&t1_dense)];

    let names = [
        "https://x.test/age/",
        "https://x.test/name/",
        "https://x.test/ok/",
        "https://x.test/score/",
    ];
    let source_map = [
        (0, PropertyValue::Integer(-3)),
        (1, PropertyValue::Text("Ada")),
        (2, PropertyValue::Boolean(true)),
        (3, PropertyValue::Float(0.5)),
    ];
    let last_map = [
        (0, PropertyValue::Integer(977)),
        (1, PropertyValue::Null),
        (3, PropertyValue::Float(-2.5)),
    ];
    let properties: [Option<&[(u32, PropertyValue<'_>)]>; 4] =
        [Some(&source_map), None, Some(&[]), Some(&last_map)];

    let labels = [Some("Caf\u{e9}"), None, Some("\u{1d50a}"), Some("e\u{301}")];
    let icons = [Some("\u{1f980}"), None, None, Some("\u{2192}")];
    let link_labels = [Some("\u{153}uvre"), None, Some("cites")];
    let link_icons = [None, Some("\u{1f517}"), None];
    let link_type_labels = [Some("authored"), Some("authored"), None];
    let link_type_icons = [None, None, Some("\u{6c34}")];

    let response = LocateResponse {
        generation: Sha256Digest::from_bytes_unchecked([0x77; 32]),
        variant: 0,
        cell: TileCoordinate { z: 3, x: 5, y: 2 },
        complete: false,
        delivered: &delivered,
        positions: &positions,
        rows: &rows,
        masks: Some(&masks),
        sources: &[61, 41, 21],
        targets: &[11, 61, 41],
        edge_rows: &[9, 57, 300],
        trailer: Some(LocateTrailer {
            labels: &labels,
            icons: &icons,
            property_names: &names,
            properties: &properties,
            link_labels: &link_labels,
            link_icons: &link_icons,
            link_type_labels: &link_type_labels,
            link_type_icons: &link_type_icons,
        }),
    };
    let bytes = response.encode();

    let expected_mask = [0b01_u8, 0b01, 0b10, 0b00];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G7 masks must match the encoder",
    );

    // Property values ride the sidecar as plain JSON: every pinned
    // double is exactly representable, and none renders integral, so
    // the number forms stay unambiguous (serde_json round-trips f64).
    let properties_sidecar = json!([
        {
            "https://x.test/age/": -3,
            "https://x.test/name/": "Ada",
            "https://x.test/ok/": true,
            "https://x.test/score/": 0.5,
        },
        Value::Null,
        {},
        {
            "https://x.test/age/": 977,
            "https://x.test/name/": Value::Null,
            "https://x.test/score/": -2.5,
        },
    ]);

    let sidecar = locate_sidecar(
        "g7-locate",
        &response,
        &bytes,
        &expected_mask,
        &properties_sidecar,
    );
    Golden {
        name: "g7-locate",
        bytes,
        sidecar,
    }
}

/// Renders a locate golden's sidecar.
///
/// Prefix, directory, decoded `HEAD`, gathered columns, and the detail trailer. `properties`
/// arrives pre-rendered because its JSON forms are pinned alongside the wire values in the golden
/// itself.
fn locate_sidecar(
    name: &str,
    response: &LocateResponse<'_>,
    bytes: &[u8],
    type_mask: &[u8],
    properties: &Value,
) -> Value {
    let mut positions_bits = Vec::new();
    let mut row_ids = Vec::new();
    for &position in response.delivered {
        let point = response.positions[position as usize];
        positions_bits.push(point.x().to_bits());
        positions_bits.push(point.y().to_bits());
        row_ids.push(response.rows[position as usize]);
    }

    let trailer = response.trailer.as_ref().expect("G7 pins the trailer");
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
            "trailer": true,
        },
        "positions": positions_bits,
        "rowIds": row_ids,
        "typeMask": type_mask,
        "sources": response.sources,
        "targets": response.targets,
        "edgeRowIds": response.edge_rows,
        "trailer": {
            "labels": details_sidecar(trailer.labels),
            "icons": details_sidecar(trailer.icons),
            "propertyNames": trailer.property_names,
            "properties": properties,
            "linkLabels": details_sidecar(trailer.link_labels),
            "linkIcons": details_sidecar(trailer.link_icons),
            "linkTypeLabels": details_sidecar(trailer.link_type_labels),
            "linkTypeIcons": details_sidecar(trailer.link_type_icons),
        },
    })
}

/// G8: the evolution scenario proven in advance - a slot count one past the v1 tile table, a
/// populated appended slot, and a populated `MASS` slot; a v1 decoder ignores both by contract, so
/// the sidecar's expectations cover only the v1 surface.
fn g8_appended_slot() -> Golden {
    let positions: Vec<Vec2> = (0_u16..6)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.25, -0.5),
                f32::from(index) * 0.125,
            )
        })
        .collect();
    let rows: Vec<u32> = (0..6).map(|index| 2 * index + 1).collect();
    let ranges = [2_u32..5];

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
        positions: &positions,
        rows: &rows,
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
    envelope.present(section(&encoded, 0).expect("HEAD is present"));
    envelope.present(section(&encoded, 1).expect("POSITIONS is present"));
    envelope.present(section(&encoded, 2).expect("ROW_IDS is present"));
    envelope.absent();
    envelope.present(&mass_column);
    envelope.present(&appended);
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
    Golden {
        name: "g8-appended-slot",
        bytes,
        sidecar,
    }
}

/// G9.
///
/// Padding sweep, low widths - `HEAD` sized for pad 1, `TYPE_MASK` for pad 3, `ROW_IDS` for pad 4
/// (odd delivered).
fn g9_padding_low() -> Golden {
    let positions: Vec<Vec2> = (0_u16..10)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(0.1875, -0.75),
                f32::from(index) * 0.09375,
            )
        })
        .collect();
    let rows: Vec<u32> = (0..10).map(|index| 5 * index + 2).collect();
    let ranges = [3_u32..8];

    // Three types, stride 1: five mask bytes pad with 3.
    let t0 = [3_u32, 6];
    let t1 = [4_u32, 5, 6];
    let empty: [u32; 0] = [];
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
        positions: &positions,
        rows: &rows,
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
    Golden {
        name: "g9-padding-low",
        bytes,
        sidecar,
    }
}

/// G10.
///
/// Padding sweep, high widths - `HEAD` sized for pad 2, `TYPE_MASK` for pad 5, two appended opaque
/// slots for pads 6 and 7.
fn g10_padding_high() -> Golden {
    let positions: Vec<Vec2> = (0_u16..6)
        .map(|index| {
            Vec2::new(
                f32::from(index).mul_add(-0.125, 0.625),
                f32::from(index).mul_add(0.25, -0.5),
            )
        })
        .collect();
    let rows: Vec<u32> = (0..6).map(|index| 13 * index).collect();
    let ranges = [1_u32..4];

    // One type, stride 1: three mask bytes pad with 5.
    let t0 = [2_u32, 3];
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
        positions: &positions,
        rows: &rows,
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
    envelope.present(section(&encoded, 0).expect("HEAD is present"));
    envelope.present(section(&encoded, 1).expect("POSITIONS is present"));
    envelope.present(section(&encoded, 2).expect("ROW_IDS is present"));
    envelope.present(section(&encoded, 3).expect("TYPE_MASK is present"));
    envelope.absent();
    envelope.present(&six);
    envelope.present(&seven);
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
    Golden {
        name: "g10-padding-high",
        bytes,
        sidecar,
    }
}
