use core::{
    marker::PhantomData,
    sync::atomic::{AtomicU8, Ordering},
};

pub(super) trait AtomicPreference: Sized {
    const NONE: u8 = 0xFF;

    fn load(value: u8) -> Option<Self>;
    fn store(value: Option<Self>) -> u8;
}

pub(super) struct AtomicOverride<T: AtomicPreference> {
    inner: AtomicU8,
    _marker: PhantomData<fn() -> *const T>,
}

impl<T: AtomicPreference> AtomicOverride<T> {
    pub(super) const fn new() -> Self {
        Self {
            inner: AtomicU8::new(T::NONE),
            _marker: PhantomData,
        }
    }

    pub(super) fn store(&self, value: Option<T>) {
        self.inner.store(T::store(value), Ordering::Relaxed);
    }

    pub(super) fn load(&self) -> Option<T> {
        let inner = self.inner.load(Ordering::Relaxed);

        T::load(inner)
    }
}
