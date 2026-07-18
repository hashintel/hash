use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::FileHeader;

#[test]
fn regions_follow_the_layout_equations() {
    // 4 rows of 2 neighbours: 32 column bytes pad to one page.
    let header = FileHeader::new(4, 2);
    assert_eq!(header.entries(), Some(8));
    assert_eq!(header.columns_padding(), Some(4096 - 32));
    assert_eq!(header.distances_offset(), Some(4096 + 4096));
    assert_eq!(header.expected_file_len(), Some(4096 + 4096 + 32));
}

#[test]
fn page_multiple_columns_need_no_padding() {
    // 1024 rows of 1 neighbour: exactly one page of column bytes.
    let header = FileHeader::new(1024, 1);
    assert_eq!(header.columns_padding(), Some(0));
    assert_eq!(header.distances_offset(), Some(4096 + 4096));
    assert_eq!(header.expected_file_len(), Some(4096 + 4096 + 4096));
}

#[test]
fn the_empty_table_is_the_bare_header_plus_one_boundary() {
    let header = FileHeader::new(0, 30);
    assert_eq!(header.entries(), Some(0));
    assert_eq!(header.columns_padding(), Some(0));
    assert_eq!(header.distances_offset(), Some(4096));
    assert_eq!(header.expected_file_len(), Some(4096));
}

#[test]
fn overflowing_geometry_matches_no_file() {
    let header = FileHeader::new(u64::MAX, 2);
    assert_eq!(header.entries(), None);
    assert_eq!(header.columns_padding(), None);
    assert_eq!(header.distances_offset(), None);
    assert_eq!(header.expected_file_len(), None);
}

#[test]
fn parsing_pins_the_magic() {
    let header = FileHeader::new(4, 2);
    let mut bytes = header.as_bytes().to_vec();
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("the emitted header parses");
    assert_eq!(parsed.rows(), 4);
    assert_eq!(parsed.neighbours(), 2);

    bytes[0] ^= 0x01;
    FileHeader::try_read_from_bytes(&bytes).expect_err("a foreign magic fails the pinned parse");
}
