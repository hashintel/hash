//! This file is derived from the Rust compiler source code.
//! Source: <https://github.com/rust-lang/rust/blob/42ec52babac2cbf2bb2b9d794f980cbcb3ebe413/compiler/rustc_data_structures/src/graph/mod.rs>.
//!
//! Originally dual-licensed under either of:
//!   - Apache License, Version 2.0 (see LICENSE-APACHE.md or <https://www.apache.org/licenses/LICENSE-2.0>)
//!   - MIT license (see LICENSE-MIT.md or <https://opensource.org/licenses/MIT>)
//!
//! You may use, copy, modify, and distribute this file under the terms of the
//! GNU Affero General Public License, Version 3.0, as part of this project,
//! provided that all original notices are preserved.
//!
//! Local adaptations relative to the pinned upstream:
//! API:
//! - Use `Id` in place of `Idx`.
//!   - `index` -> `as_usize`
//!   - `new` -> `from_usize`
//!
//! Implementation and maintenance:
//! - Migrated to smallvec v2.
//! - Applied clippy-driven fixes (no intended semantic changes).
//!
//! Finding the dominators in a control-flow graph.
//!
//! Algorithm based on Loukas Georgiadis,
//! "Linear-Time Algorithms for Dominators and Related Problems",
//! <https://www.cs.princeton.edu/techreports/2005/737.pdf>.
//!
//! Additionally useful is the original Lengauer-Tarjan paper on this subject,
//! "A Fast Algorithm for Finding Dominators in a Flowgraph"
//! Thomas Lengauer and Robert Endre Tarjan.
//! <https://www.cs.princeton.edu/courses/archive/spr03/cs423/download/dominators.pdf>.
#![expect(clippy::min_ident_chars, reason = "vendored in code")]
use alloc::alloc::Global;
use core::{cmp, ops};

use smallvec::{SmallVec, smallvec};

pub use self::{
    frontier::{DominanceFrontier, DominatorFrontiers, dominance_frontiers},
    iterated_frontier::{IteratedDominanceFrontier, iterated_dominance_frontier},
};
use crate::{
    graph::{DirectedGraph, Predecessors, Successors},
    id::{Id, IdSlice, IdVec},
    newtype,
};

mod frontier;
mod iterated_frontier;
#[cfg(test)]
mod tests;

struct PreOrderFrame<Iter> {
    pre_order_idx: PreorderIndex,
    iter: Iter,
}

newtype!(
    #[steppable]
    struct PreorderIndex(u32 is 0..=u32::MAX)
);

#[derive(Clone, Debug)]
pub struct Dominators<N> {
    kind: Kind<N>,
}

#[derive(Clone, Debug)]
enum Kind<N> {
    /// A representation optimized for a small path graphs.
    Path,
    General(Inner<N>),
}

pub fn dominators<G: DirectedGraph + Successors + Predecessors>(
    graph: &G,
    start_node: G::NodeId,
) -> Dominators<G::NodeId> {
    // We often encounter MIR bodies with 1 or 2 basic blocks. Special case the dominators
    // computation and representation for those cases.
    if is_small_path_graph(graph, start_node) {
        Dominators { kind: Kind::Path }
    } else {
        Dominators {
            kind: Kind::General(dominators_impl(graph, start_node)),
        }
    }
}

fn is_small_path_graph<G: DirectedGraph + Successors>(graph: &G, start_node: G::NodeId) -> bool {
    if start_node.as_usize() != 0 {
        return false;
    }

    if graph.node_count() == 1 {
        return true;
    }
    if graph.node_count() == 2 {
        return graph.successors(start_node).any(|n| n.as_usize() == 1);
    }

    false
}

