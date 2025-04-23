use hashbrown::HashSet;
use pretty::RcDoc;

use super::{TypeId, environment::Environment, pretty_print::PrettyPrint as _};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RecursionDepthBoundary {
    pub depth: usize,
    pub limit: usize,
}

impl RecursionDepthBoundary {
    pub fn pretty<'this>(
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
    inner: HashSet<(TypeId, TypeId), foldhash::fast::RandomState>,
}

impl RecursionBoundary {
    pub(crate) fn new() -> Self {
        Self {
            inner: HashSet::default(),
        }
    }

    pub(crate) fn enter(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        // insert returns true if the element was not already in the set
        self.inner.insert((lhs, rhs))
    }

    pub(crate) fn exit(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.inner.remove(&(lhs, rhs))
    }
}
