use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::FileHeader;

#[test]
fn header_wire_layout() {
    let header = FileHeader::new(512, 1000);
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTMRTN");
    assert_eq!(bytes[8..12], 0_u32.to_le_bytes());
    assert_eq!(bytes[12..16], 512_u32.to_le_bytes());
    assert_eq!(bytes[16..24], 1000_u64.to_le_bytes());
    assert!(bytes[24..].iter().all(|&byte| byte == 0));
}

#[test]
fn header_parse_pins_identity() {
    let mut bytes = [0_u8; FileHeader::SIZE];
    bytes.copy_from_slice(FileHeader::new(512, 1000).as_bytes());
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.stride(), 512);
    assert_eq!(parsed.count(), 1000);

    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    FileHeader::try_read_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    let mut wrong_version = bytes;
    wrong_version[8] = 1;
    FileHeader::try_read_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

#[test]
fn region_geometry() {
    // 1000 codes at stride 512: two keys, a 16-byte index padded to one
    // page, codes at 8192, 8000 code bytes behind them.
    let header = FileHeader::new(512, 1000);
    assert_eq!(header.index_keys(), Some(2));
    assert_eq!(header.codes_offset(), Some(8192));
    assert_eq!(header.expected_file_len(), Some(8192 + 8000));

    // An empty file is exactly its header: no keys, no index page.
    let empty = FileHeader::new(512, 0);
    assert_eq!(empty.index_keys(), Some(0));
    assert_eq!(empty.codes_offset(), Some(4096));
    assert_eq!(empty.expected_file_len(), Some(4096));

    // A full stride of codes still needs exactly one key.
    let exact = FileHeader::new(512, 512);
    assert_eq!(exact.index_keys(), Some(1));

    // A zero stride and overflowing geometry match no real file.
    assert_eq!(FileHeader::new(0, 1000).index_keys(), None);
    assert_eq!(FileHeader::new(0, 1000).expected_file_len(), None);
    assert_eq!(FileHeader::new(512, u64::MAX).expected_file_len(), None);
}
