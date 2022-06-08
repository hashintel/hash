use alloc::boxed::Box;
use core::{
    any::{Any, TypeId},
    fmt,
    ptr::{addr_of, NonNull},
};

use crate::{
    frame::{AttachedObject, FrameRepr},
    Context,
};

/// Stores functions to act on the underlying [`Frame`] type without knowing the unerased type.
///
/// This works around the limitation of not being able to coerce from `Box<dyn Context>` to
/// `Box<dyn Any>` to add downcasting. Also this works around dynamic dispatching, as the functions
/// are stored and called directly. In addition this reduces the memory usage by one pointer, as the
/// `VTable` is stored next to the object.
///
/// [`Frame`]: crate::Frame
pub(in crate::frame) struct VTable {
    object_drop: unsafe fn(Box<FrameRepr>),
    object_ref: unsafe fn(&FrameRepr) -> &dyn Context,
    object_downcast: unsafe fn(&FrameRepr, target: TypeId) -> Option<NonNull<()>>,
}

impl VTable {
    /// Creates a `VTable` for a [`Context`].
    pub fn new_context<C: Context>() -> &'static Self {
        &Self {
            object_drop: Self::object_drop::<C>,
            object_ref: Self::object_ref::<C>,
            object_downcast: Self::context_downcast::<C>,
        }
    }

    /// Creates a `VTable` for an attachment.
    pub fn new_attachment<A>() -> &'static Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<AttachedObject<A>>,
            object_ref: Self::object_ref::<AttachedObject<A>>,
            object_downcast: Self::attachment_downcast::<A>,
        }
    }

    /// Unerases the `frame` as a [`Context`].
    pub(in crate::frame) fn unerase<'f>(&self, frame: &'f FrameRepr) -> &'f dyn Context {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_ref)(frame) }
    }

    /// Attempts to downcast `frame` as a shared reference to `T`.
    pub(in crate::frame) fn downcast_ref<'f, T: Any>(&self, frame: &'f FrameRepr) -> Option<&'f T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_ref()) }
    }

    /// Attempts to downcast `frame` as a unique reference to `T`.
    pub(in crate::frame) fn downcast_mut<'f, T: Any>(
        &self,
        frame: &'f mut FrameRepr,
    ) -> Option<&'f mut T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_mut()) }
    }

    /// Drops the unerased value of `frame`.
    pub(in crate::frame) fn drop(&self, frame: Box<FrameRepr>) {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_drop)(frame) }
    }

    /// Drops the `frame`.
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `FrameRepr<C>`.
    unsafe fn object_drop<C: Context>(frame: Box<FrameRepr>) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        // Note: This must not use `mem::transmute` because it tries to reborrow the `Unique`
        //   contained in `Box`, which must not be done. In practice this probably won't make any
        //   difference by now, but technically it's unsound.
        //   see: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/wip/stacked-borrows.md
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<FrameRepr<C>>());
        drop(unerased);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<C>`.
    unsafe fn object_ref<C: Context>(frame: &FrameRepr) -> &dyn Context {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased = (frame as *const FrameRepr).cast::<FrameRepr<C>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        &(*(unerased))._unerased
    }

    /// Downcasts the context to `C`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<C>`.
    const unsafe fn object_downcast_unchecked<C: Context>(frame: &FrameRepr) -> NonNull<()> {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased: *const FrameRepr<C> = (frame as *const FrameRepr).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        let addr = addr_of!((*(unerased))._unerased) as *mut ();
        NonNull::new_unchecked(addr)
    }

    /// Downcasts the context to `target`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<C>`.
    unsafe fn context_downcast<C: Context>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<C>() == target {
            Some(Self::object_downcast_unchecked::<C>(frame))
        } else {
            None
        }
    }

    /// Downcasts the attachment to `target`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<AttachedObject<A>>`.
    unsafe fn attachment_downcast<A: fmt::Display + fmt::Debug + Send + Sync + 'static>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<A>() == target {
            Some(Self::object_downcast_unchecked::<AttachedObject<A>>(frame))
        } else {
            None
        }
    }
}
