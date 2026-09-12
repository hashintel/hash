use alloc::rc::Rc;
use core::{
    cmp::Ordering,
    hash::{Hash as _, Hasher as _},
    iter::Step as _,
};
use std::hash::DefaultHasher;

use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use crate::id::{HasId as _, Id as _, IdError, IdVec, newtype};

struct Domain {
    _thread_affine: Rc<()>,
}

newtype!(
    #[id(crate = crate, const)]
    struct DomainId<T>(u32)
);

newtype!(
    #[id(crate = crate, derive(Step), display = "index:{}")]
    struct BoundedId<T, U>(u16 is 10..20)
);

newtype!(
    #[id(crate = crate, const, endian = little, unaligned)]
    struct LittleId<T>(u16)
);

newtype!(
    #[id(crate = crate, endian = big, unaligned)]
    struct BigId<T>(u32)
);

newtype!(
    #[id(crate = crate, unaligned)]
    struct NativeId<T>(u16)
);

newtype!(
    #[id(crate = crate, const, unaligned)]
    struct ByteId<T>(u8 is 10..=20)
);

newtype!(
    #[id(crate = crate, endian = little, unaligned)]
    struct CollisionId<A, H, r#__HashqlHasher0, r#__HashqlAlignment0>(u16 is 10..=20)
);

type Index = DomainId<Domain>;
type Pair = BoundedId<Domain, Domain>;
type Collision = CollisionId<Domain, Domain, Domain, Domain>;

#[test]
fn marker_traits() {
    let id = Index::new(7);
    let copied = id;
    assert_eq!(id, copied);
    assert_eq!(id.id(), id);
    assert!(id < Index::new(8));
    assert_eq!(id.partial_cmp(&copied), Some(Ordering::Equal));
    assert_eq!(format!("{id:?}"), "DomainId(7)");
    assert_eq!(id.to_string(), "7");

    let mut state = DefaultHasher::new();
    id.hash(&mut state);
    let mut scalar = DefaultHasher::new();
    7_u32.hash(&mut scalar);
    assert_eq!(state.finish(), scalar.finish());

    let values: IdVec<Index, _> = IdVec::from_raw(vec![3, 4]);
    assert_eq!(values[Index::new(1)], 4);
}

#[test]
fn scalar_conversions() {
    assert_eq!(Index::new(9).get(), 9);
    assert_eq!(Index::from_u32(9), Index::new(9));
    assert_eq!(Index::from_u64(9), Index::new(9));
    assert_eq!(Index::from_usize(9), Index::new(9));
    assert_eq!(Index::try_from(9_u32), Ok(Index::new(9)));
    assert_eq!(Index::try_from(9_u64), Ok(Index::new(9)));
    assert_eq!(Index::try_from(9_usize), Ok(Index::new(9)));
    assert_eq!(Index::MIN.get(), 0);
    assert_eq!(Index::MAX.get(), u32::MAX);
    assert_eq!(Index::MIN.prev(), None);
    assert_eq!(Index::new(9).prev(), Some(Index::new(8)));
    assert_eq!(
        Index::try_from(u64::from(u32::MAX) + 1),
        Err(IdError::OutOfRange {
            value: u64::from(u32::MAX) + 1,
            min: 0,
            max: u64::from(u32::MAX),
        })
    );
}

#[test]
fn const_operations() {
    const RAW: u32 = Index::new(3).get();
    const FROM: Index = Index::from_u32(3);
    const TRY_FROM: Result<Index, IdError> = Index::try_from(3_u64);
    const COMPARED: Ordering = Index::new(3).cmp(&Index::new(4));
    const BYTE: u8 = ByteId::<Domain>::new(12).get();
    const LITTLE: Ordering = LittleId::<Domain>::new(2).cmp(&LittleId::new(256));

    assert_eq!(RAW, 3);
    assert_eq!(FROM.get(), 3);
    assert_eq!(TRY_FROM, Ok(FROM));
    assert_eq!(COMPARED, Ordering::Less);
    assert_eq!(BYTE, 12);
    assert_eq!(LITTLE, Ordering::Less);
}

fn shorten<'short>(id: DomainId<&'static ()>, _: &'short ()) -> DomainId<&'short ()> {
    id
}

#[test]
fn marker_covariance() {
    let local = ();
    let id = shorten(DomainId::new(5), &local);
    assert_eq!(id.get(), 5);
    assert_eq!(id, DomainId::new(5));
}

#[test]
fn multiple_domains() {
    assert_eq!(Pair::MIN.get(), 10);
    assert_eq!(Pair::MAX.get(), 19);
    assert_eq!(Pair::new(13).to_string(), "index:13");
    assert_eq!(Pair::forward_checked(Pair::new(18), 1), Some(Pair::new(19)));
    assert_eq!(Pair::forward_checked(Pair::new(19), 1), None);
    assert_eq!(Pair::backward_checked(Pair::new(10), 1), None);
    assert_eq!(
        Pair::steps_between(&Pair::new(10), &Pair::new(19)),
        (9, Some(9))
    );
    assert_eq!(Pair::forward_overflowing(Pair::MAX, 1), (Pair::MAX, true));
    assert_eq!(Pair::backward_overflowing(Pair::MIN, 1), (Pair::MIN, true));
    assert_eq!(
        Pair::try_from(20_u32),
        Err(IdError::OutOfRange {
            value: 20,
            min: 10,
            max: 19
        })
    );
}

