use core::alloc::Allocator;

use super::cost::{BodyProperties, Inline, LoopVec};
use crate::{
    body::location::Location,
    def::{DefId, DefIdSlice},
    pass::analysis::CallGraph,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct CallSite {
    body: DefId,
    location: Location,
}

#[derive(Debug, Copy, Clone, PartialEq)]
struct ScoreConfig {
    always_inline: f32,
    max: f32,
    max_loop_multiplier: f32,

    loop_bonus: f32,
    leaf_bonus: f32,
    single_caller_bonus: f32,
    unique_callsite_bonus: f32,
    size_penalty_factor: f32,
}

impl ScoreConfig {
    const DEFAULT: Self = Self {
        always_inline: 15.0,
        max: 80.0,
        max_loop_multiplier: 1.5,

        loop_bonus: 80.0,
        leaf_bonus: 40.0,
        single_caller_bonus: 20.0,
        unique_callsite_bonus: 30.0,
        size_penalty_factor: 1.0,
    };
}

struct CallScorer<'ctx, 'heap, A: Allocator> {
    config: ScoreConfig,
    graph: &'ctx CallGraph<'heap, A>,
    loops: &'ctx LoopVec<A>,
    properties: &'ctx DefIdSlice<BodyProperties>,
}

impl<A: Allocator> CallScorer<'_, '_, A> {
    #[expect(clippy::float_arithmetic)]
    fn score(&self, call: CallSite, callee: DefId) -> f32 {
        // A score of +inf means: always inline, do not add to cost, -inf means: never inline,
        // always inlining does not contribute to the hard max calculation.
        match self.properties[callee].inline {
            Inline::Always => return f32::INFINITY,
            Inline::Depends => {}
            Inline::Never => return f32::NEG_INFINITY,
        }

        let callee_cost = self.properties[callee].cost;

        if callee_cost < self.config.always_inline {
            // We always inline these functions "for free"
            return f32::INFINITY;
        }

        let call_in_loop = self
            .loops
            .lookup(call.body)
            .is_some_and(|set| set.contains(call.location.block));

        let max_multiplier = if call_in_loop {
            self.config.max_loop_multiplier
        } else {
            1.0
        };

        let max_cost = self.config.max * max_multiplier;
        if callee_cost > max_cost {
            return f32::NEG_INFINITY;
        }

        let mut score = 0.0;
        if call_in_loop {
            score += self.config.loop_bonus;
        }
        if self.properties[callee].is_leaf {
            score += self.config.leaf_bonus;
        }
        if self.graph.is_single_caller(call.body, callee) {
            score += self.config.single_caller_bonus;
        }
        if self.graph.unique_caller(callee) == Some(call.body) {
            score += self.config.unique_callsite_bonus;
        }

        // "damage" by the size of the callee
        score -= callee_cost * self.config.size_penalty_factor;

        score
    }
}