fn dominators_impl<G: DirectedGraph + Successors + Predecessors>(
    graph: &G,
    start_node: G::NodeId,
) -> Inner<G::NodeId> {
    // We allocate capacity for the full set of nodes, because most of the time
    // most of the nodes *are* reachable.
    let mut parent: IdVec<PreorderIndex, PreorderIndex> = IdVec::with_capacity(graph.node_count());

    let mut stack = vec![PreOrderFrame {
        pre_order_idx: PreorderIndex::MIN,
        iter: graph.successors(start_node),
    }];
    let mut pre_order_to_real: IdVec<PreorderIndex, G::NodeId> =
        IdVec::with_capacity(graph.node_count());
    let mut real_to_pre_order: IdVec<G::NodeId, Option<PreorderIndex>> =
        IdVec::from_elem(None, graph.node_count());
    pre_order_to_real.push(start_node);

    parent.push(PreorderIndex::MIN); // the parent of the root node is the root for now.
    real_to_pre_order[start_node] = Some(PreorderIndex::MIN);

    // Traverse the graph, collecting a number of things:
    //
    // * Preorder mapping (to it, and back to the actual ordering)
    // * Parents for each vertex in the preorder tree
    //
    // These are all done here rather than through one of the 'standard'
    // graph traversals to help make this fast.
    'recurse: while let Some(frame) = stack.last_mut() {
        for successor in frame.iter.by_ref() {
            if real_to_pre_order[successor].is_none() {
                let pre_order_idx = pre_order_to_real.push(successor);
                real_to_pre_order[successor] = Some(pre_order_idx);
                parent.push(frame.pre_order_idx);
                stack.push(PreOrderFrame {
                    pre_order_idx,
                    iter: graph.successors(successor),
                });

                continue 'recurse;
            }
        }

        stack.pop();
    }

    let reachable_vertices = pre_order_to_real.len();

    let mut idom = IdVec::from_elem(PreorderIndex::MIN, reachable_vertices);
    let mut semi = IdVec::from_fn(reachable_vertices, core::convert::identity);
    let mut label = semi.clone();
    let mut bucket = IdVec::from_elem(vec![], reachable_vertices);
    let mut lastlinked = None;

    // We loop over vertices in reverse preorder. This implements the pseudocode
    // of the simple Lengauer-Tarjan algorithm. A few key facts are noted here
    // which are helpful for understanding the code (full proofs and such are
    // found in various papers, including one cited at the top of this file).
    //
    // For each vertex w (which is not the root),
    //  * semi[w] is a proper ancestor of the vertex w (i.e., semi[w] != w)
    //  * idom[w] is an ancestor of semi[w] (i.e., idom[w] may equal semi[w])
    //
    // An immediate dominator of w (idom[w]) is a vertex v where v dominates w
    // and every other dominator of w dominates v. (Every vertex except the root has
    // a unique immediate dominator.)
    //
    // A semidominator for a given vertex w (semi[w]) is the vertex v with minimum
    // preorder number such that there exists a path from v to w in which all elements (other than
    // w) have preorder numbers greater than w (i.e., this path is not the tree path to
    // w).
    for w in (PreorderIndex::new(1)..PreorderIndex::from_usize(reachable_vertices)).rev() {
        // Optimization: process buckets just once, at the start of the
        // iteration. Do not explicitly empty the bucket (even though it will
        // not be used again), to save some instructions.
        //
        // The bucket here contains the vertices whose semidominator is the
        // vertex w, which we are guaranteed to have found: all vertices who can
        // be semidominated by w must have a preorder number exceeding w, so
        // they have been placed in the bucket.
        //
        // We compute a partial set of immediate dominators here.
        for &v in &bucket[w] {
            // This uses the result of Lemma 5 from section 2 from the original
            // 1979 paper, to compute either the immediate or relative dominator
            // for a given vertex v.
            //
            // eval returns a vertex y, for which semi[y] is minimum among
            // vertices semi[v] +> y *> v. Note that semi[v] = w as we're in the
            // w bucket.
            //
            // Given such a vertex y, semi[y] <= semi[v] and idom[y] = idom[v].
            // If semi[y] = semi[v], though, idom[v] = semi[v].
            //
            // Using this, we can either set idom[v] to be:
            //  * semi[v] (i.e. w), if semi[y] is w
            //  * idom[y], otherwise
            //
            // We don't directly set to idom[y] though as it's not necessarily
            // known yet. The second preorder traversal will cleanup by updating
            // the idom for any that were missed in this pass.
            let y = eval(&mut parent, lastlinked, &semi, &mut label, v);
            idom[v] = if semi[y] < w { y } else { w };
        }

        // This loop computes the semi[w] for w.
        semi[w] = w;
        for v in graph.predecessors(pre_order_to_real[w]) {
            // TL;DR: Reachable vertices may have unreachable predecessors, so ignore any of them.
            //
            // Ignore blocks which are not connected to the entry block.
            //
            // The algorithm that was used to traverse the graph and build the
            // `pre_order_to_real` and `real_to_pre_order` vectors does so by
            // starting from the entry block and following the successors.
            // Therefore, any blocks not reachable from the entry block will be
            // set to `None` in the `pre_order_to_real` vector.
            //
            // For example, in this graph, A and B should be skipped:
            //
            //           ┌─────┐
            //           │     │
            //           └──┬──┘
            //              │
            //           ┌──▼──┐              ┌─────┐
            //           │     │              │  A  │
            //           └──┬──┘              └──┬──┘
            //              │                    │
            //      ┌───────┴───────┐            │
            //      │               │            │
            //   ┌──▼──┐         ┌──▼──┐      ┌──▼──┐
            //   │     │         │     │      │  B  │
            //   └──┬──┘         └──┬──┘      └──┬──┘
            //      │               └──────┬─────┘
            //   ┌──▼──┐                   │
            //   │     │                   │
            //   └──┬──┘                ┌──▼──┐
            //      │                   │     │
            //      │                   └─────┘
            //   ┌──▼──┐
            //   │     │
            //   └──┬──┘
            //      │
            //   ┌──▼──┐
            //   │     │
            //   └─────┘
            //
            // ...this may be the case if a MirPass modifies the CFG to remove
            // or rearrange certain blocks/edges.
            let Some(v) = real_to_pre_order[v] else {
                continue;
            };

            // eval returns a vertex x from which semi[x] is minimum among
            // vertices semi[v] +> x *> v.
            //
            // From Lemma 4 from section 2, we know that the semidominator of a
            // vertex w is the minimum (by preorder number) vertex of the
            // following:
            //
            //  * direct predecessors of w with preorder number less than w
            //  * semidominators of u such that u > w and there exists (v, w) such that u *> v
            //
            // This loop therefore identifies such a minima. Note that any
            // semidominator path to w must have all but the first vertex go
            // through vertices numbered greater than w, so the reverse preorder
            // traversal we are using guarantees that all of the information we
            // might need is available at this point.
            //
            // The eval call will give us semi[x], which is either:
            //
            //  * v itself, if v has not yet been processed
            //  * A possible 'best' semidominator for w.
            let x = eval(&mut parent, lastlinked, &semi, &mut label, v);
            semi[w] = cmp::min(semi[w], semi[x]);
        }
        // semi[w] is now semidominator(w) and won't change any more.

        // Optimization: Do not insert into buckets if parent[w] = semi[w], as
        // we then immediately know the idom.
        //
        // If we don't yet know the idom directly, then push this vertex into
        // our semidominator's bucket, where it will get processed at a later
        // stage to compute its immediate dominator.
        let z = parent[w];
        if z == semi[w] {
            idom[w] = z;
        } else {
            bucket[semi[w]].push(w);
        }

        // Optimization: We share the parent array between processed and not
        // processed elements; lastlinked represents the divider.
        lastlinked = Some(w);
    }

    // Finalize the idoms for any that were not fully settable during initial
    // traversal.
    //
    // If idom[w] != semi[w] then we know that we've stored vertex y from above
    // into idom[w]. It is known to be our 'relative dominator', which means
    // that it's one of w's ancestors and has the same immediate dominator as w,
    // so use that idom.
    for w in PreorderIndex::new(1)..PreorderIndex::from_usize(reachable_vertices) {
        if idom[w] != semi[w] {
            idom[w] = idom[idom[w]];
        }
    }

    let mut immediate_dominators = IdVec::from_elem(None, graph.node_count());
    for (idx, node) in pre_order_to_real.iter_enumerated() {
        immediate_dominators[*node] = Some(pre_order_to_real[idom[idx]]);
    }

    immediate_dominators[start_node] = None;

    let time = compute_access_time(start_node, &immediate_dominators);

    Inner {
        immediate_dominators,
        time,
    }
}