#[test]
#[should_panic(expected = "id value must be between 10<20")]
fn bounded_constructor_overflow() {
    let _: Pair = Pair::new(20);
}

#[test]
fn unsized_domains() {
    let index = DomainId::<[u8]>::from_u32(1);
    let table: IdVec<DomainId<[u8]>, _> = IdVec::from_raw(vec![3, 4]);
    assert_eq!(table[index], 4);
    assert_eq!(index.id(), index);
    assert_eq!(index.to_string(), "1");
    assert_eq!(DomainId::<str>::try_from(5_u64).expect("in range").get(), 5);
    assert_eq!(DomainId::<dyn core::fmt::Display>::new(6).get(), 6);
    assert_eq!(size_of::<DomainId<[u8]>>(), size_of::<u32>());
    assert_eq!(align_of::<DomainId<[u8]>>(), align_of::<u32>());
}

#[test]
fn unsized_multiple_domains() {
    type UnsizedPair = BoundedId<[u8], str>;

    let index = UnsizedPair::new(12);
    assert_eq!(index.id(), index);
    assert_eq!(index.get(), 12);
    assert!(index < UnsizedPair::new(13));
    assert_eq!(
        UnsizedPair::forward_checked(index, 1),
        Some(UnsizedPair::new(13))
    );
    assert_eq!(size_of::<UnsizedPair>(), size_of::<u16>());
}

#[test]
fn unsized_bytes() {
    type UnsizedCollision = CollisionId<[u8], str, [u16], str>;

    let little = LittleId::<[u8]>::new(0x1234);
    let big = BigId::<str>::new(0x1234);
    let native = NativeId::<[u8]>::new(0x1234);
    assert_eq!(
        LittleId::read_from_bytes(little.as_bytes()).expect("valid encoding"),
        little
    );
    assert_eq!(
        BigId::read_from_bytes(big.as_bytes()).expect("valid encoding"),
        big
    );
    assert_eq!(
        NativeId::read_from_bytes(native.as_bytes()).expect("valid encoding"),
        native
    );
    assert_eq!(
        ByteId::<[u8]>::try_read_from_bytes(&[10])
            .expect("lower bound")
            .get(),
        10
    );
    assert_eq!(
        UnsizedCollision::try_read_from_bytes(&[20, 0]).expect("upper bound"),
        UnsizedCollision::new(20)
    );
    UnsizedCollision::try_read_from_bytes(&[21, 0]).expect_err("above upper bound");
    assert_eq!(size_of::<UnsizedCollision>(), 2);
    assert_eq!(align_of::<UnsizedCollision>(), 1);
}

#[test]
fn bytes_layout() {
    assert_eq!(size_of::<LittleId<Domain>>(), 2);
    assert_eq!(align_of::<LittleId<Domain>>(), 1);
    assert_eq!(size_of::<BigId<Domain>>(), 4);
    assert_eq!(align_of::<BigId<Domain>>(), 1);
    assert_eq!(size_of::<Index>(), size_of::<u32>());
    assert_eq!(align_of::<Index>(), align_of::<u32>());
}

#[test]
fn bytes_round_trip() {
    let little = LittleId::<Domain>::new(0x1234);
    let big = BigId::<Domain>::new(0x1234_5678);
    let native = NativeId::<Domain>::new(0x1234);
    assert_eq!(little.as_bytes(), [0x34, 0x12]);
    assert_eq!(big.as_bytes(), [0x12, 0x34, 0x56, 0x78]);
    assert_eq!(
        LittleId::read_from_bytes(little.as_bytes()).expect("valid encoding"),
        little
    );
    assert_eq!(
        BigId::read_from_bytes(big.as_bytes()).expect("valid encoding"),
        big
    );
    assert_eq!(
        NativeId::read_from_bytes(native.as_bytes()).expect("valid encoding"),
        native
    );
    assert!(LittleId::<Domain>::new(2) < LittleId::new(256));
}

#[test]
fn bounded_bytes_range() {
    assert_eq!(
        Collision::try_read_from_bytes(&[20, 0]).expect("upper bound"),
        Collision::new(20)
    );
    assert_eq!(Collision::new(10).as_bytes(), [10, 0]);
    assert_eq!(
        ByteId::<Domain>::try_read_from_bytes(&[10])
            .expect("lower bound")
            .get(),
        10
    );
    Collision::try_read_from_bytes(&[21, 0]).expect_err("above upper bound");
    Collision::try_read_from_bytes(&[9, 0]).expect_err("below lower bound");
    ByteId::<Domain>::try_read_from_bytes(&[21]).expect_err("above upper bound");
    ByteId::<Domain>::try_read_from_bytes(&[0]).expect_err("below lower bound");
}
