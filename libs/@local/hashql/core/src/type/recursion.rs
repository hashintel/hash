use archery::RcK;
use pretty::RcDoc;

use super::{TypeId, environment::Environment, pretty_print::PrettyPrint};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecursionDepthBoundary {
    pub depth: usize,
    pub limit: usize,
}

impl RecursionDepthBoundary {
    pub(crate) fn pretty<'this>(
        self,
        env: &'this Environment,
        id: TypeId,
    ) -> RcDoc<'this, anstyle::Style> {
        if self.depth >= self.limit {
            RcDoc::text("...")
        } else {
            env.types[id].copied().pretty(env, self.enter())
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
