//! The cross-language golden corpus: `fixtures/wire/`.
//!
//! Each golden is one encoded response checked in as fixture bytes
//! plus a JSON sidecar of the expected decoded values (floats as u32
//! bit patterns). The Rust side proves the encoder reproduces the
//! pinned bytes; the TypeScript decoder consumes the same files and
//! asserts field-for-field equality against the sidecar - "matches
//! the Rust side" is never asserted by eye
//! (`SPEC-ADDENDUM-WIRE.md` section 8).
//!
//! The corpus follows the addendum's enumeration. G7 (locate) is
//! deliberately missing: the locate HEAD schema lands with the locate
//! endpoint (Track 2 step 6), and pinning bytes before the schema
//! exists would pin an invention. The end-to-end golden over a real
//! published generation is likewise separate: it waits on the
//! fit-pipeline postings wiring and pins a whole artifact tree, not
//! an envelope.
//!
//! Regenerate with `ATLAS_WIRE_BLESS=1` in the environment; the
//! default run compares byte-for-byte and fails on any drift.

use core::ops::Range;
use std::fs;

use camino::Utf8PathBuf;
use serde_json::{Value, json};

use super::{
    Kind, Mode,
    edges::{EdgesResponse, EdgesTrailer},
    envelope::EnvelopeWriter,
    tests::{directory, section},
    tile::{GlobalHead, TileCoordinate, TileHead, TileResponse, TileTrailer},
};
use crate::{
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::mapped::Membership,
};

/// One pinned golden: fixture name, response bytes, decoded sidecar.
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
        assert_eq!(
            sidecar, pinned,
            "{} sidecar drifted from the pinned fixture",
            golden.name,
        );
    }
}

/// G9/G10 exist to sweep the padding widths: every width 1 through 7
/// must occur across the pair, counting the tail padding of the last
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
        g4_empty_tile(),
        g5_trailer_tile(),
        g6_edges(),
        g8_appended_slot(),
        g9_padding_low(),
        g10_padding_high(),
    ]
}

/// Renders one prefix object for a sidecar.
fn prefix_sidecar(bytes: &[u8]) -> Value {
    let magic = core::str::from_utf8(&bytes[0..8]).expect("the magic is ASCII");
    json!({
        "magic": magic,
        "wireVersion": u16::from_le_bytes(bytes[8..10].try_into().expect("two bytes")),
        "flags": u16::from_le_bytes(bytes[10..12].try_into().expect("two bytes")),
        "slotCount": u16::from_le_bytes(bytes[12..14].try_into().expect("two bytes")),
        "reserved": u16::from_le_bytes(bytes[14..16].try_into().expect("two bytes")),
    })
}

/// Renders the directory as `[[start, end], ...]` for a sidecar.
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

/// Gathers the delivered f32 bit patterns, xy interleaved.
fn positions_sidecar(positions: &[Vec2], ranges: &[Range<u32>]) -> Value {
    let mut patterns = Vec::new();
    for range in ranges {
        for point in &positions[range.start as usize..range.end as usize] {
            patterns.push(point.x().to_bits());
            patterns.push(point.y().to_bits());
        }
    }

    json!(patterns)
}

