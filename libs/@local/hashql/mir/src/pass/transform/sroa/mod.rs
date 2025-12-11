use core::{convert::Infallible, mem};

use hashql_core::heap::{Heap, Scratch};

use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::{Local, LocalVec},
        location::Location,
        place::{DefUse, Place, PlaceContext},
    },
    context::MirContext,
    intern::Interner,
    pass::{
        AnalysisPass as _, TransformPass,
        analysis::{DataDependencyAnalysis, DataDependencyGraph},
    },
    visit::{VisitorMut, r#mut::filter},
};

struct PlaceVisitor<'env, 'heap, 'scratch> {
    interner: &'env Interner<'heap>,
    graph: DataDependencyGraph<'heap, &'scratch Scratch>,
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

    fn visit_place(
        &mut self,
        location: Location,
        context: PlaceContext,
        place: &mut Place<'heap>,
    ) -> Self::Result<()> {
        // Only rewrite in the case that this is a `use`
        if context.into_def_use() != Some(DefUse::Use) {
            // If we go into the place this is going to exit as well.
            return Ok(());
        }

        *place = self.graph.resolve(self.interner, *place);
        Ok(())
    }

    fn visit_local(
        &mut self,
        location: Location,
        context: PlaceContext,
        local: &mut Local,
    ) -> Self::Result<()> {
        // only called if not called directly from `place`
        if context.into_def_use() != Some(DefUse::Use) {
            return Ok(());
        }

        let place = Place {
            local: *local,
            projections: self.interner.projections.intern_slice(&[]),
        };
        let place = self.graph.resolve(self.interner, place);
        *local = place.local;

        // TODO: DataConstantGraph resolve

        Ok(())
    }
}

// Scalar Replacement of Aggregate Types (SROA)
pub struct Sroa {
    scratch: Scratch,
}

impl Sroa {
    pub fn new() -> Self {
        Self {
            scratch: Scratch::new(),
        }
    }
}

// TODO: DataConstantGraph
impl<'env, 'heap> TransformPass<'env, 'heap> for Sroa {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        self.scratch.reset();

        let mut analysis = DataDependencyAnalysis::new_in(&self.scratch);
        analysis.run(context, body);
        let analysis = analysis.finish();
        let transient = analysis.transient(context.interner);

        // TODO
    }
}
