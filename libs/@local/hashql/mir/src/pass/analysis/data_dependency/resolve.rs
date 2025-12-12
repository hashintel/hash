use alloc::collections::VecDeque;
use core::{
    alloc::Allocator,
    hash::{Hash, Hasher},
    ops::ControlFlow,
};

use hashql_core::{
    graph::{DirectedGraph as _, linked::Edge},
    id::{Id as _, bit_vec::DenseBitSet},
};

use super::graph::{DataDependencyGraph, EdgeData};
use crate::{
    body::{
        local::Local,
        operand::Operand,
        place::{Place, PlaceMut, PlaceRef},
    },
    intern::Interner,
    pass::analysis::data_dependency::graph::EdgeKind,
};

/// State threaded through the recursive resolution algorithm.
pub(crate) struct ResolutionState<'state, 'env, 'heap, A: Allocator> {
    pub graph: &'env DataDependencyGraph<'heap, A>,
    pub interner: &'env Interner<'heap>,
    pub alloc: A,

    /// Tracks locals currently being resolved through [`Param`] edges to detect cycles.
    ///
    /// Only populated during [`Param`] traversal, since those are the only edges that can
    /// form cycles (a block parameter can receive values from multiple predecessors,
    /// including back-edges in loops).
    ///
    /// [`Param`]: EdgeKind::Param
    pub visited: Option<&'state mut DenseBitSet<Local>>,
}

impl<'env, 'heap, A: Allocator> ResolutionState<'_, 'env, 'heap, A> {
    fn cloned(&mut self) -> ResolutionState<'_, 'env, 'heap, A>
    where
        A: Clone,
    {
        ResolutionState {
            graph: self.graph,
            interner: self.interner,
            alloc: self.alloc.clone(),
            visited: self.visited.as_deref_mut(),
        }
    }

    fn without_visited<'state>(self) -> ResolutionState<'state, 'env, 'heap, A> {
        ResolutionState {
            graph: self.graph,
            interner: self.interner,
            alloc: self.alloc,
            visited: None,
        }
    }
}

macro_rules! tri {
    ($expr:expr) => {
        match $expr {
            ControlFlow::Continue(value) => value,
            ControlFlow::Break(value) => return value,
        }
    };
}

/// Result of resolving a place through the dependency graph.
#[derive(Debug, Clone)]
pub(crate) enum ResolutionResult<'heap, A: Allocator> {
    /// A cycle was detected during [`Param`] edge traversal.
    ///
    /// The resolution algorithm should unwind back to the local that initiated the cycle
    /// (the "cycle root"), which will then treat the result as [`Incomplete`].
    ///
    /// [`Param`]: EdgeKind::Param
    /// [`Incomplete`]: Self::Incomplete
    Backtrack,

    /// Resolution succeeded completely.
    ///
    /// Contains either a [`Place`] with no remaining projections, or a [`Constant`]
    /// discovered through constant propagation.
    ///
    /// [`Place`]: crate::body::place::Place
    /// [`Constant`]: crate::body::constant::Constant
    Resolved(Operand<'heap>),

    /// Resolution stopped before reaching a terminal node.
    ///
    /// This occurs when:
    /// - The source is opaque (e.g., function return value with no structural edges)
    /// - [`Param`] predecessors disagree on the source
    /// - A cycle was detected and we are the cycle root
    ///
    /// The [`PlaceMut`] contains the furthest-resolved local and any remaining projections.
    ///
    /// [`Param`]: EdgeKind::Param
    Incomplete(PlaceMut<'heap, A>),
}

impl<A: Allocator> PartialEq for ResolutionResult<'_, A> {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Resolved(l0), Self::Resolved(r0)) => l0 == r0,
            (Self::Incomplete(l0), Self::Incomplete(r0)) => l0 == r0,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

impl<A: Allocator> Eq for ResolutionResult<'_, A> {}

impl<A: Allocator> Hash for ResolutionResult<'_, A> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        core::mem::discriminant(self).hash(state);

        match self {
            Self::Backtrack => {}
            Self::Resolved(op) => op.hash(state),
            Self::Incomplete(place) => place.hash(state),
        }
    }
}

