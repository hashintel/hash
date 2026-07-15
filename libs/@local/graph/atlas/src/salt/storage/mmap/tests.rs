use std::io::Write as _;

use camino::Utf8PathBuf;
use tempfile::{NamedTempFile, tempdir};

use crate::salt::{
    hash::ContentHash,
    storage::mmap::{
        ArtifactFormat, ArtifactFormatError, ArtifactKind, ArtifactMapError, ArtifactSection,
        ArtifactWriteError, FormatVersion, HeaderError, MappedArtifact, ScalarType, SectionError,
        SectionId, publish_artifact,
    },
};

const FORMAT: ArtifactFormat = ArtifactFormat {
    kind: ArtifactKind::new(65_000),
    version: FormatVersion::new(3),
};
const FIRST_OFFSET: usize = 192;
const SECOND_OFFSET: usize = 256;
const TOTAL_BYTES: usize = 268;

#[test]
fn borrows_typed_sections_from_mapped_bytes() {
    let (_file, artifact) = map_artifact(&fixture()).expect("fixture should map");
    let view = artifact.view();

    assert_eq!(view.header().format, FORMAT);
    assert_eq!(view.header().section_count, 2);
    assert_eq!(view.sections().len(), 2);

    let matrix = view
        .section(SectionId::new(1))
        .expect("matrix section should exist");
    assert_eq!(matrix.descriptor.shape, [2, 2, 0]);
    assert_eq!(
        matrix.as_f64().expect("matrix should contain f64 values"),
        &[1.25, -2.5, 3.75, 4.0]
    );
    assert_eq!(
        matrix
            .as_f64()
            .expect("matrix should contain f64 values")
            .as_ptr()
            .cast::<u8>(),
        matrix.as_bytes().as_ptr()
    );

    let indexes = view
        .section(SectionId::new(2))
        .expect("index section should exist");
    assert_eq!(
        indexes.as_u32().expect("indexes should contain u32 values"),
        &[3, 5, 8]
    );
}

#[test]
fn private_snapshot_survives_source_overwrite_and_truncation() {
    let source = write_fixture(&fixture());
    let artifact =
        MappedArtifact::map_immutable(source.reopen().expect("fixture should reopen"), FORMAT)
            .expect("fixture should snapshot");

    std::fs::write(source.path(), b"replaced")
        .expect("source path should remain independently mutable");

    let matrix = artifact
        .view()
        .section(SectionId::new(1))
        .expect("snapshotted matrix should remain available")
        .as_f64()
        .expect("snapshotted matrix should retain its type");
    assert_eq!(matrix, &[1.25, -2.5, 3.75, 4.0]);
}

#[test]
fn streaming_publication_round_trips_and_is_idempotent() {
    let directory = tempdir().expect("temporary directory should be created");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("artifact.salt"))
        .expect("temporary path should be UTF-8");
    let matrix = [1.25_f64, -2.5, 3.75, 4.0];
    let indices = [3_u32, 5, 8];
    let sections = [
        ArtifactSection::new(SectionId::new(1), &[2, 2], &matrix)
            .expect("matrix shape should match"),
        ArtifactSection::new(SectionId::new(2), &[3], &indices).expect("index shape should match"),
    ];

    let first = publish_artifact(&path, FORMAT, &sections).expect("artifact should publish");
    let second =
        publish_artifact(&path, FORMAT, &sections).expect("publication should be idempotent");
    let mapped = MappedArtifact::map_immutable(
        std::fs::File::open(&path).expect("artifact should open"),
        FORMAT,
    )
    .expect("artifact should map");

    assert!(!first.reused_existing);
    assert!(second.reused_existing);
    assert_eq!(first.content_hash, second.content_hash);
    assert_eq!(
        mapped
            .view()
            .section(SectionId::new(1))
            .expect("matrix should exist")
            .as_f64()
            .expect("matrix should be f64"),
        matrix
    );
}

#[test]
fn canonical_empty_sections_round_trip_with_their_declared_shape() {
    let directory = tempdir().expect("temporary directory should be created");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("empty.salt"))
        .expect("temporary path should be UTF-8");
    let empty: [u32; 0] = [];
    let sections = [
        ArtifactSection::new(SectionId::new(1), &[0], &empty)
            .expect("empty vector section should validate"),
        ArtifactSection::new(SectionId::new(2), &[0, 16], &empty)
            .expect("empty matrix section should validate"),
    ];

    publish_artifact(&path, FORMAT, &sections).expect("empty sections should publish");
    let mapped = MappedArtifact::map_immutable(
        std::fs::File::open(&path).expect("artifact should open"),
        FORMAT,
    )
    .expect("artifact should map");
    let vector = mapped
        .view()
        .section(SectionId::new(1))
        .expect("empty vector should exist");
    let matrix = mapped
        .view()
        .section(SectionId::new(2))
        .expect("empty matrix should exist");

    assert_eq!(vector.descriptor.shape, [0, 0, 0]);
    assert_eq!(matrix.descriptor.shape, [0, 16, 0]);
    assert!(vector.as_u32().expect("vector should be typed").is_empty());
    assert!(matrix.as_u32().expect("matrix should be typed").is_empty());
}

#[test]
fn immutable_publication_rejects_different_existing_content() {
    let directory = tempdir().expect("temporary directory should be created");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("artifact.salt"))
        .expect("temporary path should be UTF-8");
    let first = [1_u32, 2];
    let second = [1_u32, 3];
    publish_artifact(
        &path,
        FORMAT,
        &[ArtifactSection::new(SectionId::new(1), &[2], &first).expect("section should be valid")],
    )
    .expect("first artifact should publish");

    assert!(matches!(
        publish_artifact(
            &path,
            FORMAT,
            &[ArtifactSection::new(SectionId::new(1), &[2], &second)
                .expect("section should be valid")],
        ),
        Err(ArtifactWriteError::ExistingArtifactMismatch { .. })
    ));
}

