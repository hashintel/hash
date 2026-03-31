//! Loop-breaker selection for recursive SCCs.
//!
//! When functions form a mutually recursive group (SCC), the inliner cannot inline all
//! calls without diverging. This module selects which functions to mark as loop breakers:
//! calls to a breaker within its SCC are skipped, while calls from a breaker to non-breakers
//! are still inlined. This flattens most of the call chain without infinite expansion.
//!
//! The approach follows GHC's loop-breaker strategy (Peyton Jones & Marlow 2002): select
//! which nodes to mark as non-inlineable rather than which edges to cut. All edges targeting
//! a loop breaker become non-inlineable, reducing the problem to feedback vertex set selection
//! on small SCCs.
//!
//! # Algorithm
//!
//! For each non-trivial SCC (size > 1):
//!
//! 1. Score each member by inverse inlining value. Functions that are least valuable to inline make
//!    the best breakers.
//! 2. Pick the highest-scoring member as the loop breaker.
//! 3. Check if the remaining members still form a cycle. If yes, pick another breaker.
//! 4. The remaining non-breaker members form a DAG and are processed in postorder.
//!
//! # Scoring
//!
//! The breaker score combines body cost, caller count, unique callsite status, leaf status,
//! and inline directive into a single scalar. See [`LoopBreakerConfig`] for details.

use core::{alloc::Allocator, iter, ops::ControlFlow};

use hashql_core::{
    graph::{
        DirectedGraph, Successors,
        algorithms::{
            DepthFirstForestPostOrder, TriColorDepthFirstSearch, TriColorVisitor,
            color::NodeColor,
            tarjan::{Members, SccId},
        },
    },
    heap::BumpAllocator,
    id::bit_vec::DenseBitSet,
};

use super::analysis::{BodyProperties, InlineDirective};
use crate::{
    def::{DefId, DefIdSlice},
    pass::analysis::{CallGraph, CallKind},
};

/// Configuration for loop-breaker selection within recursive SCCs.
///
/// Controls the scoring function that determines which SCC members are selected
/// as loop breakers. Higher breaker scores indicate better breaker candidates
/// (less valuable to inline).
///
/// # Scoring Formula
///
/// ```text
/// score = cost_weight * body_cost
///       - caller_penalty * apply_caller_count
///       - unique_callsite_penalty   (if exactly one callsite targets this function)
///       - leaf_penalty              (if function has no outgoing calls)
/// ```
///
/// Functions with [`InlineDirective::Never`] get score `+inf` (perfect breakers).
/// Functions with [`InlineDirective::Always`] get score `-inf` (never selected).
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct InlineLoopBreakerConfig {
    /// Weight applied to body cost.
    ///
    /// Large functions are expensive to duplicate at each call site, making them
    /// good breaker candidates.
    ///
    /// Default: `1.0`.
    pub cost_weight: f32,

    /// Penalty per apply-callsite caller.
    ///
    /// Functions called from many sites provide more inlining opportunities.
    /// Selecting them as breakers loses those opportunities for every caller.
    ///
    /// Default: `5.0`.
    pub caller_penalty: f32,

    /// Penalty for functions with exactly one callsite.
    ///
    /// A unique callsite means inlining causes zero code duplication, making
    /// the function a poor breaker choice.
    ///
    /// Default: `15.0`.
    pub unique_callsite_penalty: f32,

    /// Penalty for leaf functions.
    ///
    /// Leaves have no outgoing calls (except intrinsics) and cannot trigger
    /// further inlining cascades, making them safe and valuable to inline.
    ///
    /// Default: `10.0`.
    pub leaf_penalty: f32,
}

impl Default for InlineLoopBreakerConfig {
    fn default() -> Self {
        Self {
            cost_weight: 1.0,
            caller_penalty: 5.0,
            unique_callsite_penalty: 15.0,
            leaf_penalty: 10.0,
        }
    }
}

struct CallSubgraph<'ctx, 'heap, A: Allocator> {
    inner: &'ctx CallGraph<'heap, A>,
    members: &'ctx [DefId],
    breakers: &'ctx DenseBitSet<DefId>,
}

impl<A: Allocator> DirectedGraph for CallSubgraph<'_, '_, A> {
    type Edge<'this>
        = (DefId, DefId)
    where
        Self: 'this;
    type EdgeId = (DefId, DefId);
    type Node<'this>
        = DefId
    where
        Self: 'this;
    type NodeId = DefId;

    fn node_count(&self) -> usize {
        self.members.len() - self.breakers.count()
    }

    fn edge_count(&self) -> usize {
        self.inner.edge_count()
    }

    #[expect(unreachable_code)]
    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        unimplemented!();
        iter::empty()
    }

    #[expect(unreachable_code)]
    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        unimplemented!();
        iter::empty()
    }
}

impl<A: Allocator> Successors for CallSubgraph<'_, '_, A> {
    type SuccIter<'this>
        = impl Iterator<Item = DefId>
    where
        Self: 'this;

    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.inner
            .successors(node)
            .filter(|&succ| self.members.contains(&succ) && !self.breakers.contains(succ))
    }
}

