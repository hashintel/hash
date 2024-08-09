use alloc::sync::Arc;

use orx_concurrent_vec::ConcurrentVec;

use crate::{tree::SpanNode, Span, SpanId};

/// A collection of spans within a single source.
///
/// The storage is append-only and does not support the removal or modification of spans.
/// Once inserted spans are to be considered immutable and can be referred to via their `SpanId`,
/// which is returned on insertion.
#[derive(Debug)]
pub struct SpanStorage<S> {
    inner: Arc<ConcurrentVec<S>>,
}

impl<S> SpanStorage<S> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(ConcurrentVec::new()),
        }
    }
}

impl<S> SpanStorage<S>
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

    #[must_use]
    pub fn get(&self, span: SpanId) -> Option<&S> {
        let index = span.value() as usize;

        self.inner.get(index)
    }

    fn resolve_inner(&self, span: SpanId, visited: &mut Vec<SpanId>) -> Option<SpanNode<S>>
    where
        S: Clone,
    {
        assert!(!visited.contains(&span), "circular span reference detected");

        visited.push(span);

        let current = self.get(span).cloned()?;

        let parent = current
            .parent_id()
            .and_then(|parent| self.resolve_inner(parent, visited));

        Some(SpanNode {
            value: current,
            parent: parent.map(Box::new),
        })
    }

    /// Resolves a span into a full span tree.
    ///
    /// This has a time complexity of O(n), where n is the depth of the span tree.
    /// Tolerable, as `SpanNode`s are expected to only be used on report generation, and are
    /// supposed to be shallow in depth.
    ///
    /// # Panics
    ///
    /// Panics if a circular span reference is detected.
    #[must_use]
    pub fn resolve(&self, span: SpanId) -> Option<SpanNode<S>>
    where
        S: Clone,
    {
        let mut visited = Vec::new();
        self.resolve_inner(span, &mut visited)
    }
}

impl<S> Clone for SpanStorage<S> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl<S> Default for SpanStorage<S> {
    fn default() -> Self {
        Self::new()
    }
}
