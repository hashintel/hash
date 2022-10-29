//! # Error Structure
//!
//! Every error emitted by `deer` (and potentially other tooling) follows the same schema when
//! serialized:
//!
//! ```json5
//! {
//!     "ns": "deer", // namespace of the error
//!     "id": ["type"], // unique id across the namespace
//!     "properties": {} // object of machine readable properties related to id
//!     "message": "" // human readable message
//! }
//! ```
//!
//! Optionally errors also emit a json-schema type, which can be used to present the user with all
//! possible errors.
//!
//! ## Difference between `ns` and `id`
//!
//! The id is made of a `ns` (namespace) and `id`, a namespace is the name of a library or
//! application and their respective error.
//! This separation of namespace vs id makes it harder for application to accidentally create errors
//! with the same id, and enables applications that have the same type of error, but in different
//! areas to easily distinguish between them.
//!
//! ## Design Principles
//!
//! ### Separation of Variant and Properties
//!
//! Every variant, defined through [`ErrorVariant`], consists of 3 different values/types, the type
//! `Properties`, the const `ID` and the const `NAMESPACE`.
//!
//! The type `Properties` needs to implement `ErrorProperties`, which is implemented for all tuple
//! variants and for every `ErrorProperty`.
//!
//! Why was this design chosen?
//!
//! Due to the fact that during deserialization we "bubble-up" errors, this means that certain
//! properties (like [`Location`]), are only fully available at a later stage and not during
//! creation of the error.
//! Taking this approach allows us to delay the creation of the final version until
//! the last step, this is also why [`ErrorProperty::value`] takes a stack of values, some
//! properties might find the latest or oldest occurrence interesting, while some, like [`Location`]
//! need to take all recorded values into account.
//! A nice side-benefit is that properties can be reused *and* it ensures that the `properties`
//! object is **always** an object.
//!
//! This also has some downsides, for example that we are unable to require certain values, in the
//! future we might be able to, by taking into account values on the [`ErrorVariant`] type itself.
//!
//! Another downside of the current approach is, that a [`Display`] message cannot use the values of
//! the properties, which is not ideal when writing "personalized" error messages during
//! serialization. This is fixed because [`ErrorVariant`] implementations must provide
//! [`ErrorVariant::message`], which receives all properties and their value.
//!
//! [`Location`]: core::panic::Location

use alloc::collections::BTreeMap;
use core::fmt::{self, Debug, Display, Formatter};

use error_stack::{Context, Frame, IntoReport, Result};
use serde_value::{SerializerError, Value};

#[derive(Debug, Ord, PartialOrd, Eq, PartialEq, Hash, Copy, Clone, serde::Serialize)]
pub struct Namespace(&'static str);

#[allow(dead_code)]
const NAMESPACE: Namespace = Namespace::new("deer");

impl Namespace {
    #[must_use]
    pub const fn new(name: &'static str) -> Self {
        Self(name)
    }
}

#[derive(Debug, Ord, PartialOrd, Eq, PartialEq, Hash, Copy, Clone, serde::Serialize)]
pub struct Id(&'static [&'static str]);

impl Id {
    #[must_use]
    pub const fn new(path: &'static [&'static str]) -> Self {
        Self(path)
    }
}

/// Value which is extracted/retrieved from a stack of [`error_stack::Frame`]s
///
/// Every type that is attached as a frame (or can be requested via `request_ref`), must implement
/// this type, to be able to be used in conjunction with [`ErrorVariant`], it must provide the key
/// used in the `properties` output, as well as a value. The value does **not** need to be `Self`,
/// so transformations are possible.
///
/// This enables the "squashing" and reinterpretation of stacks of the same type, to build things
/// like location paths.
pub trait ErrorProperty: Sized {
    type Value<'a>: serde::Serialize + 'a
    where
        Self: 'a;

    fn key() -> &'static str;
    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a>;
}

/// Wrapper around [`ErrorProperty`].
///
/// This is implemented for every [`ErrorProperty`] and all tuples that contain [`ErrorProperties`].
///
/// `deer` then iterates through all types present in [`ErrorProperties`] and builds, via a stack of
/// [`error_stack::Frame`] a key-value map of values.
pub trait ErrorProperties {
    type Value<'a>: serde::Serialize + 'a
    where
        Self: 'a;

    fn value<'a>(stack: &[&'a Frame]) -> Self::Value<'a>;

    fn output(
        value: Self::Value<'_>,
        map: &mut BTreeMap<&'static str, Value>,
    ) -> Result<(), SerializerError>;
}

impl<T: ErrorProperty + 'static> ErrorProperties for T {
    type Value<'a> = T::Value<'a>;

    fn value<'a>(stack: &[&'a Frame]) -> Self::Value<'a> {
        let stack = stack.iter().filter_map(|frame| {
            #[cfg(nightly)]
            return frame.request_ref();

            #[cfg(not(nightly))]
            return frame.downcast_ref();
        });

        <T as ErrorProperty>::value(stack)
    }

    fn output(
        value: Self::Value<'_>,
        map: &mut BTreeMap<&'static str, Value>,
    ) -> Result<(), SerializerError> {
        let key = <T as ErrorProperty>::key();
        let value = serde_value::to_value(value).into_report()?;

        map.insert(key, value);
        Ok(())
    }
}

/// Possible error that can be output.
///
/// `deer` makes full use of `error-stack` and uses attachments and contexts to build up errors.
/// These errors must implement [`ErrorVariant`] to be able to use `deer` capabilities.
///
/// Each variant needs to define `Properties`, which is a tuple of all types it expects to output in
/// the `properties` output, `deer` will then look through a report, gather and transform those
/// properties, which are then used in the output and can be used while personalising the message.
///
/// The combination of `NAMESPACE` and `ID` needs to be unique.
pub trait ErrorVariant: Context + Debug + Display {
    type Properties: ErrorProperties;

    const ID: Id;
    const NAMESPACE: Namespace;

    /// Context sensitive message
    ///
    /// This type can use the properties given as well as a formatter, to enrich and output a custom
    /// message.
    ///
    /// The caller does not guarantee to call the [`Display`] implementation as fallback, the
    /// implementation should make sure to call it themselves as fallback, if needed.
    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result;
}

/// The base error type of `deer`
///
/// This type is used as base for all deserialization errors and is based on
/// [`error_stack::Context`], additional context is supplied via [`Report::attach`], therefore the
/// necessary methods for the base implementations are minimal.
///
/// [`Report::attach`]: error_stack::Report::attach
pub trait Error: Context {
    /// Error message that this should encompass, additional context is supported via
    /// [`Report::attach`]
    ///
    /// [`Report::attach`]: error_stack::Report::attach
    fn message(contents: &str) -> Self;
    fn new() -> Self;
    fn empty() -> Self;
}
