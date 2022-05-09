//! Contains the [`Provider`] trait and accompanying API, which enable trait objects to provide data
//! based on typed requests, an alternate form of runtime reflection.
//!
//! # `Provider` and `Demand`
//!
//! `Provider` and the associated APIs support generic, type-driven access to data, and a mechanism
//! for implementers to provide such data. The key parts of the interface are the `Provider`
//! trait for objects which can provide data, and the [`request_value`] and [`request_ref`]
//! functions for requesting data from an object which implements `Provider`. Generally, end users
//! should not call `request_*` directly, they are helper functions for intermediate implementers
//! to use to implement a user-facing interface.
//!
//! Typically, a data provider is a trait object of a trait which extends `Provider`. A user will
//! request data from a trait object by specifying the type of the data.
//!
//! ## Data flow
//!
//! * A user requests an object of a specific type, which is delegated to `request_value` or
//!   `request_ref`
//! * `request_*` creates a `Demand` object and passes it to `Provider::provide`
//! * The data provider's implementation of `Provider::provide` tries providing values of different
//!   types using `Demand::provide_*`. If the type matches the type requested by the user, the value
//!   will be stored in the `Demand` object.
//! * `request_*` unpacks the `Demand` object and returns any stored value to the user.
//!
//! ## Examples
//!
//! ```
//! use provider::{request_ref, Demand, Provider};
//!
//! // Definition of MyTrait, a data provider.
//! trait MyTrait: Provider {
//!     // ...
//! }
//!
//! // Methods on `MyTrait` trait objects.
//! impl dyn MyTrait + '_ {
//!     /// Get a reference to a field of the implementing struct.
//!     pub fn get_context_by_ref<T: ?Sized + 'static>(&self) -> Option<&T> {
//!         request_ref::<T, _>(self)
//!     }
//! }
//!
//! // Downstream implementation of `MyTrait` and `Provider`.
//! # struct SomeConcreteType { some_string: String }
//! impl MyTrait for SomeConcreteType {
//!     // ...
//! }
//!
//! impl Provider for SomeConcreteType {
//!     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
//!         // Provide a string reference. We could provide multiple values with
//!         // different types here.
//!         demand.provide_ref::<String>(&self.some_string);
//!     }
//! }
//!
//! // Downstream usage of `MyTrait`.
//! fn use_my_trait(obj: &dyn MyTrait) {
//!     // Request a &String from obj.
//!     let _ = obj.get_context_by_ref::<String>().unwrap();
//! }
//! ```
//!
//! In this example, if the concrete type of `obj` in `use_my_trait` is `SomeConcreteType`, then
//! the `get_context_ref` call will return a reference to `obj.some_string` with type `&String`.

#![no_std]

///////////////////////////////////////////////////////////////////////////////
// Provider trait
///////////////////////////////////////////////////////////////////////////////

extern crate alloc;

use core::{any::TypeId, mem};

/// Trait implemented by a type which can dynamically provide values based on type.
pub trait Provider {
    /// Data providers should implement this method to provide *all* values they are able to
    /// provide by using `demand`.
    ///
    /// # Examples
    ///
    /// Provides a reference to a field with type `String` as a `&str`.
    ///
    /// ```rust
    /// use provider::{Demand, Provider};
    /// # struct SomeConcreteType { field: String }
    ///
    /// impl Provider for SomeConcreteType {
    ///     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
    ///         demand.provide_ref::<str>(&self.field);
    ///     }
    /// }
    /// ```
    fn provide<'a>(&'a self, demand: &mut Demand<'a>);
}

/// Request a value from the `Provider`.
///
/// # Examples
///
/// Get a string value from a provider.
///
/// ```rust
/// use provider::{request_value, Provider};
///
/// fn get_string<P: Provider>(provider: &P) -> String {
///     request_value::<String, _>(provider).unwrap()
/// }
/// ```
pub fn request_value<'a, T, P>(provider: &'a P) -> Option<T>
where
    T: 'static,
    P: Provider + ?Sized,
{
    request_by_type_tag::<'a, tags::Value<T>, P>(provider)
}

/// Request a reference from the `Provider`.
///
/// # Examples
///
/// Get a string reference from a provider.
///
/// ```rust
/// use provider::{request_ref, Provider};
///
/// fn get_str<P: Provider>(provider: &P) -> &str {
///     request_ref::<str, _>(provider).unwrap()
/// }
/// ```
pub fn request_ref<'a, T, P>(provider: &'a P) -> Option<&'a T>
where
    T: 'static + ?Sized,
    P: Provider + ?Sized,
{
    request_by_type_tag::<'a, tags::Ref<tags::MaybeSizedValue<T>>, P>(provider)
}