/// Gathers the delivered row ids.
fn rows_sidecar(rows: &[u32], ranges: &[Range<u32>]) -> Value {
    let mut gathered = Vec::new();
    for range in ranges {
        gathered.extend_from_slice(&rows[range.start as usize..range.end as usize]);
    }

    json!(gathered)
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

/// Renders a tile HEAD object for a sidecar; `delivered` and
/// `trailer` mirror the encoder's derivation.
fn tile_head_sidecar(head: &TileHead<'_>, delivered: u64, trailer: bool) -> Value {
    let global = head.global.as_ref().map_or(Value::Null, |global| {
        let bounds = global.bounds.as_ref().map_or(Value::Null, |bounds| {
            json!([
                bounds.min().x().to_bits(),
                bounds.min().y().to_bits(),
                bounds.max().x().to_bits(),
                bounds.max().y().to_bits(),
            ])
        });
        json!({
            "visible": global.visible,
            "bounds": bounds,
            "minResolution": global.min_resolution,
        })
    });

    json!({
        "generation": head.generation.to_string(),
        "variant": head.variant,
        "coordinate": [head.coordinate.z, head.coordinate.x, head.coordinate.y],
        "mode": head.mode.code(),
        "delivered": delivered,
        "visible": head.visible,
        "firstBucket": head.first_bucket,
        "runs": head.runs,
        "global": global,
        "children": head.children,
        "trailer": trailer,
    })
}

/// G1: a non-root delta tile - one run, three points, all columns,
/// TYPE_MASK over three requested types, no trailer.
fn g1_minimal_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..12)
        .map(|index| {
            Vec2::new(
                f32::from(index) * 0.125 - 0.5,
                0.75 - f32::from(index) * 0.125,
            )
        })
        .collect();
    let rows: Vec<u32> = (0..12).map(|index| 3 * index + 7).collect();
    let ranges = [8_u32..11];

    // type 0: base positions 8 and 9 deliver; 3 and 11 lie outside
    // the run. type 1: dense bit 9 delivers; bit 2 lies outside.
    // type 2: no members. Expected masks: point 8 = 0b001,
    // point 9 = 0b011 (multi-bit), point 10 = 0b000 (no match).
    let list = [3_u32, 8, 9, 11];
    let dense = [(1_u32 << 9) | (1 << 2)];
    let empty: [u32; 0] = [];
    let masks = [
        Membership::List(&list),
        Membership::Dense(&dense),
        Membership::List(&empty),
    ];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x11; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 4, x: 9, y: 6 },
            mode: Mode::Delta,
            visible: 17,
            first_bucket: 7,
            runs: &[3],
            global: None,
            children: 0b0100,
        },
        ranges: &ranges,
        positions: &positions,
        rows: &rows,
        masks: Some(&masks),
        trailer: None,
    };
    let bytes = response.encode();

    let expected_mask = [0b001_u8, 0b011, 0b000];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G1 masks must match the encoder",
    );

    let sidecar = json!({
        "golden": "g1-minimal-tile",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 3, false),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": expected_mask,
        "mass": Value::Null,
        "appended": Value::Null,
        "trailer": Value::Null,
    });

    Golden {
        name: "g1-minimal-tile",
        bytes,
        sidecar,
    }
}

/// G2: the delta root - buckets `0..=m` with a zero-length run slot
/// in the middle, one contiguous multi-segment range, the required
/// global map, all four children.
fn g2_root_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..8)
        .map(|index| {
            Vec2::new(
                f32::from(index) * 0.25 - 0.875,
                f32::from(index) * 0.125 - 0.5,
            )
        })
        .collect();
    let rows: Vec<u32> = (0..8).map(|index| 90 - 10 * index).collect();
    // The root's runs are bucket fencepost differences; its delivered
    // set is one contiguous range.
    let ranges = [0_u32..7];

    // One requested type, dense representation: bits 0, 2, 4, 6.
    let dense = [0b0101_0101_u32];
    let masks = [Membership::Dense(&dense)];

    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x22; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            visible: 8,
            first_bucket: 0,
            runs: &[1, 0, 2, 4],
            global: Some(GlobalHead {
                visible: 7,
                bounds: Bounds2::new(Vec2::new(-0.875, -0.75), Vec2::new(0.9375, 0.5)),
                min_resolution: 5,
            }),
            children: 0b1111,
        },
        ranges: &ranges,
        positions: &positions,
        rows: &rows,
        masks: Some(&masks),
        trailer: None,
    };
    let bytes = response.encode();

    let expected_mask = [1_u8, 0, 1, 0, 1, 0, 1];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G2 masks must match the encoder",
    );

    let sidecar = json!({
        "golden": "g2-root-tile",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 7, false),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": expected_mask,
        "mass": Value::Null,
        "appended": Value::Null,
        "trailer": Value::Null,
    });

    Golden {
        name: "g2-root-tile",
        bytes,
        sidecar,
    }
}

