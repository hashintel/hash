#![cfg_attr(
    nightly,
    feature(error_generic_member_access, sync_unsafe_cell, exclusive_wrapper)
)]
#![cfg_attr(all(nightly, target_has_atomic = "128"), feature(integer_atomics))]
#![cfg_attr(not(feature = "std"), no_std)]
#![expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::error_impl_error,
    clippy::missing_errors_doc
)]

// TODO: note to implementors of `Deserialize` to allow for `visit_none` and to defer to
//       `visit_none` on every `deserialize_*` call if appropriate. missing value (`visit_none`)
//       will only be generated through `*Access` implementations.

#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{string::String, vec::Vec};
use core::marker::PhantomData;

use error_stack::{Report, ResultExt as _};
use num_traits::{FromPrimitive as _, ToPrimitive as _};
pub use schema::{Document, Reflection, Schema};

use crate::{
    bound::{BoundArrayAccess, BoundObjectAccess},
    error::{
        ArrayAccessError, BoundedContractViolationError, DeserializeError, DeserializerError,
        ExpectedType, MissingError, ObjectAccessError, ReceivedType, ReceivedValue, TypeError,
        ValueError, Variant as _, VisitorError,
    },
    schema::visitor,
};
pub use crate::{context::Context, number::Number};

mod context;
pub mod error;
mod impls;
#[macro_use]
mod macros;
mod bound;
pub mod helpers;
mod number;
pub mod schema;
pub mod value;

extern crate alloc;

pub mod export {
    // We need to re-export `alloc`, as our macros depend on it, in the case that we're operating in
    // an `std` environment most crates do not have a `extern crate alloc` statement. This means
    // that `alloc::borrow::ToOwned` is not available. (we would need to use `std::borrow::ToOwned`)
    // This means we would need to switch between `std` and `alloc` depending on the environment and
    // feature flag, which is prone to errors. (some crates default to no-std dependencies, in that
    // case this would fail). By re-exporting `alloc` we can always use `alloc::borrow::ToOwned`.
    pub extern crate alloc;

    pub use error_stack;
}

struct GenericFieldVisitor<T, U>(PhantomData<fn() -> *const (T, U)>);

impl<'de, T: Deserialize<'de>, U: Deserialize<'de>> FieldVisitor<'de>
    for GenericFieldVisitor<T, U>
{
    type Key = T;
    type Value = (T, U);

    fn visit_value<D>(
        self,
        key: Self::Key,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        U::deserialize(deserializer)
            .map(|value| (key, value))
            .change_context(VisitorError)
    }
}

pub trait ObjectAccess<'de>: Sized {
    /// Represent if the object has been accessed
    ///
    /// If [`Self::next`], [`Self::field`] or [`Self::try_field`] was called at least once this
    /// **must** return `true`, otherwise it **must** return `false`.
    ///
    /// This value is used to ensure all invariants are upheld when creating the bound version
    /// through [`Self::into_bound`]
    fn is_dirty(&self) -> bool;

    fn context(&self) -> &Context;

    /// This enables bounds-checking for [`ObjectAccess`].
    ///
    /// After calling this [`ObjectAccess`] will
    /// ensure that there are never more than `length` values returned by [`Self::next`], if there
    /// are not enough items present [`ObjectAccess`] will call [`Visitor::visit_none`].
    ///
    /// This is best suited for types where the length/amount of keys is already predetermined, like
    /// structs or enum variants.
    ///
    /// # Errors
    ///
    /// This will error if a call to [`Self::next`] has been made before calling this function or
    /// this function has been called repeatably.
    fn into_bound(
        self,
        length: usize,
    ) -> Result<BoundObjectAccess<Self>, Report<ObjectAccessError>> {
        if self.is_dirty() {
            Err(
                Report::new(BoundedContractViolationError::SetDirty.into_error())
                    .change_context(ObjectAccessError),
            )
        } else {
            Ok(BoundObjectAccess::new(self, length))
        }
    }

    fn next<K, V>(&mut self) -> Option<Result<(K, V), Report<ObjectAccessError>>>
    where
        K: Deserialize<'de>,
        V: Deserialize<'de>,
    {
        self.field(GenericFieldVisitor(PhantomData))
    }

    fn field<F>(&mut self, visitor: F) -> Option<Result<F::Value, Report<ObjectAccessError>>>
    where
        F: FieldVisitor<'de>,
    {
        self.try_field(visitor).ok()
    }

    fn try_field<F>(
        &mut self,
        visitor: F,
    ) -> Result<Result<F::Value, Report<ObjectAccessError>>, F>
    where
        F: FieldVisitor<'de>;

    fn size_hint(&self) -> Option<usize>;

    fn end(self) -> Result<(), Report<ObjectAccessError>>;
}

