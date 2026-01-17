//! Forward substitution transformation pass.
//!
//! This pass resolves place operands to their ultimate sources by leveraging data dependency
//! analysis. It effectively "looks through" assignments, projections, and block parameters to
//! substitute places with either:
//!
//! - **Constants**: When the place can be traced back to a constant value
//! - **Simplified places**: When the place can be traced to a simpler location
//!
//! This is a more comprehensive form of value propagation than [`CopyPropagation`], as it handles
//! projections, chained access paths, and closure environments through full data dependency
//! analysis.
//!
//! # Algorithm
//!
//! The pass operates by:
//!
//! 1. Running [`DataDependencyAnalysis`] to build a graph of data flow relationships
//! 2. Walking all operands in the MIR body
//! 3. For each place operand, resolving it through the dependency graph to find its source
//! 4. Substituting the operand with the resolved value (constant or simplified place)
//!
//! The resolution handles several cases:
//!
//! - **Direct assignments**: `_2 = _1; use(_2)` → `use(_1)`
//! - **Tuple projections**: `_2 = (_1, _3); use(_2.0)` → `use(_1)`
//! - **Chained projections**: `_3 = ((_1, _2),); use(_3.0.1)` → `use(_2)`
//! - **Block parameters**: When all predecessors pass the same constant, resolves to that constant
//! - **Closure environments**: Resolves captured variables through environment projections
//!
//! # Example
//!
//! Before:
//! ```text
//! bb0:
//!     _1 = const 42
//!     _2 = (_1,)
//!     _3 = _2.0
//!     return _3
//! ```
//!
//! After:
//! ```text
//! bb0:
//!     _1 = const 42
//!     _2 = (const 42,)
//!     _3 = const 42
//!     return const 42
//! ```
//!
//! # Interaction with Other Passes
//!
//! Forward substitution runs after [`CfgSimplify`] in the optimization pipeline, which ensures
//! that unreachable code paths have been eliminated before resolution. This allows the pass to
//! make more precise determinations about constant values at join points.
//!
//! When combined with dead store elimination (DSE), forward substitution enables SROA-like
//! decomposition of aggregates: uses are substituted with their original values, and DSE
//! then removes the now-dead aggregate constructions.
//!
//! When block parameters receive the same constant from all predecessors, forward substitution
//! resolves uses of that parameter to the constant. When predecessors diverge (provide different
//! constants), the place is preserved unchanged.
//!
//! [`CopyPropagation`]: super::CopyPropagation
//! [`DataDependencyAnalysis`]: crate::pass::analysis::DataDependencyAnalysis
//! [`CfgSimplify`]: super::CfgSimplify

use alloc::alloc::Global;
use core::{alloc::Allocator, convert::Infallible};

use crate::{
    body::{Body, location::Location, operand::Operand},
    context::MirContext,
    intern::Interner,
    pass::{
        AnalysisPass as _, Changed, TransformPass,
        analysis::{DataDependencyAnalysis, TransientDataDependencyGraph},
    },
    visit::{VisitorMut, r#mut::filter},
};

/// Visitor that resolves place operands to their ultimate sources.
struct PlaceVisitor<'env, 'heap, A: Allocator> {
    interner: &'env Interner<'heap>,
    graph: TransientDataDependencyGraph<'heap, A>,
    changed: bool,
}

impl<'heap, A: Allocator + Clone> VisitorMut<'heap> for PlaceVisitor<'_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_operand(&mut self, _: Location, operand: &mut Operand<'heap>) -> Self::Result<()> {
        // We do not walk the operand, as we're only interested in operands themselves, with cannot
        // be nested.
        if let Operand::Place(place) = operand {
            let next = self.graph.resolve(self.interner, place.as_ref());
            self.changed |= next != *operand;

            *operand = next;
        }

        Ok(())
    }
}

/// Forward substitution transformation pass.
///
/// Resolves place operands to their ultimate sources by tracing data dependencies through
/// projections, assignments, and block parameters. This enables downstream passes to work with
/// simplified operands and, when combined with dead store elimination, achieves SROA-like
/// decomposition of aggregates.
pub struct ForwardSubstitution<A: Allocator = Global> {
    alloc: A,
}

impl ForwardSubstitution {
    #[must_use]
    pub const fn new() -> Self {
        Self { alloc: Global }
    }
}

impl<A: Allocator> ForwardSubstitution<A> {
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }
}

impl<'env, 'heap, A: Allocator> TransformPass<'env, 'heap> for ForwardSubstitution<A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        let mut analysis = DataDependencyAnalysis::new_in(&self.alloc);
        analysis.run(context, body);
        let analysis = analysis.finish();
        let transient = analysis.transient(context.interner);

        let mut visitor = PlaceVisitor {
            interner: context.interner,
            graph: transient,
            changed: false,
        };
        Ok(()) = visitor.visit_body_preserving_cfg(body);
        drop(analysis);

        visitor.changed.into()
    }
}

impl Default for ForwardSubstitution {
    fn default() -> Self {
        Self::new()
    }
}
