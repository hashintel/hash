//! Internal API

use crate::{tags, Requisition, TagValue, TypeTag};

impl<'p> Requisition<'p, '_> {
    /// Provide a value with the given [`TypeTag`].
    pub fn provide<I>(&mut self, value: I::Type) -> &mut Self
    where
        I: TypeTag<'p>,
    {
        if let Some(tag_value @ TagValue(Option::None)) =
            self.0.tagged.downcast_mut::<tags::OptionTag<I>>()
        {
            tag_value.0 = Some(value);
        }
        self
    }

    /// Provide a value or other type with only static lifetimes.
    pub fn provide_value<T, F>(&mut self, value: F) -> &mut Self
    where
        T: 'static,
        F: FnOnce() -> T,
    {
        self.provide_with::<tags::Value<T>, F>(value)
    }

    /// Provide a reference, note that `T` must be bounded by `'static`, but may be unsized.
    pub fn provide_ref<T: ?Sized + 'static>(&mut self, value: &'p T) -> &mut Self {
        self.provide::<tags::Ref<T>>(value)
    }

    /// Provide a value with the given [`TypeTag`], using a closure to prevent unnecessary work.
    pub fn provide_with<I, F>(&mut self, op: F) -> &mut Self
    where
        I: TypeTag<'p>,
        F: FnOnce() -> I::Type,
    {
        if let Some(tag_value @ TagValue(Option::None)) =
            self.0.tagged.downcast_mut::<tags::OptionTag<I>>()
        {
            tag_value.0 = Some(op());
        }
        self
    }
}

/// A concrete request for a tagged value. Can be coerced to [`Requisition`] to be passed to
/// provider methods.
pub(super) type ConcreteRequisition<'p, I> = RequisitionImpl<TagValue<'p, tags::OptionTag<I>>>;

/// Implementation detail shared between [`Requisition`] and [`ConcreteRequisition`].
///
/// Generally this value is used through the [`Requisition`] type as an `&mut Requisition<'p>` out
/// parameter, or constructed with the `ConcreteRequisition<'p, I>` type alias.
#[repr(transparent)]
pub(super) struct RequisitionImpl<T: ?Sized> {
    pub(super) tagged: T,
}
