use core::ops::Index;
use std::collections::HashSet;

use pretty::RcDoc;

use super::{Type, TypeId, pretty_print::PrettyPrint};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecursionLimit {
    pub depth: usize,
    pub limit: usize,
}

impl RecursionLimit {
    pub(crate) fn pretty<'a, T>(
        self,
        node: &'a T,
        arena: &'a impl Index<TypeId, Output = Type>,
    ) -> RcDoc<'a, anstyle::Style>
    where
        T: PrettyPrint,
    {
        if self.depth >= self.limit {
            RcDoc::text("...")
        } else {
            node.pretty(arena, self.enter())
        }
    }

    const fn enter(self) -> Self {
        Self {
            depth: self.depth + 1,
            limit: self.limit,
        }
    }
}

pub(crate) struct RecursionGuard {
    inner: HashSet<(TypeId, TypeId), foldhash::fast::RandomState>,
}

impl RecursionGuard {
    pub(crate) fn new() -> Self {
        Self {
            inner: HashSet::default(),
        }
    }

    pub(crate) fn enter(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.inner.insert((lhs, rhs))
    }

    pub(crate) fn leave(&mut self, lhs: TypeId, rhs: TypeId) {
        self.inner.remove(&(lhs, rhs));
    }

    pub(crate) fn with<T>(
        &mut self,
        lhs: TypeId,
        rhs: TypeId,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> Option<T> {
        self.enter(lhs, rhs).then(|| closure(self))
    }
}
