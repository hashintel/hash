//! Contains the [`Provider`] trait and accompanying API, which enable trait objects to provide data
//! based on typed requests, an alternate form of runtime reflection.
//!
//! [`Provider`] and the associated APIs support generic, type-driven access to data, and a
//! mechanism for implementers to provide such data. The key parts of the interface are the
//! [`Provider`] trait for objects which can provide data, and the [`request_by_type_tag`] function
//! for data from an object which implements [`Provider`]. Note that end users should not call
//! requesting [`request_by_type_tag`] directly, it is a helper function for intermediate
//! implementers to use to implement a user-facing interface.
//!
//! Typically, a data provider is a trait object of a trait which extends [`Provider`]. A user will
//! request data from the trait object by specifying the type or a type tag (a type tag is a type
//! used only as a type parameter to identify the type which the user wants to receive).
//!
//! ## Data flow
//!
//! * A user requests an object, which is delegated to [`request_by_type_tag`]
//! * [`request_by_type_tag`] creates a [`Requisition`] object and passes it to
//!   [`Provider::provide`]
//! * The object provider's implementation of [`Provider::provide`] tries providing values of
//!   different types using `Requisition::provide_*`. If the type tag matches the type requested by
//!   the user, it will be stored in the [`Requisition`] object.
//! * [`request_by_type_tag`] unpacks the [`Requisition`] object and returns any stored value to the
//!   user.
//!
//! # Examples
// Taken from https://github.com/rust-lang/rfcs/pull/3192
//!
//! To provide data for example on an error type, the [`Provider`] API enables:
//!
//! ```rust
//! # #![feature(backtrace)]
//! use std::backtrace::Backtrace;
//!
//! use provider::{tags, Provider, Requisition, TypeTag};
//!
//! struct MyError {
//!     backtrace: Backtrace,
//!     suggestion: String,
//! }
//!
//! impl Provider for MyError {
//!     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
//!         req.provide_ref(&self.backtrace)
//!             .provide_ref(self.suggestion.as_str());
//!     }
//! }
//!
//! trait MyErrorTrait: Provider {}
//!
//! impl MyErrorTrait for MyError {}
//!
//! impl dyn MyErrorTrait {
//!     fn request_ref<T: ?Sized + 'static>(&self) -> Option<&T> {
//!         provider::request_by_type_tag::<'_, tags::Ref<T>, _>(self)
//!     }
//! }
//! ```
//!
//! In another module or crate, this can be requested for any `dyn MyErrorTrait`, not just
//! `MyError`:
//! ```rust
//! # #![feature(backtrace)]
//! # use std::backtrace::Backtrace;
//! # use provider::{Provider, Requisition, TypeTag, tags};
//! # struct MyError { backtrace: Backtrace, suggestion: String }
//! # impl Provider for MyError {
//! #     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
//! #         req.provide_ref(&self.backtrace)
//! #             .provide_ref(self.suggestion.as_str());
//! #     }
//! # }
//! # trait MyErrorTrait: Provider {}
//! # impl MyErrorTrait for MyError {}
//! # impl dyn MyErrorTrait {
//! #     fn request_ref<T: ?Sized + 'static>(&self) -> Option<&T> {
//! #         provider::request_by_type_tag::<'_, tags::Ref<T>, _>(self)
//! #     }
//! # }
//! fn report_error(e: &(dyn MyErrorTrait + 'static)) {
//!     // Generic error handling
//!     # const _: &str = stringify! {
//!     ...
//!     # };
//!
//!     // print backtrace
//!     if let Some(backtrace) = e.request_ref::<Backtrace>() {
//!         println!("{backtrace:?}")
//!     }
//!     # assert!(e.request_ref::<Backtrace>().is_some());
//!
//!     // print suggestion text
//!     if let Some(suggestions) = e.request_ref::<str>() {
//!         println!("Suggestion: {suggestions}")
//!     }
//!     # assert_eq!(e.request_ref::<str>().unwrap(), "Do it correctly next time!");
//! }
//!
//! fn main() {
//!     let error = MyError {
//!         backtrace: Backtrace::capture(),
//!         suggestion: "Do it correctly next time!".to_string(),
//!     };
//!
//!     report_error(&error);
//! }
//! ```

// Heavily inspired by https://github.com/rust-lang/project-error-handling/issues/3:
//   The project-error-handling tries to improves the error trait. In order to move the trait into
//   `core`, an alternative solution to backtrace provisioning had to be found. This is, where the
//   provider API comes from.
//
//   TODO: replace library with https://github.com/rust-lang/project-error-handling/issues/3.

