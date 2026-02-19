use core::{
    fmt::{self, Debug},
    mem::ManuallyDrop,
    ops::{Deref, DerefMut},
};

/// Wrap a value and run a closure when dropped.
///
/// This is useful for quickly creating destructors inline.
///
/// # Examples
///
/// ```rust
/// # #![allow(unused)]
/// #![feature(drop_guard)]
///
/// use std::mem::DropGuard;
///
/// {
///     // Create a new guard around a string that will
///     // print its value when dropped.
///     let s = String::from("Chashu likes tuna");
///     let mut s = DropGuard::new(s, |s| println!("{s}"));
///
///     // Modify the string contained in the guard.
///     s.push_str("!!!");
///
///     // The guard will be dropped here, printing:
///     // "Chashu likes tuna!!!"
/// }
/// ```
pub(crate) struct DropGuard<T, F>
where
    F: FnOnce(T),
{
    inner: ManuallyDrop<T>,
    func: ManuallyDrop<F>,
}

impl<T, F> DropGuard<T, F>
where
    F: FnOnce(T),
{
    /// Create a new instance of `DropGuard`.
    #[must_use]
    pub(crate) const fn new(inner: T, func: F) -> Self {
        Self {
            inner: ManuallyDrop::new(inner),
            func: ManuallyDrop::new(func),
        }
    }

    /// Consumes the `DropGuard`, returning the wrapped value.
    ///
    /// This will not execute the closure. It is typically preferred to call
    /// this function instead of `mem::forget` because it will return the stored
    /// value and drop variables captured by the closure instead of leaking their
    /// owned resources.
    #[inline]
    pub(crate) fn dismiss(guard: Self) -> T {
        // First we ensure that dropping the guard will not trigger
        // its destructor
        let mut guard = ManuallyDrop::new(guard);

        // Next we manually read the stored value from the guard.
        //
        // SAFETY: this is safe because we've taken ownership of the guard.
        let value = unsafe { ManuallyDrop::take(&mut guard.inner) };

        // Finally we drop the stored closure. We do this *after* having read
        // the value, so that even if the closure's `drop` function panics,
        // unwinding still tries to drop the value.
        //
        // SAFETY: this is safe because we've taken ownership of the guard.
        unsafe {
            ManuallyDrop::drop(&mut guard.func);
        }
        value
    }
}

impl<T, F> Deref for DropGuard<T, F>
where
    F: FnOnce(T),
{
    type Target = T;

    fn deref(&self) -> &T {
        &self.inner
    }
}

impl<T, F> DerefMut for DropGuard<T, F>
where
    F: FnOnce(T),
{
    fn deref_mut(&mut self) -> &mut T {
        &mut self.inner
    }
}

impl<T, F> Drop for DropGuard<T, F>
where
    F: FnOnce(T),
{
    fn drop(&mut self) {
        // SAFETY: `DropGuard` is in the process of being dropped.
        let inner = unsafe { ManuallyDrop::take(&mut self.inner) };

        // SAFETY: `DropGuard` is in the process of being dropped.
        let func = unsafe { ManuallyDrop::take(&mut self.func) };

        func(inner);
    }
}

impl<T, F> Debug for DropGuard<T, F>
where
    T: Debug,
    F: FnOnce(T),
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&**self, f)
    }
}
