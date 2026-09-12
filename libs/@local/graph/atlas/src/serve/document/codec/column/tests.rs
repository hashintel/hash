#![expect(
    clippy::little_endian_bytes,
    reason = "the tests build the writer's little-endian expectations"
)]

use hashql_core::id::{Id as _, IdSlice, bit_vec::BitMatrix};

use super::ColumnWriter;
use crate::{
    identity::NodeRowId,
    math::Vec2,
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    serve::{codec::EncodedRowId, document::TileSlot, membership::SelectionSlot},
};

/// Derives the expected mask bytes from inserted `(row, col)` coordinates, not from the writer.
fn expected_mask_bytes(rows: usize, cols: usize, set: &[(usize, usize)]) -> Vec<u8> {
    let stride = cols.div_ceil(8);
    let mut expected = vec![0_u8; rows * stride];
    for &(row, col) in set {
        expected[row * stride + (col >> 3)] |= 1 << (col & 7);
    }
    expected
}

/// Encodes one matrix and compares it against the bytes its inserted coordinates imply.
#[track_caller]
fn assert_masks(matrix: &BitMatrix<TileSlot, SelectionSlot>, set: &[(usize, usize)], case: &str) {
    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).masks(matrix);

    let expected = expected_mask_bytes(matrix.row_domain_size(), matrix.col_domain_size(), set);
    assert_eq!(
        buffer.len(),
        matrix.row_domain_size() * matrix.col_domain_size().div_ceil(8),
        "{case} should emit ceil(columns / 8) bytes per row"
    );
    assert_eq!(
        buffer, expected,
        "{case} should emit the bytes its inserted coordinates imply"
    );
}

/// Row ids leave as four little-endian bytes each, in slot order.
///
/// `0x0102_0304` is byte-asymmetric, where a palindromic value reads the same in either order.
#[test]
fn rows_little_endian_values() {
    let values = [
        EncodedRowId::<NodeRowId>::new_unchecked(0x0000_0000),
        EncodedRowId::new_unchecked(0x0000_0001),
        EncodedRowId::new_unchecked(0x0102_0304),
        EncodedRowId::new_unchecked(0xFFFF_FFFF),
    ];

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).rows(IdSlice::<TileSlot, _>::from_raw(&values));

    assert_eq!(
        buffer,
        [
            0x00, 0x00, 0x00, 0x00, //
            0x01, 0x00, 0x00, 0x00, //
            0x04, 0x03, 0x02, 0x01, //
            0xFF, 0xFF, 0xFF, 0xFF,
        ],
        "should encode each row id as four little-endian bytes in slot order"
    );
}

/// Row ids append after the buffer's existing content instead of replacing it.
#[test]
fn rows_prefix() {
    let values = [EncodedRowId::<NodeRowId>::new_unchecked(0x1122_3344)];
    let mut buffer = vec![0xAA, 0xBB, 0xCC];

    ColumnWriter::over(&mut buffer).rows(IdSlice::<TileSlot, _>::from_raw(&values));

    assert_eq!(
        buffer,
        [0xAA, 0xBB, 0xCC, 0x44, 0x33, 0x22, 0x11],
        "should keep the existing prefix and append the row bytes after it"
    );
}

/// Positions leave as each vector's `x` then `y`, little-endian and bit-identical to the input.
///
/// The expectation restates each value's IEEE-754 bit pattern. `-0.0` and the smallest positive
/// subnormal are the values an incidental arithmetic pass would corrupt: adding zero turns
/// `-0.0` into `0.0`, and a flush-to-zero step turns the subnormal into `0.0`.
#[test]
fn positions_little_endian_pairs() {
    let xs: [f32; 4] = [0.0, 1.5, f32::MIN, f32::from_bits(1)];
    let ys: [f32; 4] = [-0.0, -123.456, f32::MAX, f32::INFINITY];
    let values: Vec<Vec2> = xs.iter().zip(&ys).map(|(&x, &y)| Vec2::new(x, y)).collect();

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).positions(IdSlice::<TileSlot, _>::from_raw(&values));

    let mut expected = Vec::new();
    for (&x, &y) in xs.iter().zip(&ys) {
        expected.extend_from_slice(&x.to_bits().to_le_bytes());
        expected.extend_from_slice(&y.to_bits().to_le_bytes());
    }

    assert_eq!(
        buffer, expected,
        "should encode each vector's x then y as untouched little-endian f32 bytes"
    );
}

/// Positions append after the buffer's existing content instead of replacing it.
#[test]
fn positions_prefix() {
    let values = [Vec2::new(2.0, -4.0)];
    let mut buffer = vec![0x77];

    ColumnWriter::over(&mut buffer).positions(IdSlice::<TileSlot, _>::from_raw(&values));

    assert_eq!(
        buffer,
        [0x77, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x80, 0xC0],
        "should keep the prefix byte and append the vector's little-endian x then y bytes"
    );
}

