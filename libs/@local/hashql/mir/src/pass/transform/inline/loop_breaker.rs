//! Loop-breaker selection for recursive SCCs.
//!
//! When functions form a mutually recursive group (SCC), the inliner cannot inline all
//! calls without diverging. This module selects which functions to mark as loop breakers:
//! calls to a breaker within its SCC are skipped, while calls from a breaker to non-breakers
//! are still inlined. This flattens most of the call chain without infinite expansion.
//!
//! The approach follows GHC's loop-breaker strategy (Peyton Jones & Marlow 2002): select
//! which *nodes* to mark as non-inlineable rather than which *edges* to cut. All edges
//! targeting a loop breaker become non-inlineable. This reduces the problem from feedback
//! arc set (NP-hard) to feedback vertex set, which is tractable for the small SCCs (at most
//! ~12 nodes) that appear in practice.
//!
//! # Algorithm
//!
//! [`LoopBreaker::run_in`] processes every non-trivial SCC (size > 1) in the call graph:
//!
//! 1. **Score** each member by inverse inlining value via [`LoopBreaker::score`]. Higher score =
//!    less valuable to inline = better breaker candidate.
//! 2. **Select** breakers greedily: pick the highest-scored member (least valuable to inline), mark
//!    it as a breaker, then check if the remaining members still contain a cycle
//!    ([`LoopBreaker::has_cycle`]). Repeat until the remaining subgraph is acyclic. This produces a
//!    sufficient (not necessarily minimal) feedback vertex set.
//! 3. **Reorder** the SCC members via [`LoopBreaker::order`]: non-breakers appear in DFS postorder
//!    (callees before callers), followed by breakers. This ordering ensures that when a function is
//!    processed, its non-breaker callees within the same SCC have already been optimized.
//!
//! The members slice is mutated in place so the caller can iterate it directly.
//!
//! # Scoring
//!
//! The breaker score (see [`InlineLoopBreakerConfig`]) combines:
//!
//! - **Body cost** (positive contribution): large functions are expensive to duplicate.
//! - **Caller count** (negative): functions with many call sites lose more inlining opportunities
//!   when chosen as breakers.
//! - **Unique callsite** (negative): a single call site means zero duplication on inline.
//! - **Leaf status** (negative): leaves are safe, cheap inlining targets.
//! - **Inline directive**: `Never` maps to `+inf` (ideal breaker), `Always` to `-inf` (avoided
//!   unless every other candidate has been exhausted).
//!
//! # Cycle detection
//!
//! After each breaker is selected, the remaining non-breaker subgraph is checked
//! for cycles using three-color DFS ([`TriColorDepthFirstSearch`]). The DFS runs
//! on the full [`CallGraph`] with an [`ignore_edge`] filter that restricts traversal
//! to non-breaker SCC members. State is accumulated across roots via
//! [`run_from`](TriColorDepthFirstSearch::run_from) so disconnected components
//! (which appear when breaker removal splits the subgraph) are all covered.
//!
//! # Postorder computation
//!
//! Once breakers are selected, the non-breaker members form a DAG. Their processing
//! order is computed as DFS postorder over a [`CallSubgraph`] that filters the
//! call graph to non-breaker members. Breaker members are appended after the
//! non-breakers.
//!
//! [`ignore_edge`]: TriColorVisitor::ignore_edge

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
/// Functions with `InlineDirective::Never` get score `+inf` (ideal breakers).
/// Functions with `InlineDirective::Always` get score `-inf` (avoided unless
/// every other candidate has been exhausted).
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

/// A view of the [`CallGraph`] induced on the non-breaker members of a single SCC.
///
/// Both source and target are filtered: a node outside the non-breaker member set
/// has no successors, and edges targeting nodes outside it are dropped.
///
/// [`node_count`](DirectedGraph::node_count) returns the full call graph domain so
/// that traversal algorithms size their bitsets correctly for the global `DefId` space.
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
        // Must match the full DefId domain so that DenseBitSet/MixedBitSet
        // in traversal algorithms are sized correctly for any DefId index.
        self.inner.node_count()
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
        let in_subgraph = self.members.contains(&node) && !self.breakers.contains(node);

        self.inner.successors(node).filter(move |&succ| {
            in_subgraph && self.members.contains(&succ) && !self.breakers.contains(succ)
        })
    }
}

