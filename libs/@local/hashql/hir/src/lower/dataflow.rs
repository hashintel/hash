//! Dataflow analysis utilities for HIR optimization passes.
//!
//! Dataflow analysis examines how data moves through program expressions,
//! tracking dependencies and usage patterns to enable safe program transformations.

use hashql_core::id::bit_vec::MixedBitSet;

use crate::{
    context::HirContext,
    node::{
        closure::ClosureParam,
        r#let::{Binding, VarId},
        variable::LocalVariable,
    },
    visit::{self, Visitor},
};

/// Tracks variable dependencies during HIR expression analysis.
///
/// This visitor accumulates all local variables that an expression depends on,
/// useful for optimization passes that need to understand variable usage patterns.
#[derive(Debug)]
pub struct VariableDependencies {
    /// Set of variable IDs that the analyzed expression depends on.
    set: MixedBitSet<VarId>,
}

impl VariableDependencies {
    /// Creates a new dependency analyzer for the given HIR context.
    #[must_use]
    pub fn new(context: &HirContext) -> Self {
        let set = MixedBitSet::new_empty(context.counter.var.size());

        Self { set }
    }

    /// Creates a dependency analyzer from an existing variable set.
    ///
    /// Useful when reusing bitsets from memory pools or starting with
    /// a pre-existing set of known dependencies.
    #[must_use]
    pub const fn from_set(set: MixedBitSet<VarId>) -> Self {
        Self { set }
    }

    /// Extracts the final dependency set from the analyzer.
    ///
    /// Returns the accumulated variable dependencies for further analysis.
    ///
    /// # Performance Note
    ///
    /// The returned bitset should typically be returned to a memory pool
    /// to avoid repeated allocations.
    #[must_use]
    pub fn finish(self) -> MixedBitSet<VarId> {
        self.set
    }
}

impl<'heap> Visitor<'heap> for VariableDependencies {
    /// Records a dependency on a local variable.
    ///
    /// Adds the variable's ID to the dependency set after walking any
    /// nested structures like projections.
    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        self.set.insert(variable.id.value);
    }
}

#[derive(Debug)]
pub struct VariableDefinitions {
    set: MixedBitSet<VarId>,
}

impl VariableDefinitions {
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

impl<'heap> Visitor<'heap> for VariableDefinitions {
    fn visit_binding(&mut self, binding: &'heap Binding<'heap>) {
        visit::walk_binding(self, binding);

        self.set.insert(binding.binder.id);
    }

    fn visit_closure_param(&mut self, param: &'heap ClosureParam<'heap>) {
        visit::walk_closure_param(self, param);

        self.set.insert(param.name.id);
    }
}
