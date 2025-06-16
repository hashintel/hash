//! # Error Structure
//!
//! Every error emitted by `deer` (and potentially other tooling) follows the same schema when
//! serialized:
//!
//! ```json5
//! {
//!     "namespace": "deer", // namespace of the error
//!     "id": ["type"], // unique id across the namespace
//!     "properties": {} // object of machine readable properties related to id
//!     "message": "" // human readable message
//! }
//! ```
// TODO: schema types for errors, for now not implemented, but planned for 0.2
//  in depth explanation can be found here:
//  https://github.com/hashintel/hash/pull/1286#discussion_r1012733818
//!
//! ## Difference between `namespace` and `id`
//!
//! The id is made of a `namespace` and `id`, a namespace is the name of a library or
//! application and their respective error.
//! This separation of namespace vs id makes it harder for application to accidentally create errors
//! with the same id, and enables applications that have the same type of error, but in different
//! areas to easily distinguish between them.
//!
//! ## Design Principles
//!
//! ### Separation of Variant and Properties
//!
//! Every variant, defined through [`Error`], consists of 3 different values/types, the type
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
//! future we might be able to, by taking into account values on the [`Error`] type itself.
//!
//! Another downside of the current approach is, that a [`Display`] message cannot use the values of
//! the properties, which is not ideal when writing "personalized" error messages during
//! serialization. This is fixed because [`Variant`] implementations must provide
//! [`Variant::message`], which receives all properties and their value.
//!
//! [`Location`]: core::panic::Location

#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{boxed::Box, format, string::String};
#[cfg(nightly)]
use core::error::Request;
use core::{
    any::Any,
    fmt::{self, Debug, Display, Formatter},
};

pub use duplicate::{DuplicateField, DuplicateFieldError, DuplicateKey, DuplicateKeyError};
use error_stack::{Frame, Report};
pub use extra::{
    ArrayLengthError, ExpectedLength, ObjectItemsExtraError, ObjectLengthError, ReceivedKey,
    ReceivedLength,
};
pub use internal::BoundedContractViolationError;
pub use location::Location;
use serde::ser::SerializeMap;
pub use r#type::{ExpectedType, ReceivedType, TypeError};
pub use unknown::{
    ExpectedField, ExpectedIdentifier, ExpectedVariant, ReceivedField, ReceivedIdentifier,
    ReceivedVariant, UnknownFieldError, UnknownIdentifierError, UnknownVariantError,
};
pub use value::{MissingError, ReceivedValue, ValueError};

use crate::error::serialize::{Export, impl_serialize};

mod duplicate;
mod extra;
mod internal;
mod location;
mod macros;
mod serialize;
mod tuple;
mod r#type;
mod unknown;
mod value;

#[derive(Debug, Ord, PartialOrd, Eq, PartialEq, Hash, Copy, Clone, serde::Serialize)]
pub struct Namespace(&'static str);

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

pub(crate) fn fmt_fold_fields<T: Display>(
    fmt: &mut Formatter,
    iter: impl IntoIterator<Item = T>,
) -> fmt::Result {
    for (idx, field) in iter.into_iter().enumerate() {
        if idx > 0 {
            fmt.write_str(", ")?;
        }

        write!(fmt, r#""{field}""#)?;
    }

    Ok(())
}

// This compatability struct needs to exist, because serde no-std errors do not implement `Context`
// or `core::error::Error`, it holds a super shallow representation via `Debug` and `Display`.
// The original error **cannot** be attached, as the trait `serde::ser::Error` does not require
// `Send + Sync`.
//
// On std it caries the error and provides it on nightly
// TODO: if serde::ser::Error ever supports core::error::Error remove this
pub struct SerdeSerializeError {
    debug: String,
    display: String,
}

impl Debug for SerdeSerializeError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str(&self.debug)
    }
}

impl Display for SerdeSerializeError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str(&self.display)
    }
}

impl SerdeSerializeError {
    fn new<S: serde::ser::Error>(error: &S) -> Self {
        Self {
            debug: format!("{error:?}"),
            display: format!("{error}"),
        }
    }
}

#[cfg(nightly)]
impl core::error::Error for SerdeSerializeError {}