pub trait FieldVisitor<'de> {
    type Key: Deserialize<'de>;
    type Value;

    fn visit_key<D>(&self, deserializer: D) -> Result<Self::Key, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        <Self::Key as Deserialize<'de>>::deserialize(deserializer).change_context(VisitorError)
    }

    fn visit_value<D>(
        self,
        key: Self::Key,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>;
}

pub trait ArrayAccess<'de>: Sized {
    /// Represent if the array has been accessed
    ///
    /// If [`Self::next`] was called at least once this **must** return `true`, otherwise it
    /// **must** return `false`.
    ///
    /// This value is used to ensure all invariants are upheld when creating the bound version
    /// through [`Self::into_bound`]
    fn is_dirty(&self) -> bool;

    fn context(&self) -> &Context;

    /// Enables bound-checking for [`ArrayAccess`].
    ///
    /// After calling this [`ArrayAccess`] will
    /// ensure that there are never more than `length` values returned by [`Self::next`], if there
    /// are not enough items present [`ArrayAccess`] will call [`Visitor::visit_none`].
    ///
    /// One must still invoke [`Self::end`] to ensure that not too many items are supplied!
    ///
    /// This is best suited for types where the length is already predetermined, like arrays or
    /// tuples, and should not be set on types like [`Vec`]!
    ///
    /// # Errors
    ///
    /// This will error if a call to [`Self::next`] has been made before setting
    /// [`Self::into_bound`] or [`Self::into_bound`] was called repeatedly.
    fn into_bound(self, length: usize) -> Result<BoundArrayAccess<Self>, Report<ArrayAccessError>> {
        if self.is_dirty() {
            Err(
                Report::new(BoundedContractViolationError::SetDirty.into_error())
                    .change_context(ArrayAccessError),
            )
        } else {
            Ok(BoundArrayAccess::new(self, length))
        }
    }

    fn next<T>(&mut self) -> Option<Result<T, Report<ArrayAccessError>>>
    where
        T: Deserialize<'de>;

    fn size_hint(&self) -> Option<usize>;

    fn end(self) -> Result<(), Report<ArrayAccessError>>;
}

pub trait EnumVisitor<'de>: Sized {
    type Discriminant: Deserialize<'de>;

    // the value we will end up with
    type Value;

    fn expecting(&self) -> Document;

    fn visit_discriminant<D>(
        &self,
        deserializer: D,
    ) -> Result<Self::Discriminant, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        <Self::Discriminant as Deserialize<'de>>::deserialize(deserializer)
            .change_context(VisitorError)
    }

    // TODO: make clear in docs that the deserializer *must* be used (even if just
    //       `deserialize_none` is called), otherwise the `Deserializer` might get into an
    //       undefined state
    fn visit_value<D>(
        self,
        discriminant: Self::Discriminant,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>;
}

/// Provides a strict subset of visitors that could be used for identifiers, this allows for
/// implementations to:
///
/// A) know which identifier types might be used
/// B) limits misuse, by not allowing any borrowed data
///     ~> an identifier should be clearly defined in e.g. an enum and should not allow
///        any arbitrary value, by allowing borrowed strings or bytes implementations might
///        be declined to use it as a replacement of `Visitor`, in that case just `Visitor`
///        should be used.
///
/// The `'de` bounds are here for future compatability and also to stay consistent with
/// all other visitors.
#[expect(unused_variables)]
pub trait IdentifierVisitor<'de>: Sized {
    type Value;

    fn expecting(&self) -> Document;

    fn visit_u8(self, value: u8) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_u64(u64::from(value))
            .attach(ReceivedType::new(u8::document()))
    }

    fn visit_u64(self, value: u64) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(u64::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(str::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_bytes(self, value: &[u8]) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<[u8]>::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }
}

