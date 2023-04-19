#![cfg_attr(
    nightly,
    feature(
        provide_any,
        error_in_core,
        error_generic_member_access,
        integer_atomics,
        saturating_int_impl,
        sync_unsafe_cell,
        exclusive_wrapper
    )
)]
#![cfg_attr(not(feature = "std"), no_std)]

// TODO: note to implementors of `Deserialize` to allow for `visit_none` and to defer to
//  `visit_none` on every `deserialize_*` call if appropriate. missing value (`visit_none`) will
//  only be generated through `*Access` implementations.

use alloc::{string::String, vec::Vec};
use core::marker::PhantomData;

use error_stack::{Report, Result, ResultExt};
use num_traits::{FromPrimitive, ToPrimitive};
pub use schema::{Document, Reflection, Schema};

pub use crate::{context::Context, number::Number};
use crate::{
    error::{
        ArrayAccessError, DeserializeError, DeserializerError, ExpectedType, MissingError,
        ObjectAccessError, ReceivedType, ReceivedValue, TypeError, ValueError, Variant,
        VisitorError,
    },
    schema::visitor,
};

mod context;
pub mod error;
mod impls;
#[macro_use]
mod macros;
mod number;
pub mod schema;
pub mod value;

extern crate alloc;

struct GenericFieldVisitor<T, U>(PhantomData<fn() -> *const (T, U)>);

impl<'de, T: Deserialize<'de>, U: Deserialize<'de>> FieldVisitor<'de>
    for GenericFieldVisitor<T, U>
{
    type Key = T;
    type Value = (T, U);

    fn visit_value<D>(self, key: Self::Key, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        U::deserialize(deserializer)
            .map(|value| (key, value))
            .change_context(VisitorError)
    }
}

type FieldValue<'de, F> = <F as FieldVisitor<'de>>::Value;
type FieldResult<'de, F> = Option<Result<FieldValue<'de, F>, ObjectAccessError>>;

pub trait ObjectAccess<'de> {
    fn context(&self) -> &Context;

    /// This enables bound-checking for [`ObjectAccess`].
    ///
    /// After calling this [`ObjectAccess`] will
    /// ensure that there are never more than `length` values returned by [`Self::next`], if there
    /// are not enough items present [`ArrayAccess`] will call [`Visitor::visit_none`].
    ///
    /// This is best suited for types where the length/amount of keys is already predetermined, like
    /// structs or enum variants.
    ///
    /// # Errors
    ///
    /// This will error if a call to [`Self::next`] has been made before calling this function or
    /// this function has been called repeatably.
    fn set_bounded(&mut self, length: usize) -> Result<(), ObjectAccessError>;

    fn next<K, V>(&mut self) -> Option<Result<(K, V), ObjectAccessError>>
    where
        K: Deserialize<'de>,
        V: Deserialize<'de>,
    {
        self.field(GenericFieldVisitor(PhantomData))
    }

    fn field<F>(&mut self, access: F) -> FieldResult<'de, F>
    where
        F: FieldVisitor<'de>;

    fn size_hint(&self) -> Option<usize>;

    fn end(self) -> Result<(), ObjectAccessError>;
}

pub trait FieldVisitor<'de> {
    type Key: Deserialize<'de>;
    type Value;

    fn visit_key<D>(&self, deserializer: D) -> Result<Self::Key, VisitorError>
    where
        D: Deserializer<'de>,
    {
        <Self::Key as Deserialize<'de>>::deserialize(deserializer).change_context(VisitorError)
    }

    fn visit_value<D>(self, key: Self::Key, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>;
}

