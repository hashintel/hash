use core::{
    assert_matches,
    sync::atomic::{AtomicU64, Ordering},
};
use std::{io::Cursor, path::PathBuf};

use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use super::{
    ArrayShape, ArrayVariant, ArrayWriter, Dim, FileHeader, PaddedFileHeader, SizedArrayWriter,
    read::{ArrayFile, OpenArrayError},
};
use crate::{
    file::region::{PAGE_BYTES, header::HeaderError, machine::Machine},
    integrity::{Sha256, Update as _},
};

/// A uniquely named file in the system temporary directory, removed on drop.
struct TempFile {
    path: PathBuf,
}

impl TempFile {
    fn create(bytes: &[u8]) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        let path = std::env::temp_dir().join(format!(
            "atlas-array-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
        ));
        std::fs::write(&path, bytes).expect("the temporary file should be writable");

        Self { path }
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        drop(std::fs::remove_file(&self.path));
    }
}

fn shape(dims: &[u64]) -> ArrayShape {
    let dims = dims.iter().copied().map(Dim::new).collect::<Vec<_>>();
    ArrayShape::new(&dims).expect("shape should hold at most eight dimensions")
}

fn extents(shape: &ArrayShape) -> Vec<u64> {
    shape.dims().iter().map(|dim| dim.get()).collect()
}

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(ArrayVariant::F32, shape(&[1 << 18, 2])));
    let bytes = header.as_bytes();
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[0..8], b"SALTARRY");
    assert_eq!(bytes[8..12], 1_u32.to_le_bytes());
    assert_eq!(&bytes[12..16], Machine::current().as_bytes());
    assert_eq!(bytes[16], 0x0D);
    assert_eq!(bytes[17..25], (1_u64 << 18).to_le_bytes());
    assert_eq!(bytes[25..33], 2_u64.to_le_bytes());
    assert!(bytes[33..].iter().all(|&byte| byte == 0));
}

#[test]
fn foreign_native_elements_fail_the_open() {
    let mut bytes = Vec::new();
    let mut writer =
        SizedArrayWriter::new(Cursor::new(&mut bytes), ArrayVariant::U32, &[Dim::new(4)])
            .expect("the writer should start");
    writer
        .write_rows(4, [1_u32, 2, 3, 4].as_bytes())
        .expect("the rows should write");
    let _digest = writer.finish().expect("the writer should finish");

    // Flip the architecture bit in the machine information's final byte: the
    // same bytes now claim the other byte order wrote them, and native
    // elements refuse the open.
    bytes[15] ^= 0x01;
    let file = TempFile::create(&bytes);
    assert_matches!(
        ArrayFile::open(&file.path),
        Err(OpenArrayError::ForeignArchitecture { .. }),
    );
}

#[test]
fn le_pinned_elements_survive_a_foreign_writer() {
    let mut bytes = Vec::new();
    let mut writer = SizedArrayWriter::new(
        Cursor::new(&mut bytes),
        ArrayVariant::U64Le,
        &[Dim::new(1), Dim::new(2)],
    )
    .expect("the writer should start");
    writer
        .write_rows(1, [7_u64.to_le_bytes(), 9_u64.to_le_bytes()].as_flattened())
        .expect("the rows should write");
    let _digest = writer.finish().expect("the writer should finish");

    // The element type carries the byte order, so the writer's
    // architecture is irrelevant to the reader.
    bytes[15] ^= 0x01;
    let file = TempFile::create(&bytes);
    let mapped = ArrayFile::open(&file.path).expect("an le-pinned file opens on every host");
    let pairs = mapped.u64_le_pairs().expect("the pairs view exists");
    assert_eq!(pairs[0][0].get(), 7);
    assert_eq!(pairs[0][1].get(), 9);
}