/// Selects loop breakers for all non-trivial SCCs.
///
/// Returns a bitset of functions marked as loop breakers. During inlining:
/// - Calls to a breaker within its SCC are skipped.
/// - Calls from a breaker to non-breakers within its SCC are still inlined.
/// - Calls across SCCs are unaffected.
pub(crate) struct LoopBreaker<'ctx, 'heap, A: Allocator> {
    pub config: InlineLoopBreakerConfig,
    pub graph: &'ctx CallGraph<'heap, A>,
    pub properties: &'ctx DefIdSlice<BodyProperties<'heap>>,
    pub search: TriColorDepthFirstSearch<'ctx, CallGraph<'heap, A>, DefId, A>,
}

impl<A: Allocator> LoopBreaker<'_, '_, A> {
    pub(crate) fn run_in<S: BumpAllocator>(
        &mut self,
        members: &mut Members<DefId, SccId, A>,
        scratch: &S,
    ) -> DenseBitSet<DefId> {
        let mut breakers = DenseBitSet::new_empty(self.properties.len());

        for (_, members) in members {
            if members.len() < 2 {
                continue;
            }

            self.select_in(members, &mut breakers, scratch);

            let postorder = self.order(members, &breakers, scratch);
            members.copy_from_slice(postorder);
        }

        breakers
    }

    fn select_in<B: BumpAllocator>(
        &mut self,
        members: &[DefId],
        breakers: &mut DenseBitSet<DefId>,
        scratch: &B,
    ) {
        // Score all members and sort by breaker quality (best breaker first).
        let scored = scratch
            .allocate_slice_uninit(members.len())
            .write_with(|index| (members[index], self.score(members[index])));
        scored.sort_by(|(_, lhs_score), (_, rhs_score)| lhs_score.total_cmp(rhs_score).reverse());

        // The full SCC is cyclic by definition, so we always need at least one breaker.
        for &(candidate, _) in scored.iter().rev() {
            breakers.insert(candidate);

            if !self.has_cycle(members, breakers) {
                break;
            }
        }
    }

    fn has_cycle(&mut self, members: &[DefId], breakers: &DenseBitSet<DefId>) -> bool {
        struct CycleDetector<'ctx> {
            members: &'ctx [DefId],
            breakers: &'ctx DenseBitSet<DefId>,
        }

        impl<G> TriColorVisitor<G> for CycleDetector<'_>
        where
            G: DirectedGraph<NodeId = DefId>,
        {
            type Result = ControlFlow<()>;

            fn node_examined(&mut self, _: DefId, before: Option<NodeColor>) -> Self::Result {
                match before {
                    Some(NodeColor::Gray) => ControlFlow::Break(()),
                    _ => ControlFlow::Continue(()),
                }
            }

            fn ignore_edge(&mut self, source: DefId, target: DefId) -> bool {
                self.breakers.contains(source)
                    || self.breakers.contains(target)
                    || !self.members.contains(&source)
                    || !self.members.contains(&target)
            }
        }

        let root = *members
            .iter()
            .find(|&&id| !breakers.contains(id))
            .unwrap_or_else(|| unreachable!());

        let result = self
            .search
            .run(root, &mut CycleDetector { members, breakers });
        result.is_break()
    }

    #[expect(clippy::cast_precision_loss)]
    fn score(&self, body: DefId) -> f32 {
        let props = &self.properties[body];

        match props.directive {
            InlineDirective::Never => return f32::INFINITY,
            InlineDirective::Always => return f32::NEG_INFINITY,
            InlineDirective::Heuristic => {}
        }

        let caller_count = self
            .graph
            .callers(body)
            .filter(|cs| matches!(cs.kind, CallKind::Apply(_)))
            .count();

        let mut score = self.config.cost_weight * props.cost;
        score -= self.config.caller_penalty * (caller_count as f32);

        if self.graph.unique_caller(body).is_some() {
            score -= self.config.unique_callsite_penalty;
        }

        if props.is_leaf {
            score -= self.config.leaf_penalty;
        }

        score
    }

    #[expect(unsafe_code)]
    fn order<'alloc, S: BumpAllocator>(
        &self,
        members: &[DefId],
        breakers: &DenseBitSet<DefId>,
        alloc: &'alloc S,
    ) -> &'alloc [DefId] {
        let subgraph = CallSubgraph {
            inner: self.graph,
            members,
            breakers,
        };

        let mut index = 0;
        let order = alloc.allocate_slice_uninit(members.len());

        for node in DepthFirstForestPostOrder::new(&subgraph) {
            if !breakers.contains(node) {
                order[index].write(node);
                index += 1;
            }
        }

        // Breakers last, in original order.
        for &member in members {
            if breakers.contains(member) {
                order[index].write(member);
                index += 1;
            }
        }

        debug_assert_eq!(index, members.len());

        // SAFETY: We've initialized all elements up to `index` (exclusive).
        unsafe { order.assume_init_mut() }
    }
}
