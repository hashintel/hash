use core::num::NonZero;

use zerocopy::IntoBytes as _;

use super::{
    container::{BlobId, Container, ContainerState, MappingRecord, MappingSlot, MappingTarget},
    entry::{Entry, SectionId, SectionRange, Slot, UnknownEntry},
    section::{ArrayShape, ScalarArrayLayout, ScalarType, SectionKind},
};
use crate::{
    file2::ll::entry::{METADATA_BYTES, SECTION_TYPE_DOCUMENT, SECTION_TYPE_SCALAR_ARRAY},
    integrity::Checksum,
};

fn f32_layout(dims: &[u64]) -> ScalarArrayLayout {
    ScalarArrayLayout::new(
        ScalarType::F32,
        ArrayShape::new(dims).expect("dimensions should be valid"),
    )
    .expect("layout should fit in u64")
}

fn sample_entry() -> Entry {
    Entry::new(
        SectionId::new(7).expect("id should be valid"),
        SectionKind::ScalarArray(f32_layout(&[262_144, 2])),
        false,
        true,
        SectionRange::new(8192, 8192 + 2_097_152).expect("range should be valid"),
        Checksum::from_bytes(0xDEAD_BEEF_u64.to_le_bytes()),
    )
    .expect("entry should be valid")
}

#[test]
fn scalar_type_widths_and_wire_values() {
    let table: [(ScalarType, u16, u64); 12] = [
        (ScalarType::U8, 1, 1),
        (ScalarType::U16, 2, 2),
        (ScalarType::U32, 3, 4),
        (ScalarType::U64, 4, 8),
        (ScalarType::I8, 5, 1),
        (ScalarType::I16, 6, 2),
        (ScalarType::I32, 7, 4),
        (ScalarType::I64, 8, 8),
        (ScalarType::F16, 9, 2),
        (ScalarType::Bf16, 10, 2),
        (ScalarType::F32, 11, 4),
        (ScalarType::F64, 12, 8),
    ];
    for (scalar, code, width) in table {
        assert_eq!(scalar.to_wire(), code);
        assert_eq!(scalar.width(), width);
        assert_eq!(ScalarType::from_wire(code), Some(scalar));
    }
    assert_eq!(ScalarType::from_wire(0), None);
    assert_eq!(ScalarType::from_wire(13), None);
}

#[test]
fn array_shape_validation() {
    let shape = ArrayShape::new(&[262_144, 2]).expect("two dimensions should be valid");
    assert_eq!(shape.dims(), &[262_144, 2]);
    assert_eq!(shape.rank(), 2);
    assert_eq!(shape.element_count(), 524_288);

    assert_eq!(ArrayShape::new(&[]), None);
    assert_eq!(ArrayShape::new(&[1; 9]), None);
    assert_eq!(ArrayShape::new(&[4, 0]), None);
    assert_eq!(ArrayShape::new(&[u64::MAX, 2]), None);
}

#[test]
fn scalar_array_layout_byte_length() {
    assert_eq!(f32_layout(&[262_144, 2]).byte_length(), 2_097_152);

    let elements = ArrayShape::new(&[1 << 62]).expect("element count should fit in u64");
    assert_eq!(ScalarArrayLayout::new(ScalarType::U64, elements), None);
}

#[test]
fn section_kind_metadata_round_trip() {
    let kinds = [
        SectionKind::Document,
        SectionKind::Opaque,
        SectionKind::ScalarArray(f32_layout(&[262_144, 2])),
        SectionKind::QuadTree,
        SectionKind::PointCloud,
    ];
    for kind in kinds {
        let metadata = kind.encode_metadata();
        assert_eq!(SectionKind::decode(kind.type_code(), &metadata), Some(kind));
    }
}

#[test]
fn section_kind_rejects_malformed_metadata() {
    let kind = SectionKind::ScalarArray(f32_layout(&[16]));
    let valid = kind.encode_metadata();

    // Nonzero padding after the defined metadata.
    let mut tampered = valid;
    tampered[METADATA_BYTES - 1] = 1;
    assert_eq!(SectionKind::decode(kind.type_code(), &tampered), None);

    // A dimension past the rank.
    let mut tampered = valid;
    tampered[16] = 1;
    assert_eq!(SectionKind::decode(kind.type_code(), &tampered), None);

    // Zero-metadata types reject any nonzero byte.
    let mut tampered = [0; METADATA_BYTES];
    tampered[0] = 1;
    assert_eq!(SectionKind::decode(SECTION_TYPE_DOCUMENT, &tampered), None);

    // Unknown type codes are not decodable kinds.
    let zero = [0; METADATA_BYTES];
    assert_eq!(SectionKind::decode(0x0099, &zero), None);
    assert!(!SectionKind::is_known(0x0099));
}

#[test]
fn section_id_and_range_validation() {
    assert_eq!(SectionId::new(u32::MAX), None);
    assert_eq!(SectionId::new(41).map(SectionId::get), Some(41));

    let range = SectionRange::new(4096, 4120).expect("forward range should be valid");
    assert_eq!((range.start(), range.end(), range.len()), (4096, 4120, 24));
    assert_eq!(SectionRange::new(4096, 4096), None);
    assert_eq!(SectionRange::new(4096, 4095), None);
}

