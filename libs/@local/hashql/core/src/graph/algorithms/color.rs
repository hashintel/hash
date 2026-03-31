use alloc::alloc::Global;
use core::{alloc::Allocator, ops::Try};

use crate::{
    graph::{DirectedGraph, Successors},
    id::bit_vec::DenseBitSet,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeColor {
    Gray,
    Black,
}

pub struct Event<N> {
    node: N,
    next: NodeColor,
}

pub struct TriColorDepthFirstSearch<'graph, G: ?Sized, N, A: Allocator = Global> {
    graph: &'graph G,
    stack: Vec<Event<N>, A>,

    gray: DenseBitSet<N>,
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

    fn reset(&mut self) {
        self.stack.clear();
        self.gray.clear();
        self.black.clear();
    }

    pub fn run<V>(&mut self, root: G::NodeId, visitor: &mut V) -> V::Result
    where
        V: TriColorVisitor<G>,
        G: Successors,
    {
        self.reset();

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
                        "A node should be finished exactly once"
                    );

                    visitor.node_finished(node)?;
                }
                NodeColor::Gray => {
                    let not_previous_discovered = self.gray.insert(node);
                    let previous_color = if not_previous_discovered {
                        None
                    } else if self.black.contains(node) {
                        Some(NodeColor::Black)
                    } else {
                        Some(NodeColor::Gray)
                    };

                    visitor.node_examined(node, previous_color)?;

                    // If this path has already been examined we're done. This allows us to not
                    // double count nodes when we revisit them through different
                    // paths.
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

pub trait TriColorVisitor<G: DirectedGraph + ?Sized> {
    type Result: Try<Output = ()>;

    #[expect(unused_variables)]
    fn node_examined(&mut self, node: G::NodeId, before: Option<NodeColor>) -> Self::Result {
        Try::from_output(())
    }

    #[expect(unused_variables)]
    fn node_finished(&mut self, node: G::NodeId) -> Self::Result {
        Try::from_output(())
    }

    #[expect(unused_variables)]
    fn ignore_edge(&mut self, source: G::NodeId, target: G::NodeId) -> bool {
        false
    }
}

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
