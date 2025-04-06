pub mod error;

use foldhash::fast::{FoldHasher, RandomState};
use hashbrown::{HashMap, HashSet};
use hashql_core::{
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

use crate::{
    heap::Heap,
    node::{
        id::NodeId,
        path::{Path, PathSegment},
    },
};

macro ident($value:ident) {
    Ident {
        span: SpanId::SYNTHETIC,
        name: Symbol::new(stringify!($value)),
        kind: IdentKind::Lexical,
    }
}

/// Resolve name aliases and turn them into their absolute counter paths.
pub struct ResolveNames<'heap> {
    mapping: HashMap<Ident, Path<'heap>, RandomState>,
    heap: &'heap Heap,
}

impl<'heap> ResolveNames<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            mapping: HashMap::with_hasher(RandomState::default()),
            heap,
        }
    }

    pub fn prefill(&mut self) {
        // pre-fill with well-known aliases, this is a polyfill for which in the future the prelude
        // will be able to provide a more comprehensive solution.

        self.mapping.insert(
            ident!(let),
            Path {
                id: NodeId::PLACEHOLDER,
                span: SpanId::SYNTHETIC,
                rooted: true,
                segments: {
                    let vec = Vec::new_in(self.heap);

                    vec
                },
            },
        )
    }
}
