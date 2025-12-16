//! Scalar Replacement of Aggregates (SROA) transformation pass.
//!
//! This pass resolves place operands to their ultimate sources by leveraging data dependency
//! analysis. It effectively "looks through" assignments, projections, and block parameters to
//! replace places with either:
//!
//! - **Constants**: When the place can be traced back to a constant value
//! - **Simplified places**: When the place can be traced to a simpler location
//!
//! # Algorithm
//!
//! The pass operates by:
//!
//! 1. Running [`DataDependencyAnalysis`] to build a graph of data flow relationships
//! 2. Walking all operands in the MIR body
//! 3. For each place operand, resolving it through the dependency graph to find its source
//! 4. Replacing the operand with the resolved value (constant or simplified place)
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
//! SROA runs after [`CfgSimplify`] in the optimization pipeline, which ensures that unreachable
//! code paths have been eliminated before resolution. This allows SROA to make more precise
//! determinations about constant values at join points.
//!
//! When block parameters receive the same constant from all predecessors, SROA resolves uses
//! of that parameter to the constant. When predecessors diverge (provide different constants),
//! the place is preserved unchanged.
//!
//! [`DataDependencyAnalysis`]: crate::pass::analysis::DataDependencyAnalysis
//! [`CfgSimplify`]: super::CfgSimplify

use core::convert::Infallible;

use hashql_core::heap::Scratch;

use crate::{
    body::{Body, location::Location, operand::Operand},
    context::MirContext,
    intern::Interner,
    pass::{
        AnalysisPass as _, TransformPass,
        analysis::{DataDependencyAnalysis, TransientDataDependencyGraph},
    },
    visit::{VisitorMut, r#mut::filter},
};

/// Visitor that resolves place operands to their ultimate sources.
struct PlaceVisitor<'env, 'heap, 'scratch> {
    interner: &'env Interner<'heap>,
    graph: TransientDataDependencyGraph<'heap, &'scratch Scratch>,
}

impl<'heap> VisitorMut<'heap> for PlaceVisitor<'_, 'heap, '_> {
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
            *operand = self.graph.resolve(self.interner, place.as_ref());
        }

        Ok(())
    }
}

/// Scalar Replacement of Aggregates transformation pass.
///
/// Resolves place operands to their ultimate sources by tracing data dependencies. This enables
/// downstream passes to work with simplified operands and can expose constant propagation
/// opportunities.
pub struct Sroa {
    scratch: Scratch,
}

impl Sroa {
    #[must_use]
    pub fn new() -> Self {
        Self {
            scratch: Scratch::new(),
        }
    }
}

impl<'env, 'heap> TransformPass<'env, 'heap> for Sroa {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut analysis = DataDependencyAnalysis::new_in(&self.scratch);
        analysis.run(context, body);
        let analysis = analysis.finish();
        let transient = analysis.transient(context.interner);

        Ok(()) = PlaceVisitor {
            interner: context.interner,
            graph: transient,
        }
        .visit_body_preserving_cfg(body);
        drop(analysis);

        self.scratch.reset();
    }
}

impl Default for Sroa {
    fn default() -> Self {
        Self::new()
    }
}
