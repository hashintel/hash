//! Internal API

use super::{TypeId, TypeTag};

/// Sealed trait representing a type-erased tagged object.
///
/// # Safety
///
/// This trait must be exclusively implemented by the [`TagValue`] type.
pub(super) unsafe trait Tagged<'p>: 'p {
    /// The [`TypeId`] of the [`TypeTag`] this value was tagged with.
    fn tag_id(&self) -> TypeId;
}

/// A concrete tagged value for a given tag `I`.
///
/// This is the only type which implements the [`Tagged`] trait, and encodes additional information
/// about the specific [`TypeTag`] into the type. This allows for multiple different tags to support
/// overlapping value ranges, for example, both the [`Ref<str>`] and [`Value<&'static str>`] tags
/// can be used to tag a value of type [`&'static str`].
///
/// [`Ref<str>`]: crate::tags::Ref
/// [`Value<&'static str>`]: crate::tags::Value
/// [`&'static str`]: str
#[repr(transparent)]
pub(super) struct TagValue<'p, I: TypeTag<'p>>(pub(super) I::Type);

unsafe impl<'p, I> Tagged<'p> for TagValue<'p, I>
where
    I: TypeTag<'p>,
{
    fn tag_id(&self) -> TypeId {
        TypeId::of::<I>()
    }
}

impl<'p> dyn Tagged<'p> {
    /// Returns `true` if the dynamic type is tagged with `I`.
    #[inline]
    pub(super) fn is<I>(&self) -> bool
    where
        I: TypeTag<'p>,
    {
        self.tag_id() == TypeId::of::<I>()
    }

    /// Returns some reference to the dynamic value if it is tagged with `I`, or [`None`] if it
    /// isn't.
    #[inline]
    pub(super) fn downcast_mut<I>(&mut self) -> Option<&mut TagValue<'p, I>>
    where
        I: TypeTag<'p>,
    {
        if self.is::<I>() {
            // SAFETY: Just checked whether we're pointing to a `TagValue<'p, I>`
            unsafe { Some(&mut *(self as *mut Self).cast::<TagValue<'p, I>>()) }
        } else {
            None
        }
    }
}
