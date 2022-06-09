use crate::frame::VTable;

// repr(C): It must be ensured, that vtable is always stored at the same memory position when
// casting between an unerased `ErasableFrame<T>` and an erased `ErasableFrame`.
#[repr(C)]
pub(in crate::frame) struct ErasableFrame<T = ()> {
    vtable: &'static VTable,
    // As we cast between `FrameRepr<T>` and `FrameRepr<()>`, `_unerased` must not be used
    // directly, only through `vtable`
    pub(in crate::frame) _unerased: T,
}

impl<T> ErasableFrame<T> {
    /// Creates a new [`Frame`] from an unerased object.
    ///
    /// [`Frame`]: crate::Frame
    ///
    /// # Safety
    ///
    /// Must not be dropped without calling `vtable.object_drop`
    pub(in crate::frame) unsafe fn new(object: T, vtable: &'static VTable) -> Box<ErasableFrame> {
        let unerased_frame = Self {
            vtable,
            _unerased: object,
        };
        let unerased_box = Box::new(unerased_frame);
        // erase the frame by casting the pointer to `ErasableFrame<()>`
        Box::from_raw(Box::into_raw(unerased_box).cast())
    }
}

impl ErasableFrame {
    /// Returns the [`VTable`] for this [`Frame`].
    ///
    /// [`Frame`]: crate::Frame
    pub(in crate::frame) const fn vtable(&self) -> &'static VTable {
        self.vtable
    }
}
