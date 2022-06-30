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
///
/// Because this trait attaches the provided data to _every_ item in the iterator, the
/// provided data must implement [`Clone`].
pub trait IteratorExt: Iterator + Sized {
    /// Adds a new attachment to each [`Report`] in the [`Iterator`] when calling
    /// [`Iterator::next`].
    ///
    /// Applies [`Report::attach`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach`].
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    /// [`Iterator`]: std::iter::Iterator
    fn attach<A>(self, attachment: A) -> IteratorWithAttachment<Self, A>
    where
        A: Send + Sync + 'static;

    /// Lazily adds a new attachment to each [`Report`] inside the [`Iterator`] when calling
    /// [`Iterator::next`].
    ///
    /// Applies [`ResultExt::attach_lazy`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach`].
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
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
    /// [`Report`]: crate::Report
    /// [`Report::attach_printable`]: crate::Report::attach_printable
    /// [`poll`]: Future::poll
    fn attach_printable<A>(self, attachment: A) -> IteratorWithPrintableAttachment<Self, A>
    where
        A: Display + Debug + Send + Sync + 'static;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`]
    /// when calling [`Iterator::next`].
    ///
    /// Applies [`Report::attach_printable_lazy`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::attach_printable_lazy`].
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_printable_lazy`]: crate::Report::attach_printable
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
    /// [`Report`]: crate::Report
    /// [`Report::change_context`]: crate::Report::change_context
    /// [`poll`]: Future::poll
    fn change_context<C>(self, context: C) -> IteratorWithContext<Self, C>
    where
        C: Context;

    /// Changes the [`Context`] of the [`Report`] inside the [`Result`] when calling
    /// [`Iterator::next`]
    ///
    /// Applies [`Report::change_context`] to every [`Err`] variant in the iterator. For more
    /// information, see the documentation for [`Report::change_context`].
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context_lazy`]: crate::Report::change_context_lazy
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
    fn attach<A>(self, attachment: A) -> IteratorWithAttachment<Self, A> {
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
        A: Display + Debug + Send + Sync + 'static,
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
        C: Context,
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
        pub struct $name<I, A> {
            iterator: I,
            context_or_attachment: A,
        }

        impl<I, A> core::iter::Iterator for $name<I, A> where
            I: core::iter::Iterator,
            I::Item : $crate::ResultExt,
            A: $bound
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
        pub struct $name<I, F> {
            iterator: I,
            context_or_attachment: F,
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
    Result<<I::Item as ResultExt>::Ok, Report<A>>
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
    Context,
    I::Item
}

#[cfg(test)]
/// Just tests that some simple uses of `IteratorExt` (and related types) works.
mod test_simple_compiles {
    use super::*;
    use crate::test_helper::messages;

    #[derive(Debug)]
    pub struct UhOhError;

    impl core::fmt::Display for UhOhError {
        fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            f.write_str("UhOhError")
        }
    }

    impl crate::Context for UhOhError {}

    #[test]
    fn report_with_vec() {
        use alloc::{string::ToString, vec};

        let items = vec![
            Ok(1),
            Ok(1),
            Ok(2),
            Ok(5),
            Ok(14),
            Ok(42),
            Ok(132),
            Ok(429),
            Ok(1430),
            Ok(4862),
            Ok(16796),
            Err(UhOhError),
        ]
        .into_iter()
        .map(crate::ext::result::IntoReport::into_report);

        let report = items.into_iter().attach_lazy(|| "context".to_string());

        for each in report {
            match each {
                Ok(_) => (),
                Err(err) => {
                    assert_eq!(messages(&err), vec!["Opaque", "UhOhError"]);
                }
            }
        }
    }
}
