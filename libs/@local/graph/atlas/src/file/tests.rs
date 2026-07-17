use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U16, U32, U64, U128, Unalign};

use super::ll::{
    entry::{DirectoryEntry, METADATA_BYTES, ScalarArrayMetadata, VACANT_SECTION_ID},
    flags::{EntryFlag, EntryFlags},
    preamble::{SEGMENT_BYTES, SaltPreamble},
    salt::{SaltFlag, SaltFlags, SaltHeader, SaltMagic, SaltVersion},
    segment::{
        ContentMapping, DirectorySegment, INLINE_CONTENT_ID, PreambleExtension, VACANT_CONTENT_ID,
    },
};
use crate::integrity::Checksum;

#[test]
fn salt_header_pins_magic_and_version() {
    let header = SaltHeader {
        magic: SaltMagic::MAGIC,
        version: SaltVersion::V1,
        flags: SaltFlags::new(),
    };
    let bytes = header.as_bytes();
    assert_eq!(&bytes[0..4], b"SALT");
    assert_eq!(bytes[4..8], 1_u32.to_le_bytes());
    assert_eq!(bytes[8..12], [0; 4]);

    let mut copy = [0_u8; 12];
    copy.copy_from_slice(bytes);
    assert_eq!(SaltHeader::try_read_from_bytes(&copy), Ok(header));

    // A wrong magic byte fails to parse at all.
    let mut wrong_magic = copy;
    wrong_magic[0] = b'W';
    assert!(SaltHeader::try_read_from_bytes(&wrong_magic).is_err());

    // An unsupported version fails to parse at all.
    let mut wrong_version = copy;
    wrong_version[4] = 2;
    assert!(SaltHeader::try_read_from_bytes(&wrong_version).is_err());

    // Unknown flag bits parse (they are a semantic rule) and are reported.
    let mut unknown_flags = copy;
    unknown_flags[8] = 0b10;
    let parsed =
        SaltHeader::try_read_from_bytes(&unknown_flags).expect("flags should stay parseable");
    assert_eq!(parsed.flags.unknown(), 0b10);
}

#[test]
fn salt_flags_operations() {
    let mut flags = SaltFlags::new();
    assert!(!flags.contains(SaltFlag::Sealed));
    assert_eq!(flags.iter().count(), 0);
    assert_eq!(flags.unknown(), 0);

    flags.insert(SaltFlag::Sealed);
    assert!(flags.contains(SaltFlag::Sealed));
    assert_eq!(flags.as_bytes(), 1_u32.to_le_bytes());
    assert_eq!(flags.iter().collect::<Vec<_>>(), [SaltFlag::Sealed]);

    flags.remove(SaltFlag::Sealed);
    assert!(!flags.contains(SaltFlag::Sealed));
    assert_eq!(flags.as_bytes(), 0_u32.to_le_bytes());
}

#[test]
fn entry_flags_operations() {
    assert_eq!(EntryFlag::ValidationRequired.position(), 0b01);
    assert_eq!(EntryFlag::Volatile.position(), 0b10);
    assert_eq!(EntryFlag::ALL, 0b11);

    let mut flags = EntryFlags::new();
    flags.insert(EntryFlag::Volatile);
    assert!(flags.contains(EntryFlag::Volatile));
    assert!(!flags.contains(EntryFlag::ValidationRequired));

    flags.insert(EntryFlag::ValidationRequired);
    assert_eq!(
        flags.iter().collect::<Vec<_>>(),
        [EntryFlag::ValidationRequired, EntryFlag::Volatile],
    );
    assert_eq!(flags.unknown(), 0);

    flags.remove(EntryFlag::Volatile);
    assert_eq!(flags.as_bytes(), 1_u16.to_le_bytes());
}

#[test]
fn preamble_layout() {
    let preamble = SaltPreamble {
        variant: Unalign::new(SaltHeader {
            magic: SaltMagic::MAGIC,
            version: SaltVersion::V1,
            flags: SaltFlags::new(),
        }),
        directory_len: U32::new(2),
        total_entry_count: U64::new(97),
        container_len: U64::new(1 << 20),
        _reserved: [0; 4056],
        checksum: Checksum::from_bytes(0xABCD_u64.to_le_bytes()),
    };
    let bytes = preamble.as_bytes();
    assert_eq!(bytes.len(), SEGMENT_BYTES);
    assert_eq!(&bytes[0..4], b"SALT");
    assert_eq!(bytes[12..16], 2_u32.to_le_bytes());
    assert_eq!(bytes[16..24], 97_u64.to_le_bytes());
    assert_eq!(bytes[24..32], (1_u64 << 20).to_le_bytes());
    assert!(bytes[32..4088].iter().all(|&byte| byte == 0));
    assert_eq!(bytes[4088..], 0xABCD_u64.to_le_bytes());
}