#[test]
fn header_parse_pins_identity() {
    let page = PaddedFileHeader::new(FileHeader::new(ArrayVariant::F32, shape(&[16])));
    let bytes: [u8; PAGE_BYTES] = page
        .as_bytes()
        .try_into()
        .expect("a padded header is exactly one page");

    let parsed =
        PaddedFileHeader::try_ref_from_bytes(&bytes).expect("valid header bytes should parse");
    assert_eq!(parsed.variant(), ArrayVariant::F32);
    assert_eq!(extents(parsed.shape()), [16]);
    assert_eq!(parsed.as_bytes(), bytes);

    // Wrong magic, unsupported version, and unknown variant all fail to
    // parse at the byte level.
    let mut wrong_magic = bytes;
    wrong_magic[0] = b'W';
    PaddedFileHeader::try_ref_from_bytes(&wrong_magic).expect_err("a wrong magic should not parse");

    let mut wrong_version = bytes;
    wrong_version[8] = 2;
    PaddedFileHeader::try_ref_from_bytes(&wrong_version)
        .expect_err("an unsupported version should not parse");

    let mut wrong_variant = bytes;
    wrong_variant[16] = 0xFF;
    PaddedFileHeader::try_ref_from_bytes(&wrong_variant)
        .expect_err("an unknown variant should not parse");

    // The parse ignores padding without validating it.
    let mut dirty_padding = bytes;
    dirty_padding[PAGE_BYTES - 1] = 0xAB;
    PaddedFileHeader::try_ref_from_bytes(&dirty_padding).expect("padding bytes should be ignored");
}

