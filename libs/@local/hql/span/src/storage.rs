use crate::{tree::SpanNode, Span, SpanId};

/// A collection of spans within a single source file.
///
/// This struct is used to store information about multiple spans within a single source file.
pub struct SpanStorage<S> {
    arena: Vec<S>,
}

impl<S> SpanStorage<S> {
    #[must_use]
    pub const fn new() -> Self {
        Self { arena: Vec::new() }
    }
}

impl<S> SpanStorage<S>
where
    S: Span,
{
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The arena is not expected to be larger than u32::MAX"
    )]
    fn next_id(&self) -> SpanId {
        SpanId::new(self.arena.len() as u32)
    }

    pub fn insert(&mut self, span: S) -> SpanId {
        let id = self.next_id();
        self.arena.push(span);

        id
    }

    #[must_use]
    pub fn get(&self, span: SpanId) -> Option<&S> {
        let index = span.value() as usize;

        self.arena.get(index)
    }

    fn resolve_inner(&self, span: SpanId, visited: &mut Vec<SpanId>) -> Option<SpanNode<S>>
    where
        S: Clone,
    {
        assert!(!visited.contains(&span), "circular span reference detected");

        visited.push(span);

        let current = self.get(span).cloned()?;

        let parent = current
            .parent()
            .and_then(|parent| self.resolve_inner(parent, visited));

        Some(SpanNode {
            value: current,
            parent: parent.map(Box::new),
        })
    }

    /// Resolves a span into a full span tree.
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

    pub fn get_mut(&mut self, span: SpanId) -> Option<&mut S> {
        let index = span.value() as usize;

        self.arena.get_mut(index)
    }
}

impl<E> Default for SpanStorage<E> {
    fn default() -> Self {
        Self::new()
    }
}