/// Request a specific value by tag from the `Provider`.
fn request_by_type_tag<'a, I, P>(provider: &'a P) -> Option<I::Reified>
where
    I: tags::Type<'a>,
    P: Provider + ?Sized,
{
    let mut tagged = TaggedOption::<'a, I>(None);
    provider.provide(tagged.as_demand());
    tagged.0
}

///////////////////////////////////////////////////////////////////////////////
// Demand and its methods
///////////////////////////////////////////////////////////////////////////////

/// A helper object for providing data by type.
///
/// A data provider provides values by calling this type's provide methods.
#[repr(transparent)]
pub struct Demand<'a>(dyn Erased<'a> + 'a);

impl<'a> Demand<'a> {
    /// Provide a value or other type with only static lifetimes.
    ///
    /// # Examples
    ///
    /// Provides a `String` by cloning.
    ///
    /// ```rust
    /// use provider::{Demand, Provider};
    /// # struct SomeConcreteType { field: String }
    ///
    /// impl Provider for SomeConcreteType {
    ///     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
    ///         demand.provide_value::<String, _>(|| self.field.clone());
    ///     }
    /// }
    /// ```
    pub fn provide_value<T, F>(&mut self, fulfil: F) -> &mut Self
    where
        T: 'static,
        F: FnOnce() -> T,
    {
        self.provide_with::<tags::Value<T>, F>(fulfil)
    }

    /// Provide a reference, note that the referee type must be bounded by `'static`,
    /// but may be unsized.
    ///
    /// # Examples
    ///
    /// Provides a reference to a field as a `&str`.
    ///
    /// ```rust
    /// use provider::{Demand, Provider};
    /// # struct SomeConcreteType { field: String }
    ///
    /// impl Provider for SomeConcreteType {
    ///     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
    ///         demand.provide_ref::<str>(&self.field);
    ///     }
    /// }
    /// ```
    pub fn provide_ref<T: ?Sized + 'static>(&mut self, value: &'a T) -> &mut Self {
        self.provide::<tags::Ref<tags::MaybeSizedValue<T>>>(value)
    }

    /// Provide a value with the given `Type` tag.
    fn provide<I>(&mut self, value: I::Reified) -> &mut Self
    where
        I: tags::Type<'a>,
    {
        if let Some(res @ TaggedOption(None)) = self.0.downcast_mut::<I>() {
            res.0 = Some(value);
        }
        self
    }

    /// Provide a value with the given `Type` tag, using a closure to prevent unnecessary work.
    fn provide_with<I, F>(&mut self, fulfil: F) -> &mut Self
    where
        I: tags::Type<'a>,
        F: FnOnce() -> I::Reified,
    {
        if let Some(res @ TaggedOption(None)) = self.0.downcast_mut::<I>() {
            res.0 = Some(fulfil());
        }
        self
    }
}

///////////////////////////////////////////////////////////////////////////////
// Type tags
///////////////////////////////////////////////////////////////////////////////

mod tags {
    //! Type tags are used to identify a type using a separate value. This module includes type tags
    //! for some very common types.
    //!
    //! Many users of the provider APIs will not need to use type tags at all. But if you want to
    //! use them with more complex types (typically those including lifetime parameters), you will
    //! need to write your own tags.

    use core::marker::PhantomData;

    /// This trait is implemented by specific tag types in order to allow
    /// describing a type which can be requested for a given lifetime `'a`.
    ///
    /// A few example implementations for type-driven tags can be found in this
    /// module, although crates may also implement their own tags for more
    /// complex types with internal lifetimes.
    pub trait Type<'a>: Sized + 'static {
        /// The type of values which may be tagged by this tag for the given
        /// lifetime.
        type Reified: 'a;
    }

    /// Similar to the [`Type`] trait, but represents a type which may be unsized (i.e., has a
    /// `'Sized` bound). E.g., `str`.
    pub trait MaybeSizedType<'a>: Sized + 'static {
        type Reified: 'a + ?Sized;
    }

    impl<'a, T: Type<'a>> MaybeSizedType<'a> for T {
        type Reified = T::Reified;
    }

    /// Type-based tag for types bounded by `'static`, i.e., with no borrowed elements.
    #[derive(Debug)]
    pub struct Value<T: 'static>(PhantomData<T>);

    impl<'a, T: 'static> Type<'a> for Value<T> {
        type Reified = T;
    }

    /// Type-based tag similar to [`Value`] but which may be unsized (i.e., has a `'Sized` bound).
    #[derive(Debug)]
    pub struct MaybeSizedValue<T: ?Sized + 'static>(PhantomData<T>);

    impl<'a, T: ?Sized + 'static> MaybeSizedType<'a> for MaybeSizedValue<T> {
        type Reified = T;
    }

    /// Type-based tag for `&'a T` types.
    #[derive(Debug)]
    pub struct Ref<I>(PhantomData<I>);

    impl<'a, I: MaybeSizedType<'a>> Type<'a> for Ref<I> {
        type Reified = &'a I::Reified;
    }
}

