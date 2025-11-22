//! Tarjan's algorithm for finding strongly connected components (SCCs).
//!
//! This module provides an iterative, single-pass implementation of Tarjan's strongly
//! connected components algorithm. The implementation uses type-safe node states to make
//! impossible states unrepresentable and can annotate SCCs with custom data.

use alloc::{alloc::Global, vec::Vec};
use core::{alloc::Allocator, ops::Range};

use crate::{
    collections::{FastHashSet, fast_hash_set_in},
    graph::{DirectedGraph, NodeId, Successors},
    id::{HasId as _, Id, IdVec},
    newtype,
};

newtype!(pub struct DiscoveryTime(usize is 0..=usize::MAX));

pub trait Annotation {
    fn merge_scc(&mut self, other: Self);
    fn merge_reachable(&mut self, other: &Self);
}

pub trait Annotations<S> {
    type Annotation: Annotation;

    fn annotate_node(&mut self, node: NodeId) -> Self::Annotation;
    fn annotate_scc(&mut self, scc: S) -> Self::Annotation;
}

/// Represents the state of a node during Tarjan's algorithm execution.
///
/// This enum uses the type system to ensure that impossible states cannot be represented.
/// Each variant captures exactly the information available at that stage of the algorithm.
#[derive(Debug, Clone)]
enum NodeState<S, A> {
    Unvisited,

    OnStack {
        index: DiscoveryTime,
        low_link: DiscoveryTime,
        successors: Range<usize>,

        annotation: A,
    },

    InComponent {
        id: S,
    },
}

impl<S, A> NodeState<S, A> {
    /// Returns the low-link value if the node is active
    const fn low_link(&self) -> Option<DiscoveryTime> {
        match self {
            Self::OnStack { low_link, .. } => Some(*low_link),
            _ => None,
        }
    }

    /// Updates the low-link value for an active node
    fn update_low_link(&mut self, new_low: DiscoveryTime) {
        if let Self::OnStack { low_link, .. } = self
            && new_low.as_usize() < low_link.as_usize()
        {
            *low_link = new_low;
        }
    }
}

/// Represents a frame in the iterative DFS traversal
#[derive(Debug, Clone)]
struct DfsFrame {
    node: NodeId,
    successor_index: usize,
}

struct Scc<A> {
    annotation: A,
    successors: Range<usize>,
}

struct SccData<S, Ann, A: Allocator = Global> {
    components: IdVec<S, Scc<Ann>, A>,
    successors: Vec<S, A>,
    nodes: IdVec<NodeId, S, A>,
}

pub struct Tarjan<'graph, G, S, Ann: Annotations<S>, A: Allocator = Global> {
    graph: &'graph G,
    annotations: Ann,

    node_state: IdVec<NodeId, NodeState<S, Ann::Annotation>, A>,
    dfs_stack: Vec<DfsFrame, A>,
    scc_stack: Vec<NodeId, A>,
    successor_stack: Vec<NodeId, A>,
    deduplicated_successors: FastHashSet<S, A>,

    discovery_time: DiscoveryTime,

    data: SccData<S, Ann::Annotation, A>,
}

