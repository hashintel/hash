use hashql_core::id::{
    Id, IdVec,
    bit_vec::{MixedBitSet, SparseBitMatrix},
};

use crate::{
    context::HirContext,
    node::{
        r#let::{Binding, VarId},
        variable::LocalVariable,
    },
    visit::{self, Visitor},
};

struct SparseGraph<I> {
    nodes: IdVec<I, usize>,
    edges: Vec<I>,
}

impl<I> SparseGraph<I>
where
    I: Id,
{
    pub fn from_edges(domain_size: usize, mut pairs: Vec<(I, I)>) -> Self
    where
        I: Ord,
    {
        let mut nodes = IdVec::with_capacity(domain_size);
        let mut edges = Vec::with_capacity(pairs.len());

        pairs.sort_unstable();

        // forward edges (currently only ones supported)
        for (index, &mut (from, to)) in pairs.iter_mut().enumerate() {
            while from >= nodes.bound() {
                nodes.push(index);
            }

            edges.push(to);
        }

        while nodes.len() <= domain_size {
            nodes.push(edges.len());
        }

        Self { nodes, edges }
    }

    pub fn successors(&self, node: I) -> &[I] {
        &self.edges[self.nodes[node]..self.nodes[node.plus(1)]]
    }
}

pub struct VariableDataFlow {
    matrix: MixedBitSet<VarId>,
    current_binding: Option<VarId>,
}

impl VariableDataFlow {
    #[must_use]
    pub fn new(context: &HirContext) -> Self {
        let matrix = SparseBitMatrix::new(context.counter.var.size());

        Self {
            matrix,
            current_binding: None,
        }
    }

    #[must_use]
    pub fn finish(self) -> SparseBitMatrix<VarId, VarId> {
        self.matrix
    }
}

impl<'heap> Visitor<'heap> for VariableDataFlow {
    fn visit_binding(&mut self, binding: &'heap Binding<'heap>) {
        let previous = self.current_binding.replace(binding.binder.id);

        visit::walk_binding(self, binding);

        self.current_binding = previous;
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        // The call happens outside of a binding
        let Some(current_binding) = self.current_binding else {
            return;
        };

        // This means that we're in a binding, we need to record a dependency that the `binding`
        // depends on the `variable`.
        self.matrix.insert(current_binding, variable.id.value);
    }
}