/// An `Option` with a type tag `I`.
///
/// Since this struct implements `Erased`, the type can be erased to make a dynamically typed
/// option. The type can be checked dynamically using `Erased::tag_id` and since this is statically
/// checked for the concrete type, there is some degree of type safety.
#[repr(transparent)]
struct TaggedOption<'a, I: tags::Type<'a>>(Option<I::Reified>);

impl<'a, I: tags::Type<'a>> TaggedOption<'a, I> {
    fn as_demand(&mut self) -> &mut Demand<'a> {
        // SAFETY: transmuting `&mut (dyn Erased<'a> + 'a)` to `&mut Demand<'a>` is safe since
        // `Demand` is repr(transparent) and holds only a `dyn Erased<'a> + 'a`.
        unsafe { mem::transmute(self as &mut (dyn Erased<'a> + 'a)) }
    }
}

/// Represents a type-erased but identifiable object.
///
/// This trait is exclusively implemented by the `TaggedOption` type.
trait Erased<'a>: 'a {
    /// The `TypeId` of the erased type.
    fn tag_id(&self) -> TypeId;
}

impl<'a, I: tags::Type<'a>> Erased<'a> for TaggedOption<'a, I> {
    fn tag_id(&self) -> TypeId {
        TypeId::of::<I>()
    }
}

impl<'a> dyn Erased<'a> {
    /// Returns some reference to the dynamic value if it is tagged with `I`,
    /// or `None` otherwise.
    #[inline]
    fn downcast_mut<I>(&mut self) -> Option<&mut TaggedOption<'a, I>>
    where
        I: tags::Type<'a>,
    {
        if self.tag_id() == TypeId::of::<I>() {
            // SAFETY: Just checked whether we're pointing to an I.
            Some(unsafe { &mut *(self as *mut Self as *mut TaggedOption<'a, I>) })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    extern crate alloc;

    use alloc::{borrow::ToOwned, boxed::Box, string::String};

    use super::*;

    struct SomeConcreteType {
        some_string: String,
    }

    impl Provider for SomeConcreteType {
        fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
            demand
                .provide_ref::<String>(&self.some_string)
                .provide_ref::<str>(&self.some_string)
                .provide_value::<String, _>(|| "bye".to_owned());
        }
    }

    // Test the provide and request mechanisms with a by-reference trait object.
    #[test]
    fn test_provider() {
        let obj: &dyn Provider = &SomeConcreteType {
            some_string: "hello".to_owned(),
        };

        assert_eq!(&**request_ref::<String, _>(obj).unwrap(), "hello");
        assert_eq!(&*request_value::<String, _>(obj).unwrap(), "bye");
        assert_eq!(request_value::<u8, _>(obj), None);
    }

    // Test the provide and request mechanisms with a boxed trait object.
    #[test]
    fn test_provider_boxed() {
        let obj: Box<dyn Provider> = Box::new(SomeConcreteType {
            some_string: "hello".to_owned(),
        });

        assert_eq!(&**request_ref::<String, _>(&*obj).unwrap(), "hello");
        assert_eq!(&*request_value::<String, _>(&*obj).unwrap(), "bye");
        assert_eq!(request_value::<u8, _>(&*obj), None);
    }

    // Test the provide and request mechanisms with a concrete object.
    #[test]
    fn test_provider_concrete() {
        let obj = SomeConcreteType {
            some_string: "hello".to_owned(),
        };

        assert_eq!(&**request_ref::<String, _>(&obj).unwrap(), "hello");
        assert_eq!(&*request_value::<String, _>(&obj).unwrap(), "bye");
        assert_eq!(request_value::<u8, _>(&obj), None);
    }

    trait OtherTrait: Provider {}

    impl OtherTrait for SomeConcreteType {}

    impl dyn OtherTrait {
        fn get_ref<T: 'static + ?Sized>(&self) -> Option<&T> {
            request_ref::<T, _>(self)
        }
    }

    // Test the provide and request mechanisms via an intermediate trait.
    #[test]
    fn test_provider_intermediate() {
        let obj: &dyn OtherTrait = &SomeConcreteType {
            some_string: "hello".to_owned(),
        };
        assert_eq!(obj.get_ref::<str>().unwrap(), "hello");
    }
}