/// Evaluate the link-eval virtual forest, providing the currently minimum semi
/// value for the passed `node` (which may be itself).
///
/// This maintains that for every vertex v, `label[v]` is such that:
///
/// ```text
/// semi[eval(v)] = min { semi[label[u]] | root_in_forest(v) +> u *> v }
/// ```
///
/// where `+>` is a proper ancestor and `*>` is just an ancestor.
#[inline]
fn eval(
    ancestor: &mut IdSlice<PreorderIndex, PreorderIndex>,
    lastlinked: Option<PreorderIndex>,
    semi: &IdSlice<PreorderIndex, PreorderIndex>,
    label: &mut IdSlice<PreorderIndex, PreorderIndex>,
    node: PreorderIndex,
) -> PreorderIndex {
    if is_processed(node, lastlinked) {
        compress(ancestor, lastlinked, semi, label, node);
        label[node]
    } else {
        node
    }
}

#[inline]
fn is_processed(v: PreorderIndex, lastlinked: Option<PreorderIndex>) -> bool {
    lastlinked.is_some_and(|ll| v >= ll)
}

#[inline]
fn compress(
    ancestor: &mut IdSlice<PreorderIndex, PreorderIndex>,
    lastlinked: Option<PreorderIndex>,
    semi: &IdSlice<PreorderIndex, PreorderIndex>,
    label: &mut IdSlice<PreorderIndex, PreorderIndex>,
    v: PreorderIndex,
) {
    assert!(is_processed(v, lastlinked));
    // Compute the processed list of ancestors
    //
    // We use a heap stack here to avoid recursing too deeply, exhausting the
    // stack space.
    let mut stack: SmallVec<_, 8> = smallvec![v];
    let mut u = ancestor[v];
    while is_processed(u, lastlinked) {
        stack.push(u);
        u = ancestor[u];
    }

    // Then in reverse order, popping the stack
    for &[v, u] in stack.array_windows().rev() {
        if semi[label[u]] < semi[label[v]] {
            label[v] = label[u];
        }
        ancestor[v] = ancestor[u];
    }
}

