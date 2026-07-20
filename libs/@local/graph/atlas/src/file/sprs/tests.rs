use core::assert_matches;

use sprs::CsMatI;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    ArrayShape, Dim, FileHeader, IndexVariant, StorageVariant, ValueTag,
    read::{OpenSprsError, SprsFile, SprsMatrixError},
    write::{WriteSprsError, write_matrix},
};

fn matrix_shape(rows: u64, columns: u64) -> ArrayShape {
    ArrayShape::new(&[Dim::new(rows), Dim::new(columns)])
        .expect("two dimensions fit the maximum shape rank")
}

fn fixture_header(nnz: u64) -> FileHeader {
    FileHeader::new(
        ValueTag::F32,
        4,
        IndexVariant::U32,
        IndexVariant::U64,
        StorageVariant::Csr,
        matrix_shape(3, 3),
        nnz,
    )
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
        ValueTag::F32,
        4,
        IndexVariant::U32,
        IndexVariant::U64,
        StorageVariant::Csr,
        matrix_shape(4, 4),
        8,
    );
    assert_eq!(header.indices_offset(), Some(4096 + 4096));
    assert_eq!(header.values_offset(), Some(4096 + 4096 + 4096));
    assert_eq!(header.expected_file_len(), Some(4096 + 4096 + 4096 + 32));
}

#[test]
fn the_compressed_dimension_spans_the_pointers() {
    // 2 x 1023: row-compressed needs 3 pointers, column-compressed
    // 1024 - exactly two pages of u64 pointers.
    let csr = FileHeader::new(
        ValueTag::F32,
        4,
        IndexVariant::U32,
        IndexVariant::U64,
        StorageVariant::Csr,
        matrix_shape(2, 1023),
        4,
    );
    let csc = FileHeader::new(
        ValueTag::F32,
        4,
        IndexVariant::U32,
        IndexVariant::U64,
        StorageVariant::Csc,
        matrix_shape(2, 1023),
        4,
    );
    assert_eq!(csr.outer_count(), Some(2));
    assert_eq!(csc.outer_count(), Some(1023));
    assert_eq!(csr.indices_offset(), Some(4096 + 4096));
    assert_eq!(csc.indices_offset(), Some(4096 + 8192));
}

#[test]
fn narrow_elements_shrink_the_regions() {
    // 1023 rows of u16 pointers: 2048 pointer bytes, exactly half a
    // page, still pad to one.
    let header = FileHeader::new(
        ValueTag::U8,
        1,
        IndexVariant::U16,
        IndexVariant::U16,
        StorageVariant::Csr,
        matrix_shape(1023, 7),
        4096,
    );
    assert_eq!(header.indices_offset(), Some(4096 + 4096));
    // 4096 u16 indices fill two pages exactly.
    assert_eq!(header.values_offset(), Some(4096 + 4096 + 8192));
    assert_eq!(header.expected_file_len(), Some(4096 + 4096 + 8192 + 4096));
}

#[test]
fn only_matrices_describe_files() {
    let rank_one = FileHeader::new(
        ValueTag::F32,
        4,
        IndexVariant::U32,
        IndexVariant::U64,
        StorageVariant::Csr,
        ArrayShape::new(&[Dim::new(4)]).expect("one dimension fits the maximum shape rank"),
        8,
    );
    assert_eq!(rank_one.matrix_shape(), None);
    assert_eq!(rank_one.expected_file_len(), None);

    let zero_rows = FileHeader::new(
        ValueTag::F32,
        4,
        IndexVariant::U32,
        IndexVariant::U64,
        StorageVariant::Csr,
        matrix_shape(0, 4),
        0,
    );
    assert_eq!(zero_rows.matrix_shape(), None);
    assert_eq!(zero_rows.expected_file_len(), None);
}

#[test]
fn overflowing_geometry_matches_no_file() {
    let header = FileHeader::new(
        ValueTag::F32,
        4,
        IndexVariant::U64,
        IndexVariant::U64,
        StorageVariant::Csr,
        matrix_shape(u64::MAX, u64::MAX),
        u64::MAX,
    );
    assert_eq!(header.expected_file_len(), None);
}

#[test]
fn parsing_pins_the_magic() {
    let header = fixture_header(6);
    let mut bytes = header.as_bytes().to_vec();
    let parsed = FileHeader::try_read_from_bytes(&bytes).expect("the emitted header parses");
    assert_eq!(parsed.nnz(), 6);
    assert_eq!(parsed.matrix_shape(), Some((3, 3)));
    assert_eq!(parsed.order(), StorageVariant::Csr);

    bytes[0] ^= 0x01;
    FileHeader::try_read_from_bytes(&bytes).expect_err("a foreign magic fails the pinned parse");
}

