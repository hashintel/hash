use alloc::boxed::Box;
use core::ptr::NonNull;

use crate::frame::VTable;

// repr(C): It must be ensured that vtable is always stored at the same memory position when casting
// between an unerased `ErasableFrame<T>` and an erased `ErasableFrame`.
#[repr(C)]
pub(in crate::frame) struct ErasableFrame<T = ()> {
    vtable: &'static VTable,
    // As we cast between `ErasableFrame<T>` and `ErasableFrame<()>`, `_unerased` must not be used
    // directly, only through `vtable`
    pub(in crate::frame) _unerased: T,
}

impl<T> ErasableFrame<T> {
    /// Creates a new [`Frame`] from an unerased object.
    ///
    /// [`Frame`]: crate::Frame
    pub(in crate::frame) fn new(object: T, vtable: &'static VTable) -> NonNull<ErasableFrame> {
        let unerased_frame = Self {
            vtable,
            _unerased: object,
        };
        NonNull::from(Box::leak(Box::new(unerased_frame))).cast()
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
