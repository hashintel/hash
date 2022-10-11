#![cfg_attr(not(feature = "std"), no_std)]
#![warn(unreachable_pub, clippy::pedantic, clippy::nursery)]
// TODO: once more stable introduce: warning missing_docs
#![allow(clippy::redundant_pub_crate)]
#![allow(clippy::module_name_repetitions)]
#![forbid(unsafe_code)]

use alloc::{
    collections::BTreeMap,
    string::{String, ToString},
    vec::Vec,
};
use core::marker::PhantomData;

use error_stack::{IntoReport, Report, Result, ResultExt};
use num_traits::ToPrimitive;

pub use crate::{error::Error, number::Number};

mod error;
mod number;

extern crate alloc;

pub trait ObjectAccess<'de> {
    type Error: Error;

    fn value<T>(&mut self, key: &str) -> Result<T, Self::Error>
    where
        T: Deserialize<'de>;

    fn next<T>(&mut self) -> Result<Option<(String, T)>, Self::Error>
    where
        T: Deserialize<'de>;

    fn finish(self) -> Result<(), Self::Error>;
}

pub trait ArrayAccess<'de> {
    type Error: Error;

    fn next<T>(&mut self) -> Result<Option<T>, Self::Error>
    where
        T: Deserialize<'de>;

    fn finish(self) -> Result<(), Self::Error>;
}

// TODO: Error PR: attach the expected and received type
pub trait Visitor<'de>: Sized {
    type Error: Error;
    type Value;

    fn expecting_display(&self) -> String;

    // TODO: this is currently completely untyped, we might want to adhere to a standard, like
    //  JSON-Schema or OpenAPI
    //  The problem here mainly is: which crate to use, one can use utoipa (but that has significant
    //  overhead)  there's no real library out there that properly just provides the types
    //  necessary.
    fn expecting_schema(&self) -> BTreeMap<String, String> {
        BTreeMap::new()
    }

    fn visit_none(self) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected missing value",
        )))
    }

    fn visit_null(self) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type null",
        )))
    }

    fn visit_bool(self, v: bool) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type bool",
        )))
    }

    // TODO: should this auto-delegate to one of the other visit functions?!
    //  ~> experimentation is needed
    fn visit_number(self, v: Number) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type number",
        )))
    }

    fn visit_char(self, v: String) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type char",
        )))
    }

    fn visit_string(self, v: String) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type string",
        )))
    }
    fn visit_str(self, v: &str) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type string",
        )))
    }
    fn visit_borrowed_str(self, v: &'de str) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type string",
        )))
    }

    fn visit_bytes_buffer(self, v: Vec<u8>) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type string",
        )))
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type string",
        )))
    }

    fn visit_borrowed_bytes(self, v: &'de [u8]) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type string",
        )))
    }

    fn visit_array<T>(self, v: T) -> Result<Self::Value, Self::Error>
    where
        T: ArrayAccess<'de>,
    {
        Err(Report::new(Self::Error::message(
            "unexpected value of type array",
        )))
    }

    fn visit_object<T>(self, v: T) -> Result<Self::Value, Self::Error>
    where
        T: ObjectAccess<'de>,
    {
        Err(Report::new(Self::Error::message(
            "unexpected value of type object",
        )))
    }

    fn visit_i8(self, v: i8) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type i8",
        )))
    }

    fn visit_i16(self, v: i16) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type i16",
        )))
    }

    fn visit_i32(self, v: i32) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type i32",
        )))
    }

    fn visit_i64(self, v: i64) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type i64",
        )))
    }

    fn visit_i128(self, v: i128) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type i128",
        )))
    }

    fn visit_isize(self, v: isize) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type isize",
        )))
    }

    fn visit_u8(self, v: u8) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type u8",
        )))
    }

    fn visit_u16(self, v: u16) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type u16",
        )))
    }

    fn visit_u32(self, v: u32) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type u32",
        )))
    }

    fn visit_u64(self, v: u64) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type u64",
        )))
    }

    fn visit_u128(self, v: u128) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type u128",
        )))
    }

    fn visit_usize(self, v: usize) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type usize",
        )))
    }

    fn visit_f32(self, v: f32) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type f32",
        )))
    }

    fn visit_f64(self, v: f64) -> Result<Self::Value, Self::Error> {
        Err(Report::new(Self::Error::message(
            "unexpected value of type f64",
        )))
    }
}

// internal visitor, which is used during the default implementation of the `deserialize_i*` and
// `deserialize_u*` methods.
struct NumberVisitor<E: Error>(PhantomData<fn() -> E>);

impl<E: Error> NumberVisitor<E> {
    fn new() -> Self {
        Self(PhantomData::default())
    }
}

impl<E: Error> Visitor<'_> for NumberVisitor<E> {
    type Error = E;
    type Value = Number;

    fn expecting_display(&self) -> String {
        "number".to_string()
    }

    fn visit_number(self, v: Number) -> Result<Self::Value, Self::Error> {
        Ok(v)
    }
}