// Reason: We error out on every `visit_*`, which means we do not use the value, but(!) IDEs like to
// use the name to make autocomplete, therefore names for unused parameters are required.
#[expect(unused_variables)]
pub trait Visitor<'de>: Sized {
    type Value;

    fn expecting(&self) -> Document;

    fn visit_none(self) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(MissingError.into_error())
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_null(self) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<()>::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_bool(self, value: bool) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(bool::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_number(self, value: Number) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(Number::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_char(self, value: char) -> Result<Self::Value, Report<VisitorError>> {
        let mut buffer = [0; 4];
        let string = value.encode_utf8(&mut buffer);

        self.visit_str(string)
            .attach(ReceivedType::new(char::reflection()))
    }

    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<&str>::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_borrowed_str(self, value: &'de str) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_str(value)
    }

    fn visit_string(self, value: String) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_str(&value)
    }

    fn visit_bytes(self, value: &[u8]) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::BinarySchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_borrowed_bytes(self, value: &'de [u8]) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_bytes(value)
    }

    fn visit_bytes_buffer(self, value: Vec<u8>) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_bytes(&value)
    }

    fn visit_array<A>(self, array: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ArrayAccess<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::ArraySchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_object<A>(self, object: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ObjectAccess<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::ObjectSchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_i8(self, value: i8) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(i8::reflection()))
    }

    fn visit_i16(self, value: i16) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(i16::reflection()))
    }

    fn visit_i32(self, value: i32) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(i32::reflection())
    }

    fn visit_i64(self, value: i64) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(i64::reflection()))
    }

    fn visit_i128(self, value: i128) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(i128::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_u8(self, value: u8) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(u8::reflection()))
    }

    fn visit_u16(self, value: u16) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(u16::reflection()))
    }

    fn visit_u32(self, value: u32) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(u32::reflection()))
    }

    fn visit_u64(self, value: u64) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(u64::reflection()))
    }

    fn visit_u128(self, value: u128) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(u128::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_f32(self, value: f32) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(f32::reflection()))
    }

    fn visit_f64(self, value: f64) -> Result<Self::Value, Report<VisitorError>> {
        self.visit_number(Number::from(value))
            .attach(ReceivedType::new(f64::reflection()))
    }
}

#[expect(unused_variables)]
pub trait OptionalVisitor<'de>: Sized {
    type Value;

    fn expecting(&self) -> Document;

    fn visit_none(self) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(MissingError.into_error())
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_null(self) -> Result<Self::Value, Report<VisitorError>> {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<()>::reflection()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        // we do not know what the received type was as we delegate to the inner implementation
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }
}