/// Follows an edge and resolves its target place.
///
/// The edge's target local may have its own projections (stored in `edge.data.projections`).
/// This function resolves those projections first, then appends any remaining `projections`
/// from the caller's place.
///
/// # Returns
///
/// - `Continue(local)` if the target resolved to a bare local (no projections remaining)
/// - `Break(result)` if resolution completed, failed, or requires backtracking
fn traverse<'heap, A: Allocator + Clone>(
    mut state: ResolutionState<'_, '_, 'heap, A>,
    PlaceRef {
        local: _,
        projections,
    }: PlaceRef<'_, 'heap>,
    edge: &Edge<EdgeData<'heap>>,
) -> ControlFlow<ResolutionResult<'heap, A>, Local> {
    // The edge's target may itself have projections that must be resolved first.
    let target = PlaceRef {
        local: Local::new(edge.target().as_usize()),
        projections: edge.data.projections.0,
    };

    let result = resolve(state.cloned(), target);

    match result {
        ResolutionResult::Backtrack => ControlFlow::Break(ResolutionResult::Backtrack),
        ResolutionResult::Incomplete(mut place) => {
            // Append remaining projections and propagate the incomplete result.
            place.projections.extend(projections.iter().copied());

            ControlFlow::Break(ResolutionResult::Incomplete(place))
        }
        ResolutionResult::Resolved(Operand::Constant(constant)) => {
            debug_assert!(
                projections.is_empty(),
                "cannot project into a constant; remaining projections should be empty"
            );

            ControlFlow::Break(ResolutionResult::Resolved(Operand::Constant(constant)))
        }
        ResolutionResult::Resolved(Operand::Place(place)) if place.projections.is_empty() => {
            // Fully resolved to a local with no projections; continue resolution.
            ControlFlow::Continue(place.local)
        }
        ResolutionResult::Resolved(Operand::Place(place)) => {
            // Resolved to a place with projections we cannot traverse; mark as incomplete.
            let mut combined = VecDeque::with_capacity_in(
                place.projections.len() + projections.len(),
                state.alloc,
            );
            combined.extend(place.projections);
            combined.extend(projections.iter().copied());

            ControlFlow::Break(ResolutionResult::Incomplete(PlaceMut {
                local: place.local,
                projections: combined,
            }))
        }
    }
}

/// Attempts to resolve a block parameter by checking all predecessor edges.
///
/// A block parameter may receive values from multiple predecessor blocks. This function
/// traverses all [`Param`] edges and checks whether they resolve to the same source.
/// If all predecessors agree, resolution continues through that common source.
///
/// Handles cycle detection: if we encounter a local already in the `visited` set,
/// we return [`Backtrack`] to unwind. The cycle root (where `visited` was first
/// initialized) catches the backtrack and returns [`Incomplete`].
///
/// [`Param`]: EdgeKind::Param
/// [`Backtrack`]: ResolutionResult::Backtrack
/// [`Incomplete`]: ResolutionResult::Incomplete
fn resolve_params<'heap, A: Allocator + Clone>(
    mut state: ResolutionState<'_, '_, 'heap, A>,
    place: PlaceRef<'_, 'heap>,
) -> ControlFlow<ResolutionResult<'heap, A>, Local> {
    let mut edges = state.graph.outgoing_edges(place.local);
    let Some(head) = edges.next() else {
        unreachable!("caller must guarantee that at least one Param edge exists")
    };

    // Cycle detection: if we've already visited this local, backtrack.
    if let Some(visited) = &mut state.visited
        && !visited.insert(place.local)
    {
        return ControlFlow::Break(ResolutionResult::Backtrack);
    }

    // Initialize cycle tracking if this is the first Param traversal.
    let mut owned_visited = None;
    let visited_ref = state.visited.as_deref_mut().or_else(|| {
        owned_visited = Some(DenseBitSet::new_empty(state.graph.graph.node_count()));
        owned_visited.as_mut()
    });

    let mut rec_state = ResolutionState {
        graph: state.graph,
        interner: state.interner,
        alloc: state.alloc.clone(),
        visited: visited_ref,
    };

    let first = traverse(rec_state.cloned(), place, head);

    // Check consensus: all predecessors must resolve to the same result.
    let all_agree = edges.all(|edge| traverse(rec_state.cloned(), place, edge) == first);

    if all_agree {
        // If we initiated backtracking (owned_visited is Some) and got Backtrack,
        // we are the cycle root and should treat this as incomplete.
        let is_cycle_root =
            first == ControlFlow::Break(ResolutionResult::Backtrack) && owned_visited.is_some();

        if !is_cycle_root {
            // Clean up visited state before returning.
            if let Some(visited) = state.visited {
                visited.remove(place.local);
            }

            return first;
        }
    }

    // Clean up visited state before returning incomplete.
    if let Some(visited) = &mut state.visited {
        visited.remove(place.local);
    }

    // Predecessors diverge or a cycle was detected; cannot resolve through this param.
    let mut projections = VecDeque::new_in(state.alloc.clone());
    projections.extend(place.projections);

    ControlFlow::Break(ResolutionResult::Incomplete(PlaceMut {
        local: place.local,
        projections,
    }))
}

