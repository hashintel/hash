use orx_concurrent_vec::ConcurrentVec;

use super::{Span, SpanId, entry::Entry};

/// A collection of spans within a single source.
///
/// The storage is append-only and does not support the removal or modification of spans.
/// Once inserted spans are to be considered immutable and can be referred to via their `SpanId`,
/// which is returned on insertion.
#[derive(Debug)]
pub struct SpanTable<S> {
    inner: ConcurrentVec<S>,
}

impl<S> SpanTable<S> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: ConcurrentVec::new(),
        }
    }
}

impl<S> SpanTable<S>
where
    S: Span,
{
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The arena is not expected to be larger than u32::MAX + debug assertions"
    )]
    pub fn insert(&self, span: S) -> SpanId {
        const MAX_LEN: usize = u32::MAX as usize;

        let index = self.inner.push(span);

        // The `as` here is safe, because if we're at `u32::MAX` elements, the next push would
        // overflow.
        debug_assert!(index <= MAX_LEN, "Arena is full");

        SpanId::new(index as u32)
    }

    pub fn modify(&self, span: SpanId, func: impl FnMut(&mut S)) -> bool {
        let index = span.value() as usize;

        let Some(element) = self.inner.get(index) else {
            return false;
        };

        element.update(func);
        true
    }

    #[must_use]
    pub fn get(&self, span: SpanId) -> Option<Entry<'_, S>> {
        let index = span.value() as usize;

        self.inner.get(index).map(Entry::new)
    }

    #[must_use]
    pub fn get_cloned(&self, span: SpanId) -> Option<S>
    where
        S: Clone,
    {
        let index = span.value() as usize;

        self.inner.get_cloned(index)
    }

    /// Returns a vector of ancestor span IDs for the given span.
    ///
    /// # Panics
    ///
    /// This function will panic if a circular reference is detected in the span hierarchy.
    pub fn ancestors(&self, span: SpanId) -> Vec<SpanId> {
        let mut visited = vec![span];
        let mut ancestors = Vec::new();

        let mut current = self.get(span);

        while let Some(entry) = current.take() {
            let parent_id = entry.map(Span::parent_id);

            if let Some(parent_id) = parent_id {
                assert!(
                    !visited.contains(&parent_id),
                    "circular span reference detected"
                );
                visited.push(parent_id);

                ancestors.push(parent_id);
                current = self.get(parent_id);
            }
        }

        ancestors
    }
}

impl<S> Default for SpanTable<S> {
    fn default() -> Self {
        Self::new()
    }
}
