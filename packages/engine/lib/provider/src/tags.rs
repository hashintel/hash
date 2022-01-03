//! Type tags are used to identify a type using a separate value. This module includes type tags for
//! some very common types.
//!
//! Many users of the provider APIs will not need to use type tags at all. But if you want to use
//! them with more complex types (typically those including lifetime parameters), you will
//! need to write your own tags.

use core::marker::PhantomData;

use crate::TypeTag;

/// Type-based [`TypeTag`] for `&'p T` types.
#[derive(Debug)]
pub struct Ref<T: ?Sized + 'static>(PhantomData<T>);

impl<'p, T: ?Sized + 'static> TypeTag<'p> for Ref<T> {
    type Type = &'p T;
}

/// Type-based [`TypeTag`] for static `T` types.
#[derive(Debug)]
pub struct Value<T: 'static>(PhantomData<T>);

impl<'p, T: 'static> TypeTag<'p> for Value<T> {
    type Type = T;
}

/// Tag combinator to wrap the given tag's value in an [`Option<T>`][Option]
#[derive(Debug)]
pub struct OptionTag<I>(PhantomData<I>);

impl<'p, I: TypeTag<'p>> TypeTag<'p> for OptionTag<I> {
    type Type = Option<I::Type>;
}

/// Tag combinator to wrap the given tag's value in an [`Result<T, E>`][Result]
#[derive(Debug)]
pub struct ResultTag<I, E>(PhantomData<I>, PhantomData<E>);

impl<'p, I: TypeTag<'p>, E: TypeTag<'p>> TypeTag<'p> for ResultTag<I, E> {
    type Type = Result<I::Type, E::Type>;
}

// Tested in `crate::tests`
