use std::collections::HashMap;

use crate::{
    data::{SpanData, SpanTree},
    file::FileId,
    Span,
};

/// A collection of spans within a single source file.
///
/// This struct is used to store information about multiple spans within a single source file.
pub struct SpanStorage<E> {
    file: FileId,
    items: HashMap<Span, SpanData<E>>,
}

impl<E> SpanStorage<E> {
    #[must_use]
    pub fn new(file: FileId) -> Self {
        Self {
            file,
            items: HashMap::new(),
        }
    }

    #[must_use]
    pub const fn file(&self) -> FileId {
        self.file
    }

    pub fn insert(&mut self, span: SpanData<E>) {
        self.items.insert(span.span, span);
    }

    #[must_use]
    pub fn get(&self, span: Span) -> Option<&SpanData<E>> {
        self.items.get(&span)
    }

    pub fn resolve(&self, span: Span) -> Option<SpanTree<E>>
    where
        E: Clone,
    {
        let current = self.get(span)?.clone();
        let parent = current.parent.and_then(|parent| self.resolve(parent));

        Some(SpanTree {
            file: self.file,
            span: current.span,
            parent: parent.map(Box::new),
            extra: current.extra,
        })
    }

    pub fn get_mut(&mut self, span: Span) -> Option<&mut SpanData<E>> {
        self.items.get_mut(&span)
    }
}