#[cfg(all(not(nightly), not(feature = "std")))]
impl Error for SerdeSerializeError {}

#[cfg(all(not(nightly), feature = "std"))]
impl std::error::Error for SerdeSerializeError {}

/// Value which is extracted/retrieved from a stack of [`error_stack::Frame`]s
///
/// Every type that is attached as a frame (or can be requested via `request_ref`), must implement
/// this type, to be able to be used in conjunction with [`Error`], it must provide the key
/// used in the `properties` output, as well as a value. The value does **not** need to be `Self`,
/// so transformations are possible.
///
/// This enables the "squashing" and reinterpretation of stacks of the same type, to build things
/// like location paths.
pub trait ErrorProperty: Sized + Send + Sync {
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

    fn output<S>(value: Self::Value<'_>, map: &mut S) -> Result<(), Report<[SerdeSerializeError]>>
    where
        S: SerializeMap;
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

    fn output<S>(value: Self::Value<'_>, map: &mut S) -> Result<(), Report<[SerdeSerializeError]>>
    where
        S: SerializeMap,
    {
        let key = <T as ErrorProperty>::key();

        Ok(map
            .serialize_entry(key, &value)
            .map_err(|err| Report::new(SerdeSerializeError::new(&err)))?)
    }
}

/// Possible error that can be output.
///
/// `deer` makes full use of `error-stack` and uses attachments and contexts to build up errors.
/// These errors must implement [`Error`] to be able to use `deer` capabilities.
///
/// Each variant needs to define `Properties`, which is a tuple of all types it expects to output in
/// the `properties` output, `deer` will then look through a report, gather and transform those
/// properties, which are then used in the output and can be used while personalising the message.
///
/// The combination of `NAMESPACE` and `ID` needs to be unique.
pub trait Variant: Sized + Debug + Display + Send + Sync + 'static {
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
    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result;

    #[cfg(nightly)]
    #[expect(unused_variables)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {}

    fn into_error(self) -> Error {
        Error::new(self)
    }
}

type SerializeReturnType<'a> = Option<Box<dyn erased_serde::Serialize + 'a>>;

pub struct Error {
    variant: Box<dyn Any + Send + Sync>,
    serialize: for<'a> fn(error: &'a Self, &[&'a Frame]) -> SerializeReturnType<'a>,
    display: fn(error: &Box<dyn Any + Send + Sync>, fmt: &mut Formatter) -> fmt::Result,
    debug: fn(error: &Box<dyn Any + Send + Sync>, fmt: &mut Formatter) -> fmt::Result,
    #[cfg(nightly)]
    provide: for<'a> fn(error: &'a Box<dyn Any + Send + Sync>, request: &mut Request<'a>),
}

impl Debug for Error {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        (self.debug)(&self.variant, fmt)
    }
}

impl Display for Error {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        (self.display)(&self.variant, fmt)
    }
}

fn impl_display<E: Variant>(
    error: &Box<dyn Any + Send + Sync>,
    fmt: &mut Formatter,
) -> fmt::Result {
    #[expect(
        clippy::coerce_container_to_any,
        reason = "False positive: https://github.com/rust-lang/rust-clippy/issues/15045"
    )]
    let error: &E = error
        .downcast_ref()
        .expect("`impl_display` should only be called on corresponding `Error`");

    Display::fmt(error, fmt)
}

fn impl_debug<E: Variant>(error: &Box<dyn Any + Send + Sync>, fmt: &mut Formatter) -> fmt::Result {
    #[expect(
        clippy::coerce_container_to_any,
        reason = "False positive: https://github.com/rust-lang/rust-clippy/issues/15045"
    )]
    let error: &E = error
        .downcast_ref()
        .expect("`impl_debug` should only be called on corresponding `Error`");

    Debug::fmt(error, fmt)
}

#[cfg(nightly)]
#[expect(clippy::incompatible_msrv, reason = "This is gated behind nightly")]
fn impl_provide<'a, E: Variant>(error: &'a Box<dyn Any + Send + Sync>, request: &mut Request<'a>) {
    #[expect(
        clippy::coerce_container_to_any,
        reason = "False positive: https://github.com/rust-lang/rust-clippy/issues/15045"
    )]
    let error: &E = error
        .downcast_ref()
        .expect("`impl_provide` should only be called on corresponding `Error`");

    request.provide_ref(error);
    error.provide(request);
}

