#[cfg(feature = "arbitrary-precision")]
use num_bigfloat::BigFloat;
#[cfg(feature = "arbitrary-precision")]
use num_bigint::BigInt;
use num_traits::{FromPrimitive, ToPrimitive};

#[derive(Debug, Clone)]
enum OpaqueNumber {
    Int(i64),
    #[cfg(feature = "arbitrary-precision")]
    BigInt(BigInt),

    Float(f64),
    #[cfg(feature = "arbitrary-precision")]
    BigFloat(BigFloat),
}

#[derive(Debug, Clone)]
pub struct Number(OpaqueNumber);

impl FromPrimitive for Number {
    fn from_isize(n: isize) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_i8(n: i8) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n as i64)))
    }

    fn from_i16(n: i16) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n as i64)))
    }

    fn from_i32(n: i32) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n as i64)))
    }

    fn from_i64(n: i64) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n)))
    }

    fn from_i128(n: i128) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_usize(n: usize) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_u8(n: u8) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n as i64)))
    }

    fn from_u16(n: u16) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n as i64)))
    }

    fn from_u32(n: u32) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n as i64)))
    }

    fn from_u64(n: u64) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_u128(n: u128) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_f32(n: f32) -> Option<Self> {
        Some(Self(OpaqueNumber::Float(n as f64)))
    }

    fn from_f64(n: f64) -> Option<Self> {
        Some(Self(OpaqueNumber::Float(n)))
    }
}

macro_rules! to_int {
    ($method:ident) => {
        fn $method(&self) -> Option<isize> {
            match &self.0 {
                OpaqueNumber::Int(x) => x.$method(),
                #[cfg(feature = "arbitrary-precision")]
                OpaqueNumber::BigInt(x) => x.$method(),

                // they return None because the conversion from int to float is not lossless
                OpaqueNumber::Float(x) => None,
                #[cfg(feature = "arbitrary-precision")]
                OpaqueNumber::BigFloat(x) => None,
            }
        }
    };
    ($($method:ident),*) => {
        $(to_int!($method))*
    }
}

impl ToPrimitive for Number {
    to_int!(
        to_isize, to_i8, to_i16, to_i32, to_i64, to_i128, //
        to_usize, to_u8, to_u16, to_u32, to_u64, to_u128
    );

    fn to_f32(&self) -> Option<f32> {
        match &self.0 {
            OpaqueNumber::Int(x) => x.to_f32(),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::BigInt(x) => x.to_f32(),

            OpaqueNumber::Float(x) => x.to_f32(),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::BigFloat(x) => x.to_f32(),
        }
    }

    fn to_f64(&self) -> Option<f64> {
        match &self.0 {
            OpaqueNumber::Int(x) => x.to_f64(),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::BigInt(x) => x.to_f64(),

            OpaqueNumber::Float(x) => Some(*x),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::BigFloat(x) => x.to_f64(),
        }
    }
}
