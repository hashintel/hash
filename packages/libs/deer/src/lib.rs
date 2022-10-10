//! Intentionally left blank for now!

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs, unreachable_pub, clippy::pedantic, clippy::nursery)]
#![allow(clippy::redundant_pub_crate)]
#![allow(clippy::module_name_repetitions)]
#![forbid(unsafe_code)]

use alloc::string::String;

use error_stack::{IntoReport, Result, ResultExt};
use num_traits::ToPrimitive;

pub use crate::{error::Error, number::Number};

mod error;
mod number;

extern crate alloc;

#[derive(Debug, Copy, Clone)]
pub enum PrimitiveType {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,
}

macro_rules! derive_from_number {
    ([$($name:ident; $method:ident),*]) => {
        $(derive_from_number!(#internal, $name; $method);)*
    };

    (#internal, $name:ident; $method:ident) => {
        fn $name(self) -> Result<$name, Self::Error> {
            self.number()?
                .$method()
                .ok_or_else(|| Self::Error::message("provided value too large or too small"))
                .into_report()
        }
    };
}

pub trait Deserializer: Sized {
    type Error: Error;
    type Array;
    type Object;

    fn current(&self) -> PrimitiveType;

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
        isize; to_isize,
        u8; to_u8,
        u16; to_u16,
        u32; to_u32
    ]);

    derive_from_number!([
        i128; to_i128,
        u64; to_u64,
        u128; to_u128,
        usize; to_usize
    ]);
}

pub trait Deserialize: Sized {
    fn name() -> &'static str;

    fn deserialize<D: Deserializer>(de: D) -> Result<Self, D::Error>;
}
