use alloc::boxed::Box;
use core::{
    marker::PhantomData,
    mem,
    ops::{Deref, DerefMut},
    ptr::NonNull,
};

use crate::FrameKind;

/// Stores a [`Box`] and a [`FrameKind`] by only occupying one pointer in size.
///
/// It's guaranteed that a `TaggedBox` has the same size as `Box`.
pub struct TaggedBox<T>(usize, PhantomData<Box<T>>);

impl<T> TaggedBox<T> {
    /// Mask for the pointer.
    ///
    /// For a given pointer width, this will be
    ///
    ///  - 16 bit: `1111_1111_1111_1110`
    ///  - 32 bit: `1111_1111_1111_1111_1111_1111_1111_1100`
    ///  - 64 bit: `1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1000`
    ///
    /// so the last bit will *always* be `0`.
    const MASK: usize = !(mem::align_of::<*const T>() - 1);

    /// Creates a new tagged pointer with a `FrameKind`.
    ///
    /// # Panics
    ///
    /// if the tag is too large to be stored next to a pointer.
    pub fn new(frame: T, kind: FrameKind) -> Self {
        // Will only fail on 8-bit platforms which Rust currently does not support
        assert!(
            mem::align_of::<*const T>() >= 2,
            "Tag can't be stored as tagged pointer"
        );
        let raw = Box::into_raw(Box::new(frame));

        let tag = kind == FrameKind::Context;
        // Store the tag in the last bit, due to alignment, this is 0 for 16-bit and higher
        Self(raw as usize | usize::from(tag), PhantomData)
    }

    /// Returns the tag stored inside the pointer
    pub const fn kind(&self) -> FrameKind {
        // We only store the last bit. If it's `1`, it's a context, otherwise it's an attachment
        if self.0 & 1 == 1 {
            FrameKind::Context
        } else {
            FrameKind::Attachment
        }
    }

    /// Returns a pointer to the stored object.
    const fn ptr(&self) -> NonNull<T> {
        let ptr = (self.0 & Self::MASK) as *mut T;

        // SAFETY: Pointer was created from `Box::new`
        unsafe { NonNull::new_unchecked(ptr) }
    }

    /// Casts the box to another type.
    ///
    /// # Safety
    ///
    /// - Same as casting between pointers and dereference them later on
    pub const unsafe fn cast<U>(self) -> TaggedBox<U> {
        TaggedBox(self.0, PhantomData)
    }

    /// Converts the tagged box back to a box.
    pub fn into_box(self) -> Box<T> {
        // SAFETY: Pointer was created from `Box::new`
        unsafe { Box::from_raw(self.ptr().as_ptr()) }
    }
}

impl<T> Deref for TaggedBox<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: Pointer was created from `Box::new`
        unsafe { self.ptr().as_ref() }
    }
}

impl<T> DerefMut for TaggedBox<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: Pointer was created from `Box::new`
        unsafe { self.ptr().as_mut() }
    }
}
