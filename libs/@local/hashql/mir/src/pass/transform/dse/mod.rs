use std::alloc::{Allocator, Global};

use hashql_core::{
    collections::WorkQueue,
    heap::Scratch,
    id::{
        IdSlice, IdVec,
        bit_vec::{DenseBitSet, MixedBitSet, SparseBitMatrix},
    },
};

use crate::{
    body::{
        Body,
        local::{Local, LocalSlice, LocalVec},
        location::Location,
        place::{DefUse, PlaceContext},
    },
    context::MirContext,
    pass::{AnalysisPass as _, TransformPass, analysis::DataDependencyAnalysis},
    visit::Visitor,
};

#[cfg(test)]
mod tests;

/// A matrix representing reverse dependency relationships between locals.
///
/// This matrix stores the relation `R(x, y)` where `y ∈ row[x]` means "x is used by y".
/// Given a dependency graph where `A depends on B` (A uses the value of B), this matrix
/// stores the reverse: `B is used by A`.
///
/// After computing the transitive closure, `row[x]` contains all locals that transitively
/// depend on `x`, which is useful for dead store elimination to determine cascading effects
/// when a value becomes unused.
struct ReverseDependencyMatrix<A: Allocator = Global> {
    length: usize,
    matrix: SparseBitMatrix<Local, Local, A>,
}

impl<A: Allocator> ReverseDependencyMatrix<A> {
    const fn new_in(domain: &LocalSlice<impl Sized>, alloc: A) -> Self {
        Self {
            length: domain.len(),
            matrix: SparseBitMatrix::new_in(domain.len(), alloc),
        }
    }

    /// Inserts an edge indicating that `dependency` is used by `local`.
    ///
    /// After this call, `local` will appear in `row[dependency]`.
    fn insert(&mut self, dependency: Local, local: Local) {
        self.matrix.insert(dependency, local);
    }

    /// Computes the transitive closure of the "used by" relation in-place.
    ///
    /// Uses a fixed-point iteration algorithm: repeatedly applies the closure rule
    /// "if R(x, y) and R(y, z) then R(x, z)" until no new edges are added.
    ///
    /// After completion, `row[x]` contains all locals that transitively use `x`,
    /// including through cycles. In a cycle, nodes will have themselves in their row
    /// since they can reach themselves via the cycle.
    ///
    /// # Algorithm properties
    ///
    /// - **Correctness**: The algorithm computes the least fixed point of the closure rule, which
    ///   is exactly the non-reflexive transitive closure (paths of length ≥ 1).
    /// - **Termination**: Guaranteed on finite graphs since `union_rows` is monotone (only adds
    ///   bits) and there are at most n² possible edges.
    /// - **In-place safety**: Each iteration clones the current row before iterating, so mutations
    ///   during iteration don't affect the set of dependents being processed. Reading updated rows
    ///   from earlier in the same pass is safe due to monotonicity and confluence—the final result
    ///   is independent of update order.
    fn transitive_closure(&mut self) {
        let n = self.length;
        let mut changed = true;

        while changed {
            changed = false;
            for local in Local::new(0)..Local::new(n) {
                // Clone the row to get a snapshot of current dependents.
                // This prevents issues from mutating the row while iterating.
                let Some(row) = self.matrix.row(local).cloned() else {
                    continue;
                };

                // For each dependent y of local x: if y is used by z, then x is also used by z.
                // This implements the closure rule: R(x,y) ∧ R(y,z) → R(x,z)
                for dependent in &row {
                    changed |= self
                        .matrix
                        .union_rows(/* read */ dependent, /* write */ local);
                }
            }
        }
    }
}

pub struct DeadStatementElimination {
    scratch: Scratch,
}

impl<'env, 'heap> TransformPass<'env, 'heap> for DeadStatementElimination {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut analysis = DataDependencyAnalysis::new_in(&self.scratch);
        analysis.run(context, body);
        let analysis = analysis.finish();
        let transient = analysis.transient(context.interner);

        // The transient graph only has dependencies edges, what we need is the reverse, we need
        // dependent edges.
        let mut matrix = ReverseDependencyMatrix::new_in(&body.local_decls, &self.scratch);
        for local in body.local_decls.ids() {
            for dependency in transient.depends_on(local) {
                matrix.insert(dependency, local);
            }
        }

        matrix.transitive_closure();

        // Compute any of the local declarations that are not used anywhere
        let mut dead = DenseBitSet::new_empty(body.local_decls.len());

        let mut visitor = FindUseVisitor {
            uses: LocalVec::from_domain_in(0, &body.local_decls, &self.scratch),
        };
        visitor.visit_body(body);

        for local in visitor
            .uses
            .iter_enumerated()
            .filter(|&(_, &uses)| uses == 0)
            .map(|(id, _)| id)
        {
            dead.insert(local);
        }

        // for each row, find rows that only have "dead" dependents, we do this by simply `&` with
        // the negative, if it yields a non-zero value, that means we depend on a value that is
        // used, therefore can't be added.
        let mut changed = true;
        while changed {
            changed = false;
            for row in matrix.matrix.rows() {
                if matrix.matrix.subset_row(row, &dead) == Some(true) {
                    changed = true;
                    dead.insert(row);
                }
            }
        }

        todo!()
    }
}

struct FindUseVisitor<A: Allocator> {
    uses: LocalVec<usize, A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for FindUseVisitor<A> {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        if context.into_def_use() != Some(DefUse::Use) {
            return Ok(());
        }

        self.uses[local] += 1;
        Ok(())
    }
}
