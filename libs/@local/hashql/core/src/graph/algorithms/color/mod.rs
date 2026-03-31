//! Three-color depth-first search for directed graphs.
//!
//! Implements a DFS where each node transitions through three states:
//!
//! - **White** (unvisited): not yet encountered.
//! - **Gray** (in the [`gray`] set): discovered but not yet finished; still on the DFS stack.
//! - **Black** (in the [`black`] set): all successors have been processed.
//!
//! The color of a node when it is re-encountered determines the edge classification:
//!
//! | Re-encounter color | Meaning          |
//! |--------------------|------------------|
//! | `None` (white)     | Tree edge        |
//! | `Some(Gray)`       | Back edge (cycle)|
//! | `Some(Black)`      | Cross/forward    |
//!
//! This is an iterative (stack-based) implementation. The visitor receives callbacks
//! at two points: when a node is first examined ([`node_examined`]) and when all its
//! successors are finished ([`node_finished`]). The `node_finished` callback fires in
//! postorder.
//!
//! [`gray`]: TriColorDepthFirstSearch::gray
//! [`black`]: TriColorDepthFirstSearch::black
//! [`node_examined`]: TriColorVisitor::node_examined
//! [`node_finished`]: TriColorVisitor::node_finished

use alloc::alloc::Global;
use core::{alloc::Allocator, ops::Try};

use crate::{
    graph::{DirectedGraph, Successors},
    id::bit_vec::DenseBitSet,
};

#[cfg(test)]
mod tests;

/// DFS node state.
///
/// Passed to [`TriColorVisitor::node_examined`] as the `before` parameter to indicate
/// what state a node was in when it was re-encountered. A value of `None` means the node
/// was white (first discovery).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeColor {
    /// On the current DFS path. Re-encountering a gray node means a back edge (cycle).
    Gray,
    /// Fully processed. Re-encountering a black node means a cross or forward edge.
    Black,
}

/// Internal event pushed onto the DFS stack.
///
/// Each node generates two events: `Gray` on discovery (explore successors)
/// and `Black` when all successors are done (finish the node).
struct Event<N> {
    node: N,
    next: NodeColor,
}

/// Iterative three-color DFS over a directed graph.
///
/// Reusable across multiple `run` calls. Each call to [`run`](Self::run) resets all
/// internal state before starting from the given root.
///
/// The graph's full node domain is used to size the internal bitsets, so node IDs
/// from the graph can be used directly without remapping.
pub struct TriColorDepthFirstSearch<'graph, G: ?Sized, N, A: Allocator = Global> {
    graph: &'graph G,
    stack: Vec<Event<N>, A>,

    /// Nodes that have been discovered (entered the DFS stack).
    gray: DenseBitSet<N>,
    /// Nodes whose successors have all been processed.
    black: DenseBitSet<N>,
}

impl<'graph, G: DirectedGraph + ?Sized> TriColorDepthFirstSearch<'graph, G, G::NodeId, Global> {
    #[inline]
    pub fn new(graph: &'graph G) -> Self {
        Self::new_in(graph, Global)
    }
}