/// G3: a total tile - one run per bucket, zero-length runs
/// interspersed, bucket-major concatenation, nine requested types
/// (two-byte mask stride).
fn g3_total_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..10)
        .map(|index| Vec2::new(0.9 - f32::from(index) * 0.1875, f32::from(index) * 0.0625))
        .collect();
    let rows: Vec<u32> = (0..10).map(|index| 1000 + 7 * index).collect();
    // Buckets 0..=4: one contiguous base slice each, two of them
    // empty. Base position 3 belongs to no run and never delivers.
    let ranges = [0_u32..2, 2..2, 5..8, 8..8, 9..10];

    // Nine types: stride 2, type 8's bit lands in the second byte.
    let t0 = [0_u32, 5, 9];
    let t1_dense = [(1_u32 << 5) | (1 << 3)];
    let t3 = [1_u32];
    let t7 = [6_u32, 7];
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
            coordinate: TileCoordinate { z: 2, x: 1, y: 3 },
            mode: Mode::Total,
            visible: 10,
            first_bucket: 0,
            runs: &[2, 0, 3, 0, 1],
            global: None,
            children: 0b1001,
        },
        ranges: &ranges,
        positions: &positions,
        rows: &rows,
        masks: Some(&masks),
        trailer: None,
    };
    let bytes = response.encode();

    // Delivered order 0, 1, 5, 6, 7, 9:
    // t0 | t3 | t0+t1 | t7 | t7 | t0+t8.
    let expected_mask = [
        0x01_u8, 0x00, 0x08, 0x00, 0x03, 0x00, 0x80, 0x00, 0x80, 0x00, 0x01, 0x01,
    ];
    assert_eq!(
        section(&bytes, 3).expect("TYPE_MASK is present"),
        expected_mask,
        "the hand-derived G3 masks must match the encoder",
    );

    let sidecar = json!({
        "golden": "g3-total-tile",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 6, false),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": expected_mask,
        "mass": Value::Null,
        "appended": Value::Null,
        "trailer": Value::Null,
    });

    Golden {
        name: "g3-total-tile",
        bytes,
        sidecar,
    }
}

/// G4: an empty tile - zero delivered, present-empty columns, absent
/// TYPE_MASK (the request carried no coloredTypeIds), a global map
/// whose bounds are absent because the visible set is empty.
fn g4_empty_tile() -> Golden {
    let response = TileResponse {
        head: TileHead {
            generation: Sha256Digest::from_bytes_unchecked([0x44; 32]),
            variant: 0,
            coordinate: TileCoordinate { z: 6, x: 41, y: 23 },
            mode: Mode::Delta,
            visible: 0,
            first_bucket: 9,
            runs: &[0],
            global: Some(GlobalHead {
                visible: 0,
                bounds: None,
                min_resolution: 0,
            }),
            children: 0,
        },
        ranges: &[],
        positions: &[],
        rows: &[],
        masks: None,
        trailer: None,
    };
    let bytes = response.encode();

    let sidecar = json!({
        "golden": "g4-empty-tile",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 0, false),
        "positions": [],
        "rowIds": [],
        "typeMask": Value::Null,
        "mass": Value::Null,
        "appended": Value::Null,
        "trailer": Value::Null,
    });

    Golden {
        name: "g4-empty-tile",
        bytes,
        sidecar,
    }
}

/// G5: a trailer tile - labels and icons with null entries and
/// non-ASCII UTF-8 (multi-byte sequences and a combining mark).
fn g5_trailer_tile() -> Golden {
    let positions: Vec<Vec2> = (0_u16..8)
        .map(|index| {
            Vec2::new(
                -0.25 + f32::from(index) * 0.125,
                0.5 - f32::from(index) * 0.25,
            )
        })
        .collect();
    let rows: Vec<u32> = (0..8).map(|index| 11 * index + 5).collect();
    let ranges = [0_u32..1, 3..5, 6..7];

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
            mode: Mode::Total,
            visible: 8,
            first_bucket: 0,
            runs: &[1, 2, 1],
            global: None,
            children: 0b0110,
        },
        ranges: &ranges,
        positions: &positions,
        rows: &rows,
        masks: None,
        trailer: Some(TileTrailer {
            labels: &labels,
            icons: &icons,
        }),
    };
    let bytes = response.encode();

    let sidecar = json!({
        "golden": "g5-trailer-tile",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 4, true),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": Value::Null,
        "mass": Value::Null,
        "appended": Value::Null,
        "trailer": {
            "labels": details_sidecar(&labels),
            "icons": details_sidecar(&icons),
        },
    });

    Golden {
        name: "g5-trailer-tile",
        bytes,
        sidecar,
    }
}

