use crate::{
    frame::{TaggedBox, VTable},
    Context, FrameKind,
};

// repr(C): It must be ensured, that vtable is always stored at the same memory position when
// casting between `FrameRepr<T>` and `FrameRepr<()>`.
#[repr(C)]
pub(in crate::frame) struct FrameRepr<T = ()> {
    vtable: &'static VTable,
    // As we cast between `FrameRepr<T>` and `FrameRepr<()>`, `_unerased` must not be used
    // directly, only through `vtable`
    pub(in crate::frame) _unerased: T,
}

impl<C> FrameRepr<C>
where
    C: Context,
{
    /// Creates a new [`Frame`] from an unerased [`Context`] object.
    ///
    /// [`Frame`]: crate::Frame
    ///
    /// # Safety
    ///
    /// Must not be dropped without calling `vtable.object_drop`
    pub(in crate::frame) unsafe fn new(
        context: C,
        vtable: &'static VTable,
        kind: FrameKind,
    ) -> TaggedBox<FrameRepr> {
        let unerased_frame = Self {
            vtable,
            _unerased: context,
        };
        let unerased_box = TaggedBox::new(unerased_frame, kind);
        // erase the frame by casting the pointer to `FrameBox<()>`
        unerased_box.cast()
    }
}

impl FrameRepr {
    /// Returns the [`VTable`] for this [`Frame`].
    ///
    /// [`Frame`]: crate::Frame
    pub(in crate::frame) const fn vtable(&self) -> &'static VTable {
        self.vtable
    }
}
