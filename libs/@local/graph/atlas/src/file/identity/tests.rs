#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
#![expect(
    clippy::big_endian_bytes,
    reason = "big-endian id fixtures sort byte-wise like their numeric values"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use zerocopy::IntoBytes as _;

use super::{
    FileHeader, PaddedFileHeader,
    read::{IdentityFile, OpenIdentityError},
    write::{stride_for, write_regions},
};
use crate::file::region::header::HeaderError;

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(4, 7, 512));
    let bytes = header.as_bytes();

    // The literal length pins the layout and bounds the region slices.
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[..8], b"SALTIDNT");
    assert_eq!(&bytes[8..12], &0_u32.to_le_bytes(), "version 0");
    assert_eq!(&bytes[12..16], &4_u32.to_le_bytes(), "key width");
    assert_eq!(&bytes[16..24], &7_u64.to_le_bytes(), "row count");
    assert_eq!(&bytes[24..28], &512_u32.to_le_bytes(), "index stride");
    assert!(
        bytes[28..].iter().all(|&byte| byte == 0),
        "writers emit zero padding",
    );
}

#[test]
fn geometry_pads_every_region_to_page_boundaries() {
    // 7 four-byte ids are 28 bytes, padded to one 4096-byte unit; one
    // index key (stride 512 covers all 7 pairs) is 4 bytes, padded
    // likewise. The trailing 7 pairs of 12 bytes end the file unpadded.
    let header = FileHeader::new(4, 7, 512);
    assert_eq!(header.index_keys(), Some(1));
    assert_eq!(header.index_offset(), Some(8192));
    assert_eq!(header.pairs_offset(), Some(12288));
    assert_eq!(header.expected_file_len(), Some(12288 + 7 * 12));

    // 1024 four-byte ids fill exactly one region unit: no padding. The
    // stride of 512 needs two index keys.
    let exact = FileHeader::new(4, 1024, 512);
    assert_eq!(exact.index_keys(), Some(2));
    assert_eq!(exact.index_offset(), Some(4096 + 4096));

    // Degenerate parameters match no real file.
    assert_eq!(FileHeader::new(0, 7, 512).expected_file_len(), None);
    assert_eq!(FileHeader::new(4, 7, 0).expected_file_len(), None);
    assert_eq!(
        FileHeader::new(u32::MAX, u64::MAX, 1).expected_file_len(),
        None,
    );
}

#[test]
fn stride_fills_one_page_of_pairs() {
    // 8-byte ids make 16-byte pairs: 256 per 4096-byte page.
    assert_eq!(stride_for(8), 256);
    // 32-byte ids make 40-byte pairs: 102 per page, floor division.
    assert_eq!(stride_for(32), 102);
    // Ids wider than a page still index every pair.
    assert_eq!(stride_for(8192), 1);
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-identity-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

// Four-byte ids in row order; ascending id-byte order is rows 2, 0, 1.
const IDS: [[u8; 4]; 3] = [[9, 0, 0, 1], [9, 0, 0, 2], [3, 7, 7, 7]];
const ORDER: [u64; 3] = [2, 0, 1];

fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    write_regions(4, IDS.as_flattened(), &ORDER, &mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.idnt");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = IdentityFile::open(&path).expect("the written file reopens");

    assert_eq!(file.key_width(), 4);
    assert_eq!(file.rows(), 3);
    assert_eq!(file.stride(), stride_for(4));

    // The id column is the input verbatim, in row order.
    assert_eq!(file.ids(), IDS.as_flattened());

    // One stride covers all three pairs, so the index holds the
    // smallest id.
    assert_eq!(file.index_keys(), [3, 7, 7, 7]);

    // Pairs are (id, row LE), ascending by id bytes.
    assert_eq!(
        file.pairs(),
        [
            [3, 7, 7, 7].as_slice(),
            &2_u64.to_le_bytes(),
            &[9, 0, 0, 1],
            &0_u64.to_le_bytes(),
            &[9, 0, 0, 2],
            &1_u64.to_le_bytes(),
        ]
        .concat(),
    );
}

#[test]
fn empty_table_reopens() {
    // A zero count is valid geometry: three empty regions.
    let path = scratch("empty.idnt");
    let mut bytes = Vec::new();
    write_regions(4, &[], &[], &mut bytes).expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = IdentityFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.rows(), 0);
    assert!(file.ids().is_empty());
    assert!(file.index_keys().is_empty());
    assert!(file.pairs().is_empty());
}

#[test]
fn index_keys_delimit_strides_across_pages() {
    // 8-byte ids stride at 256 pairs: 600 rows need 3 index keys, and
    // key `i` is the id of pair `i · 256`. Big-endian bytes sort like
    // the numbers themselves, so the identity permutation is the
    // ascending order.
    let ids: Vec<[u8; 8]> = (0..600_u64).map(u64::to_be_bytes).collect();
    let order: Vec<u64> = (0..600).collect();

    let path = scratch("strided.idnt");
    let mut bytes = Vec::new();
    write_regions(8, ids.as_flattened(), &order, &mut bytes)
        .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = IdentityFile::open(&path).expect("the written file reopens");
    assert_eq!(file.stride(), 256);
    assert_eq!(
        file.index_keys(),
        [
            0_u64.to_be_bytes().as_slice(),
            &256_u64.to_be_bytes(),
            &512_u64.to_be_bytes(),
        ]
        .concat(),
    );
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.idnt");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&undersized),
        Err(OpenIdentityError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.idnt");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&foreign),
        Err(OpenIdentityError::Header(_)),
    );

    let future = scratch("future-version.idnt");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&future),
        Err(OpenIdentityError::Header(_)),
    );

    let torn = scratch("torn.idnt");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&torn),
        Err(OpenIdentityError::Length { .. }),
    );

    // A zero width or stride in an otherwise intact header matches no
    // real file length.
    let zero_width = scratch("zero-width.idnt");
    let mut bytes = fixture_bytes();
    bytes[12..16].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&zero_width, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&zero_width),
        Err(OpenIdentityError::Length { expected: None, .. }),
    );

    let zero_stride = scratch("zero-stride.idnt");
    let mut bytes = fixture_bytes();
    bytes[24..28].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&zero_stride, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&zero_stride),
        Err(OpenIdentityError::Length { expected: None, .. }),
    );
}

#[test]
#[should_panic(expected = "one order entry per whole id")]
fn writer_rejects_disagreeing_regions() {
    let mut bytes = Vec::new();
    let _result = write_regions(4, IDS.as_flattened(), &[0, 1], &mut bytes);
}