#[expect(unused_variables)]
pub trait StructVisitor<'de>: Sized {
    type Value;

    fn expecting(&self) -> Document;

    // visit_none and visit_null are not implemented, as they can be used more expressively using
    // `OptionalVisitor`

    fn visit_array<A>(self, array: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ArrayAccess<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::ArraySchema::document()))
            .attach(ExpectedType::new(self.expecting()))
            .change_context(VisitorError))
    }

    fn visit_object<A>(self, object: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ObjectAccess<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(visitor::ObjectSchema::document()))
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

    fn visit_number(self, value: Number) -> Result<Self::Value, Report<VisitorError>> {
        Ok(value)
    }

    fn visit_i128(self, value: i128) -> Result<Self::Value, Report<VisitorError>> {
        let number = Number::from_i128(value).ok_or_else(|| self.value_error(value))?;
        self.visit_number(number)
    }

    fn visit_u128(self, value: u128) -> Result<Self::Value, Report<VisitorError>> {
        let number = Number::from_u128(value).ok_or_else(|| self.value_error(value))?;
        self.visit_number(number)
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
        fn $method<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
        where
            V: Visitor<'de>,
        {
            let number = self.deserialize_number(NumberVisitor::<<$schema as Deserialize>::Reflection>(PhantomData))?;
            let value = number
                .$to()
                .ok_or_else(||
                    Report::new(ValueError.into_error())
                        .attach(ExpectedType::new(<$schema>::reflection()))
                        .attach(ReceivedValue::new(number))
                )
                .change_context(DeserializerError)?;

            visitor.$visit(value).change_context(DeserializerError)
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
#[must_use]
pub trait Deserializer<'de>: Sized {
    fn context(&self) -> &Context;

    fn is_human_readable(&self) -> bool {
        true
    }

    /// Require the [`Deserializer`] to figure out **how** to drive the visitor based on input data.
    ///
    /// You should not rely on this when implementing [`Deserialize`], as non self-describing
    /// formats are unable to provide this method.
    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>;

    /// Deserialize a `null` (or equivalent type) value
    ///
    /// This type should signal the explicit absence of a value, not to be confused with the
    ///
    /// # Errors
    ///
    /// Current value is not of type null
    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
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
    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
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
    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>;

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
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
    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>;

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>;

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>;

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
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
    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
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
    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>;

    /// Hint that the `Deserialize` type expects a value to be present or not.
    ///
    /// Due to the special nature of this deserialization call a special visitor is used.
    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: OptionalVisitor<'de>;

    /// Hint that the `Deserialize` type expects an enum
    ///
    /// Due to the very special nature of an enum (being a fundamental type) a special visitor is
    /// used.
    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: EnumVisitor<'de>;

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: StructVisitor<'de>;

    derive_from_number![
        deserialize_i8(to_i8: i8) -> visit_i8,
        deserialize_i16(to_i16: i16) -> visit_i16,
        deserialize_i32(to_i32: i32) -> visit_i32,
        deserialize_i64(to_i64: i64) -> visit_i64,
        deserialize_i128(to_i128: i128) -> visit_i128,

        deserialize_u8(to_u8: u8) -> visit_u8,
        deserialize_u16(to_u16: u16) -> visit_u16,
        deserialize_u32(to_u32: u32) -> visit_u32,
        deserialize_u64(to_u64: u64) -> visit_u64,
        deserialize_u128(to_u128: u128) -> visit_u128,

        deserialize_f32(to_f32: f32) -> visit_f32,
        deserialize_f64(to_f64: f64) -> visit_f64,
    ];

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: IdentifierVisitor<'de>;
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
    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>;

    #[must_use]
    fn reflection() -> Document {
        <Self::Reflection as Reflection>::document()
    }
}

pub trait DeserializeOwned: for<'de> Deserialize<'de> {}
impl<T> DeserializeOwned for T where T: for<'de> Deserialize<'de> {}

#[cfg(test)]
pub(crate) mod test {
    #[cfg_attr(feature = "std", allow(unused_imports))]
    use alloc::{format, string::String, vec::Vec};
    use core::{
        fmt::{Display, Formatter},
        marker::PhantomData,
    };

    use error_stack::{Frame, Report};
    use serde::{
        Serialize, Serializer,
        ser::{Error as _, SerializeMap as _},
    };

    use crate::error::{Error, ErrorProperties, Variant};

    struct SerializeFrame<'a, 'b, E: Variant> {
        frames: &'b [&'a Frame],
        _marker: PhantomData<fn() -> *const E>,
    }

    impl<E: Variant> Serialize for SerializeFrame<'_, '_, E> {
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

    pub(crate) fn to_json<T: Variant>(
        report: &Report<impl core::error::Error + Send + Sync + 'static>,
    ) -> serde_json::Value {
        // we do not need to worry about the tree structure
        let frames: Vec<_> = report.frames().collect();

        let ser: SerializeFrame<T> = SerializeFrame {
            frames: &frames,
            _marker: PhantomData,
        };

        serde_json::to_value(ser)
            .expect("should be able to convert `SerializeFrame` into `serde_json::Value`")
    }

    struct ErrorMessage<'a, 'b, E: Variant> {
        error: &'a E,
        properties: &'b <E::Properties as ErrorProperties>::Value<'a>,
    }

    impl<E: Variant> Display for ErrorMessage<'_, '_, E> {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
            self.error.message(fmt, self.properties)
        }
    }

    pub(crate) fn to_message<T: Variant>(report: &Report<Error>) -> String {
        let frames: Vec<_> = report.frames().collect();
        let properties = T::Properties::value(&frames);

        let error = report.current_context();
        #[expect(
            clippy::coerce_container_to_any,
            reason = "False positive: https://github.com/rust-lang/rust-clippy/issues/15045"
        )]
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