#[test]
fn entry_round_trip_and_length_agreement() {
    let entry = sample_entry();
    let raw = entry.encode();
    assert_eq!(raw.flags.as_bytes(), 2_u16.to_le_bytes());
    assert_eq!(Slot::decode(&raw), Some(Slot::Entry(entry)));

    // 16 f32 elements need 64 bytes, not 60.
    let short = SectionRange::new(4096, 4096 + 60).expect("range should be valid");
    assert_eq!(
        Entry::new(
            SectionId::new(0).expect("id should be valid"),
            SectionKind::ScalarArray(f32_layout(&[16])),
            false,
            false,
            short,
            Checksum::from_bytes([0; 8]),
        ),
        None,
    );
}

#[test]
fn slot_vacancy_round_trip() {
    let raw = Slot::vacant_wire();
    let bytes = raw.as_bytes();
    assert_eq!(bytes[0..4], u32::MAX.to_le_bytes());
    assert!(bytes[4..].iter().all(|&byte| byte == 0));
    assert_eq!(Slot::decode(&raw), Some(Slot::Vacant));

    // A torn or tampered vacant slot is rejected.
    let mut tampered = raw;
    tampered.start = 1.into();
    assert_eq!(Slot::decode(&tampered), None);
}

#[test]
fn slot_decode_rejects_malformed_frames() {
    let valid = sample_entry().encode();

    // Zero section type.
    let mut tampered = valid;
    tampered.section_type = 0.into();
    assert_eq!(Slot::decode(&tampered), None);

    // Unknown flag bit.
    let mut tampered = valid;
    tampered.flags = zerocopy::transmute!(0b100_u16);
    assert_eq!(Slot::decode(&tampered), None);

    // Empty range.
    let mut tampered = valid;
    tampered.end = tampered.start;
    assert_eq!(Slot::decode(&tampered), None);

    // Known type with malformed metadata.
    let mut tampered = valid;
    tampered.metadata[METADATA_BYTES - 1] = 1;
    assert_eq!(Slot::decode(&tampered), None);
}

#[test]
fn slot_decode_preserves_unknown_sections() {
    let mut raw = sample_entry().encode();
    raw.section_type = 0x0099.into();
    // Unknown metadata is not validated.
    raw.metadata = [0xAB; METADATA_BYTES];

    let expected = UnknownEntry {
        section_id: SectionId::new(7).expect("id should be valid"),
        type_code: 0x0099,
        validation_required: false,
        volatile: true,
        range: SectionRange::new(8192, 8192 + 2_097_152).expect("range should be valid"),
        checksum: Checksum::from_bytes(0xDEAD_BEEF_u64.to_le_bytes()),
    };
    assert_eq!(Slot::decode(&raw), Some(Slot::Unknown(expected)));
}

#[test]
fn blob_id_rejectsreserved_values() {
    assert_eq!(BlobId::new(0), None);
    assert_eq!(BlobId::new(u128::MAX), None);
    assert_eq!(BlobId::new(0x2A).map(BlobId::get), Some(0x2A));
}

#[test]
fn mapping_slot_round_trip() {
    let slots = [
        MappingSlot::Unoccupied,
        MappingSlot::Record(MappingRecord {
            target: MappingTarget::Inline,
            segments: NonZero::new(3).expect("length should be nonzero"),
        }),
        MappingSlot::Record(MappingRecord {
            target: MappingTarget::Blob(BlobId::new(0x2A).expect("id should be valid")),
            segments: NonZero::new(1).expect("length should be nonzero"),
        }),
        MappingSlot::Record(MappingRecord {
            target: MappingTarget::Spare,
            segments: NonZero::new(60).expect("length should be nonzero"),
        }),
    ];
    for slot in slots {
        assert_eq!(MappingSlot::decode(&slot.encode()), Some(slot));
    }

    // A named content with a zero-length run is invalid.
    let mut tampered = MappingSlot::Record(MappingRecord {
        target: MappingTarget::Blob(BlobId::new(0x2A).expect("id should be valid")),
        segments: NonZero::new(1).expect("length should be nonzero"),
    })
    .encode();
    tampered.length = 0.into();
    assert_eq!(MappingSlot::decode(&tampered), None);

    // Reserved bytes must be zero.
    let mut tampered = MappingSlot::Unoccupied.encode();
    tampered.reserved = [1, 0, 0, 0];
    assert_eq!(MappingSlot::decode(&tampered), None);
}

#[test]
fn container_round_trip_and_checksum() {
    let extensions = NonZero::new(1).expect("extension count should be nonzero");
    let unsealed =
        Container::new(extensions, ContainerState::Unsealed).expect("container should be valid");
    let raw = unsealed.encode();
    assert_eq!(Container::decode(&raw), Some(unsealed));

    // Any flipped payload byte breaks the preamble checksum.
    let mut torn = unsealed.encode();
    torn.reserved[17] = 1;
    assert_eq!(Container::decode(&torn), None);

    let sealed = Container::new(
        extensions,
        ContainerState::Sealed {
            entry_count: 97,
            container_len: 1 << 20,
        },
    )
    .expect("container should be valid");
    assert_eq!(Container::decode(&sealed.encode()), Some(sealed));
}

#[test]
fn container_rejects_invalid_geometry_and_states() {
    let extensions = NonZero::new(1).expect("extension count should be nonzero");

    // A sealed length shorter than the preamble and its extensions.
    assert_eq!(
        Container::new(
            extensions,
            ContainerState::Sealed {
                entry_count: 0,
                container_len: 4096 * 2 - 1,
            },
        ),
        None,
    );

    // Unsealed counters must be zero on the wire.
    let mut raw = Container::new(extensions, ContainerState::Unsealed)
        .expect("container should be valid")
        .encode();
    raw.total_entry_count = 1.into();
    assert_eq!(Container::decode(&raw), None);
}