#[test]
fn shape_is_the_longest_nonzero_prefix() {
    // The first zero terminates the shape, and the parse ignores bytes past it.
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
fn u8_variant_pins_its_identity_and_width() {
    let header = FileHeader::new(ArrayVariant::U8, shape(&[3, 32]));
    assert_eq!(header.as_bytes()[16], 0x01);
    assert_eq!(ArrayVariant::U8.width(), 1);
    assert_eq!(header.byte_length(), Some(96));
    assert_eq!(header.expected_file_len(), Some(4096 + 96));

    let parsed =
        FileHeader::try_read_from_bytes(header.as_bytes()).expect("a u8 header should parse");
    assert_eq!(parsed.variant(), ArrayVariant::U8);
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

#[test]
#[cfg_attr(miri, ignore = "mmap is not supported under miri")]
fn writer_and_file_round_trip_aligned_vectors() {
    let rows: [[f32; 8]; 3] = [[0.5; 8], [-2.0; 8], [1024.0; 8]];

    let mut buffer = Cursor::new(Vec::new());
    let mut writer = ArrayWriter::new(&mut buffer, ArrayVariant::F32, &[Dim::new(8)])
        .expect("writing to a cursor should succeed");
    for row in &rows {
        writer
            .write_row(row.as_bytes())
            .expect("writing to a cursor should succeed");
    }
    let written = writer.finish().expect("sealing a cursor should succeed");
    assert_eq!(written, 3);

    let file = TempFile::create(buffer.get_ref());
    let opened = ArrayFile::open(&file.path).expect("a sealed file should open");

    assert_eq!(opened.variant(), ArrayVariant::F32);
    assert_eq!(extents(opened.shape()), [3, 8]);
    assert!(opened.data().as_ptr().is_aligned_to(4096));

    let vectors = opened
        .vectors::<8>()
        .expect("an f32 file shaped [3, 8] should view as 8-vectors");
    assert_eq!(vectors.len(), 3);
    for (vector, row) in vectors.iter().zip(&rows) {
        // Bit-exact storage is the contract, so bytes compare exactly.
        assert_eq!(vector.as_array().as_bytes(), row.as_bytes());
    }

    // A different width is a different file.
    assert!(opened.vectors::<16>().is_none());
}

#[test]
#[cfg_attr(miri, ignore = "mmap is not supported under miri")]
fn zero_rows_seal_as_the_empty_array() {
    let mut buffer = Cursor::new(Vec::new());
    let writer = ArrayWriter::new(&mut buffer, ArrayVariant::F32, &[Dim::new(512)])
        .expect("writing to a cursor should succeed");
    let written = writer.finish().expect("sealing a cursor should succeed");
    assert_eq!(written, 0);
    assert_eq!(buffer.get_ref().len(), PAGE_BYTES);

    // A zero-element file records no row width, so it is zero vectors of
    // every dimension.
    let file = TempFile::create(buffer.get_ref());
    let opened = ArrayFile::open(&file.path).expect("an empty array should open");
    assert!(opened.shape().dims().is_empty());
    assert!(opened.vectors::<512>().expect("zero rows").is_empty());
    assert!(opened.vectors::<8>().expect("zero rows").is_empty());
}

#[test]
#[cfg_attr(miri, ignore = "mmap is not supported under miri")]
fn open_rejects_what_the_header_contradicts() {
    // An unfinished write leaves the reserved zero header, which no
    // parse accepts.
    let mut unfinished = vec![0_u8; PAGE_BYTES];
    unfinished.extend_from_slice([1.0_f32; 8].as_bytes());
    let file = TempFile::create(&unfinished);
    assert_matches!(
        ArrayFile::open(&file.path),
        Err(OpenArrayError::Header(HeaderError::Invalid))
    );

    // A file shorter than one header fails the length check before any
    // parse.
    let file = TempFile::create(&[0xAB; 16]);
    assert_matches!(
        ArrayFile::open(&file.path),
        Err(OpenArrayError::Header(HeaderError::Undersized {
            actual: 16
        }))
    );

    // A truncated data region violates the length rule.
    let mut truncated = Vec::new();
    truncated.extend_from_slice(
        PaddedFileHeader::new(FileHeader::new(ArrayVariant::F32, shape(&[2, 4]))).as_bytes(),
    );
    truncated.extend_from_slice([1.0_f32; 4].as_bytes());
    let file = TempFile::create(&truncated);
    assert_matches!(
        ArrayFile::open(&file.path),
        Err(OpenArrayError::Length {
            expected: Some(expected),
            actual,
        }) if expected == 4096 + 32 && actual == 4096 + 16
    );

    // A missing file surfaces the io error.
    let missing = std::env::temp_dir().join("atlas-array-missing");
    assert_matches!(
        ArrayFile::open(&missing),
        Err(OpenArrayError::Header(HeaderError::Io(_)))
    );
}

#[test]
#[cfg_attr(miri, ignore = "mmap is not supported under miri")]
fn vectors_exists_exactly_for_f32_matrices() {
    // A u8 file never views as vectors.
    let mut bytes = Vec::new();
    bytes.extend_from_slice(
        PaddedFileHeader::new(FileHeader::new(ArrayVariant::U8, shape(&[3, 32]))).as_bytes(),
    );
    bytes.extend_from_slice(&[7; 96]);
    let file = TempFile::create(&bytes);
    let opened = ArrayFile::open(&file.path).expect("a u8 array should open");
    assert!(opened.vectors::<32>().is_none());

    // A rank-1 f32 array is not a matrix.
    let mut bytes = Vec::new();
    bytes.extend_from_slice(
        PaddedFileHeader::new(FileHeader::new(ArrayVariant::F32, shape(&[8]))).as_bytes(),
    );
    bytes.extend_from_slice([1.0_f32; 8].as_bytes());
    let file = TempFile::create(&bytes);
    let opened = ArrayFile::open(&file.path).expect("a rank-1 array should open");
    assert!(opened.vectors::<8>().is_none());
}

/// The sized and streaming writers share one format.
///
/// The same rows through the sized writer produce the streaming writer's bytes exactly, and the
/// returned digest is the digest of those bytes.
#[test]
fn sized_writer_matches_the_streaming_writer_byte_for_byte() {
    let rows: [[f32; 8]; 3] = [[0.5; 8], [-2.0; 8], [1024.0; 8]];

    let mut streamed = Cursor::new(Vec::new());
    let mut writer = ArrayWriter::new(&mut streamed, ArrayVariant::F32, &[Dim::new(8)])
        .expect("writing to a cursor should succeed");
    for row in &rows {
        writer
            .write_row(row.as_bytes())
            .expect("writing to a cursor should succeed");
    }
    writer.finish().expect("sealing a cursor should succeed");

    let mut sized = Vec::new();
    let mut writer =
        SizedArrayWriter::new(&mut sized, ArrayVariant::F32, &[Dim::new(3), Dim::new(8)])
            .expect("writing to a vector should succeed");
    for row in &rows {
        writer
            .write_row(row.as_bytes())
            .expect("writing to a vector should succeed");
    }
    let digest = writer.finish().expect("sealing a vector should succeed");

    assert_eq!(&sized, streamed.get_ref());

    let mut hasher = Sha256::new();
    hasher.update(&sized);
    assert_eq!(digest, hasher.finalize());
}

/// Whole-row chunks and single rows are one stream.
///
/// `write_rows` appends the same bytes `write_row` would, row by row.
#[test]
fn sized_writer_accepts_whole_row_chunks() {
    let rows: [[f32; 2]; 4] = [[0.0, 1.0], [2.0, 3.0], [4.0, 5.0], [6.0, 7.0]];

    let mut chunked = Vec::new();
    let mut writer =
        SizedArrayWriter::new(&mut chunked, ArrayVariant::F32, &[Dim::new(4), Dim::new(2)])
            .expect("writing to a vector should succeed");
    writer
        .write_rows(4, rows.as_bytes())
        .expect("writing to a vector should succeed");
    let bulk = writer.finish().expect("sealing a vector should succeed");

    let mut single = Vec::new();
    let mut writer =
        SizedArrayWriter::new(&mut single, ArrayVariant::F32, &[Dim::new(4), Dim::new(2)])
            .expect("writing to a vector should succeed");
    for row in &rows {
        writer
            .write_row(row.as_bytes())
            .expect("writing to a vector should succeed");
    }
    let rowed = writer.finish().expect("sealing a vector should succeed");

    assert_eq!(chunked, single);
    assert_eq!(bulk, rowed);
}

/// A short stream never seals.
///
/// The header promised rows the stream did not deliver, so the digest refuses to endorse the file.
#[test]
#[should_panic(expected = "the stream must deliver exactly the shape's promised rows")]
fn sized_writer_rejects_a_short_stream() {
    let mut bytes = Vec::new();
    let writer = SizedArrayWriter::new(&mut bytes, ArrayVariant::F32, &[Dim::new(2), Dim::new(2)])
        .expect("writing to a vector should succeed");
    let _digest = writer.finish();
}

/// A stream past the promise panics at the write, not at the seal.
#[test]
#[should_panic(expected = "the stream must stay within the shape's promised row count")]
fn sized_writer_rejects_an_overlong_stream() {
    let mut bytes = Vec::new();
    let mut writer =
        SizedArrayWriter::new(&mut bytes, ArrayVariant::F32, &[Dim::new(1), Dim::new(2)])
            .expect("writing to a vector should succeed");
    let row: [f32; 2] = [0.0, 1.0];
    writer
        .write_row(row.as_bytes())
        .expect("writing to a vector should succeed");
    drop(writer.write_row(row.as_bytes()));
}

/// Zero promised rows seal as the zero-element array immediately.
#[test]
fn sized_writer_seals_zero_rows() {
    let mut bytes = Vec::new();
    let writer = SizedArrayWriter::new(&mut bytes, ArrayVariant::F32, &[Dim::ZERO, Dim::new(512)])
        .expect("writing to a vector should succeed");
    let _digest = writer.finish().expect("sealing a vector should succeed");
    assert_eq!(bytes.len(), PAGE_BYTES);
}
