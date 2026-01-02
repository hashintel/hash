//! Heuristic scoring for inline candidates.
//!
//! This module implements the scoring function that determines whether a callsite
//! should be inlined. The scoring balances the benefits of inlining (reduced call
//! overhead, optimization opportunities) against the costs (code size increase).
//!
//! # Scoring Algorithm
//!
//! For each callsite, the score is computed as:
//!
//! ```text
//! 1. Check InlineDirective:
//!    - Always → +∞ (unconditional inline)
//!    - Never  → -∞ (never inline)
//!
//! 2. Check always_inline threshold:
//!    - If cost < always_inline → +∞
//!
//! 3. Check max threshold:
//!    - max_cost = max × (max_loop_multiplier if in_loop else 1.0)
//!    - If cost > max_cost → -∞
//!
//! 4. Compute score:
//!    score = loop_bonus + leaf_bonus + single_caller_bonus + unique_callsite_bonus
//!          - cost × size_penalty_factor
//! ```
//!
//! # Score Interpretation
//!
//! - `+∞`: Always inline, bypasses budget.
//! - `> 0`: Candidate for inlining, consumes budget.
//! - `≤ 0`: Not inlined.
//! - `-∞`: Never inline.

use core::alloc::Allocator;

use super::analysis::{BasicBlockLoopVec, BodyProperties, InlineDirective};
use crate::{
    body::location::Location,
    def::DefIdSlice,
    pass::analysis::{CallGraph, CallSite},
};

/// Configuration for inline heuristics.
///
/// Controls thresholds, bonuses, and penalties that determine which callsites
/// are selected for inlining.
///
/// # Thresholds
///
/// - [`always_inline`](Self::always_inline): Functions below this cost always inline.
/// - [`max`](Self::max): Functions above this cost never inline (via heuristics).
/// - [`max_loop_multiplier`](Self::max_loop_multiplier): Raises the max threshold for callsites
///   inside loops.
///
/// # Bonuses
///
/// Bonuses are added to the score for beneficial callsite properties:
/// - [`loop_bonus`](Self::loop_bonus): Callsite is inside a loop (hot code).
/// - [`leaf_bonus`](Self::leaf_bonus): Target has no outgoing calls.
/// - [`single_caller_bonus`](Self::single_caller_bonus): Only one caller calls this target.
/// - [`unique_callsite_bonus`](Self::unique_callsite_bonus): Exactly one callsite to target.
///
/// # Penalty
///
/// - [`size_penalty_factor`](Self::size_penalty_factor): Multiplier for cost when subtracting from
///   score. Values > 1.0 bias against larger functions.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct InlineHeuristicsConfig {
    /// Cost threshold below which functions are always inlined.
    ///
    /// Functions with `cost < always_inline` get score `+∞` and bypass the budget
    /// entirely. This ensures trivial helpers are always inlined regardless of
    /// call frequency.
    ///
    /// Default: `10.0` (~1-2 blocks with a few operations).
    pub always_inline: f32,

    /// Maximum cost for a function to be considered for inlining.
    ///
    /// Functions with `cost > max` (or `max × max_loop_multiplier` in loops) get
    /// score `-∞` and are never inlined via heuristics.
    ///
    /// Also used as the base for computing per-caller budget:
    /// `budget = max × budget_multiplier`.
    ///
    /// Default: `60.0` (~6-8 moderate blocks).
    pub max: f32,

    /// Multiplier for `max` when the callsite is inside a loop.
    ///
    /// Allows slightly larger functions to be inlined in hot paths.
    /// Effective max in loops = `max × max_loop_multiplier`.
    ///
    /// Default: `1.5` (raises ceiling from 60 to 90 in loops).
    pub max_loop_multiplier: f32,

    /// Bonus for callsites inside loops.
    ///
    /// Loop bodies execute many times, so inlining amortizes call overhead
    /// and enables loop-specific optimizations.
    ///
    /// Default: `20.0`.
    pub loop_bonus: f32,

    /// Bonus for leaf functions (no outgoing calls except intrinsics).
    ///
    /// Leaf functions are simpler and won't trigger further inlining cascades,
    /// making them safer to inline.
    ///
    /// Default: `10.0`.
    pub leaf_bonus: f32,

    /// Bonus when this caller is the only function that calls the target.
    ///
    /// Single-caller functions are good candidates because the code exists
    /// only for this caller anyway.
    ///
    /// Default: `5.0`.
    pub single_caller_bonus: f32,

    /// Bonus when there is exactly one callsite to the target in the entire program.
    ///
    /// This implies both single caller and single callsite, meaning inlining
    /// causes zero code duplication.
    ///
    /// Default: `12.0`.
    pub unique_callsite_bonus: f32,

    /// Multiplier for target cost when computing the size penalty.
    ///
    /// The penalty subtracted from the score is `cost × size_penalty_factor`.
    /// Values > 1.0 bias against larger functions, requiring more bonuses to
    /// achieve a positive score.
    ///
    /// Default: `1.1` (mild bias against size).
    pub size_penalty_factor: f32,
}

impl Default for InlineHeuristicsConfig {
    fn default() -> Self {
        Self {
            always_inline: 10.0,
            max: 60.0,
            max_loop_multiplier: 1.5,

            loop_bonus: 20.0,
            leaf_bonus: 10.0,
            single_caller_bonus: 5.0,
            unique_callsite_bonus: 12.0,
            size_penalty_factor: 1.1,
        }
    }
}

/// Scores callsites to determine inlining desirability.
///
/// Uses [`InlineHeuristicsConfig`] along with call graph and body properties
/// to compute a score for each callsite.
pub(crate) struct InlineHeuristics<'ctx, 'heap, A: Allocator> {
    pub config: InlineHeuristicsConfig,
    pub graph: &'ctx CallGraph<'heap, A>,
    pub loops: &'ctx BasicBlockLoopVec<A>,
    pub properties: &'ctx DefIdSlice<BodyProperties>,
}

impl<A: Allocator> InlineHeuristics<'_, '_, A> {
    /// Compute the inlining score for a callsite.
    ///
    /// Returns:
    /// - `+∞` for unconditional inlining (directive or below `always_inline`).
    /// - `-∞` for functions that should never be inlined.
    /// - A finite score otherwise, where positive means "candidate for inlining".
    #[expect(clippy::float_arithmetic)]
    pub(crate) fn score(
        &self,
        CallSite {
            caller,
            kind: location,
            target,
        }: CallSite<Location>,
    ) -> f32 {
        // Check directive first: Always/Never override all heuristics.
        match self.properties[target].directive {
            InlineDirective::Always => return f32::INFINITY,
            InlineDirective::Heuristic => {}
            InlineDirective::Never => return f32::NEG_INFINITY,
        }

        let target_cost = self.properties[target].cost;

        // Trivially small functions bypass scoring and budget.
        if target_cost < self.config.always_inline {
            return f32::INFINITY;
        }

        let call_in_loop = self
            .loops
            .lookup(caller)
            .is_some_and(|set| set.contains(location.block));

        // Loops get a higher max threshold to allow larger functions.
        let max_multiplier = if call_in_loop {
            self.config.max_loop_multiplier
        } else {
            1.0
        };

        let max_cost = self.config.max * max_multiplier;
        if target_cost > max_cost {
            return f32::NEG_INFINITY;
        }

        // Accumulate bonuses for beneficial properties.
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

        // Subtract size penalty: larger functions need more bonuses to be profitable.
        score -= target_cost * self.config.size_penalty_factor;

        score
    }
}
