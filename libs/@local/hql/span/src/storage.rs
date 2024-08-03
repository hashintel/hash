use crate::{tree::SpanTree, Span, SpanId};

/// A collection of spans within a single source file.
///
/// This struct is used to store information about multiple spans within a single source file.
pub struct SpanStorage<E> {
    arena: Vec<Span<E>>,
}

impl<E> SpanStorage<E> {
    #[must_use]
    pub const fn new() -> Self {
        Self { arena: Vec::new() }
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "The arena is not expected to be large"
    )]
    fn next_id(&self) -> SpanId {
        SpanId::new(self.arena.len() as u32)
    }

    pub fn insert(&mut self, span: Span<E>) -> SpanId {
        let id = self.next_id();
        self.arena.push(span);

        id
    }

    #[must_use]
    pub fn get(&self, span: SpanId) -> Option<&Span<E>> {
        let index = span.value() as usize;

        self.arena.get(index)
    }

    pub fn resolve(&self, span: SpanId) -> Option<SpanTree<E>>
    where
        E: Clone,
    {
        let current = self.get(span).cloned()?;

        let parent = current.parent.and_then(|parent| self.resolve(parent));

        Some(SpanTree {
            file: current.file,
            range: current.range,
            parent: parent.map(Box::new),
            extra: current.extra,
        })
    }

    pub fn get_mut(&mut self, span: SpanId) -> Option<&mut Span<E>> {
        let index = span.value() as usize;

        self.arena.get_mut(index)
    }
}

impl<E> Default for SpanStorage<E> {
    fn default() -> Self {
        Self::new()
    }
}
