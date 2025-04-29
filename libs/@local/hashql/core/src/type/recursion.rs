use hashbrown::HashSet;
use pretty::RcDoc;

use super::{TypeId, environment::Environment, pretty_print::PrettyPrint as _};
use crate::collection::FastHashSet;

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
            env.r#type(id).pretty(env, self.enter())
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
    inner: FastHashSet<(TypeId, TypeId)>,

    lhs: FastHashSet<TypeId>,
    rhs: FastHashSet<TypeId>,
}

impl RecursionBoundary {
    pub(crate) fn new() -> Self {
        Self {
            inner: HashSet::default(),
            lhs: HashSet::default(),
            rhs: HashSet::default(),
        }
    }

    pub(crate) fn enter(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        // Insert returns true if the element was not already in the set
        let should_enter = self.inner.insert((lhs, rhs));

        // Only insert if the element was not already in the set, otherwise our coinductive
        // recursion detection will always discharge.
        if !should_enter {
            self.lhs.insert(lhs);
            self.rhs.insert(rhs);
        }

        should_enter
    }

    pub(crate) fn exit(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.lhs.remove(&lhs);
        self.rhs.remove(&rhs);

        self.inner.remove(&(lhs, rhs))
    }
}