impl Error {
    pub fn new<T: Variant>(variant: T) -> Self {
        Self {
            variant: Box::new(variant),
            serialize: impl_serialize::<T>,
            display: impl_display::<T>,
            debug: impl_debug::<T>,
            #[cfg(nightly)]
            provide: impl_provide::<T>,
        }
    }

    pub(crate) fn variant(&self) -> &Box<dyn Any + Send + Sync> {
        &self.variant
    }

    pub fn downcast<T: Variant>(self) -> core::result::Result<T, Self> {
        #[cfg(nightly)]
        let Self {
            variant,
            serialize,
            display,
            debug,
            provide,
        } = self;

        #[cfg(not(nightly))]
        let Self {
            variant,
            serialize,
            display,
            debug,
        } = self;

        variant.downcast().map(|value| *value).map_err(|variant| {
            #[cfg(nightly)]
            return Self {
                variant,
                serialize,
                display,
                debug,
                provide,
            };

            #[cfg(not(nightly))]
            return Self {
                variant,
                serialize,
                display,
                debug,
            };
        })
    }

    #[must_use]
    pub fn downcast_ref<T: Variant>(&self) -> Option<&T> {
        #[expect(
            clippy::coerce_container_to_any,
            reason = "False positive: https://github.com/rust-lang/rust-clippy/issues/15045"
        )]
        self.variant().downcast_ref()
    }
}

impl core::error::Error for Error {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        (self.provide)(&self.variant, request);
    }
}

/// This macro makes implementation of error structs easier, by implementing all necessary
/// traits automatically and removing significant boilerplate.
macro_rules! error {
    ($(#[$attr:meta])* $name:ident : $display:literal) => {
        $(#[$attr])*
        #[derive(Debug)]
        pub struct $name;

        impl Display for $name {
            fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
                fmt.write_str($display)
            }
        }

        #[cfg(nightly)]
        impl core::error::Error for $name {}

        #[cfg(all(feature = "std", not(nightly)))]
        impl std::error::Error for $name {}

        #[cfg(all(not(feature = "std"), not(nightly)))]
        impl error_stack::Context for $name {}
    };
}

error!(
    /// Every visitor must return this error, this is just a wrapper context,
    /// the actual error should implement [`Error`] instead.
    VisitorError: "visitor has encountered one or more unrecoverable errors"
);

error!(
    /// Every [`Deserialize`] implementation must return this error,
    /// this is just a wrapper context which is used to aid error recovery,
    /// the actual error should implement [`Error`] instead,
    ///
    /// [`Deserialize`]: crate::Deserialize
    DeserializeError: "deserialize failed"
);

error!(
    /// Every [`Deserializer`] implementation must return this error, this is just a wrapper context,
    /// which is used to aid error recovery. The actual error should implement [`Error`] instead.
    ///
    /// [`Deserializer`]: crate::Deserializer
    DeserializerError: "deserializer encountered unrecoverable error"
);

error!(
    /// Every [`ObjectAccess`] implementation must return this error, this is just a wrapper context,
    /// which is used to aid error recovery. The actual error should implement [`Error`] instead.
    ///
    /// [`ObjectAccess`]: crate::ObjectAccess
    ObjectAccessError: "object access encountered one or more errors during access"
);

error!(
    /// Every [`ArrayAccess`] implementation must return this error, this is just a wrapper context,
    /// which is used to aid error recovery. The actual error should implement [`Error`] instead.
    ///
    /// [`ArrayAccess`]: crate::ArrayAccess
    ArrayAccessError: "array access encountered one or more errors during access"
);

pub trait ReportExt<C: core::error::Error + Send + Sync + 'static> {
    fn export(self) -> Export<C>;
}

impl<C: core::error::Error + Send + Sync + 'static> ReportExt<C> for Report<C> {
    fn export(self) -> Export<C> {
        Export::new(self.expand())
    }
}

impl<C: core::error::Error + Send + Sync + 'static> ReportExt<C> for Report<[C]> {
    fn export(self) -> Export<C> {
        Export::new(self)
    }
}
