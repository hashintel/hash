use std::alloc::Allocator;

use hashql_core::heap::BumpAllocator;

use self::{
    cost::{CostEstimationAnalysis, CostEstimationConfig, CostEstimationResidual},
    score::ScoreConfig,
};
use crate::{
    body::Body,
    def::{DefId, DefIdSlice},
    pass::analysis::CallGraph,
};

mod cost;
mod score;

#[derive(Debug, Copy, Clone, PartialEq)]
struct InlineConfig {
    pub cost: CostEstimationConfig,
    pub score: ScoreConfig,
    pub budget_multiplier: f32,
}

impl InlineConfig {
    const DEFAULT: Self = Self {
        cost: CostEstimationConfig::DEFAULT,
        score: ScoreConfig::DEFAULT,
        budget_multiplier: 5.0,
    };
}

struct Inliner<A: Allocator, S: BumpAllocator> {
    alloc: A,
    scratch: S,

    config: InlineConfig,
}

impl<A: Allocator, S: BumpAllocator> Inliner<A, S> {
    fn prepare<'heap>(
        &mut self,
        bodies: &DefIdSlice<Body<'heap>>,
    ) -> (CallGraph<'heap, &A>, CostEstimationResidual<&A>) {
        // First we need to create a call graph
        let callgraph = CallGraph::analyze_in(bodies, &self.alloc);

        // First we need to run the cost estimation pass
        let mut analysis = CostEstimationAnalysis::new(
            &callgraph,
            bodies,
            self.config.cost,
            &self.alloc,
            &mut self.scratch,
        );

        for body in bodies {
            analysis.analyze(body);
        }

        let costs = analysis.finish();

        (callgraph, costs)
    }

    fn inline_function<'heap>(
        &self,
        graph: &CallGraph<'heap, &A>,
        costs: &CostEstimationResidual<&A>,

        bodies: &mut DefIdSlice<Body<'heap>>,
        body: DefId,
    ) {
        let budget = self
            .config
            .score
            .max
            .mul_add(self.config.budget_multiplier, costs.properties[body].cost);
        let mut current_cost = costs.properties[body].cost;

        loop {
            // Find all the candidate call sites, that haven't yet been inlined. What's important is
            // that during inlining we split the call graph, which means that we need to also fix up
            // the call graph once inlining is done to represent the new reality.
        }

        todo!()
    }
}
