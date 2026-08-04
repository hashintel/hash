#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
#![expect(
    clippy::float_cmp,
    reason = "the format persists parameters verbatim; round trips are bit-exact contracts"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use zerocopy::IntoBytes as _;

use super::{
    FileHeader, PaddedFileHeader,
    read::{ClassifierFile, OpenClassifierError},
    write::write_regions,
};
use crate::file::region::header::HeaderError;

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(4, 6, 1.5, [0.25, -0.5, 2.0]));
    let bytes = header.as_bytes();

    // The literal length pins the layout and bounds the region slices.
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[..8], b"SALTCLSF");
    assert_eq!(&bytes[8..12], &0_u32.to_le_bytes(), "version 0");
    assert_eq!(&bytes[12..16], &0_u32.to_le_bytes(), "reserved");
    assert_eq!(&bytes[16..24], &4_u64.to_le_bytes(), "dimension");
    assert_eq!(&bytes[24..32], &6_u64.to_le_bytes(), "distance count");
    assert_eq!(&bytes[32..40], &1.5_f64.to_le_bytes(), "temperature");
    assert_eq!(&bytes[40..48], &0.25_f64.to_le_bytes(), "intercept 0");
    assert_eq!(&bytes[48..56], &(-0.5_f64).to_le_bytes(), "intercept 1");
    assert_eq!(&bytes[56..64], &2.0_f64.to_le_bytes(), "intercept 2");
    assert!(
        bytes[64..].iter().all(|&byte| byte == 0),
        "writers emit zero padding",
    );
}

#[test]
fn geometry_pads_every_region_to_page_boundaries() {
    // 4 dimensions: 3 rows are 96 bytes and each moment vector 32,
    // every region padded to one 4096-byte unit; 6 distances end the
    // file unpadded.
    let header = FileHeader::new(4, 6, 1.0, [0.0; 3]);
    assert_eq!(header.mean_offset(), Some(2 * 4096));
    assert_eq!(header.inverse_scales_offset(), Some(3 * 4096));
    assert_eq!(header.distances_offset(), Some(4 * 4096));
    assert_eq!(header.expected_file_len(), Some(4 * 4096 + 48));

    // 512 dimensions fill regions exactly: 3 rows are 12288 bytes and
    // each moment vector 4096, so every region ends on a page boundary.
    let exact = FileHeader::new(512, 0, 1.0, [0.0; 3]);
    assert_eq!(exact.mean_offset(), Some(4 * 4096));
    assert_eq!(exact.inverse_scales_offset(), Some(5 * 4096));
    assert_eq!(exact.distances_offset(), Some(6 * 4096));
    assert_eq!(exact.expected_file_len(), Some(6 * 4096));

    // Overflowing geometry matches no real file.
    let absurd = FileHeader::new(u64::MAX, u64::MAX, 1.0, [0.0; 3]);
    assert_eq!(absurd.expected_file_len(), None);
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-classifier-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

fn fixture_bytes() -> Vec<u8> {
    let coefficients = [
        &[1.0, 2.0, 3.0, 4.0][..],
        &[-1.0, -2.0, -3.0, -4.0][..],
        &[0.5, 0.25, 0.125, 0.0625][..],
    ];
    let mean = [0.0, 0.5, -0.5, 1.0];
    let inverse_scales = [1.0, 2.0, 4.0, 8.0];
    let distances = [0.0, 0.25, 0.5, 1.0, 2.0, 4.0];

    let mut bytes = Vec::new();
    write_regions(
        1.5,
        [0.25, -0.5, 2.0],
        coefficients,
        &mean,
        &inverse_scales,
        &distances,
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.clsf");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = ClassifierFile::open(&path).expect("the written file reopens");

    assert_eq!(file.dimension(), 4);
    assert_eq!(file.temperature(), 1.5);
    assert_eq!(file.intercepts(), [0.25, -0.5, 2.0]);
    assert_eq!(
        file.coefficients(),
        [
            1.0, 2.0, 3.0, 4.0, //
            -1.0, -2.0, -3.0, -4.0, //
            0.5, 0.25, 0.125, 0.0625,
        ],
    );
    assert_eq!(file.mean(), [0.0, 0.5, -0.5, 1.0]);
    assert_eq!(file.inverse_scales(), [1.0, 2.0, 4.0, 8.0]);
    assert_eq!(file.distances(), [0.0, 0.25, 0.5, 1.0, 2.0, 4.0]);
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.clsf");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        ClassifierFile::open(&undersized),
        Err(OpenClassifierError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.clsf");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        ClassifierFile::open(&foreign),
        Err(OpenClassifierError::Header(HeaderError::Invalid)),
    );

    let future = scratch("future-version.clsf");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(
        ClassifierFile::open(&future),
        Err(OpenClassifierError::Header(HeaderError::Invalid)),
    );

    let torn = scratch("torn.clsf");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(
        ClassifierFile::open(&torn),
        Err(OpenClassifierError::Length { .. }),
    );
}

#[test]
#[should_panic(expected = "one inverse scale per dimension")]
fn writer_rejects_disagreeing_regions() {
    let row = [0.0; 4];

    let mut bytes = Vec::new();
    let _result = write_regions(
        1.0,
        [0.0; 3],
        [&row, &row, &row],
        &[0.0; 4],
        &[0.0; 3],
        &[],
        &mut bytes,
    );
}
