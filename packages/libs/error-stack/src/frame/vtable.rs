use alloc::boxed::Box;
use core::{
    any::{Any, TypeId},
    fmt,
    ptr::{addr_of, NonNull},
};

#[cfg(nightly)]
use crate::{
    frame::attachment::AttachmentProvider,
    provider::{Demand, Provider},
};
use crate::{frame::ErasableFrame, Context};

/// Stores functions to act on the underlying [`Frame`] type without knowing the unerased type.
///
/// This works around the limitation of not being able to coerce from `Box<dyn Context>` to
/// `Box<dyn Any>` to add downcasting. Also this works around dynamic dispatching, as the functions
/// are stored and called directly. In addition this reduces the memory usage by one pointer, as the
/// `VTable` is stored next to the object.
///
/// [`Frame`]: crate::Frame
pub(in crate::frame) struct VTable {
    object_drop: unsafe fn(Box<ErasableFrame>),
    object_downcast: unsafe fn(&ErasableFrame, target: TypeId) -> Option<NonNull<()>>,
    debug_ref: unsafe fn(&ErasableFrame) -> Option<&dyn fmt::Debug>,
    display_ref: unsafe fn(&ErasableFrame) -> Option<&dyn fmt::Display>,
    #[cfg(nightly)]
    provide: unsafe fn(&ErasableFrame, &mut Demand),
}

impl VTable {
    /// Creates a `VTable` for a [`Context`].
    pub fn new_context<C: Context>() -> &'static Self {
        &Self {
            object_drop: Self::object_drop::<C>,
            object_downcast: Self::object_downcast::<C>,
            debug_ref: Self::debug_ref::<C>,
            display_ref: Self::display_ref::<C>,
            #[cfg(nightly)]
            provide: Self::context_provide::<C>,
        }
    }

    /// Creates a `VTable` for an attachment.
    pub fn new_debug_display_attachment<A>() -> &'static Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<A>,
            object_downcast: Self::object_downcast::<A>,
            debug_ref: Self::debug_ref::<A>,
            display_ref: Self::display_ref::<A>,
            #[cfg(nightly)]
            provide: Self::self_provide::<A>,
        }
    }

    /// Creates a `VTable` for an attachment.
    pub fn new_debug_attachment<A>() -> &'static Self
    where
        A: fmt::Debug + Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<A>,
            object_downcast: Self::object_downcast::<A>,
            debug_ref: Self::debug_ref::<A>,
            display_ref: Self::no_display_ref,
            #[cfg(nightly)]
            provide: Self::self_provide::<A>,
        }
    }

    /// Creates a `VTable` for an attachment.
    pub fn new_display_attachment<A>() -> &'static Self
    where
        A: fmt::Display + Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<A>,
            object_downcast: Self::object_downcast::<A>,
            debug_ref: Self::no_debug_ref,
            display_ref: Self::display_ref::<A>,
            #[cfg(nightly)]
            provide: Self::self_provide::<A>,
        }
    }

    /// Creates a `VTable` for an attachment.
    pub fn new_attachment<A>() -> &'static Self
    where
        A: Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<A>,
            object_downcast: Self::object_downcast::<A>,
            debug_ref: Self::no_debug_ref,
            display_ref: Self::no_display_ref,
            #[cfg(nightly)]
            provide: Self::self_provide::<A>,
        }
    }

    /// Unerases the `frame` as a [`Display`].
    pub(in crate::frame) fn unerase_display<'f>(
        &self,
        frame: &'f ErasableFrame,
    ) -> Option<&'f dyn fmt::Display> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.display_ref)(frame) }
    }

    /// Unerases the `frame` as a [`Debug`].
    pub(in crate::frame) fn unerase_debug<'f>(
        &self,
        frame: &'f ErasableFrame,
    ) -> Option<&'f dyn fmt::Debug> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.debug_ref)(frame) }
    }

    /// Calls `provide` on `frame`.
    #[cfg(nightly)]
    pub(in crate::frame) fn provide(&self, frame: &ErasableFrame, demand: &mut Demand) {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.provide)(frame, demand) }
    }

    /// Attempts to downcast `frame` as a shared reference to `T`.
    pub(in crate::frame) fn downcast_ref<'f, T: Any>(
        &self,
        frame: &'f ErasableFrame,
    ) -> Option<&'f T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_ref()) }
    }

    /// Attempts to downcast `frame` as a unique reference to `T`.
    pub(in crate::frame) fn downcast_mut<'f, T: Any>(
        &self,
        frame: &'f mut ErasableFrame,
    ) -> Option<&'f mut T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_mut()) }
    }

    /// Drops the unerased value of `frame`.
    pub(in crate::frame) fn drop(&self, frame: Box<ErasableFrame>) {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_drop)(frame) }
    }

    /// Drops the `frame`.
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `FrameRepr<C>`.
    unsafe fn object_drop<T>(frame: Box<ErasableFrame>) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        // Note: This must not use `mem::transmute` because it tries to reborrow the `Unique`
        //   contained in `Box`, which must not be done. In practice this probably won't make any
        //   difference by now, but technically it's unsound.
        //   see: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/wip/stacked-borrows.md
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<ErasableFrame<T>>());
        drop(unerased);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<T>`.
    #[cfg(nightly)]
    unsafe fn context_provide<C: Context>(frame: &ErasableFrame, demand: &mut Demand) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased = (frame as *const ErasableFrame).cast::<ErasableFrame<C>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        (*(unerased))._unerased.provide(demand)
    }

    /// Unerase the object as None.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    #[cfg(nightly)]
    unsafe fn self_provide<A: 'static>(frame: &ErasableFrame, demand: &mut Demand) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased =
            (frame as *const ErasableFrame).cast::<ErasableFrame<AttachmentProvider<A>>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        (*(unerased))._unerased.provide(demand)
    }

    /// Unerase the object as `&dyn Display`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<T>`.
    unsafe fn display_ref<'t, T: fmt::Display + 't>(
        frame: &ErasableFrame,
    ) -> Option<&(dyn fmt::Display + 't)> {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased = (frame as *const ErasableFrame).cast::<ErasableFrame<T>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        Some(&(*(unerased))._unerased)
    }

    /// Unerase the object as None.
    fn no_display_ref(_: &ErasableFrame) -> Option<&dyn fmt::Display> {
        None
    }

    /// Unerase the object as `&dyn Display`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<T>`.
    unsafe fn debug_ref<'t, T: fmt::Debug + 't>(
        frame: &ErasableFrame,
    ) -> Option<&(dyn fmt::Debug + 't)> {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased = (frame as *const ErasableFrame).cast::<ErasableFrame<T>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        Some(&(*(unerased))._unerased)
    }

    /// Unerase the object as None.
    fn no_debug_ref(_: &ErasableFrame) -> Option<&dyn fmt::Debug> {
        None
    }

    /// Downcasts the object to `T`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<T>`.
    unsafe fn object_downcast<T: Any>(
        frame: &ErasableFrame,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<T>() == target {
            // Attach T's native vtable onto the pointer to `self._unerased`
            let unerased: *const ErasableFrame<T> = (frame as *const ErasableFrame).cast();
            // inside of vtable it's allowed to access `_unerased`
            #[allow(clippy::used_underscore_binding)]
            let addr = addr_of!((*(unerased))._unerased) as *mut ();
            Some(NonNull::new_unchecked(addr))
        } else {
            None
        }
    }
}