pub trait ArrayAccess<'de> {
    fn context(&self) -> &Context;

    /// Enables bound-checking for [`ArrayAccess`].
    ///
    /// After calling this [`ArrayAccess`] will
    /// ensure that there are never more than `length` values returned by [`Self::next`], if there
    /// are not enough items present [`ArrayAccess`] will call [`Visitor::visit_none`].
    ///
    /// One should still invoke [`Self::end`] to ensure that not too many items are supplied!
    ///
    /// This is best suited for types where the length is already predetermined, like arrays or
    /// tuples, and should not be set on types like [`Vec`]!
    ///
    /// # Errors
    ///
    /// This will error if a call to [`Self::next`] has been made before setting
    /// [`Self::set_bounded`] or [`Self::set_bounded`] was called repeatedly.
    fn set_bounded(&mut self, length: usize) -> Result<(), ArrayAccessError>;

    fn next<T>(&mut self) -> Option<Result<T, ArrayAccessError>>
    where
        T: Deserialize<'de>;

    fn size_hint(&self) -> Option<usize>;

    fn end(self) -> Result<(), ArrayAccessError>;
}

pub trait EnumVisitor<'de>: Sized {
    // TODO: interesting part: serde actually has `deserialize_identifier` which can be used
    //  deserialize implementations can then use that to their advantage by default it also
    //  generates an index version for all fields, that is gated behind `deserialize_identifier`.
    //  Maybe we want something like a `DiscriminantVisitor` and `visit_enum_discriminant`?
    type Discriminant: Deserialize<'de>;

    // the value we will end up with
    type Value;

    fn expecting(&self) -> Document;

    fn visit_discriminant<D>(&self, deserializer: D) -> Result<Self::Discriminant, VisitorError>
    where
        D: Deserializer<'de>,
    {
        <Self::Discriminant as Deserialize<'de>>::deserialize(deserializer)
            .change_context(VisitorError)
    }

    fn visit_value<D>(
        self,
        discriminant: Self::Discriminant,
        deserializer: D,
    ) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>;
}

// pub trait VariantAccess<'de>: Sized {}
//
// pub trait EnumAccess<'de> {}

// Reason: We error out on every `visit_*`, which means we do not use the value, but(!) IDEs like to
// use the name to make autocomplete, therefore names for unused parameters are required.
#[allow(unused_variables)]
pub trait Visitor<'de>: Sized {
    type Value;

    fn expecting(&self) -> Document;

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Err(Report::new(MissingError.into_error())
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<()>::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_bool(self, v: bool) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(bool::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_number(self, v: Number) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(Number::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_char(self, v: char) -> Result<Self::Value, VisitorError> {
        let mut buffer = [0; 4];
        let v = v.encode_utf8(&mut buffer);

        self.visit_str(v)
            .attach(ReceivedType::new(char::reflection()))
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<&str>::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_borrowed_str(self, v: &'de str) -> Result<Self::Value, VisitorError> {
        self.visit_str(v)
    }

    fn visit_string(self, v: String) -> Result<Self::Value, VisitorError> {
        self.visit_str(&v)
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::BinarySchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_borrowed_bytes(self, v: &'de [u8]) -> Result<Self::Value, VisitorError> {
        self.visit_bytes(v)
    }

    fn visit_bytes_buffer(self, v: Vec<u8>) -> Result<Self::Value, VisitorError> {
        self.visit_bytes(&v)
    }

    fn visit_array<T>(self, v: T) -> Result<Self::Value, VisitorError>
    where
        T: ArrayAccess<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::ArraySchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_object<T>(self, v: T) -> Result<Self::Value, VisitorError>
    where
        T: ObjectAccess<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::ObjectSchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_i8(self, v: i8) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(i8::reflection()))
    }

    fn visit_i16(self, v: i16) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(i16::reflection()))
    }

    fn visit_i32(self, v: i32) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v)).attach(i32::reflection())
    }

    fn visit_i64(self, v: i64) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(i64::reflection()))
    }

    fn visit_i128(self, v: i128) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(i128::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_isize(self, v: isize) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(isize::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_u8(self, v: u8) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(u8::reflection()))
    }

    fn visit_u16(self, v: u16) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(u16::reflection()))
    }

    fn visit_u32(self, v: u32) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(u32::reflection()))
    }

    fn visit_u64(self, v: u64) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(u64::reflection()))
    }

    fn visit_u128(self, v: u128) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(u128::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_usize(self, v: usize) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(usize::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_f32(self, v: f32) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(f32::reflection()))
    }

    fn visit_f64(self, v: f64) -> Result<Self::Value, VisitorError> {
        self.visit_number(Number::from(v))
            .attach(ReceivedType::new(f64::reflection()))
    }
}