/// Tracks the list of dominators for each node.
#[derive(Clone, Debug)]
struct Inner<N> {
    // Even though we track only the immediate dominator of each node, it's
    // possible to get its full list of dominators by looking up the dominator
    // of each dominator.
    immediate_dominators: IdVec<N, Option<N>>,
    time: IdVec<N, Time>,
}

impl<N> Dominators<N>
where
    N: Id,
{
    /// Returns true if node is reachable from the start node.
    pub fn is_reachable(&self, node: N) -> bool {
        match &self.kind {
            Kind::Path => true,
            Kind::General(g) => g.time[node].start != 0,
        }
    }

    /// Returns the immediate dominator of node, if any.
    pub fn immediate_dominator(&self, node: N) -> Option<N> {
        match &self.kind {
            Kind::Path => (0 < node.as_usize()).then(|| N::from_usize(node.as_usize() - 1)),
            Kind::General(general) => general.immediate_dominators[node],
        }
    }

    /// Returns true if `a` dominates `b`.
    ///
    /// # Panics
    ///
    /// Panics if `b` is unreachable.
    #[inline]
    pub fn dominates(&self, lhs: N, rhs: N) -> bool {
        match &self.kind {
            Kind::Path => lhs.as_usize() <= rhs.as_usize(),
            Kind::General(general) => {
                let lhs = general.time[lhs];
                let rhs = general.time[rhs];
                assert!(rhs.start != 0, "node {rhs:?} is not reachable");

                lhs.start <= rhs.start && rhs.finish <= lhs.finish
            }
        }
    }
}

/// Describes the number of vertices discovered at the time when processing of a particular vertex
/// started and when it finished. Both values are zero for unreachable vertices.
#[derive(Copy, Clone, Default, Debug)]
struct Time {
    start: u32,
    finish: u32,
}

newtype!(struct EdgeIndex(u32 is 0..=u32::MAX));

fn compute_access_time<N: Id>(
    start_node: N,
    immediate_dominators: &IdSlice<N, Option<N>>,
) -> IdVec<N, Time> {
    // Transpose the dominator tree edges, so that child nodes of vertex v are stored in
    // node[edges[v].start..edges[v].end].
    let mut edges: IdVec<N, ops::Range<EdgeIndex>> = IdVec::from_domain_in(
        EdgeIndex::from_u32(0)..EdgeIndex::from_u32(0),
        immediate_dominators,
        Global,
    );

    for &idom in immediate_dominators {
        if let Some(idom) = idom {
            edges[idom].end.increment_by(1);
        }
    }

    let mut max = EdgeIndex::from_u32(0);
    for edge in &mut edges {
        max.increment_by(edge.end.as_usize());
        edge.start = max;
        edge.end = max;
    }

    let mut node = IdVec::from_elem(Id::from_usize(0), max.as_usize());
    for (id, &idom) in immediate_dominators.iter_enumerated() {
        if let Some(idom) = idom {
            edges[idom].start.decrement_by(1);
            node[edges[idom].start] = id;
        }
    }

    // Perform a depth-first search of the dominator tree. Record the number of vertices discovered
    // when vertex v is discovered first as time[v].start, and when its processing is finished as
    // time[v].finish.
    let mut time: IdVec<N, Time> =
        IdVec::from_domain_in(Time::default(), immediate_dominators, Global);
    let mut stack = Vec::new();

    let mut discovered = 1;
    stack.push(start_node);
    time[start_node].start = discovered;

    while let Some(&id) = stack.last() {
        let edge = &mut edges[id];
        if edge.start == edge.end {
            // Finish processing vertex i.
            time[id].finish = discovered;
            stack.pop();
        } else {
            let start = node[edge.start];
            edge.start.increment_by(1);
            // Start processing vertex j.
            discovered += 1;
            time[start].start = discovered;
            stack.push(start);
        }
    }

    time
}
