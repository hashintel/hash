#![expect(clippy::float_arithmetic)]
use alloc::collections::BinaryHeap;
use core::{alloc::Allocator, cmp};

use hashql_core::{
    graph::algorithms::{
        Tarjan,
        tarjan::{SccId, StronglyConnectedComponents},
    },
    heap::BumpAllocator,
};

use self::{
    cost::{CostEstimationAnalysis, CostEstimationConfig, CostEstimationResidual},
    score::{CallScorer, ScoreConfig},
};
use crate::{
    body::{Body, location::Location},
    def::{DefId, DefIdSlice},
    pass::analysis::{CallGraph, CallSite},
};

mod cost;
mod score;

struct Candidate {
    score: f32,
    callsite: CallSite<Location>,
}

impl PartialEq for Candidate {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == cmp::Ordering::Equal
    }
}

impl Eq for Candidate {}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { score, callsite: _ } = self;

        score.total_cmp(&other.score).reverse()
    }
}

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
    fn global_analysis<'heap>(
        &self,
        bodies: &DefIdSlice<Body<'heap>>,
    ) -> (
        CallGraph<'heap, A>,
        CostEstimationResidual<A>,
        StronglyConnectedComponents<DefId, SccId, (), A>,
    )
    where
        A: Clone,
    {
        let callgraph = CallGraph::analyze_in(bodies, self.alloc.clone());
        let mut analysis = CostEstimationAnalysis::new(
            &callgraph,
            bodies,
            self.config.cost,
            self.alloc.clone(),
            self.alloc.clone(),
        );

        for body in bodies {
            analysis.analyze(body);
        }

        let costs = analysis.finish();

        let tarjan = Tarjan::new_in(&callgraph, self.alloc.clone());
        let sccs: StronglyConnectedComponents<DefId, SccId, (), A> = tarjan.run();

        (callgraph, costs, sccs)
    }

    fn inlinable_callsites(
        &self,
        graph: &CallGraph<'_, A>,
        costs: &CostEstimationResidual<A>,
        sccs: &StronglyConnectedComponents<DefId, SccId, (), A>,

        body: DefId,
    ) -> Vec<CallSite<Location>, A>
    where
        A: Clone,
    {
        let component = sccs.scc(body);
        let scorer = CallScorer::new(self.config.score, graph, costs);

        let mut to_be_inlined = Vec::new_in(self.alloc.clone());
        let mut candidates = BinaryHeap::new_in(self.alloc.clone());

        for callsite in graph.apply_callsites(body) {
            if sccs.scc(callsite.target) == component {
                // We cannot inline calls to the same SCC, aka functions that are inside of a
                // recursive chain.
                continue;
            }

            let score = scorer.score(callsite);
            if score.is_sign_negative() {
                // The cost is negative, which means that the call site is not a candidate for
                // inlining.
                continue;
            }

            if score.is_infinite() {
                // The cost infinite, which means that the call site is *always* inlined, without
                // contributing to the overall cost of the caller.
                to_be_inlined.push(callsite);
                continue;
            }

            candidates.push(Candidate { score, callsite });
        }

        let mut remaining_budget = self.config.score.max * self.config.budget_multiplier;
        let chosen_candidates = candidates
            .into_iter_sorted()
            .take_while(|Candidate { score: _, callsite }| {
                let target_cost = costs.properties[callsite.target].cost;
                if remaining_budget - target_cost >= 0.0 {
                    remaining_budget -= target_cost;
                    return true;
                }

                false
            })
            .map(|Candidate { score: _, callsite }| callsite);
        to_be_inlined.extend(chosen_candidates);

        // sort the candidates by location (in reverse order), the reason we do this is so that
        // inlining doesn't disturb the location of subsequent candidates
        to_be_inlined.sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());

        to_be_inlined
    }

    fn inline<'heap>(
        &self,
        graph: &CallGraph<'_, A>,
        costs: &CostEstimationResidual<A>,
        sccs: &StronglyConnectedComponents<DefId, SccId, (), A>,

        bodies: &mut DefIdSlice<Body<'heap>>,
        body: DefId,
    ) where
        A: Clone,
    {
        // TODO: global overarching scratch space for BinaryHeap and Vec (sadly needs to be done
        // because we don't have checkpointing yet)
        let mut targets = self.inlinable_callsites(graph, costs, sccs, body);

        // targets already come pre-ordered, so we can just iterate over them
        for CallSite {
            caller,
            kind,
            target,
        } in targets
        {
            todo!()
        }
    }
}