#[allow(unused_variables)]
pub trait OptionalVisitor<'de>: Sized {
    type Value;

    fn expecting(&self) -> Document;

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Err(Report::new(MissingError.into_error())
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<()>::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        // we do not know what the received type was as we delegate to the inner implementation
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }
}

// internal visitor, which is used during the default implementation of the `deserialize_i*` and
// `deserialize_u*` methods.
struct NumberVisitor<T: Reflection>(PhantomData<fn() -> *const T>);

impl<T: Reflection> NumberVisitor<T> {
    fn value_error(
        &self,
        value: impl erased_serde::Serialize + Send + Sync + 'static,
    ) -> Report<VisitorError> {
        Report::new(ValueError.into_error())
            .attach(ReceivedValue::new(value))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError)
    }
}

impl<T: Reflection> Visitor<'_> for NumberVisitor<T> {
    type Value = Number;

    fn expecting(&self) -> Document {
        T::document()
    }

    fn visit_number(self, v: Number) -> Result<Self::Value, VisitorError> {
        Ok(v)
    }

    fn visit_i128(self, v: i128) -> Result<Self::Value, VisitorError> {
        Number::from_i128(v)
            .ok_or_else(|| self.value_error(v))
            .and_then(|number| self.visit_number(number))
    }

    fn visit_isize(self, v: isize) -> Result<Self::Value, VisitorError> {
        Number::from_isize(v)
            .ok_or_else(|| self.value_error(v))
            .and_then(|number| self.visit_number(number))
    }

    fn visit_u128(self, v: u128) -> Result<Self::Value, VisitorError> {
        Number::from_u128(v)
            .ok_or_else(|| self.value_error(v))
            .and_then(|number| self.visit_number(number))
    }

    fn visit_usize(self, v: usize) -> Result<Self::Value, VisitorError> {
        Number::from_usize(v)
            .ok_or_else(|| self.value_error(v))
            .and_then(|number| self.visit_number(number))
    }
}

