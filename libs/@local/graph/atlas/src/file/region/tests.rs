use std::fs;

use super::{PAGE, PageMap, padded_size, write_padding, write_region};

#[test]
fn padded_sizes_round_to_the_boundary() {
    assert_eq!(padded_size(0, 8), Some(0));
    assert_eq!(padded_size(1, 1), Some(PAGE));
    assert_eq!(padded_size(512, 8), Some(PAGE));
    assert_eq!(padded_size(513, 8), Some(2 * PAGE));
    // The largest aligned size (2^64 - 4096, from 2^52 - 1 elements
    // one page wide) is representable; one element more overflows the
    // multiplication, and an unaligned size above it overflows the
    // rounding.
    assert_eq!(
        padded_size(0x000F_FFFF_FFFF_FFFF, PAGE),
        Some(0xFFFF_FFFF_FFFF_F000),
    );
    assert_eq!(padded_size(0x000F_FFFF_FFFF_FFFF + 1, PAGE), None);
    assert_eq!(padded_size(u64::MAX, 2), None);
    assert_eq!(padded_size(u64::MAX, 1), None);
}

#[test]
fn regions_pad_to_the_boundary() {
    let mut bytes = Vec::new();
    write_region(&mut bytes, &[7_u8; 5]).expect("a vector write succeeds");
    assert_eq!(bytes.len() as u64, PAGE);
    assert_eq!(&bytes[..5], &[7_u8; 5]);
    assert!(bytes[5..].iter().all(|&byte| byte == 0));
}

#[test]
fn aligned_regions_close_without_padding() {
    let mut bytes = Vec::new();
    let aligned = usize::try_from(PAGE).expect("one page fits the address space");
    write_region(&mut bytes, &vec![7_u8; aligned]).expect("a vector write succeeds");
    assert_eq!(bytes.len() as u64, PAGE);

    write_padding(&mut bytes, 0).expect("a vector write succeeds");
    assert_eq!(bytes.len() as u64, PAGE);
}

#[test]
fn streamed_regions_close_at_the_boundary() {
    let mut bytes = vec![7_u8; 10];
    write_padding(&mut bytes, 10).expect("a vector write succeeds");
    assert_eq!(bytes.len() as u64, PAGE);
    assert!(bytes[10..].iter().all(|&byte| byte == 0));
}

#[test]
fn the_map_carves_regions() {
    let path = std::env::temp_dir().join(format!(
        "hash-graph-atlas-region-map-{}",
        std::process::id()
    ));
    let mut content = vec![0_u8; usize::try_from(PAGE).expect("one page fits the address space")];
    content.extend_from_slice(&[1, 2, 3, 4]);
    fs::write(&path, &content).expect("the fixture file should write");

    let map = PageMap::open(&path).expect("the fixture file should map");
    assert_eq!(map.len(), PAGE + 4);
    assert_eq!(map.bytes().len() as u64, PAGE + 4);
    assert_eq!(
        map.header_page().expect("one page is mapped").len() as u64,
        PAGE
    );
    assert_eq!(map.region(PAGE, 4), &[1, 2, 3, 4]);
    assert_eq!(map.region(PAGE + 1, 2), &[2, 3]);

    fs::remove_file(&path).expect("the fixture file should remove");
}

#[test]
fn a_live_map_excludes_exclusive_lockers() {
    let path = std::env::temp_dir().join(format!(
        "hash-graph-atlas-region-lock-{}",
        std::process::id()
    ));
    fs::write(&path, [1, 2, 3]).expect("the fixture file should write");

    let map = PageMap::open(&path).expect("the fixture file should map");

    let writer = fs::File::open(&path).expect("the fixture file should reopen");
    assert!(
        matches!(writer.try_lock(), Err(fs::TryLockError::WouldBlock)),
        "an exclusive lock must contend with a live mapping"
    );

    drop(map);
    writer
        .try_lock()
        .expect("the exclusive lock must succeed once the mapping drops");

    fs::remove_file(&path).expect("the fixture file should remove");
}

#[test]
fn a_short_file_has_no_header_page() {
    let path = std::env::temp_dir().join(format!(
        "hash-graph-atlas-region-short-{}",
        std::process::id()
    ));
    fs::write(&path, [1, 2, 3]).expect("the fixture file should write");

    let map = PageMap::open(&path).expect("the fixture file should map");
    assert_eq!(map.len(), 3);
    assert!(map.header_page().is_none());

    fs::remove_file(&path).expect("the fixture file should remove");
}