/// Resolves a place to its ultimate data source by traversing the dependency graph.
///
/// Starting from `place`, this function follows edges in the dependency graph to find where
/// the data ultimately originates. The algorithm handles three types of edges:
///
/// - **[`Load`]**: Always followed transitively (a load has exactly one source)
/// - **[`Param`]**: Followed only if all predecessors agree on the same source (consensus)
/// - **[`Index`]/[`Field`]**: Matched against projections to trace through aggregates
///
/// Resolution terminates with:
/// - [`Resolved`] when the source is found (either a [`Place`] or propagated [`Constant`])
/// - [`Incomplete`] when resolution cannot continue (opaque source, divergent params, or remaining
///   projections that don't match any edge)
/// - [`Backtrack`] when a cycle is detected (only during [`Param`] traversal)
///
/// [`Load`]: EdgeKind::Load
/// [`Param`]: EdgeKind::Param
/// [`Index`]: EdgeKind::Index
/// [`Field`]: EdgeKind::Field
/// [`Resolved`]: ResolutionResult::Resolved
/// [`Incomplete`]: ResolutionResult::Incomplete
/// [`Backtrack`]: ResolutionResult::Backtrack
/// [`Place`]: crate::body::place::Place
/// [`Constant`]: crate::body::constant::Constant
pub(crate) fn resolve<'heap, A: Allocator + Clone>(
    mut state: ResolutionState<'_, '_, 'heap, A>,
    mut place: PlaceRef<'_, 'heap>,
) -> ResolutionResult<'heap, A> {
    // Scan outgoing edges to find Load and count Param edges.
    let mut params = 0_usize;
    let mut load_edge = None;
    for edge in state.graph.outgoing_edges(place.local) {
        match edge.data.kind {
            EdgeKind::Load => load_edge = Some(edge),
            EdgeKind::Param => params += 1,
            EdgeKind::Index(_)
            | EdgeKind::Field(..)
            | EdgeKind::ClosurePtr
            | EdgeKind::ClosureEnv => {}
        }
    }

    // Follow Load edges transitively (loads have exactly one source).
    if let Some(load) = load_edge {
        place.local = tri!(traverse(state.cloned(), place, load));
    }

    // Attempt to resolve through Param edges if all predecessors agree.
    // Skip if a constant binding exists (divergent by definition).
    if params > 0
        && state
            .graph
            .constant_bindings
            .find_by_kind(place.local, EdgeKind::Param)
            .is_none()
    {
        place.local = tri!(resolve_params(state.cloned(), place));
    }

    let (projection, rest) = match place.projections {
        [] => {
            // Base case: no more projections to resolve.
            // Check for constant propagation through Load.
            let operand = if let Some(constant) = state
                .graph
                .constant_bindings
                .find_by_kind(place.local, EdgeKind::Load)
            {
                Operand::Constant(constant)
            } else {
                Operand::Place(Place::local(place.local, state.interner))
            };

            return ResolutionResult::Resolved(operand);
        }
        [projection, rest @ ..] => (projection, rest),
    };

    // Check for constant binding matching the current projection.
    if rest.is_empty()
        && let Some(constant) = state
            .graph
            .constant_bindings
            .find(place.local, projection.kind)
    {
        return ResolutionResult::Resolved(Operand::Constant(constant));
    }

    // Find an edge matching the current projection.
    let Some(edge) = state
        .graph
        .outgoing_edges(place.local)
        .find(|edge| edge.data.kind.matches_projection(projection.kind))
    else {
        // No matching edge found; this is an opaque source (e.g., function return).
        let mut projections = VecDeque::new_in(state.alloc.clone());
        projections.extend(place.projections);

        return ResolutionResult::Incomplete(PlaceMut {
            local: place.local,
            projections,
        });
    };

    let target = traverse(
        state.cloned().without_visited(),
        PlaceRef {
            local: place.local,
            projections: rest,
        },
        edge,
    );

    resolve(
        state,
        PlaceRef {
            local: tri!(target),
            projections: rest,
        },
    )
}
