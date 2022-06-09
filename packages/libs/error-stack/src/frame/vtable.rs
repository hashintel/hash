use alloc::boxed::Box;
use core::{
    any::TypeId,
    fmt,
    ptr::{addr_of, NonNull},
};

#[cfg(nightly)]
use crate::{
    frame::attachment::AttachmentProvider,
    provider::{Demand, Provider},
};
use crate::{
    frame::{kind::AttachmentKind, ErasableFrame},
    Context, FrameKind,
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
    object_drop: unsafe fn(NonNull<ErasableFrame>),
    object_downcast: unsafe fn(&ErasableFrame, target: TypeId) -> Option<NonNull<()>>,
    unerase: unsafe fn(&ErasableFrame) -> FrameKind<'_>,
    #[cfg(nightly)]
    provide: unsafe fn(&ErasableFrame, &mut Demand),
}

impl VTable {
    /// Creates a `VTable` for a [`Context`].
    pub fn new_context<C: Context>() -> &'static Self {
        &Self {
            object_drop: Self::object_drop::<C>,
            object_downcast: Self::object_downcast::<C>,
            unerase: Self::unerase_context::<C>,
            #[cfg(nightly)]
            provide: Self::context_provide::<C>,
        }
    }

    /// Creates a `VTable` for a printable attachment.
    pub fn new_printable_attachment<A>() -> &'static Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<A>,
            object_downcast: Self::object_downcast::<A>,
            unerase: Self::unerase_printable_attachment::<A>,
            #[cfg(nightly)]
            provide: Self::self_provide::<A>,
        }
    }

    /// Creates a `VTable` for a generic attachment.
    pub fn new_attachment<A>() -> &'static Self
    where
        A: Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<A>,
            object_downcast: Self::object_downcast::<A>,
            unerase: Self::unerase_generic_attachment::<A>,
            #[cfg(nightly)]
            provide: Self::self_provide::<A>,
        }
    }

    /// Unerases the `frame` as a [`FrameKind`].
    pub(in crate::frame) fn unerase<'f>(&self, frame: &'f ErasableFrame) -> FrameKind<'f> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.unerase)(frame) }
    }

    /// Calls `provide` on `frame`.
    #[cfg(nightly)]
    pub(in crate::frame) fn provide(&self, frame: &ErasableFrame, demand: &mut Demand) {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.provide)(frame, demand) }
    }

    /// Attempts to downcast `frame` as a shared reference to `T`.
    pub(in crate::frame) fn downcast_ref<'f, T: Send + Sync + 'static>(
        &self,
        frame: &'f ErasableFrame,
    ) -> Option<&'f T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_ref()) }
    }

    /// Attempts to downcast `frame` as a unique reference to `T`.
    pub(in crate::frame) fn downcast_mut<'f, T: Send + Sync + 'static>(
        &self,
        frame: &'f mut ErasableFrame,
    ) -> Option<&'f mut T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_mut()) }
    }

    /// Drops the unerased value of `frame`.
    pub(in crate::frame) fn drop(&self, frame: NonNull<ErasableFrame>) {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_drop)(frame) }
    }

    /// Drops the `frame`.
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `ErasableFrame<T>`.
    unsafe fn object_drop<T>(frame: NonNull<ErasableFrame>) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        // Note: This must not use `mem::transmute` because it tries to reborrow the `Unique`
        //   contained in `Box`, which must not be done. In practice this probably won't make any
        //   difference by now, but technically it's unsound.
        //   see: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/wip/stacked-borrows.md
        let unerased: Box<ErasableFrame<T>> = Box::from_raw(frame.as_ptr().cast());
        drop(unerased);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<C>`.
    #[cfg(nightly)]
    unsafe fn context_provide<C: Context>(frame: &ErasableFrame, demand: &mut Demand) {
        // Attach C's native vtable onto the pointer to `self._unerased`
        let unerased: *const ErasableFrame<C> = (frame as *const ErasableFrame).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        (*(unerased))._unerased.provide(demand);
    }

    /// Unerase the object as None.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    #[cfg(nightly)]
    unsafe fn self_provide<A: 'static>(frame: &ErasableFrame, demand: &mut Demand) {
        // Attach A's native vtable onto the pointer to `self._unerased`
        let unerased: *const ErasableFrame<AttachmentProvider<A>> =
            (frame as *const ErasableFrame).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        (*(unerased))._unerased.provide(demand);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<C>`.
    unsafe fn unerase_context<C: Context>(frame: &ErasableFrame) -> FrameKind<'_> {
        // Attach C's native vtable onto the pointer to `self._unerased`
        let unerased: *const ErasableFrame<C> = (frame as *const ErasableFrame).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        FrameKind::Context(&(*(unerased))._unerased)
    }

    /// Unerase the object as generic attachment.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    unsafe fn unerase_generic_attachment<A: Send + Sync + 'static>(
        frame: &ErasableFrame,
    ) -> FrameKind<'_> {
        // Attach A's native vtable onto the pointer to `self._unerased`
        // Casting from `AttachmentProvider<A>` to `A` is allowed as `AttachmentProvider` is
        // `repr(transparent)`
        let unerased: *const ErasableFrame<A> = (frame as *const ErasableFrame).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        FrameKind::Attachment(AttachmentKind::Opaque(&(*(unerased))._unerased))
    }

    /// Unerase the object as `&dyn Debug + Display`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    unsafe fn unerase_printable_attachment<A: fmt::Debug + fmt::Display + Send + Sync + 'static>(
        frame: &ErasableFrame,
    ) -> FrameKind<'_> {
        // Attach A's native vtable onto the pointer to `self._unerased`
        // Casting from `AttachmentProvider<A>` to `A` is allowed as `AttachmentProvider` is
        // `repr(transparent)`
        let unerased: *const ErasableFrame<A> = (frame as *const ErasableFrame).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        FrameKind::Attachment(AttachmentKind::Printable(&(*(unerased))._unerased))
    }

    /// Downcasts the object to `T`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<T>`.
    unsafe fn object_downcast<T: Send + Sync + 'static>(
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
