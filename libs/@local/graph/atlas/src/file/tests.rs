use core::num::NonZero;

use zerocopy::IntoBytes as _;

use super::{
    entry::{BlobEntry, ContentId, Entry, IndexEntry, IndexRecord, Placement, SectionRange, Slot},
    header::{ContainerState, Header},
    section::{ArrayShape, ScalarArrayLayout, ScalarType, SectionKind},
    wire::{self, WireIndexRecord, WireSaltEntry},
};

fn f32_layout(dims: &[u64]) -> ScalarArrayLayout {
    ScalarArrayLayout::new(
        ScalarType::F32,
        ArrayShape::new(dims).expect("dimensions should be valid"),
    )
    .expect("layout should fit in u64")
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
fn section_kind_scalar_array_metadata_layout() {
    let kind = SectionKind::ScalarArray(f32_layout(&[262_144, 2]));
    let metadata = kind.encode_metadata();
    assert_eq!(metadata[0..2], 11_u16.to_le_bytes());
    assert_eq!(metadata[2..4], 2_u16.to_le_bytes());
    assert_eq!(metadata[4..8], [0; 4]);
    assert_eq!(metadata[8..16], 262_144_u64.to_le_bytes());
    assert_eq!(metadata[16..24], 2_u64.to_le_bytes());
    assert!(metadata[24..].iter().all(|&byte| byte == 0));
}

#[test]
fn section_kind_rejects_malformed_metadata() {
    let kind = SectionKind::ScalarArray(f32_layout(&[16]));
    let valid = kind.encode_metadata();

    // Nonzero padding after the defined metadata.
    let mut tampered = valid;
    tampered[79] = 1;
    assert_eq!(SectionKind::decode(kind.type_code(), &tampered), None);

    // A dimension past the rank.
    let mut tampered = valid;
    tampered[16] = 1;
    assert_eq!(SectionKind::decode(kind.type_code(), &tampered), None);

    // Zero-metadata types reject any nonzero byte.
    let mut tampered = [0; wire::ENTRY_METADATA_BYTES];
    tampered[0] = 1;
    assert_eq!(
        SectionKind::decode(wire::SECTION_TYPE_DOCUMENT, &tampered),
        None
    );

    // The index is not a blob section type.
    let zero = [0; wire::ENTRY_METADATA_BYTES];
    assert_eq!(SectionKind::decode(wire::SECTION_TYPE_INDEX, &zero), None);
    assert!(!SectionKind::is_blob_type(wire::SECTION_TYPE_INDEX));
}

#[test]
fn content_id_rejects_reserved_values() {
    assert_eq!(ContentId::new(wire::CONTAINER_CONTENT_ID), None);
    assert_eq!(ContentId::new(wire::VACANT_CONTENT_ID), None);
    assert_eq!(ContentId::new(42).map(ContentId::get), Some(42));
}

#[test]
fn section_range_requires_nonempty_forward_range() {
    let range = SectionRange::new(4096, 4120).expect("forward range should be valid");
    assert_eq!(range.start(), 4096);
    assert_eq!(range.end(), 4120);
    assert_eq!(range.len(), 24);

    assert_eq!(SectionRange::new(4096, 4096), None);
    assert_eq!(SectionRange::new(4096, 4095), None);
}

#[test]
fn blob_entry_wire_layout() {
    let kind = SectionKind::ScalarArray(f32_layout(&[262_144, 2]));
    let range = SectionRange::new(8192, 8192 + 2_097_152).expect("range should be valid");
    let blob = BlobEntry::new(
        ContentId::new(42).expect("id should be valid"),
        7,
        kind,
        Placement::Inline,
        false,
        range,
        0xDEAD_BEEF,
    )
    .expect("entry should be valid");
    let raw = Entry::Blob(blob).encode();
    let bytes = raw.as_bytes();

    assert_eq!(bytes.len(), 128);
    assert_eq!(bytes[0..16], 42_u128.to_le_bytes());
    assert_eq!(bytes[16..20], 7_u32.to_le_bytes());
    assert_eq!(bytes[20..22], 3_u16.to_le_bytes());
    assert_eq!(bytes[22..24], [0; 2]);
    assert_eq!(bytes[24..32], 8192_u64.to_le_bytes());
    assert_eq!(bytes[32..40], 2_105_344_u64.to_le_bytes());
    assert_eq!(bytes[40..48], 0xDEAD_BEEF_u64.to_le_bytes());
    assert_eq!(bytes[48..50], 11_u16.to_le_bytes());

    assert_eq!(Slot::decode(&raw), Some(Slot::Entry(Entry::Blob(blob))));
}

#[test]
fn blob_entry_outline_flags_round_trip() {
    let blob = BlobEntry::new(
        ContentId::new(7).expect("id should be valid"),
        0,
        SectionKind::Opaque,
        Placement::Outline,
        true,
        SectionRange::new(1, 100).expect("range should be valid"),
        9,
    )
    .expect("entry should be valid");
    let raw = Entry::Blob(blob).encode();
    assert_eq!(raw.flags.get(), 0b11);
    assert_eq!(Slot::decode(&raw), Some(Slot::Entry(Entry::Blob(blob))));
}

#[test]
fn blob_entry_rejects_invariant_violations() {
    let id = ContentId::new(42).expect("id should be valid");
    let kind = SectionKind::ScalarArray(f32_layout(&[16]));
    let aligned = SectionRange::new(4096, 4096 + 64).expect("range should be valid");

    // Scalar array length disagreement: 16 f32 elements need 64 bytes.
    let short = SectionRange::new(4096, 4096 + 60).expect("range should be valid");
    assert_eq!(
        BlobEntry::new(id, 0, kind, Placement::Inline, false, short, 0),
        None,
    );

    // Unaligned inline start.
    let unaligned = SectionRange::new(4100, 4100 + 64).expect("range should be valid");
    assert_eq!(
        BlobEntry::new(id, 0, kind, Placement::Inline, false, unaligned, 0),
        None,
    );

    // Outline sections are exempt from container alignment.
    assert!(BlobEntry::new(id, 0, kind, Placement::Outline, false, unaligned, 0).is_some());
    assert!(BlobEntry::new(id, 0, kind, Placement::Inline, false, aligned, 0).is_some());
}

#[test]
fn index_entry_requires_aligned_whole_records() {
    let range = SectionRange::new(8192, 8192 + 48).expect("range should be valid");
    let index = IndexEntry::new(range, 5).expect("entry should be valid");
    assert_eq!(index.range(), range);
    assert_eq!(index.payload_crc(), 5);

    let ragged = SectionRange::new(8192, 8192 + 50).expect("range should be valid");
    assert_eq!(IndexEntry::new(ragged, 5), None);
    let unaligned = SectionRange::new(8200, 8200 + 48).expect("range should be valid");
    assert_eq!(IndexEntry::new(unaligned, 5), None);
}

#[test]
fn index_entry_wire_round_trip() {
    let range = SectionRange::new(8192, 8192 + 48).expect("range should be valid");
    let entry = Entry::Index(IndexEntry::new(range, 5).expect("entry should be valid"));
    let raw = entry.encode();
    assert_eq!(raw.content_id.get(), 0);
    assert_eq!(raw.section_type.get(), wire::SECTION_TYPE_INDEX);
    assert_eq!(raw.flags.get(), 0);
    assert_eq!(Slot::decode(&raw), Some(Slot::Entry(entry)));

    // The index is rejected under a blob content id or with flags set.
    let mut tampered = raw;
    tampered.content_id = 42_u128.into();
    assert_eq!(Slot::decode(&tampered), None);
    let mut tampered = raw;
    tampered.flags = wire::ENTRY_FLAG_MUST_UNDERSTAND.into();
    assert_eq!(Slot::decode(&tampered), None);
}

#[test]
fn slot_vacancy_round_trip() {
    let raw = Slot::vacant_wire();
    let bytes = raw.as_bytes();
    assert_eq!(bytes[0..16], u128::MAX.to_le_bytes());
    assert!(bytes[16..].iter().all(|&byte| byte == 0));
    assert_eq!(Slot::decode(&raw), Some(Slot::Vacant));

    // A torn or tampered vacant slot is rejected.
    let mut tampered = raw;
    tampered.section_id = 1.into();
    assert_eq!(Slot::decode(&tampered), None);
}

#[test]
fn slot_decode_rejects_malformed_frames() {
    let valid = Entry::Blob(
        BlobEntry::new(
            ContentId::new(42).expect("id should be valid"),
            0,
            SectionKind::Opaque,
            Placement::Inline,
            false,
            SectionRange::new(8192, 8200).expect("range should be valid"),
            0,
        )
        .expect("entry should be valid"),
    )
    .encode();

    // Zero section type.
    let mut tampered = valid;
    tampered.section_type = 0.into();
    assert_eq!(Slot::decode(&tampered), None);

    // Unknown flag bit.
    let mut tampered = valid;
    tampered.flags = 0b100.into();
    assert_eq!(Slot::decode(&tampered), None);

    // Empty range.
    let mut tampered = valid;
    tampered.end = tampered.start;
    assert_eq!(Slot::decode(&tampered), None);

    // Container id with a blob section type.
    let mut tampered = valid;
    tampered.content_id = wire::CONTAINER_CONTENT_ID.into();
    assert_eq!(Slot::decode(&tampered), None);
}

#[test]
fn slot_decode_preserves_unknown_sections() {
    let raw = WireSaltEntry {
        content_id: 42_u128.into(),
        section_id: 3.into(),
        section_type: 0x0099.into(),
        flags: wire::ENTRY_FLAG_MUST_UNDERSTAND.into(),
        start: 8192.into(),
        end: 8200.into(),
        payload_crc: 17.into(),
        // Unknown metadata is preserved as opaque and not validated.
        metadata: [0xAB; wire::ENTRY_METADATA_BYTES],
    };
    let Some(Slot::Unknown(unknown)) = Slot::decode(&raw) else {
        panic!("unknown section types should decode to skippable entries");
    };
    assert_eq!(unknown.content_id, 42);
    assert_eq!(unknown.section_id, 3);
    assert_eq!(unknown.type_code, 0x0099);
    assert!(unknown.must_understand);
    assert_eq!(unknown.placement, Placement::Inline);
    assert_eq!(unknown.range.len(), 8);
    assert_eq!(unknown.payload_crc, 17);
}

#[test]
fn index_record_round_trip() {
    let record = IndexRecord {
        content_id: ContentId::new(42).expect("id should be valid"),
        first_slot: NonZero::new(1).expect("slot should be nonzero"),
        slot_count: NonZero::new(3).expect("count should be nonzero"),
    };
    let raw = record.encode();
    assert_eq!(raw.as_bytes().len(), 24);
    assert_eq!(IndexRecord::decode(&raw), Some(record));

    // Slot 0 holds the index itself and reserved ids are not blobs.
    let mut tampered = raw;
    tampered.first_slot = 0.into();
    assert_eq!(IndexRecord::decode(&tampered), None);
    let mut tampered = raw;
    tampered.content_id = 0_u128.into();
    assert_eq!(IndexRecord::decode(&tampered), None);
}

#[test]
fn header_round_trip_and_geometry() {
    let segments = NonZero::new(64).expect("segment count should be nonzero");
    let unsealed = Header::new(segments, ContainerState::Unsealed).expect("header should be valid");
    assert_eq!(unsealed.slot_capacity(), 1984);
    assert_eq!(Header::decode(&unsealed.encode()), Some(unsealed));

    let raw = unsealed.encode();
    assert_eq!(raw.magic, *wire::SALT_MAGIC);
    assert_eq!(raw.version.get(), 1);
    assert_eq!(raw.flags.get(), 0);

    let sealed = Header::new(
        segments,
        ContainerState::Sealed {
            entry_count: 100,
            total_bytes: 4096 * 65 + 8192,
        },
    )
    .expect("header should be valid");
    let raw = sealed.encode();
    assert_eq!(raw.flags.get(), wire::HEADER_FLAG_SEALED);
    assert_eq!(Header::decode(&raw), Some(sealed));
}

#[test]
fn header_rejects_invalid_geometry_and_frames() {
    let segments = NonZero::new(64).expect("segment count should be nonzero");

    // Entry count above capacity and length below the header region.
    assert_eq!(
        Header::new(
            segments,
            ContainerState::Sealed {
                entry_count: 1985,
                total_bytes: 4096 * 65,
            },
        ),
        None,
    );
    assert_eq!(
        Header::new(
            segments,
            ContainerState::Sealed {
                entry_count: 0,
                total_bytes: 4096 * 65 - 1,
            },
        ),
        None,
    );
    let over_cap = NonZero::new(wire::MAX_DIRECTORY_SEGMENTS + 1).expect("should be nonzero");
    assert_eq!(Header::new(over_cap, ContainerState::Unsealed), None);

    let valid = Header::new(segments, ContainerState::Unsealed)
        .expect("header should be valid")
        .encode();

    // Wrong magic, wrong version, unknown flags, zero segments, and
    // unsealed headers carrying counts.
    let mut tampered = valid;
    tampered.magic = *b"SALW";
    assert_eq!(Header::decode(&tampered), None);
    let mut tampered = valid;
    tampered.version = 2.into();
    assert_eq!(Header::decode(&tampered), None);
    let mut tampered = valid;
    tampered.flags = 0b10.into();
    assert_eq!(Header::decode(&tampered), None);
    let mut tampered = valid;
    tampered.directory_segments = 0.into();
    assert_eq!(Header::decode(&tampered), None);
    let mut tampered = valid;
    tampered.entry_count = 1.into();
    assert_eq!(Header::decode(&tampered), None);
}