macro_rules! derive_from_number {
    [$($method:ident ($to:ident : $schema:ident) -> $visit:ident,)*] => {
        $(derive_from_number!(#internal, $method; $schema, $to, $visit);)*
    };

    (#internal, $method:ident; $schema:ident, $to:ident, $visit:ident) => {
        /// Automatically implemented convenience method, which uses [`Self::deserialize_number`]
        /// to extract a value of the primitive type, will otherwise error out.
        ///
        /// # Errors
        ///
        /// Current value is either not a number or wasn't able to be casted to the primitive type
        fn $method<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: Visitor<'de>,
        {
            let n = self.deserialize_number(NumberVisitor::<<$schema as Deserialize>::Reflection>(PhantomData))?;
            let v = n
                .$to()
                .ok_or_else(||
                    Report::new(ValueError.into_error())
                        .attach(ExpectedType::new(<$schema>::reflection()))
                        .attach(ReceivedValue::new(n))
                )
                .change_context(DeserializerError)?;

            visitor.$visit(v).change_context(DeserializerError)
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
    fn context(&self) -> &Context;

    /// Require the [`Deserializer`] to figure out **how** to drive the visitor based on input data.
    ///
    /// You should not rely on this when implementing [`Deserialize`], as non self-describing
    /// formats are unable to provide this method.
    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>;

    /// Deserialize a `null` (or equivalent type) value
    ///
    /// This type should signal the explicit absence of a value, not to be confused with the
    ///
    /// # Errors
    ///
    /// Current value is not of type null
    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>;

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>;

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>;

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>;

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>;

    /// Hint that the `Deserialize` type expects a value to be present or not.
    ///
    /// Due to the special nature of this deserialization call a special visitor is used.
    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>;

    /// Hint that the `Deserialize` type expect an enum
    ///
    /// Due to the very special nature of an enum (being a fundamental type) a special visitor is
    /// used.
    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>;

    derive_from_number![
        deserialize_i8(to_i8: i8) -> visit_i8,
        deserialize_i16(to_i16: i16) -> visit_i16,
        deserialize_i32(to_i32: i32) -> visit_i32,
        deserialize_i64(to_i64: i64) -> visit_i64,
        deserialize_i128(to_i128: i128) -> visit_i128,
        deserialize_isize(to_isize: isize) -> visit_isize,

        deserialize_u8(to_u8: u8) -> visit_u8,
        deserialize_u16(to_u16: u16) -> visit_u16,
        deserialize_u32(to_u32: u32) -> visit_u32,
        deserialize_u64(to_u64: u64) -> visit_u64,
        deserialize_u128(to_u128: u128) -> visit_u128,
        deserialize_usize(to_usize: usize) -> visit_usize,

        deserialize_f32(to_f32: f32) -> visit_f32,
        deserialize_f64(to_f64: f64) -> visit_f64,
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
    type Reflection: Reflection + ?Sized;

    /// Deserialize this value from the given `deer` deserializer.
    ///
    /// # Errors
    ///
    /// Deserialization was unsuccessful
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError>;

    #[must_use]
    fn reflection() -> Document {
        <Self::Reflection as Reflection>::document()
    }
}

pub trait DeserializeOwned: for<'de> Deserialize<'de> {}
impl<T> DeserializeOwned for T where T: for<'de> Deserialize<'de> {}

#[cfg(test)]
pub(crate) mod test {
    use alloc::{format, string::String, vec::Vec};
    use core::{
        fmt::{Display, Formatter},
        marker::PhantomData,
    };

    use error_stack::{Context, Frame, Report};
    use serde::{
        ser::{Error as _, SerializeMap},
        Serialize, Serializer,
    };

    use crate::error::{Error, ErrorProperties, Variant};

    struct SerializeFrame<'a, 'b, E: Variant> {
        frames: &'b [&'a Frame],
        _marker: PhantomData<fn() -> *const E>,
    }

    impl<'a, 'b, E: Variant> Serialize for SerializeFrame<'a, 'b, E> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let mut map = serializer.serialize_map(None)?;

            E::Properties::output(E::Properties::value(self.frames), &mut map)
                .map_err(|error| S::Error::custom(format!("{error:?}")))?;

            map.end()
        }
    }

    pub(crate) fn to_json<T: Variant>(report: &Report<impl Context>) -> serde_json::Value {
        // we do not need to worry about the tree structure
        let frames: Vec<_> = report.frames().collect();

        let s: SerializeFrame<T> = SerializeFrame {
            frames: &frames,
            _marker: PhantomData::default(),
        };

        serde_json::to_value(s)
            .expect("should be able to convert `SerializeFrame` into `serde_json::Value`")
    }

    struct ErrorMessage<'a, 'b, E: Variant> {
        error: &'a E,
        properties: &'b <E::Properties as ErrorProperties>::Value<'a>,
    }

    impl<E: Variant> Display for ErrorMessage<'_, '_, E> {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            self.error.message(f, self.properties)
        }
    }

    pub(crate) fn to_message<T: Variant>(report: &Report<Error>) -> String {
        let frames: Vec<_> = report.frames().collect();
        let properties = T::Properties::value(&frames);

        let error = report.current_context();
        let error = error
            .variant()
            .downcast_ref::<T>()
            .expect("context is of correct type");

        let message = ErrorMessage {
            error,
            properties: &properties,
        };

        format!("{message}")
    }
}