/// Entry point for loop-breaker selection and SCC reordering.
pub(crate) struct LoopBreaker<'ctx, 'heap, A: Allocator> {
    pub config: InlineLoopBreakerConfig,
    pub graph: &'ctx CallGraph<'heap, A>,
    pub properties: &'ctx DefIdSlice<BodyProperties<'heap>>,
    pub search: TriColorDepthFirstSearch<'ctx, CallGraph<'heap, A>, DefId, A>,
}

impl<A: Allocator> LoopBreaker<'_, '_, A> {
    /// Select loop breakers and reorder members for every non-trivial SCC.
    ///
    /// After this call, for each non-trivial SCC:
    /// - A sufficient set of breakers has been selected to make the remainder acyclic.
    /// - The member slice is reordered: non-breaker callees before their callers, breakers last.
    ///
    /// Returns a bitset of all selected breakers across every SCC.
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

            #[expect(
                clippy::debug_assert_with_mut_call,
                reason = "the call only resets and uses the search state, therefore is safe to be \
                          mut"
            )]
            {
                debug_assert!(
                    !self.has_cycle(members, &breakers),
                    "select_in must produce an acyclic remainder"
                );
            }

            let postorder = self.order(members, &breakers, scratch);
            members.copy_from_slice(postorder);
        }

        breakers
    }

    /// Greedily select breakers for a single non-trivial SCC.
    ///
    /// Postcondition: the non-breaker remainder of `members` is acyclic.
    fn select_in<B: BumpAllocator>(
        &mut self,
        members: &[DefId],
        breakers: &mut DenseBitSet<DefId>,
        scratch: &B,
    ) {
        // Sort descending: highest breaker score (least valuable to inline) first.
        let scored = scratch
            .allocate_slice_uninit(members.len())
            .write_with(|index| (members[index], self.score(members[index])));
        scored.sort_by(|(_, lhs_score), (_, rhs_score)| lhs_score.total_cmp(rhs_score).reverse());

        // The full SCC is cyclic by definition, so we always need at least one breaker.
        for &(candidate, _) in &*scored {
            breakers.insert(candidate);

            if !self.has_cycle(members, breakers) {
                break;
            }
        }
    }

    /// Returns whether the non-breaker members still contain a cycle.
    fn has_cycle(&mut self, members: &[DefId], breakers: &DenseBitSet<DefId>) -> bool {
        struct SubgraphCycleDetector<'ctx> {
            members: &'ctx [DefId],
            breakers: &'ctx DenseBitSet<DefId>,
        }

        impl<G> TriColorVisitor<G> for SubgraphCycleDetector<'_>
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

        let mut detector = SubgraphCycleDetector { members, breakers };

        // Accumulate visited state across roots: breaker removal can disconnect
        // the subgraph, and a cycle in an unreachable component would be missed
        // by a single-root search.
        self.search.reset();
        for &member in members {
            if breakers.contains(member) {
                continue;
            }

            if self.search.run_from(member, &mut detector).is_break() {
                return true;
            }
        }

        false
    }

    /// Compute the breaker score for a single function.
    ///
    /// Higher score = better breaker candidate (less valuable to inline).
    /// See [`InlineLoopBreakerConfig`] for the formula and weight descriptions.
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
        score = self
            .config
            .caller_penalty
            .mul_add(-(caller_count as f32), score);

        if self.graph.unique_caller(body).is_some() {
            score -= self.config.unique_callsite_penalty;
        }

        if props.is_leaf {
            score -= self.config.leaf_penalty;
        }

        score
    }

    /// Compute the processing order for a non-trivial SCC.
    ///
    /// Returns non-breaker members ordered so that callees appear before their
    /// callers, followed by breaker members.
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

        // The forest traversal covers the full DefId domain (since node_count
        // must match the DefId index space for bitset sizing). Non-member nodes
        // have no successors in the induced subgraph and yield as isolated
        // nodes, so we filter them out.
        for node in DepthFirstForestPostOrder::new(&subgraph) {
            if !breakers.contains(node) && members.contains(&node) {
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

        // SAFETY: All `members.len()` elements are initialized:
        // - The forest traversal yields every non-breaker member exactly once (reachable in the
        //   full domain, filtered to SCC members).
        // - The final loop writes all breaker members.
        unsafe { order.assume_init_mut() }
    }
}
