use alloc::boxed::Box;
#[cfg(nightly)]
use core::any::{Demand, Provider};
use core::{
    any::TypeId,
    fmt,
    ptr::{addr_of_mut, NonNull},
};

#[cfg(nightly)]
use crate::frame::attachment::AttachmentProvider;
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
    object_downcast: unsafe fn(NonNull<ErasableFrame>, target: TypeId) -> Option<NonNull<()>>,
    unerase: unsafe fn(&NonNull<ErasableFrame>) -> FrameKind<'_>,
    #[cfg(nightly)]
    provide: unsafe fn(NonNull<ErasableFrame>, &mut Demand),
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

    /// Creates a `VTable` for a [`compat`].
    ///
    /// [`Compat`]: crate::Compat
    #[cfg(any(feature = "anyhow", feature = "eyre"))]
    pub fn new_compat<T, C: Context>() -> &'static Self
    where
        T: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        &Self {
            object_drop: Self::object_drop::<C>,
            object_downcast: Self::object_downcast::<T>,
            unerase: Self::unerase_context::<C>,
            #[cfg(nightly)]
            provide: Self::context_provide::<C>,
        }
    }

    /// Unerases the `frame` as a [`FrameKind`].
    pub(in crate::frame) fn unerase<'f>(&self, frame: &'f NonNull<ErasableFrame>) -> FrameKind<'f> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.unerase)(frame) }
    }

    /// Calls `provide` on `frame`.
    #[cfg(nightly)]
    pub(in crate::frame) fn provide(&self, frame: NonNull<ErasableFrame>, demand: &mut Demand) {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.provide)(frame, demand) }
    }

    /// Attempts to downcast `frame` as a shared reference to `T`.
    pub(in crate::frame) fn downcast_ref<'f, T: Send + Sync + 'static>(
        &self,
        frame: NonNull<ErasableFrame>,
    ) -> Option<&'f T> {
        // SAFETY: Use vtable to attach the frames' native vtable for the right original type.
        unsafe { (self.object_downcast)(frame, TypeId::of::<T>()).map(|ptr| ptr.cast().as_ref()) }
    }

    /// Attempts to downcast `frame` as a unique reference to `T`.
    pub(in crate::frame) fn downcast_mut<'f, T: Send + Sync + 'static>(
        &self,
        frame: NonNull<ErasableFrame>,
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
        let unerased: Box<ErasableFrame<T>> = Box::from_raw(frame.as_ptr().cast());
        drop(unerased);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<C>`.
    #[cfg(nightly)]
    unsafe fn context_provide<C: Context>(frame: NonNull<ErasableFrame>, demand: &mut Demand) {
        // Attach C's native vtable onto the pointer to `self._unerased`
        let unerased: NonNull<ErasableFrame<C>> = frame.cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        unerased.as_ref()._unerased.provide(demand);
    }

    /// Unerase the object as None.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    #[cfg(nightly)]
    unsafe fn self_provide<A: 'static>(frame: NonNull<ErasableFrame>, demand: &mut Demand) {
        // Attach A's native vtable onto the pointer to `self._unerased`
        let unerased: NonNull<ErasableFrame<AttachmentProvider<A>>> = frame.cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        unerased.as_ref()._unerased.provide(demand);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<C>`.
    unsafe fn unerase_context<C: Context>(frame: &NonNull<ErasableFrame>) -> FrameKind<'_> {
        // Attach C's native vtable onto the pointer to `self._unerased`
        let unerased: NonNull<ErasableFrame<C>> = frame.cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        FrameKind::Context(&unerased.as_ref()._unerased)
    }

    /// Unerase the object as generic attachment.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    unsafe fn unerase_generic_attachment<A: Send + Sync + 'static>(
        frame: &NonNull<ErasableFrame>,
    ) -> FrameKind<'_> {
        // Attach A's native vtable onto the pointer to `self._unerased`
        // Casting from `AttachmentProvider<A>` to `A` is allowed as `AttachmentProvider` is
        // `repr(transparent)`
        let unerased: NonNull<ErasableFrame<A>> = frame.cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        FrameKind::Attachment(AttachmentKind::Opaque(&unerased.as_ref()._unerased))
    }

    /// Unerase the object as `&dyn Debug + Display`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<AttachmentProvider<A>>`.
    unsafe fn unerase_printable_attachment<A: fmt::Debug + fmt::Display + Send + Sync + 'static>(
        frame: &NonNull<ErasableFrame>,
    ) -> FrameKind<'_> {
        // Attach A's native vtable onto the pointer to `self._unerased`
        // Casting from `AttachmentProvider<A>` to `A` is allowed as `AttachmentProvider` is
        // `repr(transparent)`
        let unerased: NonNull<ErasableFrame<A>> = frame.cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        FrameKind::Attachment(AttachmentKind::Printable(&unerased.as_ref()._unerased))
    }

    /// Downcasts the object to `T`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `ErasableFrame<T>`.
    unsafe fn object_downcast<T: Send + Sync + 'static>(
        frame: NonNull<ErasableFrame>,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        (TypeId::of::<T>() == target).then(|| {
            // Attach T's native vtable onto the pointer to `self._unerased`
            let unerased: NonNull<ErasableFrame<T>> = frame.cast();

            // inside of vtable it's allowed to access `_unerased`
            #[allow(clippy::used_underscore_binding)]
            NonNull::new_unchecked(addr_of_mut!((*(unerased.as_ptr()))._unerased)).cast()
        })
    }
}
