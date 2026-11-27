#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

mod generic;

use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use super::{Id, IdError, IdSlice, IdVec, newtype};

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
fn unbounded_range() {
    assert_eq!(UnboundedId::MIN.as_u64(), 0);
    assert_eq!(UnboundedId::MAX.as_u64(), u64::MAX);
    assert_eq!(
        UnboundedId::try_from(u64::MAX),
        Ok(UnboundedId::new(u64::MAX))
    );
}

#[test]
fn unbounded_overflow() {
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
fn bytes_alignment() {
    assert_eq!(align_of::<LittleId>(), 1);
    assert_eq!(size_of::<LittleId>(), 8);
    assert_eq!(align_of::<BigId>(), 1);
    assert_eq!(size_of::<BigId>(), 4);
    assert_eq!(align_of::<NativeBytesId>(), 1);
    assert_eq!(size_of::<NativeBytesId>(), 2);
}

#[test]
fn little_endian_encoding() {
    let id = LittleId::new(0x0102_0304_0506_0708);

    assert_eq!(id.as_bytes(), [8, 7, 6, 5, 4, 3, 2, 1]);
}

#[test]
fn big_endian_encoding() {
    let id = BigId::new(0x0102_0304);

    assert_eq!(id.as_bytes(), [1, 2, 3, 4]);
}

#[test]
fn bytes_round_trip() {
    let id = LittleId::new(0xDEAD_BEEF);

    assert_eq!(
        LittleId::read_from_bytes(id.as_bytes()).expect("encoding is its own byte source"),
        id
    );
}

#[test]
fn bytes_numeric_order() {
    // Byte-lexicographic order over little-endian encodings would invert this pair.
    assert!(LittleId::new(2) < LittleId::new(256));
}

#[test]
fn bytes_format() {
    assert_eq!(LittleId::new(42).to_string(), "42");
    assert_eq!(format!("{:?}", BigId::new(7)), "BigId(7)");
}

newtype!(
    #[id(crate = crate, endian = big, unaligned)]
    struct WindowId(u16 is 10..=20)
);

#[test]
fn get_scalar() {
    const IN_CONST: u64 = UnboundedId::new(3).get();

    assert_eq!(UnboundedId::new(7).get(), 7_u64);
    assert_eq!(LittleId::new(9).get(), 9_u64);
    assert_eq!(NarrowUnboundedId::new(3).get(), 3_u16);
    assert_eq!(IN_CONST, 3);
}

#[test]
fn bounded_bytes_range() {
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
fn bounded_bytes_encoding() {
    let id = WindowId::new(18);

    assert_eq!(id.as_bytes(), [0, 18]);
}

#[test]
fn native_bytes_round_trip() {
    let id = NativeBytesId::new(0x1234);

    assert_eq!(
        NativeBytesId::read_from_bytes(id.as_bytes()).expect("encoding is its own byte source"),
        id
    );
    assert_eq!(id.as_u64(), 0x1234);
}

newtype!(
    #[id(crate = crate, const)]
    struct RangedId(u32 is 0..=0xFFFF_FF00)
);

newtype!(
    #[id(crate = crate)]
    struct ExclusiveId(u16 is 10..20)
);

newtype!(
    #[id(crate = crate)]
    struct CompoundEndId(u8 is 0..2 | 8)
);

newtype!(
    #[id(crate = crate)]
    struct InferredEndId(u8 is 0..=(!0 >> 1))
);

newtype!(
    #[id(crate = crate, endian = big, unaligned)]
    struct CompoundEndBytesId(u16 is 0..2 | 8)
);

#[test]
fn ranged_compound_end() {
    assert_eq!(CompoundEndId::MAX.get(), 9);
    assert_eq!(CompoundEndId::new(9).get(), 9);
    assert_eq!(CompoundEndId::try_from(9_u32), Ok(CompoundEndId::MAX));
    assert_eq!(
        CompoundEndId::try_from(10_u32),
        Err(IdError::OutOfRange {
            value: 10,
            min: 0,
            max: 9,
        })
    );
    assert_eq!(size_of::<Option<CompoundEndId>>(), 1);

    assert_eq!(CompoundEndBytesId::MAX.get(), 9);
    CompoundEndBytesId::try_read_from_bytes(&[0, 9]).expect("9 lies in the range");
    CompoundEndBytesId::try_read_from_bytes(&[0, 10]).expect_err("10 lies above the range");
}

#[test]
fn ranged_inferred_end() {
    assert_eq!(InferredEndId::MAX.get(), 127);
    assert_eq!(InferredEndId::try_from(127_u32), Ok(InferredEndId::MAX));
    assert_eq!(
        InferredEndId::try_from(128_u32),
        Err(IdError::OutOfRange {
            value: 128,
            min: 0,
            max: 127,
        })
    );
    assert_eq!(
        InferredEndId::try_from(u64::from(u32::MAX)),
        Err(IdError::OutOfRange {
            value: u64::from(u32::MAX),
            min: 0,
            max: 127,
        })
    );
}

#[test]
fn ranged_niche() {
    assert_eq!(size_of::<RangedId>(), 4);
    assert_eq!(size_of::<Option<RangedId>>(), 4);
    assert_eq!(size_of::<Option<Option<ExclusiveId>>>(), 2);

    assert_eq!(size_of::<Option<NarrowUnboundedId>>(), 4);
}

#[test]
fn ranged_bounds() {
    const IN_CONST: RangedId = RangedId::new(0xFFFF_FF00);

    assert_eq!(IN_CONST.get(), 0xFFFF_FF00);
    assert_eq!(RangedId::MAX, IN_CONST);
    assert_eq!(RangedId::MIN.get(), 0);

    assert_eq!(ExclusiveId::MIN.get(), 10);
    assert_eq!(ExclusiveId::MAX.get(), 19);
    assert_eq!(ExclusiveId::MAX.prev(), Some(ExclusiveId::new(18)));
    assert_eq!(ExclusiveId::MIN.prev(), None);
    assert_eq!(
        ExclusiveId::try_from(20_u32),
        Err(IdError::OutOfRange {
            value: 20,
            min: 10,
            max: 19,
        })
    );
    assert_eq!(
        [Some(ExclusiveId::new(19)), None].map(|id| id.map(ExclusiveId::get)),
        [Some(19), None]
    );
    assert!(ExclusiveId::new(10) < ExclusiveId::new(11));
}

#[test]
#[should_panic(expected = "id value must be between 10<20")]
fn ranged_above() {
    let _id = ExclusiveId::new(20);
}

#[test]
fn enumerated_full_range() {
    let raw = [0_u8; 10];
    let slice = IdSlice::<CompoundEndId, _>::from_raw(&raw);

    let ids: Vec<u8> = slice.ids().map(CompoundEndId::get).collect();
    assert_eq!(ids, (0..10).collect::<Vec<u8>>());
    assert_eq!(
        slice.iter_enumerated().map(|(id, _)| id).next_back(),
        Some(CompoundEndId::MAX)
    );

    let squares = IdVec::<CompoundEndId, u8>::from_fn(10, |id| id.get() * id.get());
    assert_eq!(squares[CompoundEndId::MAX], 81);
    assert_eq!(
        squares.into_iter_enumerated().next_back(),
        Some((CompoundEndId::MAX, 81))
    );
}

#[test]
#[should_panic(expected = "id value must be between 0<2 | 8")]
fn enumerated_above() {
    let raw = [0_u8; 11];
    let _ids = IdSlice::<CompoundEndId, _>::from_raw(&raw).ids();
}

#[test]
#[should_panic(expected = "id value must be between 10<20")]
fn enumerated_below() {
    let raw = [0_u8; 15];
    let _iter = IdSlice::<ExclusiveId, _>::from_raw(&raw).iter_enumerated();
}

#[test]
fn ranged_constant_pattern() {
    const FIRST: RangedId = RangedId::new(0);

    let label = match RangedId::new(1) {
        FIRST => "first",
        RangedId::MAX => "last",
        _ => "other",
    };

    assert_eq!(label, "other");
}

newtype!(
    #[id(crate = crate, const, endian = big, unaligned)]
    struct ConstBytesId(u16 is 10..=20)
);

const fn precedes<I: [const] Id>(lhs: &I, rhs: &I) -> bool {
    *lhs < *rhs && *lhs != *rhs
}

#[test]
fn const_comparison() {
    const RANGED: bool = precedes(&RangedId::new(1), &RangedId::new(2));
    const BYTES: bool = precedes(&ConstBytesId::new(10), &ConstBytesId::new(20));
    const REVERSED: bool = precedes(&ConstBytesId::new(20), &ConstBytesId::new(10));

    assert_eq!([RANGED, BYTES, REVERSED], [true, true, false]);
}

#[cfg(feature = "rayon")]
mod par {
    use alloc::{vec, vec::Vec};

    use rayon::iter::{IntoParallelIterator as _, ParallelExtend as _, ParallelIterator as _};

    use super::UnboundedId;
    use crate::id::{Id as _, IdVec};

    #[test]
    fn iter_enumerated_serial_agreement() {
        let vec: IdVec<UnboundedId, u32> = IdVec::from_raw(vec![10, 20, 30]);

        let serial: Vec<(UnboundedId, u32)> = vec
            .iter_enumerated()
            .map(|(id, &value)| (id, value))
            .collect();
        let parallel: Vec<(UnboundedId, u32)> = vec
            .par_iter_enumerated()
            .map(|(id, &value)| (id, value))
            .collect();

        assert_eq!(parallel, serial);
    }

    #[test]
    fn ids_serial_agreement() {
        let vec: IdVec<UnboundedId, u32> = IdVec::from_raw(vec![1, 2, 3, 4]);

        let serial: Vec<UnboundedId> = vec.ids().collect();
        let parallel: Vec<UnboundedId> = vec.par_ids().collect();

        assert_eq!(parallel, serial);
    }

    #[test]
    fn collect_extend_order() {
        let collected: IdVec<UnboundedId, u32> = (0..64_u32).into_par_iter().collect();
        assert_eq!(collected.as_raw(), (0..64).collect::<Vec<u32>>());

        let mut extended: IdVec<UnboundedId, u32> = IdVec::new();
        extended.par_extend((0..64_u32).into_par_iter());
        assert_eq!(extended.as_raw(), collected.as_raw());
    }

    #[test]
    fn into_iter_enumerated_ids() {
        let vec: IdVec<UnboundedId, u32> = IdVec::from_raw(vec![7, 8]);

        let pairs: Vec<(UnboundedId, u32)> = vec.into_par_iter_enumerated().collect();

        assert_eq!(
            pairs,
            [
                (UnboundedId::from_usize(0), 7),
                (UnboundedId::from_usize(1), 8)
            ]
        );
    }
}

#[cfg(feature = "zerocopy")]
mod bytes {
    use zerocopy::{FromBytes as _, IntoBytes as _};

    use super::UnboundedId;
    use crate::id::{IdArray, IdSlice};

    #[test]
    fn slice_bytes() {
        let data: [u32; 3] = [1, 2, 3];
        let slice = IdSlice::<UnboundedId, u32>::from_raw(&data);

        assert_eq!(slice.as_bytes(), data.as_bytes());
    }

    #[test]
    fn array_round_trip() {
        let array = IdArray::<UnboundedId, u32, 3>::from_raw([4, 5, 6]);

        let back = <IdArray<UnboundedId, u32, 3>>::read_from_bytes(array.as_bytes())
            .expect("the encoding is its own byte source");

        assert_eq!(back, array);
    }
}
