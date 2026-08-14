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

use zerocopy::IntoBytes as _;

use super::{
    FileHeader, PaddedFileHeader, PolicyRow,
    read::{OpenPolicyError, PolicyFile},
    write::write_rows,
};
use crate::file::region::{header::HeaderError, machine::Machine};

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(3));
    let bytes = header.as_bytes();

    // The literal length pins the layout and bounds the region slice.
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[..8], b"SALTPLCY");
    assert_eq!(&bytes[8..12], &2_u32.to_le_bytes(), "version 2");
    assert_eq!(
        &bytes[12..16],
        Machine::current().as_bytes(),
        "machine information"
    );
    assert_eq!(&bytes[16..24], &3_u64.to_le_bytes(), "policy count");
    assert!(
        bytes[24..].iter().all(|&byte| byte == 0),
        "writers emit zero padding",
    );

    assert_eq!(header.expected_file_len(), Some(4096 + 3 * 56));
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

fn fixture_row(relation: u64, coincident: f64) -> PolicyRow {
    PolicyRow {
        relation,
        attraction_coincident: coincident,
        attraction_proximal: 0.25,
        selected_coincident: coincident,
        selected_proximal: 0.5,
        applicability: 0.75,
        strength: 1.0,
        reserved: [0; 4],
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
        rows.iter().map(|row| row.relation).collect::<Vec<_>>(),
        [2, 5, 9],
    );
    assert_eq!(rows[1].attraction_coincident, 0.5);
    assert_eq!(rows[1].attraction_proximal, 0.25);
    assert_eq!(rows[1].selected_proximal, 0.5);
    assert_eq!(rows[1].applicability, 0.75);
    assert_eq!(rows[1].strength, 1.0);
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
    bytes[8..12].copy_from_slice(&3_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PolicyFile::open(&future),
        Err(OpenPolicyError::Header(HeaderError::Version {
            found: 3,
            expected: 2,
        })),
    );

    let torn = scratch("torn.plcy");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(PolicyFile::open(&torn), Err(OpenPolicyError::Length { .. }),);

    // The other byte-order bit parses and then refuses by name: the rows are stored in the
    // writer's native order, and this reader's differs. The bit lives in the machine
    // information's final byte.
    let foreign_order = scratch("foreign-order.plcy");
    let mut bytes = fixture_bytes();
    bytes[15] ^= 1;
    fs::write(&foreign_order, &bytes).expect("the scratch file is writable");
    assert_matches!(
        PolicyFile::open(&foreign_order),
        Err(OpenPolicyError::Architecture { .. }),
    );

    // The machine information's reserved bits admit every pattern, so an unknown bit alone
    // refuses nothing: relying on one is a layout-version decision.
    let reserved_bits = scratch("reserved-bits.plcy");
    let mut bytes = fixture_bytes();
    bytes[12] = 2;
    fs::write(&reserved_bits, &bytes).expect("the scratch file is writable");
    let _file = PolicyFile::open(&reserved_bits).expect("unknown machine bits still open");
}