impl<'graph, G: DirectedGraph + ?Sized, A: Allocator>
    TriColorDepthFirstSearch<'graph, G, G::NodeId, A>
{
    pub fn new_in(graph: &'graph G, alloc: A) -> Self {
        Self {
            graph,
            stack: Vec::new_in(alloc),
            gray: DenseBitSet::new_empty(graph.node_count()),
            black: DenseBitSet::new_empty(graph.node_count()),
        }
    }

    /// Clears all traversal state (gray set, black set, stack).
    ///
    /// Call this before a sequence of [`run_from`](Self::run_from) calls to start
    /// with a clean slate.
    pub fn reset(&mut self) {
        self.stack.clear();
        self.gray.clear();
        self.black.clear();
    }

    /// Run a DFS from `root`, resetting all state first.
    ///
    /// Equivalent to calling [`reset`](Self::reset) followed by
    /// [`run_from`](Self::run_from). Use this when each DFS should be independent.
    pub fn run<V>(&mut self, root: G::NodeId, visitor: &mut V) -> V::Result
    where
        V: TriColorVisitor<G>,
        G: Successors,
    {
        self.reset();
        self.run_from(root, visitor)
    }

    /// Run a DFS from `root` without resetting state.
    ///
    /// Nodes already in the gray or black sets from previous calls are treated as
    /// previously visited. This allows running DFS from multiple roots while
    /// accumulating state: a node finished (black) by an earlier root is skipped,
    /// so each connected component is explored at most once.
    ///
    /// Stops early if the visitor returns a residual (e.g., `Err` or
    /// `ControlFlow::Break`). Edges for which [`TriColorVisitor::ignore_edge`]
    /// returns `true` are not followed.
    pub fn run_from<V>(&mut self, root: G::NodeId, visitor: &mut V) -> V::Result
    where
        V: TriColorVisitor<G>,
        G: Successors,
    {
        self.stack.push(Event {
            node: root,
            next: NodeColor::Gray,
        });

        while let Some(Event { node, next }) = self.stack.pop() {
            match next {
                NodeColor::Black => {
                    let not_previously_finished = self.black.insert(node);
                    debug_assert!(
                        not_previously_finished,
                        "a node should be finished exactly once"
                    );

                    visitor.node_finished(node)?;
                }
                NodeColor::Gray => {
                    let newly_discovered = self.gray.insert(node);
                    let previous_color = if newly_discovered {
                        None
                    } else if self.black.contains(node) {
                        Some(NodeColor::Black)
                    } else {
                        Some(NodeColor::Gray)
                    };

                    visitor.node_examined(node, previous_color)?;

                    // Already visited through another path: nothing more to do.
                    if previous_color.is_some() {
                        continue;
                    }

                    self.stack.push(Event {
                        node,
                        next: NodeColor::Black,
                    });
                    for successor in self.graph.successors(node) {
                        if !visitor.ignore_edge(node, successor) {
                            self.stack.push(Event {
                                node: successor,
                                next: NodeColor::Gray,
                            });
                        }
                    }
                }
            }
        }

        Try::from_output(())
    }
}

/// Callbacks for [`TriColorDepthFirstSearch`].
///
/// All methods have default no-op implementations, so visitors only need to
/// override the events they care about.
pub trait TriColorVisitor<G: DirectedGraph + ?Sized> {
    /// The control-flow type returned by each callback.
    ///
    /// Use `Result<(), E>` or `ControlFlow<B>` to support early termination.
    type Result: Try<Output = ()>;

    /// Called when a node is encountered during DFS.
    ///
    /// `before` indicates the node's color at the time of re-encounter:
    /// - `None`: first discovery (white to gray transition).
    /// - `Some(Gray)`: back edge, indicating a cycle.
    /// - `Some(Black)`: cross or forward edge.
    #[expect(unused_variables)]
    fn node_examined(&mut self, node: G::NodeId, before: Option<NodeColor>) -> Self::Result {
        Try::from_output(())
    }

    /// Called after all successors of `node` have been fully processed.
    ///
    /// Fires in postorder: a node finishes only after all its descendants finish.
    #[expect(unused_variables)]
    fn node_finished(&mut self, node: G::NodeId) -> Self::Result {
        Try::from_output(())
    }

    /// Return `true` to skip this edge during traversal.
    ///
    /// Allows restricting the DFS to a subgraph without constructing a
    /// separate graph data structure.
    #[expect(unused_variables)]
    fn ignore_edge(&mut self, source: G::NodeId, target: G::NodeId) -> bool {
        false
    }
}

/// A [`TriColorVisitor`] that detects cycles.
///
/// Returns `Err(())` as soon as a back edge (re-encounter of a gray node) is found.
pub struct CycleDetector;

impl<G: DirectedGraph> TriColorVisitor<G> for CycleDetector {
    type Result = Result<(), ()>;

    fn node_examined(&mut self, _: G::NodeId, before: Option<NodeColor>) -> Self::Result {
        match before {
            Some(NodeColor::Gray) => Err(()),
            _ => Ok(()),
        }
    }
}