/// An identity leaves as its exact 32 bytes: the web id's 16, then the entity uuid's 16.
#[test]
fn identities_exact_32_bytes() {
    let values = [
        ArchivedEntityId {
            web_id: ArchivedWebId::from_bytes([0x01; 16]),
            entity_uuid: ArchivedEntityUuid::from_bytes([0x02; 16]),
        },
        ArchivedEntityId {
            web_id: ArchivedWebId::from_bytes([0xAA; 16]),
            entity_uuid: ArchivedEntityUuid::from_bytes([0xBB; 16]),
        },
    ];

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).identities(IdSlice::<TileSlot, _>::from_raw(&values));

    let mut expected = Vec::new();
    expected.extend_from_slice(&[0x01; 16]);
    expected.extend_from_slice(&[0x02; 16]);
    expected.extend_from_slice(&[0xAA; 16]);
    expected.extend_from_slice(&[0xBB; 16]);

    assert_eq!(
        buffer.len(),
        64,
        "should emit exactly 32 bytes per identity"
    );
    assert_eq!(
        buffer, expected,
        "should emit the web id's bytes then the entity uuid's bytes, per identity"
    );
}

/// Identities append after the buffer's existing content instead of replacing it.
#[test]
fn identities_prefix() {
    let values = [ArchivedEntityId {
        web_id: ArchivedWebId::from_bytes([0x11; 16]),
        entity_uuid: ArchivedEntityUuid::from_bytes([0x22; 16]),
    }];
    let mut buffer = vec![0xEE, 0xEE];

    ColumnWriter::over(&mut buffer).identities(IdSlice::<TileSlot, _>::from_raw(&values));

    let mut expected = vec![0xEE, 0xEE];
    expected.extend_from_slice(&[0x11; 16]);
    expected.extend_from_slice(&[0x22; 16]);

    assert_eq!(
        buffer, expected,
        "should keep the prefix and append the identity's 32 bytes after it"
    );
}

/// A matrix with no rows emits no bytes, whatever its column count.
#[test]
fn masks_zero_rows() {
    let matrix = BitMatrix::<TileSlot, SelectionSlot>::new(0, 5);

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).masks(&matrix);

    assert!(
        buffer.is_empty(),
        "should emit no bytes for a zero-row matrix"
    );
}

/// A matrix with no columns emits no bytes per row, whatever its row count.
#[test]
fn masks_zero_columns() {
    let matrix = BitMatrix::<TileSlot, SelectionSlot>::new(3, 0);

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).masks(&matrix);

    assert!(
        buffer.is_empty(),
        "should emit no bytes per row when the column domain is empty"
    );
}

/// Each row occupies `ceil(columns / 8)` bytes, at widths around the byte and word boundaries.
#[test]
fn masks_stride_widths() {
    for (cols, stride, bit) in [
        (1_usize, 1_usize, 0_usize),
        (8, 1, 7),
        (9, 2, 8),
        (63, 8, 62),
        (64, 8, 63),
        (65, 9, 64),
    ] {
        let mut matrix = BitMatrix::<TileSlot, SelectionSlot>::new(1, cols);
        matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(bit));

        assert_eq!(
            cols.div_ceil(8),
            stride,
            "the fixture's own stride for {cols} columns should be {stride}"
        );
        assert_masks(&matrix, &[(0, bit)], &format!("{cols} columns"));
    }
}

/// Within one byte, column 0 is the least-significant bit.
///
/// Columns 0, 1 and 4 pack least-significant-bit first as `0b0001_0011`. A most-significant-bit
/// first writer emits `0b1100_1000` from the same three columns.
#[test]
fn masks_lsb_first() {
    let mut matrix = BitMatrix::<TileSlot, SelectionSlot>::new(1, 8);
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(0));
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(1));
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(4));

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).masks(&matrix);

    assert_eq!(
        buffer,
        [0b0001_0011],
        "columns 0, 1 and 4 should pack least-significant-bit first"
    );
}

/// Rows leave in matrix row order, each with its own pattern.
#[test]
fn masks_row_order() {
    let mut matrix = BitMatrix::<TileSlot, SelectionSlot>::new(3, 8);
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(0));
    matrix.insert(TileSlot::from_usize(1), SelectionSlot::from_usize(3));
    matrix.insert(TileSlot::from_usize(2), SelectionSlot::from_usize(7));

    let mut buffer = Vec::new();
    ColumnWriter::over(&mut buffer).masks(&matrix);

    assert_eq!(
        buffer,
        [0b0000_0001, 0b0000_1000, 0b1000_0000],
        "should emit the three rows in matrix order, each with its own pattern"
    );
}

/// Per-row patterns spanning the 64-bit word boundary at column 64 encode independently.
#[test]
fn masks_word_boundary_patterns() {
    let mut matrix = BitMatrix::<TileSlot, SelectionSlot>::new(2, 65);
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(63));
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(64));
    matrix.insert(TileSlot::from_usize(1), SelectionSlot::from_usize(0));
    matrix.insert(TileSlot::from_usize(1), SelectionSlot::from_usize(64));

    assert_masks(
        &matrix,
        &[(0, 63), (0, 64), (1, 0), (1, 64)],
        "two rows across the word boundary",
    );
}

/// Masks append after the buffer's existing content instead of replacing it.
#[test]
fn masks_prefix() {
    let mut matrix = BitMatrix::<TileSlot, SelectionSlot>::new(1, 8);
    matrix.insert(TileSlot::from_usize(0), SelectionSlot::from_usize(2));
    let mut buffer = vec![0x99];

    ColumnWriter::over(&mut buffer).masks(&matrix);

    assert_eq!(
        buffer,
        [0x99, 0b0000_0100],
        "should keep the prefix byte and append the row's mask byte after it"
    );
}
