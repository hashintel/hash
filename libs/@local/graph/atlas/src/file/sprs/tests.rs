use sprs::CsMatI;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    ArrayShape, ArrayVariant, Dim, FileHeader, IndexVariant,
    read::{OpenSprsError, SprsFile, SprsMatrixError},
    write::write_matrix,
};

fn matrix_shape(rows: u64, columns: u64) -> ArrayShape {
    ArrayShape::new(&[Dim::new(rows), Dim::new(columns)])
        .expect("two dimensions fit the maximum shape rank")
}

/// A 3 x 3 CSR matrix with two entries per row.
fn fixture() -> CsMatI<f32, u32, u64> {
    CsMatI::new(
        (3, 3),
        vec![0, 2, 4, 6],
        vec![1, 2, 0, 2, 0, 1],
        vec![0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
    )
}

#[test]
fn regions_follow_the_layout_equations() {
    // 4 x 4, 8 entries: 40 pointer bytes and 32 index bytes each pad
    // to one page.
    let header = FileHeader::new(
        ArrayVariant::F32,
        IndexVariant::U32,
        IndexVariant::U64,
        matrix_shape(4, 4),
        8,
    );
    assert_eq!(header.indices_offset(), Some(4096 + 4096));
    assert_eq!(header.values_offset(), Some(4096 + 4096 + 4096));
    assert_eq!(header.expected_file_len(), Some(4096 + 4096 + 4096 + 32));
}

#[test]
fn narrow_elements_shrink_the_regions() {
    // 1023 rows of u16 pointers: 2048 pointer bytes, exactly half a
    // page, still pad to one.
    let header = FileHeader::new(
        ArrayVariant::U8,
        IndexVariant::U16,
        IndexVariant::U16,
        matrix_shape(1023, 7),
        4096,
    );
    assert_eq!(header.indices_offset(), Some(4096 + 4096));
    // 4096 u16 indices fill two pages exactly.
    assert_eq!(header.values_offset(), Some(4096 + 4096 + 8192));
    assert_eq!(header.expected_file_len(), Some(4096 + 4096 + 8192 + 4096),);
}

#[test]
fn only_matrices_describe_files() {
    let rank_one = FileHeader::new(
        ArrayVariant::F32,
        IndexVariant::U32,
        IndexVariant::U64,
        ArrayShape::new(&[Dim::new(4)]).expect("one dimension fits the maximum shape rank"),
        8,
    );
    assert_eq!(rank_one.matrix_shape(), None);
    assert_eq!(rank_one.expected_file_len(), None);

    let zero_rows = FileHeader::new(
        ArrayVariant::F32,
        IndexVariant::U32,
        IndexVariant::U64,
        matrix_shape(0, 4),
        0,
    );
    assert_eq!(zero_rows.matrix_shape(), None);
    assert_eq!(zero_rows.expected_file_len(), None);
}

#[test]
fn overflowing_geometry_matches_no_file() {
    let header = FileHeader::new(
        ArrayVariant::F32,
        IndexVariant::U64,
        IndexVariant::U64,
        matrix_shape(u64::MAX, u64::MAX),
        u64::MAX,
    );
    assert_eq!(header.expected_file_len(), None);
}

#[test]
fn parsing_pins_the_magic() {
    let header = FileHeader::new(
        ArrayVariant::F32,
        IndexVariant::U32,
        IndexVariant::U64,
        matrix_shape(4, 4),
        8,
    );
    let mut bytes = header.as_bytes().to_vec();
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("the emitted header parses");
    assert_eq!(parsed.nnz(), 8);
    assert_eq!(parsed.matrix_shape(), Some((4, 4)));

    bytes[0] ^= 0x01;
    FileHeader::try_read_from_bytes(&bytes).expect_err("a foreign magic fails the pinned parse");
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through FFI Miri cannot execute"
)]
fn a_written_matrix_reopens_as_the_same_view() {
    let dir = std::env::temp_dir().join(format!("hash-graph-atlas-sprs-{}", std::process::id()));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let matrix = fixture();
    let mut bytes = Vec::new();
    write_matrix(&matrix, &mut bytes).expect("writing to a buffer succeeds");
    let path = dir.join("matrix.sprs");
    std::fs::write(&path, &bytes).expect("the file writes");

    let file = SprsFile::open(&path).expect("the written file reopens");
    assert_eq!(file.matrix_shape(), (3, 3));
    assert_eq!(file.nnz(), 6);
    assert_eq!(file.value(), ArrayVariant::F32);
    assert_eq!(file.index(), IndexVariant::U32);
    assert_eq!(file.iptr(), IndexVariant::U64);

    let reopened = file
        .matrix::<f32, u32, u64>()
        .expect("the described element types view");
    assert_eq!(
        reopened.indptr().raw_storage(),
        matrix.indptr().raw_storage()
    );
    assert_eq!(reopened.indices(), matrix.indices());
    assert_eq!(reopened.data(), matrix.data());

    // Requesting different element types is rejected, not misread.
    assert!(matches!(
        file.matrix::<f64, u32, u64>(),
        Err(SprsMatrixError::Elements { .. }),
    ));

    // Unsorted indices within a row violate the structure at view time.
    let indices_offset = usize::try_from(
        FileHeader::new(
            ArrayVariant::F32,
            IndexVariant::U32,
            IndexVariant::U64,
            matrix_shape(3, 3),
            6,
        )
        .indices_offset()
        .expect("the fixture geometry fits u64"),
    )
    .expect("the fixture geometry fits usize");
    let mut tampered = bytes.clone();
    tampered[indices_offset..indices_offset + 8].copy_from_slice([2_u32, 1].as_bytes());
    let tampered_path = dir.join("tampered.sprs");
    std::fs::write(&tampered_path, &tampered).expect("the tampered file writes");
    let tampered_file = SprsFile::open(&tampered_path).expect("the tampered file parses");
    assert!(matches!(
        tampered_file.matrix::<f32, u32, u64>(),
        Err(SprsMatrixError::Structure(_)),
    ));

    // A truncated file contradicts the length equation.
    let truncated_path = dir.join("truncated.sprs");
    std::fs::write(&truncated_path, &bytes[..bytes.len() - 4]).expect("the short file writes");
    assert!(matches!(
        SprsFile::open(&truncated_path),
        Err(OpenSprsError::Length { .. }),
    ));

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}