/// G6: an edges response - three columns, explicit `complete` in the
/// HEAD, the four-array detail trailer.
fn g6_edges() -> Golden {
    let link_labels = [Some("created by"), None, Some("\u{153}uvre")];
    let link_icons = [None, None, Some("\u{1f517}")];
    let link_type_labels = [Some("authored"), Some("authored"), None];
    let link_type_icons = [None, None, None];

    let response = EdgesResponse {
        generation: Sha256Digest::from_bytes_unchecked([0x66; 32]),
        variant: 0,
        complete: false,
        sources: &[4, 9, 4],
        targets: &[7, 2, 11],
        edge_rows: &[100, 205, 3],
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
            "variant": 0,
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

/// G8: the evolution scenario proven in advance - a slot count one
/// past the v1 tile table, a populated appended slot, and a populated
/// MASS slot; a v1 decoder ignores both by contract.
fn g8_appended_slot() -> Golden {
    let positions: Vec<Vec2> = (0_u16..6)
        .map(|index| Vec2::new(f32::from(index) * 0.25 - 0.5, f32::from(index) * 0.125))
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
            first_bucket: 6,
            runs: &[3],
            global: None,
            children: 0b0001,
        },
        ranges: &ranges,
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

    let sidecar = json!({
        "golden": "g8-appended-slot",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 3, false),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": Value::Null,
        "mass": mass,
        "appended": { "5": appended },
        "trailer": Value::Null,
    });

    Golden {
        name: "g8-appended-slot",
        bytes,
        sidecar,
    }
}

/// G9: padding sweep, low widths - HEAD sized for pad 1, TYPE_MASK
/// for pad 3, ROW_IDS for pad 4.
fn g9_padding_low() -> Golden {
    let positions: Vec<Vec2> = (0_u16..10)
        .map(|index| Vec2::new(f32::from(index) * 0.1875 - 0.75, f32::from(index) * 0.09375))
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
            // x = 1000 and visible = 1200 take two-byte arguments,
            // sizing the HEAD to 63 bytes: pad 1.
            coordinate: TileCoordinate {
                z: 10,
                x: 1000,
                y: 30,
            },
            mode: Mode::Delta,
            visible: 1200,
            first_bucket: 13,
            runs: &[5],
            global: None,
            children: 0b0011,
        },
        ranges: &ranges,
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

    let sidecar = json!({
        "golden": "g9-padding-low",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 5, false),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": expected_mask,
        "mass": Value::Null,
        "appended": Value::Null,
        "trailer": Value::Null,
    });

    Golden {
        name: "g9-padding-low",
        bytes,
        sidecar,
    }
}

/// G10: padding sweep, high widths - HEAD sized for pad 2, TYPE_MASK
/// for pad 5, two appended opaque slots for pads 6 and 7.
fn g10_padding_high() -> Golden {
    let positions: Vec<Vec2> = (0_u16..6)
        .map(|index| {
            Vec2::new(
                0.625 - f32::from(index) * 0.125,
                f32::from(index) * 0.25 - 0.5,
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
            // x = 300 and visible = 400 take two-byte arguments,
            // sizing the HEAD to 62 bytes: pad 2.
            coordinate: TileCoordinate {
                z: 9,
                x: 300,
                y: 17,
            },
            mode: Mode::Delta,
            visible: 400,
            first_bucket: 12,
            runs: &[3],
            global: None,
            children: 0b1000,
        },
        ranges: &ranges,
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

    let sidecar = json!({
        "golden": "g10-padding-high",
        "layer": "tile",
        "prefix": prefix_sidecar(&bytes),
        "directory": directory_sidecar(&bytes),
        "head": tile_head_sidecar(&response.head, 3, false),
        "positions": positions_sidecar(&positions, &ranges),
        "rowIds": rows_sidecar(&rows, &ranges),
        "typeMask": expected_mask,
        "mass": Value::Null,
        "appended": { "5": six, "6": seven },
        "trailer": Value::Null,
    });

    Golden {
        name: "g10-padding-high",
        bytes,
        sidecar,
    }
}
