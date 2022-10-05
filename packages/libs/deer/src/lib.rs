//! Intentionally left blank for now!

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs, unreachable_pub, clippy::pedantic, clippy::nursery)]
#![allow(clippy::redundant_pub_crate)]
#![allow(clippy::module_name_repetitions)]
#![forbid(unsafe_code)]

mod error;
mod number;

extern crate alloc;
extern crate core;

use crate::number::Number;

macro_rules! derive_from_number {
    ($name:ident; $method:ident) => {
        fn $name(self) -> Result<$name, Self::Error> {
            self.number()?
                .$method()
                // TODO!
                .ok_or_else(|| Self::Error::expected(DataType::I8))
                .into_report()
                .attach(Path::new())
        }
    };

    ([$($name:ident; $method:ident),*]) => {
        $(derive_from_number!($name; $method))*
    }
}

pub trait Deserializer: Sized {
    type Error: error::Error;
    type Array;
    type Object;

    fn null(self) -> Result<(), Self::Error>;
    fn bool(self) -> Result<bool, Self::Error>;
    fn number(self) -> Result<Number, Self::Error>;
    fn string(self) -> Result<String, Self::Error>;
    fn array(self) -> Result<Self::Array, Self::Error>;
    fn object(self) -> Result<Self::Object, Self::Error>;

    derive_from_number!([
        i8; to_i8,
        i16; to_i16,
        i32; to_i32,
        i64; to_i64,
        i128; to_i128,
        isize; to_isize,
        u8; to_u8,
        u16; to_u16,
        u32; to_u32,
        u64; to_u64,
        u128; to_u128,
        usize; to_usize
    ]);
}

pub trait Deserialize: Sized {
    fn name() -> &'static str;

    fn deserialize<D: Deserializer>(de: D) -> Result<Self, D::Error>;
}
