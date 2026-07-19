#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]

use std::{fs, path::PathBuf};

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::{
    FileHeader,
    read::{LandmarkFile, OpenLandmarkError},
    write::write_regions,
};
use crate::math::Vec2;

#[test]
fn header_wire_layout() {
    let header = FileHeader::new(3, 7);
    let bytes = header.as_bytes();

    // The literal length pins the layout and bounds the region slices.
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[..8], b"SALTLNDM");
    assert_eq!(&bytes[8..12], &0_u32.to_le_bytes(), "version 0");
    assert_eq!(&bytes[12..16], &0_u32.to_le_bytes(), "reserved");
    assert_eq!(&bytes[16..24], &3_u64.to_le_bytes(), "landmark count");
    assert_eq!(&bytes[24..32], &7_u64.to_le_bytes(), "corpus row count");
    assert!(
        bytes[32..].iter().all(|&byte| byte == 0),
        "writers emit zero padding",
    );
}

#[test]
fn geometry_pads_every_region_to_page_boundaries() {
    // 3 rows are 24 bytes, padded to one 4096-byte unit; 7 ordinals are
    // 28 bytes, padded likewise; 3 coordinates end the file unpadded.
    let header = FileHeader::new(3, 7);
    assert_eq!(header.assignment_offset(), Some(8192));
    assert_eq!(header.coordinates_offset(), Some(12288));
    assert_eq!(header.expected_file_len(), Some(12288 + 24));

    // 512 rows fill exactly one region unit: no padding.
    let exact = FileHeader::new(512, 1024);
    assert_eq!(exact.assignment_offset(), Some(4096 + 4096));
    assert_eq!(exact.coordinates_offset(), Some(8192 + 4096));

    // Overflowing geometry matches no real file.
    let absurd = FileHeader::new(u64::MAX, u64::MAX);
    assert_eq!(absurd.expected_file_len(), None);
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-landmark-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

fn fixture_bytes() -> Vec<u8> {
    let rows = [U64::<LE>::new(2), U64::new(5), U64::new(9)];
    let assignment = [0, 0, 1, 1, 2, 2, 0].map(U32::<LE>::new);
    let coordinates = [
        Vec2::new(1.0, -2.0),
        Vec2::new(0.5, 0.25),
        Vec2::new(-8.0, 4.0),
    ];

    let mut bytes = Vec::new();
    write_regions(&rows, &assignment, &coordinates, &mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.lndm");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = LandmarkFile::open(&path).expect("the written file reopens");

    assert_eq!(file.landmarks(), 3);
    assert_eq!(file.rows(), 7);
    assert_eq!(
        file.selected_rows()
            .iter()
            .map(|row| row.get())
            .collect::<Vec<_>>(),
        [2, 5, 9],
    );
    assert_eq!(
        file.assignment()
            .iter()
            .map(|ordinal| ordinal.get())
            .collect::<Vec<_>>(),
        [0, 0, 1, 1, 2, 2, 0],
    );
    assert_eq!(
        file.coordinates(),
        [
            Vec2::new(1.0, -2.0),
            Vec2::new(0.5, 0.25),
            Vec2::new(-8.0, 4.0),
        ],
    );
}

#[test]
fn empty_skeleton_reopens() {
    // Zero counts are valid geometry: three empty regions.
    let path = scratch("empty.lndm");
    let mut bytes = Vec::new();
    write_regions(&[], &[], &[], &mut bytes).expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = LandmarkFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.landmarks(), 0);
    assert!(file.selected_rows().is_empty());
    assert!(file.assignment().is_empty());
    assert!(file.coordinates().is_empty());
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.lndm");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert!(matches!(
        LandmarkFile::open(&undersized),
        Err(OpenLandmarkError::Undersized { actual: 16 }),
    ));

    let foreign = scratch("foreign.lndm");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert!(matches!(
        LandmarkFile::open(&foreign),
        Err(OpenLandmarkError::Header(_)),
    ));

    let future = scratch("future-version.lndm");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert!(matches!(
        LandmarkFile::open(&future),
        Err(OpenLandmarkError::Header(_)),
    ));

    let torn = scratch("torn.lndm");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert!(matches!(
        LandmarkFile::open(&torn),
        Err(OpenLandmarkError::Length { .. }),
    ));
}

#[test]
#[should_panic(expected = "one coordinate per landmark")]
fn writer_rejects_disagreeing_regions() {
    let rows = [U64::<LE>::new(2), U64::new(5)];
    let coordinates = [Vec2::ZERO];

    let mut bytes = Vec::new();
    let _result = write_regions(&rows, &[], &coordinates, &mut bytes);
}