#![warn(missing_docs, clippy::pedantic, clippy::nursery)]

pub mod tags;

mod internal;
mod requisition;

use core::any::TypeId;

use self::internal::{TagValue, Tagged};
use crate::requisition::{ConcreteRequisition, RequisitionImpl};

/// Trait implemented by a type which can dynamically provide tagged values.
pub trait Provider {
    /// Object providers should implement this method to provide *all* values they are able to
    /// provide using `req`.
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>);
}

/// Request a specific value by a given tag from the [`Provider`].
pub fn request_by_type_tag<'p, I, P: Provider + ?Sized>(provider: &'p P) -> Option<I::Type>
where
    I: TypeTag<'p>,
{
    let mut req: ConcreteRequisition<'p, I> = RequisitionImpl {
        tagged: TagValue(None),
    };
    provider.provide(&mut Requisition(&mut req));
    req.tagged.0
}

/// This trait is implemented by specific `TypeTag` types in order to allow describing a type which
/// can be requested for a given lifetime `'p`.
///
/// A few example implementations for type-driven `TypeTag`s can be found in the [`tags`] module,
/// although crates may also implement their own tags for more complex types with internal
/// lifetimes.
pub trait TypeTag<'p>: Sized + 'static {
    /// The type of values which may be tagged by this `TypeTag` for the given lifetime.
    type Type: 'p;
}

/// A helper object for providing objects by type.
///
/// An object provider provides values by calling this type's provide methods. Note, that
/// `Requisition` is a wrapper around a mutable reference to a [`TypeTag`]ged value.
pub struct Requisition<'p, 'r>(&'r mut RequisitionImpl<dyn Tagged<'p> + 'p>);

#[cfg(test)]
pub(crate) mod tests {
    use crate::{tags, Provider, Requisition, TypeTag};

    struct CustomTagA;
    impl<'p> TypeTag<'p> for CustomTagA {
        type Type = usize;
    }

    struct CustomTagB;
    impl<'p> TypeTag<'p> for CustomTagB {
        type Type = usize;
    }

    pub struct MyError {
        value: usize,
        reference: usize,
        custom_tag_a: usize,
        custom_tag_b: usize,
        option: Option<usize>,
        result_ok: Result<u32, i32>,
        result_err: Result<i32, u32>,
    }

    impl Provider for MyError {
        fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
            req.provide_value(|| self.value)
                .provide_ref(&self.reference)
                .provide_with::<CustomTagA, _>(|| self.custom_tag_a)
                .provide::<CustomTagB>(self.custom_tag_b)
                .provide::<tags::OptionTag<tags::Value<usize>>>(self.option)
                .provide::<tags::ResultTag<tags::Value<u32>, tags::Value<i32>>>(self.result_ok)
                .provide::<tags::ResultTag<tags::Value<i32>, tags::Value<u32>>>(self.result_err);
        }
    }

    pub const ERR: MyError = MyError {
        value: 1,
        reference: 2,
        custom_tag_a: 3,
        custom_tag_b: 4,
        option: Some(5),
        result_ok: Ok(6),
        result_err: Err(7),
    };

    #[test]
    fn provide_value() {
        assert_eq!(
            crate::request_by_type_tag::<tags::Value<usize>, _>(&ERR),
            Some(1)
        );
    }

    #[test]
    fn provide_ref() {
        assert_eq!(
            crate::request_by_type_tag::<tags::Ref<usize>, _>(&ERR),
            Some(&2)
        );
    }

    #[test]
    fn provide_with() {
        assert_eq!(crate::request_by_type_tag::<CustomTagA, _>(&ERR), Some(3));
    }

    #[test]
    fn provide() {
        assert_eq!(crate::request_by_type_tag::<CustomTagB, _>(&ERR), Some(4));
    }

    #[test]
    fn tags() {
        assert_eq!(
            crate::request_by_type_tag::<tags::OptionTag<tags::Value<usize>>, _>(&ERR),
            Some(Some(5))
        );
        assert_eq!(
            crate::request_by_type_tag::<tags::ResultTag<tags::Value<u32>, tags::Value<i32>>, _>(
                &ERR
            ),
            Some(Ok(6))
        );
        assert_eq!(
            crate::request_by_type_tag::<tags::ResultTag<tags::Value<i32>, tags::Value<u32>>, _>(
                &ERR
            ),
            Some(Err(7))
        );
    }
}