#[test]
fn rejects_payload_corruption_before_exposing_sections() {
    let mut bytes = fixture();
    bytes[FIRST_OFFSET] ^= 1;

    assert!(matches!(
        map_artifact(&bytes),
        Err(ArtifactMapError::Format(ArtifactFormatError::Header(
            HeaderError::PayloadHash { .. }
        )))
    ));
}

#[test]
fn rejects_unknown_scalar_and_nonzero_padding() {
    let mut bytes = fixture();
    bytes[64 + 2] = 99;
    rehash(&mut bytes);
    assert!(matches!(
        map_artifact(&bytes),
        Err(ArtifactMapError::Format(ArtifactFormatError::Section {
            index: 0,
            error: SectionError::UnknownScalar { actual: 99 },
        }))
    ));

    let mut bytes = fixture();
    bytes[FIRST_OFFSET + 40] = 1;
    rehash(&mut bytes);
    assert!(matches!(
        map_artifact(&bytes),
        Err(ArtifactMapError::Format(ArtifactFormatError::Section {
            index: 1,
            error: SectionError::NonZeroPadding { .. },
        }))
    ));
}

#[test]
fn rejects_incompatible_formats_and_typed_access() {
    let file = write_fixture(&fixture());
    let wrong = ArtifactFormat {
        kind: FORMAT.kind,
        version: FormatVersion::new(FORMAT.version.as_u16() + 1),
    };

    assert!(matches!(
        MappedArtifact::map_immutable(file.reopen().expect("should reopen fixture"), wrong,),
        Err(ArtifactMapError::Format(ArtifactFormatError::Header(
            HeaderError::Format { .. }
        )))
    ));

    let artifact =
        MappedArtifact::map_immutable(file.reopen().expect("should reopen fixture"), FORMAT)
            .expect("fixture should map");
    let matrix = artifact
        .view()
        .section(SectionId::new(1))
        .expect("matrix section should exist");
    let error = matrix
        .as_f32()
        .expect_err("an f64 section should reject f32 access");
    assert_eq!(error.expected, ScalarType::F32);
    assert_eq!(error.actual, ScalarType::F64);
}

fn fixture() -> Vec<u8> {
    let mut bytes = vec![0_u8; TOTAL_BYTES];
    bytes[..8].copy_from_slice(b"SALTMMAP");
    put_u16(&mut bytes, 8, 3);
    put_u16(&mut bytes, 10, FORMAT.kind.as_u16());
    put_u32(&mut bytes, 12, 0x0102_0304);
    put_u32(&mut bytes, 16, 64);
    put_u32(&mut bytes, 20, 2);
    put_u64(&mut bytes, 24, TOTAL_BYTES as u64);

    descriptor(
        &mut bytes,
        0,
        Descriptor {
            id: 1,
            scalar: ScalarType::F64 as u8,
            rank: 2,
            offset: FIRST_OFFSET as u64,
            length: 32,
            shape: [2, 2, 0],
        },
    );
    descriptor(
        &mut bytes,
        1,
        Descriptor {
            id: 2,
            scalar: ScalarType::U32 as u8,
            rank: 1,
            offset: SECOND_OFFSET as u64,
            length: 12,
            shape: [3, 0, 0],
        },
    );

    for (index, value) in [1.25_f64, -2.5, 3.75, 4.0].iter().enumerate() {
        let offset = FIRST_OFFSET + index * size_of::<f64>();
        bytes[offset..offset + size_of::<f64>()].copy_from_slice(&value.to_le_bytes());
    }
    for (index, value) in [3_u32, 5, 8].iter().enumerate() {
        let offset = SECOND_OFFSET + index * size_of::<u32>();
        bytes[offset..offset + size_of::<u32>()].copy_from_slice(&value.to_le_bytes());
    }
    rehash(&mut bytes);
    bytes
}

#[derive(Debug, Copy, Clone)]
struct Descriptor {
    id: u16,
    scalar: u8,
    rank: u8,
    offset: u64,
    length: u64,
    shape: [u64; 3],
}

fn descriptor(bytes: &mut [u8], index: usize, descriptor: Descriptor) {
    let offset = 64 + index * 48;
    put_u16(bytes, offset, descriptor.id);
    bytes[offset + 2] = descriptor.scalar;
    bytes[offset + 3] = descriptor.rank;
    put_u32(bytes, offset + 4, 64);
    put_u64(bytes, offset + 8, descriptor.offset);
    put_u64(bytes, offset + 16, descriptor.length);
    for (axis, dimension) in descriptor.shape.into_iter().enumerate() {
        put_u64(bytes, offset + 24 + axis * 8, dimension);
    }
}

fn rehash(bytes: &mut [u8]) {
    let hash = ContentHash::digest(&bytes[64..]);
    bytes[32..64].copy_from_slice(hash.as_bytes());
}

fn map_artifact(bytes: &[u8]) -> Result<(NamedTempFile, MappedArtifact), ArtifactMapError> {
    let file = write_fixture(bytes);
    let artifact =
        MappedArtifact::map_immutable(file.reopen().expect("should reopen fixture"), FORMAT)?;
    Ok((file, artifact))
}

fn write_fixture(bytes: &[u8]) -> NamedTempFile {
    let mut file = NamedTempFile::new().expect("should create a temporary artifact");
    file.write_all(bytes).expect("should write fixture");
    file.flush().expect("should flush fixture");
    file
}

fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_u64(bytes: &mut [u8], offset: usize, value: u64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}
