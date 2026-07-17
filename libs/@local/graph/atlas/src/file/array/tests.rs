use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use super::{ArrayShape, ArrayVariant, Dim, FileHeader};

fn shape(dims: &[u64]) -> ArrayShape {
    let dims = dims.iter().copied().map(Dim::new).collect::<Vec<_>>();
    ArrayShape::new(&dims).expect("shape should hold at most eight dimensions")
}

fn extents(shape: &ArrayShape) -> Vec<u64> {
    shape.dims().iter().map(|dim| dim.get()).collect()
}

#[test]
fn header_wire_layout() {
    let header = FileHeader::new(ArrayVariant::F32, shape(&[1 << 18, 2]));
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTARRY");
    assert_eq!(bytes[8..12], 0_u32.to_le_bytes());
    assert_eq!(bytes[12], 0x00);
    assert_eq!(bytes[13..21], (1_u64 << 18).to_le_bytes());
    assert_eq!(bytes[21..29], 2_u64.to_le_bytes());
    assert!(bytes[29..].iter().all(|&byte| byte == 0));
}

#[test]
fn header_parse_pins_identity() {
    let valid = FileHeader::new(ArrayVariant::F32, shape(&[16]));
    let mut bytes = [0_u8; FileHeader::SIZE];
    bytes.copy_from_slice(valid.as_bytes());
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.variant(), ArrayVariant::F32);
    assert_eq!(extents(parsed.shape()), [16]);
    assert_eq!(parsed.as_bytes(), bytes);

    // Wrong magic, unsupported version, and unknown variant all fail to
    // parse at the byte level.
    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    FileHeader::try_read_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    let mut wrong_version = bytes;
    wrong_version[8] = 1;
    FileHeader::try_read_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");

    let mut wrong_variant = bytes;
    wrong_variant[12] = 0xFF;
    FileHeader::try_read_from_bytes(&wrong_variant)
        .expect_err("an unknown variant should not parse");

    // Padding is ignored, not validated.
    let mut dirty_padding = bytes;
    dirty_padding[FileHeader::SIZE - 1] = 0xAB;
    FileHeader::try_read_from_bytes(&dirty_padding).expect("padding bytes should be ignored");
}

#[test]
fn shape_is_the_longest_nonzero_prefix() {
    // The first zero terminates the shape; bytes past it are ignored.
    let raw = [3_u64, 4, 0, 7, 0, 9, 0, 0];
    let terminated = ArrayShape::read_from_bytes(raw.as_bytes())
        .unwrap_or_else(|_| panic!("every bit pattern should be a shape"));
    assert_eq!(extents(&terminated), [3, 4]);
    assert_eq!(terminated.element_count(), Some(12));

    // A leading zero is the zero-element array.
    assert_eq!(extents(&shape(&[0])), [0_u64; 0]);
    assert_eq!(shape(&[0]).element_count(), Some(0));
    assert_eq!(shape(&[0, 5]).element_count(), Some(0));
    assert_eq!(shape(&[]).element_count(), Some(0));

    // All eight slots may be dimensions.
    assert_eq!(shape(&[1; 8]).dims().len(), 8);
    assert!(ArrayShape::new(&[Dim::new(1); 9]).is_none());
}

#[test]
fn element_count_overflow_matches_no_file() {
    let huge = shape(&[u64::MAX, 2]);
    assert_eq!(huge.element_count(), None);
    let header = FileHeader::new(ArrayVariant::F32, huge);
    assert_eq!(header.byte_length(), None);
    assert_eq!(header.expected_file_len(), None);

    // The element count can fit while the byte length overflows.
    let elements_only = shape(&[1 << 62]);
    assert_eq!(elements_only.element_count(), Some(1 << 62));
    let header = FileHeader::new(ArrayVariant::F32, elements_only);
    assert_eq!(header.byte_length(), None);
}

#[test]
fn expected_file_len_is_the_single_rule() {
    let header = FileHeader::new(ArrayVariant::F32, shape(&[1 << 18, 2]));
    assert_eq!(header.byte_length(), Some(1 << 21));
    assert_eq!(header.expected_file_len(), Some(4096 + (1 << 21)));

    // A zero-element array is exactly its header.
    let empty = FileHeader::new(ArrayVariant::F32, shape(&[0]));
    assert_eq!(empty.expected_file_len(), Some(4096));
}
