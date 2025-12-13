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
        // We don't traverse by default, as any traversal wouldn't help much.
        if let Operand::Place(place) = operand {
            *operand = self.graph.resolve(self.interner, place.as_ref());
        }

        Ok(())
    }
}

// Scalar Replacement of Aggregate Types (SROA)
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
