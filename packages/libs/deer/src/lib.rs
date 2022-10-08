//! Intentionally left blank for now!

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs, unreachable_pub, clippy::pedantic, clippy::nursery)]
#![allow(clippy::redundant_pub_crate)]
#![allow(clippy::module_name_repetitions)]
#![forbid(unsafe_code)]

use alloc::string::String;

use error_stack::{IntoReport, Result};
use num_traits::ToPrimitive;

pub use crate::{error::Error, number::Number};

mod error;
mod number;

extern crate alloc;

/// Lookup of Type
///
/// This is used as the signal for the type that is currently present, [`Deserialize`]
/// implementations may use this to special case certain values.
#[derive(Debug, Copy, Clone)]
pub enum PrimitiveType {
    /// null type
    Null,
    /// bool type
    Bool,
    /// number type
    Number,
    /// string type
    String,
    /// array type
    Array,
    /// object type
    Object,
}

macro_rules! derive_from_number {
    ([$($name:ident; $method:ident),*]) => {
        $(derive_from_number!(#internal, $name; $method);)*
    };

    (#internal, $name:ident; $method:ident) => {
        /// Automatically implemented convenience method, which uses [`Self::number`] to extract
        /// a value of the primitive type, will otherwise error out.
        ///
        /// # Errors
        ///
        /// Current value is either not a number or wasn't able to be casted to the primitive type
        fn $name(self) -> Result<$name, Self::Error> {
            self.number()?
                .$method()
                .ok_or_else(|| Self::Error::message("provided value too large or too small"))
                .into_report()
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
/// * 4 primitives:
///     * `null` (equivalent to [`None`] or `()`)
///     * `bool` (equivalent to [`true`], [`false`])
///     * `number` (equivalent to `1u8`, `257i16`, ...)
///     * `string` (equivalent to `"Hello World!"`)
/// * composite types
///     * `object` (equivalent to `struct`, `enum struct variant`)
///     * `array` (equivalent to `Vec<T>`, `HashSet<T>`, `(T, U)`)
///
/// The [`Deserializer`] trait supports a single entrypoint, which are methods that consume the
/// [`Deserializer`] and either return the value requested or return an error.
///
/// [`serde`]: https://serde.rs/
pub trait Deserializer: Sized {
    /// The error type that can be returned if some error occurs during deserialization
    type Error: Error;
    /// The type returned from [`Self::array`], which must implement the <TO BE ADDED> trait.
    type Array;
    /// The type returned from [`Self::object`], which must implement the <TO BE ADDED> trait.
    type Object;

    /// Lookup
    ///
    /// This must return the determined type for the current value, the corresponding method call
    /// **must not** fail.
    fn current(&self) -> PrimitiveType;

    /// Deserialize a `null` (or equivalent type) value
    ///
    /// This type should signal missing or empty.
    ///
    /// Some formats do not have this concept and should in that case always error out, formats like
    /// `JSON`, which have multiple representations for `null` should return from this function!
    ///
    /// # Errors
    ///
    /// Current value is not of type null
    fn null(self) -> Result<(), Self::Error>;

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
    fn bool(self) -> Result<bool, Self::Error>;

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
    fn number(self) -> Result<Number, Self::Error>;

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
    fn string(self) -> Result<String, Self::Error>;

    /// Deserialize a `Array`
    ///
    /// This should not directly deserialize into a `Vec<T>`, but return a type that implements
    /// `ArrayAccess`, this type then iterates over all values.
    ///
    /// # Errors
    ///
    /// Current value is not of type array
    fn array(self) -> Result<Self::Array, Self::Error>;

    /// Deserialize a `Object`
    ///
    /// This should not directly deserialize into a object, but instead return a type that
    /// implements `ObjectAccess`, this type will then go through all entries.
    ///
    /// # Errors
    ///
    /// Current value is not of type object
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
pub trait Deserialize: Sized {
    /// The name of the type, this is used during error reporting to display a correct name.
    fn name() -> &'static str;

    /// Deserialize this value from the given `deer` deserializer.
    ///
    /// # Errors
    ///
    /// Deserialization was unsuccessful
    fn deserialize<D: Deserializer>(de: D) -> Result<Self, D::Error>;
}
