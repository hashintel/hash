use core::{
    marker::PhantomData,
    sync::atomic::{AtomicU8, Ordering},
};

pub(super) trait AtomicPreference {
    const DEFAULT: Self;

    fn from_u8(value: u8) -> Self;
    fn into_u8(self) -> u8;
}

pub(super) struct AtomicOverride<T: AtomicPreference> {
    inner: AtomicU8,
    _marker: PhantomData<fn() -> *const T>,
}

impl<T: AtomicPreference> AtomicOverride<T> {
    pub(super) const fn new() -> Self {
        Self {
            inner: AtomicU8::new(T::DEFAULT.store()),
            _marker: PhantomData,
        }
    }

    pub(super) fn store(&self, value: T) {
        self.inner.store(value.into_u8(), Ordering::Relaxed);
    }

    pub(super) fn load(&self) -> T {
        let inner = self.inner.load(Ordering::Relaxed);

        T::from_u8(inner)
    }
}
