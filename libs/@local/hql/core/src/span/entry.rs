use orx_concurrent_vec::ConcurrentElement;

/// A read-only entry into a concurrent element.
pub struct Entry<'a, S>(&'a ConcurrentElement<S>);

impl<'a, S> Entry<'a, S> {
    pub(crate) const fn new(element: &'a ConcurrentElement<S>) -> Self {
        Entry(element)
    }

    #[must_use]
    pub fn cloned(&self) -> S
    where
        S: Clone,
    {
        self.0.cloned()
    }

    #[must_use]
    pub fn copied(&self) -> S
    where
        S: Copy,
    {
        self.0.copied()
    }

    pub fn map<T>(&self, func: impl FnOnce(&S) -> T) -> T {
        self.0.map(func)
    }
}
