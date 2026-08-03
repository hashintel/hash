#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
#![expect(
    clippy::float_cmp,
    reason = "the format persists values verbatim; round trips are bit-exact contracts"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use zerocopy::{F32, IntoBytes as _, U64};

use super::{
    FileHeader, PaddedFileHeader, PolicyRow,
    read::{OpenPolicyError, PolicyFile},
    write::write_rows,
};
use crate::file::region::header::HeaderError;

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(3));
    let bytes = header.as_bytes();

    // The literal length pins the layout and bounds the region slice.
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[..8], b"SALTPLCY");
    assert_eq!(&bytes[8..12], &0_u32.to_le_bytes(), "version 0");
    assert_eq!(&bytes[12..16], &0_u32.to_le_bytes(), "reserved");
    assert_eq!(&bytes[16..24], &3_u64.to_le_bytes(), "policy count");
    assert!(
        bytes[24..].iter().all(|&byte| byte == 0),
        "writers emit zero padding",
    );

    assert_eq!(header.expected_file_len(), Some(4096 + 3 * 32));
    // Overflowing geometry matches no real file.
    assert_eq!(FileHeader::new(u64::MAX).expected_file_len(), None);
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-policy-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

fn fixture_row(relation: u64, coincident: f32) -> PolicyRow {
    PolicyRow {
        relation: U64::new(relation),
        attraction_coincident: F32::new(coincident),
        attraction_proximal: F32::new(0.25),
        selected_coincident: F32::new(coincident),
        selected_proximal: F32::new(0.5),
        applicability: F32::new(0.75),
        strength: F32::new(1.0),
    }
}

fn fixture_bytes() -> Vec<u8> {
    let rows = [
        fixture_row(2, 0.0),
        fixture_row(5, 0.5),
        fixture_row(9, 1.0),
    ];

    let mut bytes = Vec::new();
    write_rows(&rows, &mut bytes).expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn written_rows_reopen_verbatim() {
    let path = scratch("roundtrip.plcy");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = PolicyFile::open(&path).expect("the written file reopens");
    let rows = file.rows();

    assert_eq!(rows.len(), 3);
    assert_eq!(
        rows.iter()
            .map(|row| row.relation.get())
            .collect::<Vec<_>>(),
        [2, 5, 9],
    );
    assert_eq!(rows[1].attraction_coincident.get(), 0.5);
    assert_eq!(rows[1].attraction_proximal.get(), 0.25);
    assert_eq!(rows[1].selected_proximal.get(), 0.5);
    assert_eq!(rows[1].applicability.get(), 0.75);
    assert_eq!(rows[1].strength.get(), 1.0);
}

#[test]
fn empty_table_reopens() {
    // A zero count is valid geometry: one empty region.
    let path = scratch("empty.plcy");
    let mut bytes = Vec::new();
    write_rows(&[], &mut bytes).expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = PolicyFile::open(&path).expect("the empty file reopens");
    assert!(file.rows().is_empty());
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.plcy");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        PolicyFile::open(&undersized),
        Err(OpenPolicyError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.plcy");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(PolicyFile::open(&foreign), Err(OpenPolicyError::Header(_)),);

    let future = scratch("future-version.plcy");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(PolicyFile::open(&future), Err(OpenPolicyError::Header(_)),);

    let torn = scratch("torn.plcy");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(PolicyFile::open(&torn), Err(OpenPolicyError::Length { .. }),);
}