macro_rules! derive_from_number {
    [$($method:ident ($to:ident) -> $visit:ident,)*] => {
        $(derive_from_number!(#internal, $method; $to, $visit);)*
    };

    (#internal, $method:ident; $to:ident, $visit:ident) => {
        /// Automatically implemented convenience method, which uses [`Self::deserialize_number`]
        /// to extract a value of the primitive type, will otherwise error out.
        ///
        /// # Errors
        ///
        /// Current value is either not a number or wasn't able to be casted to the primitive type
        fn $method<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            let n = self.deserialize_number(NumberVisitor::<Self::Error>::new())?;
            let v = n
                .$to()
                .ok_or_else(|| Self::Error::message("provided value too large or too small"))
                .into_report()?;

            visitor.$visit(v).change_context(Self::Error::new())
        }
    };
}

/// A **data format** that can deserialize any data structure which is supported by deer.
///
/// This traits defines the deserialization half, while [`Deserialize`] is used to use the
/// deserializer to convert that data into the instance of a type, or fail if that was not possible.
///
/// `deer`s focus is on simplicity, therefore the data model is a lot less specific than ones used
/// by other crates (like [`serde`]).
///
/// The data model consists of the following types:
///
/// * 7 primitives:
///     * `none`
///         * encodes the missing of a value (`undefined` in JS)
///     * `null`
///         * encodes the explicit absence of a value (`null` in JSON)
///     * `bool`
///         * Rust equivalent: [`true`], [`false`]
///     * `number`
///         * encodes both floating point and integral numbers
///     * `char`:
///         * example: `'a'`
///     * `string`
///         * example: `"Hello World!"`
///     * `bytes`
///         * example: `[0b0001, 0b1000]`
/// * composite types
///     * `object`
///         * encodes any object, be it a map, struct or enum struct variant
///     * `array`
///         * encodes any sequence of data, be it an array, a set or tuple
///
/// The [`Deserializer`] trait supports a single entrypoint, which are methods that consume the
/// [`Deserializer`] and either return the value requested or return an error.
///
/// [`serde`]: https://serde.rs/
pub trait Deserializer<'de>: Sized {
    /// The error type that can be returned if some error occurs during deserialization
    type Error: Error;

    /// Require the [`Deserializer`] to figure out **how** to drive the visitor based on input data.
    ///
    /// You should not rely on this when implementing [`Deserialize`], as non self-describing
    /// formats are unable to provide this method.
    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    fn deserialize_none<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    /// Deserialize a `null` (or equivalent type) value
    ///
    /// This type should signal the explicit absence of a value, not to be confused with the
    ///
    /// # Errors
    ///
    /// Current value is not of type null
    fn deserialize_null<V>(self, visitor: V) -> Result<V, Self::Error>
    where
        V: Visitor<'de>;

    /// Deserialize a [`bool`] value.
    ///
    /// Some formats might not have this concept and should always error out if that is the case.
    ///
    /// > **Hint**: Do not try to coerce values like `1` or `0` to booleans, this is highly
    /// > discouraged. The [`Deserialize`] implementation or a future version of `deer` should do
    /// > that instead.
    ///
    /// # Errors
    ///
    /// Current value is not of type bool
    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    /// Deserialize a [`Number`] value.
    ///
    /// This is a super-type of primitive types used by Rust, this is due to the fact that some
    /// formats (like `JSON`) do not have the concept of multiple types that represent
    /// integers/floats.
    ///
    /// This method also enables a default trait implementation for all primitives types.
    ///
    /// > **Hint**: Do not try to coerce values like `"1"`, `"0"`, `true`, `false` to numbers, this
    /// > is highly discouraged. The [`Deserialize`] implementation of a future version of `deer`
    /// > would implement that functionality.
    ///
    /// # Errors
    ///
    /// Current value is not of type number
    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    /// Deserialize a [`String`] value.
    ///
    /// `deer` (in contrast to [`serde`]) does not support `&str`, this is because `deer` only
    /// handles owned data, this comes with some overhead, but enables easier implementation.
    ///
    /// > **Hint**: Do not try to cerce values to string, this is highly discouraged and only
    /// > [`Deserialize`] or a future version of `deer` should implement that functionality, if
    /// > desired.
    ///
    /// # Errors
    ///
    /// Current value is not of type string
    ///
    /// [`serde`]: https://serde.rs/
    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    /// Deserialize an `Array`
    ///
    /// This should not directly deserialize into a `Vec<T>`, but return a type that implements
    /// `ArrayAccess`, this type then iterates over all values.
    ///
    /// # Errors
    ///
    /// Current value is not of type array
    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    /// Deserialize a `Object`
    ///
    /// This should not directly deserialize into a object, but instead return a type that
    /// implements `ObjectAccess`, this type will then go through all entries.
    ///
    /// # Errors
    ///
    /// Current value is not of type object
    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>;

    derive_from_number![
        deserialize_i8(to_i8) -> visit_i8,
        deserialize_i16(to_i16) -> visit_i16,
        deserialize_i32(to_i32) -> visit_i32,
        deserialize_i64(to_i64) -> visit_i64,
        deserialize_i128(to_i128) -> visit_i128,
        deserialize_isize(to_isize) -> visit_isize,

        deserialize_u8(to_u8) -> visit_u8,
        deserialize_u16(to_u16) -> visit_u16,
        deserialize_u32(to_u32) -> visit_u32,
        deserialize_u64(to_u64) -> visit_u64,
        deserialize_u128(to_u128) -> visit_u128,
        deserialize_usize(to_usize) -> visit_usize,

        deserialize_f32(to_f32) -> visit_f32,
        deserialize_f64(to_f64) -> visit_f64,
    ];
}

/// A **data-structure** that can be deserialized from any format supported by deer.
///
/// `deer` provides [`Deserialize`] implementations for many Rust primitives and standard library
/// types.
///
/// Additionally `deer` provides a derive macro which can automatically generate the trait.
///
/// In rare cases it may be necessary to implement [`Deserialize`] manually, in that case you can
/// use the automatically generated output
/// (which can be displayed with tools like [cargo-expand](https://github.com/dtolnay/cargo-expand))
/// as a template. The macro generates human readable code which can be used as template.
// TODO: add example
pub trait Deserialize<'de>: Sized {
    /// Deserialize this value from the given `deer` deserializer.
    ///
    /// # Errors
    ///
    /// Deserialization was unsuccessful
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error>;
}
