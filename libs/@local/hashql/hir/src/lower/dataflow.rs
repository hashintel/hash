use hashql_core::id::bit_vec::MixedBitSet;

use crate::{
    context::HirContext,
    node::{r#let::VarId, variable::LocalVariable},
    visit::{self, Visitor},
};

pub struct VariableDependencies {
    set: MixedBitSet<VarId>,
}

impl VariableDependencies {
    #[must_use]
    pub fn new(context: &HirContext) -> Self {
        let set = MixedBitSet::new_empty(context.counter.var.size());

        Self { set }
    }

    #[must_use]
    pub const fn from_set(set: MixedBitSet<VarId>) -> Self {
        Self { set }
    }

    #[must_use]
    pub fn finish(self) -> MixedBitSet<VarId> {
        self.set
    }
}

impl<'heap> Visitor<'heap> for VariableDependencies {
    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        self.set.insert(variable.id.value);
    }
}
