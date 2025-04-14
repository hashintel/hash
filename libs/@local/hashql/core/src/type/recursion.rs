use core::ops::Index;

use archery::RcK;
use pretty::RcDoc;

use super::{Type, TypeId, pretty_print::PrettyPrint};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecursionDepthBoundary {
    pub depth: usize,
    pub limit: usize,
}

impl RecursionDepthBoundary {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RecursionBoundary {
    inner: rpds::HashTrieSet<(TypeId, TypeId), RcK, foldhash::fast::RandomState>,
}

impl RecursionBoundary {
    pub(crate) fn new() -> Self {
        Self {
            inner: rpds::HashTrieSet::new_with_hasher_with_ptr_kind(
                foldhash::fast::RandomState::default(),
            ),
        }
    }

    pub(crate) fn with<T>(
        &self,
        lhs: TypeId,
        rhs: TypeId,
        closure: impl FnOnce(Self) -> T,
    ) -> Option<T> {
        let contains = self.inner.contains(&(lhs, rhs));

        if contains {
            return None;
        }

        let result = closure(Self {
            inner: self.inner.insert((lhs, rhs)),
        });

        Some(result)
    }

    pub(crate) fn enter(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        if self.inner.contains(&(lhs, rhs)) {
            false
        } else {
            self.inner.insert_mut((lhs, rhs));
            true
        }
    }

    pub(crate) fn exit(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        if self.inner.contains(&(lhs, rhs)) {
            self.inner.remove_mut(&(lhs, rhs));
            true
        } else {
            false
        }
    }
}