#[test]
fn matrices_without_an_on_disk_form_are_rejected() {
    // A sliced view's pointers do not begin at zero.
    let matrix = fixture();
    let view = matrix.view();
    let sliced = view.slice_outer(1..3);
    assert_matches!(
        write_matrix(&sliced, Vec::new()),
        Err(WriteSprsError::Sliced),
    );

    // A zero dimension terminates the shape.
    let empty = CsMatI::<f32, u32, u64>::new((2, 0), vec![0, 0, 0], vec![], vec![]);
    assert_matches!(
        write_matrix(&empty, Vec::new()),
        Err(WriteSprsError::ZeroDimension {
            rows: 2,
            columns: 0,
        }),
    );
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
    assert_eq!(file.value(), ValueTag::F32);
    assert_eq!(file.value_width(), 4);
    assert_eq!(file.index(), IndexVariant::U32);
    assert_eq!(file.iptr(), IndexVariant::U64);
    assert_eq!(file.order(), StorageVariant::Csr);

    let reopened = file
        .matrix::<f32, u32, u64>()
        .expect("the described element types view");
    assert!(reopened.is_csr());
    assert_eq!(
        reopened.indptr().raw_storage(),
        matrix.indptr().raw_storage(),
    );
    assert_eq!(reopened.indices(), matrix.indices());
    assert_eq!(reopened.data(), matrix.data());

    // Requesting different element types is rejected, not misread.
    assert_matches!(
        file.matrix::<f64, u32, u64>(),
        Err(SprsMatrixError::Elements { .. }),
    );

    // Unsorted indices within a row violate the structure at view time.
    let indices_offset = usize::try_from(
        fixture_header(6)
            .indices_offset()
            .expect("the fixture geometry fits u64"),
    )
    .expect("the fixture geometry fits usize");
    let mut tampered = bytes.clone();
    tampered[indices_offset..indices_offset + 8].copy_from_slice([2_u32, 1].as_bytes());
    let tampered_path = dir.join("tampered.sprs");
    std::fs::write(&tampered_path, &tampered).expect("the tampered file writes");
    let tampered_file = SprsFile::open(&tampered_path).expect("the tampered file parses");
    assert_matches!(
        tampered_file.matrix::<f32, u32, u64>(),
        Err(SprsMatrixError::Structure(_)),
    );

    // A truncated file contradicts the length equation.
    let truncated_path = dir.join("truncated.sprs");
    std::fs::write(&truncated_path, &bytes[..bytes.len() - 4]).expect("the short file writes");
    assert_matches!(
        SprsFile::open(&truncated_path),
        Err(OpenSprsError::Length { .. }),
    );

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

/// A two-component opaque value under test.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
struct Pair {
    low: f32,
    high: f32,
}

impl super::SprsValue for Pair {
    const TAG: ValueTag = ValueTag::Opaque;
}

/// A different opaque value of the same width.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
struct Packed(u64);

impl super::SprsValue for Packed {
    const TAG: ValueTag = ValueTag::Opaque;
}

/// A narrower opaque value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
struct Narrow(u32);

impl super::SprsValue for Narrow {
    const TAG: ValueTag = ValueTag::Opaque;
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through FFI Miri cannot execute"
)]
fn opaque_values_are_identified_by_width_alone() {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-sprs-opaque-{}",
        std::process::id()
    ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let matrix = CsMatI::<Pair, u32, u64>::new(
        (2, 2),
        vec![0, 1, 2],
        vec![1, 0],
        vec![
            Pair {
                low: 0.5,
                high: 1.0,
            },
            Pair {
                low: 1.5,
                high: 2.0,
            },
        ],
    );
    let mut bytes = Vec::new();
    write_matrix(&matrix, &mut bytes).expect("writing to a buffer succeeds");
    let path = dir.join("opaque.sprs");
    std::fs::write(&path, &bytes).expect("the file writes");

    let file = SprsFile::open(&path).expect("the written file reopens");
    assert_eq!(file.value(), ValueTag::Opaque);
    assert_eq!(file.value_width(), 8);

    // The written type reads back bit-exactly.
    let reopened = file
        .matrix::<Pair, u32, u64>()
        .expect("the written opaque type views");
    assert_eq!(reopened.data(), matrix.data());

    // An equal-width opaque type is interchangeable on the wire: that
    // is Opaque's documented contract, not an accident.
    let packed = file
        .matrix::<Packed, u32, u64>()
        .expect("an equal-width opaque type views");
    assert_eq!(packed.data().len(), 2);

    // A different width is rejected, as is a pinned scalar tag of the
    // same width.
    assert_matches!(
        file.matrix::<Narrow, u32, u64>(),
        Err(SprsMatrixError::Elements { .. }),
    );
    assert_matches!(
        file.matrix::<f64, u32, u64>(),
        Err(SprsMatrixError::Elements { .. }),
    );

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through FFI Miri cannot execute"
)]
fn a_column_compressed_matrix_round_trips() {
    let dir =
        std::env::temp_dir().join(format!("hash-graph-atlas-sprs-csc-{}", std::process::id()));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let matrix = fixture().to_csc();
    let mut bytes = Vec::new();
    write_matrix(&matrix, &mut bytes).expect("writing to a buffer succeeds");
    let path = dir.join("matrix.sprs");
    std::fs::write(&path, &bytes).expect("the file writes");

    let file = SprsFile::open(&path).expect("the written file reopens");
    assert_eq!(file.order(), StorageVariant::Csc);

    let reopened = file
        .matrix::<f32, u32, u64>()
        .expect("the described element types view");
    assert!(reopened.is_csc());
    assert_eq!(
        reopened.indptr().raw_storage(),
        matrix.indptr().raw_storage(),
    );
    assert_eq!(reopened.indices(), matrix.indices());
    assert_eq!(reopened.data(), matrix.data());

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}
