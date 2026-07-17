#![expect(
    clippy::float_cmp,
    reason = "bounds round-trip bit-exactly through the fixed little-endian encoding"
)]

use zerocopy::{IntoBytes as _, TryFromBytes as _, U32, U64};

use super::{FileHeader, Node};

#[test]
fn header_wire_layout() {
    let header = FileHeader::new(5, 1000, [-1.0, -2.0, 3.0, 4.0]);
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTQUAD");
    assert_eq!(bytes[8..12], 0_u32.to_le_bytes());
    assert_eq!(bytes[12..20], 5_u64.to_le_bytes());
    assert_eq!(bytes[20..28], 1000_u64.to_le_bytes());
    assert_eq!(bytes[28..32], (-1.0_f32).to_le_bytes());
    assert_eq!(bytes[40..44], 4.0_f32.to_le_bytes());
    assert!(bytes[44..].iter().all(|&byte| byte == 0));
}

#[test]
fn header_parse_pins_identity() {
    let mut bytes = [0_u8; FileHeader::SIZE];
    bytes.copy_from_slice(FileHeader::new(5, 1000, [-1.0, -2.0, 3.0, 4.0]).as_bytes());

    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.nodes(), 5);
    assert_eq!(parsed.points(), 1000);
    assert_eq!(parsed.bounds(), [-1.0, -2.0, 3.0, 4.0]);

    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    FileHeader::try_read_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    let mut wrong_version = bytes;
    wrong_version[8] = 1;
    FileHeader::try_read_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");
}

#[test]
fn node_wire_layout() {
    let node = Node {
        children: [
            U32::new(1),
            U32::new(2),
            U32::new(Node::NO_CHILD),
            U32::new(4),
        ],
        cloud: U64::new(0x2A),
        points: U32::new(256),
        reserved: [0; 4],
    };
    let bytes = node.as_bytes();
    assert_eq!(bytes.len(), 32);
    assert_eq!(bytes[0..4], 1_u32.to_le_bytes());
    assert_eq!(bytes[8..12], u32::MAX.to_le_bytes());
    assert_eq!(bytes[16..24], 0x2A_u64.to_le_bytes());
    assert_eq!(bytes[24..28], 256_u32.to_le_bytes());
    assert_eq!(bytes[28..32], [0; 4]);
}

#[test]
fn expected_file_len_is_the_single_rule() {
    let header = FileHeader::new(5, 1000, [0.0; 4]);
    assert_eq!(header.expected_file_len(), Some(4096 + 5 * 32));

    // An empty tree is exactly its header.
    let empty = FileHeader::new(0, 0, [0.0; 4]);
    assert_eq!(empty.expected_file_len(), Some(4096));

    // Overflowing geometry matches no real file.
    let huge = FileHeader::new(u64::MAX, 0, [0.0; 4]);
    assert_eq!(huge.expected_file_len(), None);
}