#[test]
fn content_mapping_layout() {
    assert_eq!(INLINE_CONTENT_ID, 0);
    assert_eq!(VACANT_CONTENT_ID, u128::MAX);

    let mapping = ContentMapping {
        content_id: U128::new(0x2A),
        length: U32::new(3),
        _reserved: [0; 4],
    };
    let bytes = mapping.as_bytes();
    assert_eq!(bytes.len(), 24);
    assert_eq!(bytes[0..16], 0x2A_u128.to_le_bytes());
    assert_eq!(bytes[16..20], 3_u32.to_le_bytes());
    assert_eq!(bytes[20..24], [0; 4]);
}

#[test]
fn segment_geometry() {
    assert_eq!(PreambleExtension::MAPPING_COUNT, 170);
    assert_eq!(size_of::<PreambleExtension>(), SEGMENT_BYTES);
    assert_eq!(DirectorySegment::ENTRY_COUNT, 31);
    assert_eq!(size_of::<DirectorySegment>(), SEGMENT_BYTES);
    // The checksum trails the segment: its offset is size - 8.
    assert_eq!(core::mem::offset_of!(PreambleExtension, checksum), 4088);
    assert_eq!(core::mem::offset_of!(DirectorySegment, checksum), 4088);
}

#[test]
fn directory_entry_layout() {
    let scalar_array = ScalarArrayMetadata {
        scalar: U16::new(11),
        rank: U16::new(2),
        _reserved: [0; 4],
        shape: [
            U64::new(262_144),
            U64::new(2),
            U64::new(0),
            U64::new(0),
            U64::new(0),
            U64::new(0),
            U64::new(0),
            U64::new(0),
        ],
    };
    let mut metadata = [0_u8; METADATA_BYTES];
    metadata[..size_of::<ScalarArrayMetadata>()].copy_from_slice(scalar_array.as_bytes());

    let mut flags = EntryFlags::new();
    flags.insert(EntryFlag::Volatile);
    let entry = DirectoryEntry {
        section_id: U32::new(7),
        section_type: U16::new(3),
        flags,
        start: U64::new(8192),
        end: U64::new(8192 + 2_097_152),
        metadata,
        checksum: Checksum::from_bytes(0xDEAD_BEEF_u64.to_le_bytes()),
    };
    let bytes = entry.as_bytes();
    assert_eq!(bytes.len(), 128);
    assert_eq!(bytes[0..4], 7_u32.to_le_bytes());
    assert_eq!(bytes[4..6], 3_u16.to_le_bytes());
    assert_eq!(bytes[6..8], 2_u16.to_le_bytes());
    assert_eq!(bytes[8..16], 8192_u64.to_le_bytes());
    assert_eq!(bytes[16..24], 2_105_344_u64.to_le_bytes());
    // Scalar array metadata: scalar f32 (11), rank 2, shape 262144 x 2.
    assert_eq!(bytes[24..26], 11_u16.to_le_bytes());
    assert_eq!(bytes[26..28], 2_u16.to_le_bytes());
    assert_eq!(bytes[32..40], 262_144_u64.to_le_bytes());
    assert_eq!(bytes[40..48], 2_u64.to_le_bytes());
    assert!(bytes[48..120].iter().all(|&byte| byte == 0));
    assert_eq!(bytes[120..128], 0xDEAD_BEEF_u64.to_le_bytes());
}

#[test]
fn vacant_sentinels_sort_after_occupied_keys() {
    // Binary search over a run relies on the vacant sentinels comparing
    // greater than every real key.
    assert!(VACANT_SECTION_ID > VACANT_SECTION_ID - 1);
    assert!(VACANT_CONTENT_ID > 1);
    let occupied = U32::<LE>::new(41);
    let vacant = U32::<LE>::new(VACANT_SECTION_ID);
    assert!(occupied.get() < vacant.get());
}
