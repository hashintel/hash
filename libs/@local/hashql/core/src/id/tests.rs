#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use super::{Id as _, IdError, newtype};

newtype!(
    #[id(crate = crate)]
    struct UnboundedId(u64)
);

newtype!(
    #[id(crate = crate)]
    struct NarrowUnboundedId(u16)
);

newtype!(
    #[id(crate = crate, endian = little, unaligned)]
    struct LittleId(u64)
);

newtype!(
    #[id(crate = crate, endian = big, unaligned)]
    struct BigId(u32)
);

newtype!(
    #[id(crate = crate, unaligned)]
    struct NativeBytesId(u16)
);

#[test]
fn unbounded_id_covers_backing_type() {
    assert_eq!(UnboundedId::MIN.as_u64(), 0);
    assert_eq!(UnboundedId::MAX.as_u64(), u64::MAX);
    assert_eq!(
        UnboundedId::try_from(u64::MAX),
        Ok(UnboundedId::new(u64::MAX))
    );
}

#[test]
fn unbounded_id_rejects_values_wider_than_backing_type() {
    let above = u64::from(u16::MAX) + 1;

    assert_eq!(
        NarrowUnboundedId::try_from(above),
        Err(IdError::OutOfRange {
            value: above,
            min: 0,
            max: u64::from(u16::MAX),
        })
    );
    assert_eq!(
        NarrowUnboundedId::try_from(u64::from(u16::MAX)),
        Ok(NarrowUnboundedId::new(u16::MAX))
    );
}

#[test]
fn byte_encoded_id_has_alignment_one() {
    assert_eq!(align_of::<LittleId>(), 1);
    assert_eq!(size_of::<LittleId>(), 8);
    assert_eq!(align_of::<BigId>(), 1);
    assert_eq!(size_of::<BigId>(), 4);
    assert_eq!(align_of::<NativeBytesId>(), 1);
    assert_eq!(size_of::<NativeBytesId>(), 2);
}

#[test]
fn little_endian_id_encodes_low_byte_first() {
    let id = LittleId::new(0x0102_0304_0506_0708);

    assert_eq!(id.as_bytes(), [8, 7, 6, 5, 4, 3, 2, 1]);
}

#[test]
fn big_endian_id_encodes_high_byte_first() {
    let id = BigId::new(0x0102_0304);

    assert_eq!(id.as_bytes(), [1, 2, 3, 4]);
}

#[test]
fn byte_encoded_id_reads_back_from_bytes() {
    let id = LittleId::new(0xDEAD_BEEF);

    assert_eq!(
        LittleId::read_from_bytes(id.as_bytes()).expect("encoding is its own byte source"),
        id
    );
}

#[test]
fn byte_encoded_id_orders_by_value() {
    // Byte-lexicographic order over little-endian encodings would invert this pair.
    assert!(LittleId::new(2) < LittleId::new(256));
}

#[test]
fn byte_encoded_id_formats_value() {
    assert_eq!(LittleId::new(42).to_string(), "42");
    assert_eq!(format!("{:?}", BigId::new(7)), "BigId(7)");
}

newtype!(
    #[id(crate = crate, endian = big, unaligned)]
    struct WindowId(u16 is 10..=20)
);

#[test]
fn get_returns_the_raw_scalar() {
    const IN_CONST: u64 = UnboundedId::new(3).get();

    assert_eq!(UnboundedId::new(7).get(), 7_u64);
    assert_eq!(LittleId::new(9).get(), 9_u64);
    assert_eq!(NarrowUnboundedId::new(3).get(), 3_u16);
    assert_eq!(IN_CONST, 3);
}

#[test]
fn bounded_byte_id_reads_only_in_range_bytes() {
    let id = WindowId::try_read_from_bytes(&[0, 20]).expect("20 lies in the range");
    assert_eq!(id, WindowId::new(20));
    assert_eq!(
        WindowId::try_read_from_bytes(&[0, 10]).expect("10 lies in the range"),
        WindowId::new(10)
    );

    WindowId::try_read_from_bytes(&[0, 21]).expect_err("21 lies above the range");
    WindowId::try_read_from_bytes(&[0, 9]).expect_err("9 lies below the range");
    WindowId::try_read_from_bytes(&[0, 0]).expect_err("zero lies below the range");
    WindowId::try_read_from_bytes(&[255, 255]).expect_err("the maximum lies above the range");
}

#[test]
fn bounded_byte_id_still_writes_bytes() {
    let id = WindowId::new(18);

    assert_eq!(id.as_bytes(), [0, 18]);
}

#[test]
fn native_bytes_id_round_trips() {
    let id = NativeBytesId::new(0x1234);

    assert_eq!(
        NativeBytesId::read_from_bytes(id.as_bytes()).expect("encoding is its own byte source"),
        id
    );
    assert_eq!(id.as_u64(), 0x1234);
}
