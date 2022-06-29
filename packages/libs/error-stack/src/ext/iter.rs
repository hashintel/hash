use core::fmt::{Debug, Display};

use crate::{Context, Report, ResultExt};

/// This trait provides extension methods for iterators which makes it possible to turn them into
/// `Report`s.
///
/// This method works only on iterators of items which implement [`crate::ResultExt`].
///
/// Because this trait attaches the provided data to _every_ item in the iterator, the
/// provided data must implement [`Clone`].
pub trait IteratorExt: Iterator + Sized {
    /// Adds a new attachment to each [`Report`] in the iterator.
    #[track_caller]
    fn attach<A>(self, attachement: A) -> IteratorWithAttachement<Self, A>
    where
        A: Send + Sync + 'static;

    /// Lazily adds a new attachment to each [`Report`] in the iterator.
    #[track_caller]
    fn attach_lazy<A, F>(self, attachement: F) -> IteratorWithLazyAttachement<Self, F>
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Attaches a printable attachement to the [`Report`] inside the [`Result`] in each item
    /// in the iterator.
    #[track_caller]
    fn attach_printable<A>(self, attachement: A) -> IteratorWithPrintableAttachement<Self, A>
    where
        A: Display + Debug + Send + Sync + 'static;

    /// Lazily attaches a printable attachement to the [`Report`] inside the [`Result`] in each item
    /// in the iterator.
    #[track_caller]
    fn attach_printable_lazy<A, F>(
        self,
        attachement: F,
    ) -> IteratorWithLazyPrintableAttachement<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Changes the [`Context`] inside the [`Report`] for each item in the iterator.
    #[track_caller]
    fn change_context<C>(self, context: C) -> IteratorWithContext<Self, C>
    where
        C: Context;

    /// Lazily changes the [`Context`] inside the [`Report`] for each item in the iterator.
    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> IteratorWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C;
}

impl<I: Iterator> IteratorExt for I
where
    I::Item: ResultExt,
{
    #[track_caller]
    fn attach<A>(self, attachement: A) -> IteratorWithAttachement<Self, A> {
        IteratorWithAttachement {
            iterator: self,
            context: attachement,
        }
    }

    #[track_caller]
    fn attach_lazy<A, F>(self, attachement: F) -> IteratorWithLazyAttachement<Self, F>
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        IteratorWithLazyAttachement {
            iterator: self,
            context: attachement,
        }
    }

    #[track_caller]
    fn attach_printable<A>(self, attachement: A) -> IteratorWithPrintableAttachement<Self, A>
    where
        A: Display + Debug + Send + Sync + 'static,
    {
        IteratorWithPrintableAttachement {
            iterator: self,
            context: attachement,
        }
    }

    #[track_caller]
    fn attach_printable_lazy<A, F>(
        self,
        attachement: F,
    ) -> IteratorWithLazyPrintableAttachement<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        IteratorWithLazyPrintableAttachement {
            iterator: self,
            context: attachement,
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> IteratorWithContext<Self, C>
    where
        C: Context,
    {
        IteratorWithContext {
            iterator: self,
            context,
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> IteratorWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        IteratorWithLazyContext {
            iterator: self,
            context,
        }
    }
}

pub struct IteratorWithAttachement<I, A> {
    iterator: I,
    context: A,
}

impl<I, A> Iterator for IteratorWithAttachement<I, A>
where
    I: Iterator,
    I::Item: ResultExt,
    A: Send + Sync + 'static + Clone,
{
    type Item = I::Item;

    #[track_caller]
    fn next(&mut self) -> Option<Self::Item> {
        match self.iterator.next() {
            Some(item) => Some(item.attach(self.context.clone())),
            None => None,
        }
    }
}

pub struct IteratorWithLazyAttachement<I, A> {
    iterator: I,
    context: A,
}

impl<I, F, A> Iterator for IteratorWithLazyAttachement<I, F>
where
    I: Iterator,
    I::Item: ResultExt,
    F: FnOnce() -> A + Clone,
    A: Send + Sync + Clone + 'static,
{
    type Item = I::Item;

    #[track_caller]
    fn next(&mut self) -> Option<Self::Item> {
        match self.iterator.next() {
            Some(item) => Some(item.attach_lazy(self.context.clone())),
            None => None,
        }
    }
}

pub struct IteratorWithPrintableAttachement<I, A> {
    iterator: I,
    context: A,
}

impl<I, A> Iterator for IteratorWithPrintableAttachement<I, A>
where
    I: Iterator,
    I::Item: ResultExt,
    A: Display + Debug + Send + Sync + 'static + Clone,
{
    type Item = I::Item;

    #[track_caller]
    fn next(&mut self) -> Option<Self::Item> {
        match self.iterator.next() {
            Some(item) => Some(item.attach_printable(self.context.clone())),
            None => None,
        }
    }
}

pub struct IteratorWithContext<I, A> {
    iterator: I,
    context: A,
}

impl<I, A> Iterator for IteratorWithContext<I, A>
where
    I: Iterator,
    I::Item: ResultExt,
    A: Context + Clone,
{
    type Item = Result<<I::Item as ResultExt>::Ok, Report<A>>;

    #[track_caller]
    fn next(&mut self) -> Option<Self::Item> {
        match self.iterator.next() {
            Some(item) => Some(item.change_context(self.context.clone())),
            None => None,
        }
    }
}

pub struct IteratorWithLazyContext<I, A> {
    iterator: I,
    context: A,
}

impl<I, F, A> Iterator for IteratorWithLazyContext<I, F>
where
    I: Iterator,
    I::Item: ResultExt,
    F: FnOnce() -> A + Clone,
    A: Context,
{
    type Item = Result<<I::Item as ResultExt>::Ok, Report<A>>;

    #[track_caller]
    fn next(&mut self) -> Option<Self::Item> {
        match self.iterator.next() {
            Some(item) => Some(item.change_context_lazy(self.context.clone())),
            None => None,
        }
    }
}

pub struct IteratorWithLazyPrintableAttachement<I, A> {
    iterator: I,
    context: A,
}

impl<I, F, A> Iterator for IteratorWithLazyPrintableAttachement<I, F>
where
    I: Iterator,
    I::Item: ResultExt,
    F: FnOnce() -> A + Clone,
    A: Context,
{
    type Item = I::Item;

    #[track_caller]
    fn next(&mut self) -> Option<Self::Item> {
        match self.iterator.next() {
            Some(item) => Some(item.attach_printable_lazy(self.context.clone())),
            None => todo!(),
        }
    }
}

#[cfg(test)]
/// Just tests that some simple uses of `IteratorExt` (and related types) works.
mod test_simple_compiles {
    use super::*;

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

        let report = items.into_iter().attach("context".to_string());

        report.for_each(drop);
    }
}