impl<'graph, G, S, Ann, A> Tarjan<'graph, G, S, Ann, A>
where
    S: Id,
    G: DirectedGraph + Successors,
    Ann: Annotations<S>,
    A: Allocator + Clone,
{
    pub fn new_in(graph: &'graph G, annotations: Ann, alloc: A) -> Self {
        let node_count = graph.node_count();

        Self {
            graph,
            annotations,
            // Nodes are first in an unvisited state
            node_state: IdVec::from_fn_in(node_count, |_| NodeState::Unvisited, alloc.clone()),

            dfs_stack: Vec::new_in(alloc.clone()),
            scc_stack: Vec::new_in(alloc.clone()),
            successor_stack: Vec::new_in(alloc.clone()),
            deduplicated_successors: fast_hash_set_in(None, alloc.clone()),

            discovery_time: DiscoveryTime::MIN,
            data: SccData {
                components: IdVec::new_in(alloc.clone()),
                successors: Vec::new_in(alloc.clone()),
                nodes: IdVec::from_fn_in(node_count, |_| S::MAX, alloc),
            },
        }
    }

    pub fn run(mut self) -> SccData<S, Ann::Annotation, A> {
        // Explore from each unvisited node, as to handle disconnected components
        for node in self.graph.iter_nodes() {
            let id = node.id();

            if matches!(self.node_state[id], NodeState::Unvisited) {
                self.explore_from(id);
            }
        }

        self.data
    }

    fn start_exploration(&mut self, node: NodeId) {
        let index = self.discovery_time;
        self.discovery_time.increment_by(1);

        self.scc_stack.push(node);

        let successors_start = self.successor_stack.len();

        let frame = DfsFrame {
            node,
            successor_index: successors_start,
        };

        self.successor_stack.extend(self.graph.successors(node));
        let successors_end = self.successor_stack.len();

        self.node_state[node] = NodeState::OnStack {
            index,
            low_link: index,
            successors: successors_start..successors_end,
            annotation: self.annotations.annotate_node(node),
        };

        self.dfs_stack.push(frame);
    }

    fn explore_from(&mut self, start_node: NodeId) {
        debug_assert!(self.dfs_stack.is_empty());

        self.start_exploration(start_node);

        // Iterative DFS
        while let Some(frame) = self.dfs_stack.last_mut() {
            let current_node = frame.node;
            let NodeState::OnStack { successors, .. } = &self.node_state[current_node] else {
                unreachable!("Node state should be Exploring")
            };
            let successors_range = successors.clone();

            // Process next successor
            if frame.successor_index < successors_range.end {
                let successor = self.successor_stack[frame.successor_index];
                frame.successor_index += 1;

                match &self.node_state[successor] {
                    NodeState::Unvisited => {
                        // Visit this successor
                        self.start_exploration(successor);
                    }
                    &NodeState::OnStack {
                        index: succ_index, ..
                    } => {
                        // Back edge to a node on the stack - update low-link
                        self.node_state[current_node].update_low_link(succ_index);
                    }
                    NodeState::InComponent { .. } => {
                        // Cross edge or forward edge - ignore for low-link
                    }
                }
            } else {
                // All successors processed - pop this frame
                self.dfs_stack.pop();

                // Update parent's low-link if there is a parent
                if let Some(parent_frame) = self.dfs_stack.last()
                    && let Some(current_low) = self.node_state[current_node].low_link()
                {
                    self.node_state[parent_frame.node].update_low_link(current_low);
                }

                let NodeState::OnStack {
                    index, low_link, ..
                } = self.node_state[current_node]
                else {
                    unreachable!("NodeState should be Exploring");
                };

                if index == low_link {
                    // SCC is a root
                    self.finalize_scc(current_node);
                }
            }
        }
    }

    fn finalize_scc(&mut self, root: NodeId) {
        // Collect all nodes in this SCC from the stack
        let scc_id = self.data.components.push_with(|id| Scc {
            annotation: self.annotations.annotate_scc(id),
            successors: self.data.successors.len()..self.data.successors.len(),
        });

        loop {
            let node = self.scc_stack.pop().expect("SCC stack should not be empty");
            self.data.nodes[node] = scc_id;

            let NodeState::OnStack {
                annotation,
                successors,
                ..
            } = core::mem::replace(
                &mut self.node_state[node],
                NodeState::InComponent { id: scc_id },
            )
            else {
                unreachable!("nodes inside of the scc stack should be unvisited");
            };

            self.data.components[scc_id]
                .annotation
                .merge_scc(annotation);

            for &successor in &self.successor_stack[successors.clone()] {
                // If not in component, then it's either not yet finalized, or in the same scc
                if let NodeState::InComponent { id: target_scc_id } = self.node_state[successor]
                    && target_scc_id != scc_id
                    && self.deduplicated_successors.insert(target_scc_id)
                {
                    let [scc, target] = self
                        .data
                        .components
                        .get_disjoint_mut([scc_id, target_scc_id])
                        .unwrap_or_else(|_err| {
                            unreachable!("verified previously that this is disjoint")
                        });

                    scc.annotation.merge_reachable(&target.annotation);
                }
            }

            self.successor_stack.truncate(successors.start);

            if node == root {
                break;
            }
        }

        let successor_len = self.data.successors.len();
        self.data
            .successors
            .extend(self.deduplicated_successors.drain());
        self.data.successors[successor_len..].sort_unstable();

        self.data.components[scc_id].successors.end = self.data.successors.len();
    }
}
