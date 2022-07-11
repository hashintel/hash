//! This module provides adaptors which make it possible to use `error-stack`'s functionality
//! on [`Iterator`]s.
//!
//! Most of the relevant documentation can be found in [`IteratorExt`].

use core::{
    fmt::{Debug, Display},
    marker::{Send, Sync},
};

use crate::{Context, Report, ResultExt};

/// This trait provides extension methods for iterators which makes it possible to manipulate
/// items inside them using the usual `error-stack` methods.
///
/// `IteratorExt` is only implemented for iterators of items which implement [`crate::ResultExt`].
pub trait IteratorExt: Iterator + Sized {
    /// Adds a new attachment to each [`Report`] in the [`Iterator`] when calling
    /// [`Iterator::next`].
    ///
    /// Applies [`Report::attach`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach`].
    ///
    /// [`Iterator`]: std::iter::Iterator
    fn attach<A>(self, attachment: A) -> IteratorWithAttachment<Self, A>
    where
        A: Clone + Send + Sync + 'static;

    /// Lazily adds a new attachment to each [`Report`] inside the [`Iterator`] when calling
    /// [`Iterator::next`].
    ///
    /// Applies [`Report::attach`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach`].
    ///
    /// [`poll`]: Future::poll
    fn attach_lazy<A, F>(self, attachment: F) -> IteratorWithLazyAttachment<Self, F>
    where
        A: Send + Sync + 'static,
        F: Fn() -> A;

    /// Adds a new printable attachment to the [`Report`] inside the [`Result`] when
    /// calling [`Iterator::next`].
    ///
    /// Applies [`Report::attach_printable`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach_printable`].
    ///
    /// [`poll`]: Future::poll
    fn attach_printable<A>(self, attachment: A) -> IteratorWithPrintableAttachment<Self, A>
    where
        A: Clone + Display + Debug + Send + Sync + 'static;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`]
    /// when calling [`Iterator::next`].
    ///
    /// Applies [`Report::attach_printable`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach_printable`].
    ///
    /// [`poll`]: Future::poll
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> IteratorWithLazyPrintableAttachment<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: Fn() -> A;

    /// Changes the [`Context`] of the [`Report`] inside the [`Result`] when calling
    /// [`Iterator::next`]
    ///
    /// Applies [`Report::change_context`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::change_context`].
    ///
    /// [`poll`]: Future::poll
    fn change_context<C>(self, context: C) -> IteratorWithContext<Self, C>
    where
        C: Context + Clone;

    /// Changes the [`Context`] of the [`Report`] inside the [`Result`] when calling
    /// [`Iterator::next`]
    ///
    /// Applies [`Report::change_context`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::change_context`].
    ///
    /// [`poll`]: Future::poll
    fn change_context_lazy<C, F>(self, context: F) -> IteratorWithLazyContext<Self, F>
    where
        C: Context,
        F: Fn() -> C;
}

impl<I: Iterator> IteratorExt for I
where
    I::Item: ResultExt,
{
    #[track_caller]
    fn attach<A>(self, attachment: A) -> IteratorWithAttachment<Self, A>
    where
        A: Clone + Send + Sync + 'static,
    {
        IteratorWithAttachment {
            iterator: self,
            context_or_attachment: attachment,
        }
    }

    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> IteratorWithLazyAttachment<Self, F>
    where
        A: Send + Sync + 'static,
        F: Fn() -> A,
    {
        IteratorWithLazyAttachment {
            iterator: self,
            context_or_attachment: attachment,
        }
    }

    #[track_caller]
    fn attach_printable<A>(self, attachment: A) -> IteratorWithPrintableAttachment<Self, A>
    where
        A: Clone + Display + Debug + Send + Sync + 'static,
    {
        IteratorWithPrintableAttachment {
            iterator: self,
            context_or_attachment: attachment,
        }
    }

    #[track_caller]
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> IteratorWithLazyPrintableAttachment<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: Fn() -> A,
    {
        IteratorWithLazyPrintableAttachment {
            iterator: self,
            context_or_attachment: attachment,
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> IteratorWithContext<Self, C>
    where
        C: Context + Clone,
    {
        IteratorWithContext {
            iterator: self,
            context_or_attachment: context,
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> IteratorWithLazyContext<Self, F>
    where
        C: Context,
        F: Fn() -> C,
    {
        IteratorWithLazyContext {
            iterator: self,
            context_or_attachment: context,
        }
    }
}

macro_rules! impl_iterator_adaptor {
    (
        $name:ident,
        $method:ident,
        $bound:ident
        $(+ $bounds:ident)*
        $(+ $lifetime:lifetime)*,
        $output:ty
    ) => {
        #[doc=concat!("The adaptor returned by [`IteratorExt::", stringify!($method), "']")]
        pub struct $name<I, T> {
            iterator: I,
            context_or_attachment: T,
        }

        impl<I, T> core::iter::Iterator for $name<I, T> where
            I: core::iter::Iterator,
            I::Item : $crate::ResultExt,
            T: $bound
            $(+ $bounds)*
            $(+ $lifetime)*
        {
            type Item = $output;

            fn next(&mut self) -> Option<Self::Item> {
                Some(self.iterator
                    .next()?
                    .$method(|| self.context_or_attachment.clone()))
            }
        }
    };
}

macro_rules! impl_lazy_iterator_adaptor {
    (
        $name:ident,
        $method:ident,
        $bound:ident
        $(+ $bounds:ident)*
        $(+ $lifetime:lifetime)*,
        $output:ty
    ) => {
        #[doc=concat!("The adaptor returned by [`IteratorExt::", stringify!($method), "']")]
        pub struct $name<I, T> {
            iterator: I,
            context_or_attachment: T,
        }

        impl<I, A, F> core::iter::Iterator for $name<I, F> where
            I: core::iter::Iterator,
            I::Item : $crate::ResultExt,
            F: Fn() -> A,
            A: $bound
            $(+ $bounds)*
            $(+ $lifetime)*
        {
            type Item = $output;

            fn next(&mut self) -> Option<Self::Item> {
                Some(self.iterator
                    .next()?
                    .$method(&self.context_or_attachment))
            }
        }
    };
}

impl_iterator_adaptor! {
    IteratorWithAttachment,
    attach_lazy,
    Send + Sync + Clone + 'static,
    I::Item
}

impl_iterator_adaptor! {
    IteratorWithPrintableAttachment,
    attach_printable_lazy,
    Display + Debug + Send + Sync + Clone + 'static,
    I::Item
}

impl_iterator_adaptor! {
    IteratorWithContext,
    change_context_lazy,
    Context + Clone,
    Result<<I::Item as ResultExt>::Ok, Report<T>>
}

impl_lazy_iterator_adaptor! {
    IteratorWithLazyAttachment,
    attach_lazy,
    Send + Sync + 'static,
    I::Item
}

impl_lazy_iterator_adaptor! {
    IteratorWithLazyContext,
    change_context_lazy,
    Context,
    Result<<I::Item as ResultExt>::Ok, Report<A>>
}

impl_lazy_iterator_adaptor! {
    IteratorWithLazyPrintableAttachment,
    attach_printable_lazy,
    Display + Debug + Send + Sync + 'static,
    I::Item
}
