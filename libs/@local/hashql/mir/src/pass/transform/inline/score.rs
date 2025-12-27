use core::alloc::Allocator;

use super::cost::{BodyProperties, Inline, LoopVec};
use crate::{
    body::location::Location,
    def::DefIdSlice,
    pass::analysis::{CallGraph, CallSite},
};

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ScoreConfig {
    pub always_inline: f32,
    pub max: f32,
    pub max_loop_multiplier: f32,

    pub loop_bonus: f32,
    pub leaf_bonus: f32,
    pub single_caller_bonus: f32,
    pub unique_callsite_bonus: f32,
    pub size_penalty_factor: f32,
}

impl ScoreConfig {
    pub const DEFAULT: Self = Self {
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

pub(crate) struct CallScorer<'ctx, 'heap, A: Allocator> {
    pub config: ScoreConfig,
    pub graph: &'ctx CallGraph<'heap, A>,
    pub loops: &'ctx LoopVec<A>,
    pub properties: &'ctx DefIdSlice<BodyProperties>,
}

impl<A: Allocator> CallScorer<'_, '_, A> {
    #[expect(clippy::float_arithmetic)]
    pub(crate) fn score(
        &self,
        CallSite {
            caller,
            kind: location,
            target,
        }: CallSite<Location>,
    ) -> f32 {
        // +inf = always inline, -inf = never inline.
        match self.properties[target].inline {
            Inline::Always => return f32::INFINITY,
            Inline::Depends => {}
            Inline::Never => return f32::NEG_INFINITY,
        }

        let target_cost = self.properties[target].cost;

        if target_cost < self.config.always_inline {
            return f32::INFINITY;
        }

        let call_in_loop = self
            .loops
            .lookup(caller)
            .is_some_and(|set| set.contains(location.block));

        let max_multiplier = if call_in_loop {
            self.config.max_loop_multiplier
        } else {
            1.0
        };

        let max_cost = self.config.max * max_multiplier;
        if target_cost > max_cost {
            return f32::NEG_INFINITY;
        }

        let mut score = 0.0;
        if call_in_loop {
            score += self.config.loop_bonus;
        }
        if self.properties[target].is_leaf {
            score += self.config.leaf_bonus;
        }
        if self.graph.is_single_caller(caller, target) {
            score += self.config.single_caller_bonus;
        }
        if self.graph.unique_caller(target) == Some(caller) {
            score += self.config.unique_callsite_bonus;
        }

        score -= target_cost * self.config.size_penalty_factor;

        score
    }
}
