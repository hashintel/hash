#![expect(
    clippy::little_endian_bytes,
    reason = "the tampered header fields are pinned to the format's canonical little-endian bytes"
)]

use std::{fs, io::Write as _};

use camino::Utf8PathBuf;

use super::{
    EdgeWidth, FileHeader,
    read::{AdjacencyFile, OpenAdjacencyError},
    write,
};

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-adjacency-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("the scratch directory should create");
    dir
}

/// The three-node fixture: edge 0 from node 0 to node 1, edge 1 a
/// self-loop at node 2.
///
/// Fenceposts by hand: node 0 owns out `[0, 1)` and in `[1, 1)`, node 1
/// owns out `[1, 1)` and in `[1, 2)`, node 2 owns out `[2, 3)` and in
/// `[3, 4)`.
const FENCEPOSTS: [u64; 7] = [0, 1, 1, 1, 2, 3, 4];
const VALUES: [u64; 4] = [0, 0, 1, 1];

fn write_fixture(path: impl AsRef<camino::Utf8Path>, width: EdgeWidth) {
    let mut file = fs::File::create(path.as_ref()).expect("the fixture file should create");
    write::write_lists(&FENCEPOSTS, &VALUES, width, &mut file)
        .expect("the fixture lists should write");
    file.flush().expect("the fixture file should flush");
}

#[test]
fn geometry_is_page_aligned() {
    let header = FileHeader::new(3, 2, EdgeWidth::U32);

    assert_eq!(size_of::<FileHeader>(), 4096);
    assert_eq!(header.fencepost_count(), Some(7));
    // Seven 8-byte fenceposts pad to one region unit.
    assert_eq!(header.values_offset(), Some(8192));
    assert_eq!(header.expected_file_len(), Some(8192 + 4 * 4));
}

#[test]
fn overflowing_geometry_matches_no_file() {
    let header = FileHeader::new(u64::MAX, u64::MAX, EdgeWidth::U64);

    assert_eq!(header.fencepost_count(), None);
    assert_eq!(header.values_offset(), None);
    assert_eq!(header.expected_file_len(), None);
}

#[test]
fn the_width_follows_the_edge_count() {
    assert_eq!(EdgeWidth::for_edges(0), EdgeWidth::U32);
    assert_eq!(EdgeWidth::for_edges(u64::from(u32::MAX)), EdgeWidth::U32);
    assert_eq!(
        EdgeWidth::for_edges(u64::from(u32::MAX) + 1),
        EdgeWidth::U64
    );
}

#[test]
fn lists_round_trip_at_both_widths() {
    let dir = scratch("round-trip");

    for (width, name) in [
        (EdgeWidth::U32, "narrow.adjc"),
        (EdgeWidth::U64, "wide.adjc"),
    ] {
        let path = dir.join(name);
        write_fixture(&path, width);

        let file = AdjacencyFile::open(&path).expect("the fixture file should open");
        assert_eq!(file.nodes(), 3, "{name}");
        assert_eq!(file.edges(), 2, "{name}");
        assert_eq!(file.fenceposts(), FENCEPOSTS, "{name}");

        let values = file.values();
        assert_eq!(values.len(), 4, "{name}");
        assert!(!values.is_empty(), "{name}");
        assert_eq!(values.iter().collect::<Vec<_>>(), VALUES, "{name}");
        assert_eq!(values.get(2), 1, "{name}");
        assert_eq!(
            values.slice(1..3).iter().collect::<Vec<_>>(),
            [0, 1],
            "{name}",
        );
    }
}

#[test]
fn an_empty_domain_round_trips() {
    let dir = scratch("empty");
    let path = dir.join("empty.adjc");

    let mut file = fs::File::create(&path).expect("the fixture file should create");
    write::write_lists(&[0], &[], EdgeWidth::U32, &mut file).expect("the empty lists should write");
    drop(file);

    let file = AdjacencyFile::open(&path).expect("the empty file should open");
    assert_eq!(file.nodes(), 0);
    assert_eq!(file.edges(), 0);
    assert_eq!(file.fenceposts(), [0]);
    assert!(file.values().is_empty());
}

#[test]
fn foreign_bytes_fail_to_parse() {
    let dir = scratch("foreign");
    let path = dir.join("adjacency.adjc");
    write_fixture(&path, EdgeWidth::U32);
    let valid = fs::read(&path).expect("the fixture file should read");

    // Offsets into the pinned header: the magic, the version, and the
    // width, each corrupted in place.
    for (offset, name) in [(0, "magic"), (8, "version"), (12, "width")] {
        let mut tampered = valid.clone();
        tampered[offset] ^= 0xFF;
        let tampered_path = dir.join(format!("{name}.adjc"));
        fs::write(&tampered_path, &tampered).expect("the tampered file should write");

        assert!(
            matches!(
                AdjacencyFile::open(&tampered_path),
                Err(OpenAdjacencyError::Header(_)),
            ),
            "a corrupted {name} should fail the header parse",
        );
    }
}

#[test]
fn a_torn_file_is_rejected() {
    let dir = scratch("torn");
    let path = dir.join("adjacency.adjc");
    write_fixture(&path, EdgeWidth::U32);
    let valid = fs::read(&path).expect("the fixture file should read");

    let undersized = dir.join("undersized.adjc");
    fs::write(&undersized, &valid[..100]).expect("the undersized file should write");
    assert!(matches!(
        AdjacencyFile::open(&undersized),
        Err(OpenAdjacencyError::Undersized { actual: 100 }),
    ));

    let truncated = dir.join("truncated.adjc");
    fs::write(&truncated, &valid[..valid.len() - 4]).expect("the truncated file should write");
    assert!(matches!(
        AdjacencyFile::open(&truncated),
        Err(OpenAdjacencyError::Length {
            expected: Some(_),
            ..
        }),
    ));

    let oversized = dir.join("oversized.adjc");
    let mut bytes = valid;
    bytes.extend_from_slice(&[0; 4]);
    fs::write(&oversized, &bytes).expect("the oversized file should write");
    assert!(matches!(
        AdjacencyFile::open(&oversized),
        Err(OpenAdjacencyError::Length {
            expected: Some(_),
            ..
        }),
    ));
}

#[test]
fn an_overflowing_header_is_rejected() {
    let dir = scratch("overflow");
    let path = dir.join("adjacency.adjc");
    write_fixture(&path, EdgeWidth::U32);

    // Rewrite the node count to a value whose fencepost region
    // overflows the length equation.
    let mut bytes = fs::read(&path).expect("the fixture file should read");
    bytes[16..24].copy_from_slice(&u64::MAX.to_le_bytes());
    fs::write(&path, &bytes).expect("the tampered file should write");

    assert!(matches!(
        AdjacencyFile::open(&path),
        Err(OpenAdjacencyError::Length { expected: None, .. }),
    ));
}
