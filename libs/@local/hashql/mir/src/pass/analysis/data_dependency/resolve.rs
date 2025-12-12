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

pub(crate) struct ResolutionState<'state, 'env, 'heap, A: Allocator> {
    pub graph: &'env DataDependencyGraph<'heap, A>,
    pub interner: &'env Interner<'heap>,
    pub alloc: A,
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

#[derive(Debug, Clone)]
pub(crate) enum ResolutionResult<'heap, A: Allocator> {
    // We're currently in a recursive resolution, hit a cycle and must backtrack until we're at
    // the place that initiated it
    Backtrack,
    Resolved(Operand<'heap>),
    // If incomplete, then we prepend/append our projections that need to take place
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

fn traverse<'heap, A: Allocator + Clone>(
    mut state: ResolutionState<'_, '_, 'heap, A>,
    PlaceRef {
        local: _,
        projections,
    }: PlaceRef<'_, 'heap>,
    edge: &Edge<EdgeData<'heap>>,
) -> ControlFlow<ResolutionResult<'heap, A>, Local> {
    // We found a matching edge, which means we can continue resolution (using the rest). The
    // important part is:
    // - the edge itself has projections associated with it that must first be resolved.
    let target = PlaceRef {
        local: Local::new(edge.target().as_usize()),
        projections: edge.data.projections.0,
    };

    // We start to resolve the target place recursively, but *without* our state, this is
    // important so that we don't backtrack early if we don't need to.
    let result = resolve(state.cloned(), target);

    match result {
        ResolutionResult::Backtrack => ControlFlow::Break(ResolutionResult::Backtrack),
        ResolutionResult::Incomplete(mut place) => {
            // We weren't able to resolve the place, therefore terminate with our incomplete state.
            place.projections.extend(projections.iter().copied());

            ControlFlow::Break(ResolutionResult::Incomplete(place))
        }
        ResolutionResult::Resolved(Operand::Constant(constant)) => {
            debug_assert!(
                projections.is_empty(),
                "constant can only be propagated in the case that projections are empty"
            );

            ControlFlow::Break(ResolutionResult::Resolved(Operand::Constant(constant)))
        }
        ResolutionResult::Resolved(Operand::Place(place)) if place.projections.is_empty() => {
            // In the case that the place returned as any projections we promote to unresolved,
            // because we cannot continue.
            ControlFlow::Continue(place.local)
        }
        ResolutionResult::Resolved(Operand::Place(place)) => {
            // In the case that the place returned as any projections we promote to unresolved,
            // because we cannot continue.
            let mut dequeue = VecDeque::with_capacity_in(
                projections.len() + place.projections.len(),
                state.alloc,
            );
            dequeue.extend(place.projections);
            dequeue.extend(projections.iter().copied());

            let place = PlaceMut {
                local: place.local,
                projections: dequeue,
            };

            // We cannot continue resolving the place, because it has projections
            ControlFlow::Break(ResolutionResult::Incomplete(place))
        }
    }
}

fn resolve_params<'heap, A: Allocator + Clone>(
    mut state: ResolutionState<'_, '_, 'heap, A>,
    place: PlaceRef<'_, 'heap>,
) -> ControlFlow<ResolutionResult<'heap, A>, Local> {
    // We can **only** check propagation in the case that:
    // A) we have more than 0 edges
    // B) all edges are params
    // C) there is no constant, because otherwise we would know that we're divergent
    let mut edges = state.graph.outgoing_edges(place.local);
    let Some(head) = edges.next() else {
        unreachable!("we just verified there are more than 0");
    };

    if let Some(visited) = &mut state.visited
        && !visited.insert(place.local)
    {
        // We found a cycle, which we must break.
        return ControlFlow::Break(ResolutionResult::Backtrack);
    }

    let mut visited = None;
    let visited_state = state.visited.as_deref_mut().or_else(|| {
        visited = Some(DenseBitSet::new_empty(state.graph.graph.node_count()));
        visited.as_mut()
    });

    let mut rec_state = ResolutionState {
        graph: state.graph,
        interner: state.interner,
        alloc: state.alloc.clone(),
        visited: visited_state,
    };

    let first = traverse(rec_state.cloned(), place, head);

    // We check if there is a consensus amongst all others
    if edges.all(|edge| traverse(rec_state.cloned(), place, edge) == first) {
        if first == ControlFlow::Break(ResolutionResult::Backtrack) && visited.is_some() {
            // We are the initiator of the backtrack (as `visited` is initialized) and therefore the
            // stopping point. If not true we can just propagate the overall result.
        } else {
            if let Some(visited) = state.visited {
                visited.remove(place.local);
            }

            return first;
        }
    }

    if let Some(visited) = &mut state.visited {
        visited.remove(place.local);
    }

    // At least one of the edges is divergent *or* recursion has occurred.
    let mut dequeue = VecDeque::new_in(state.alloc.clone());
    dequeue.extend(place.projections);

    ControlFlow::Break(ResolutionResult::Incomplete(PlaceMut {
        local: place.local,
        projections: dequeue,
    }))
}

pub(crate) fn resolve<'heap, A: Allocator + Clone>(
    mut state: ResolutionState<'_, '_, 'heap, A>,
    mut place: PlaceRef<'_, 'heap>,
) -> ResolutionResult<'heap, A> {
    let mut params = 0_usize;
    let mut load = None;
    for edge in state.graph.outgoing_edges(place.local) {
        match edge.data.kind {
            EdgeKind::Load => load = Some(edge), // Load can only be there alone
            EdgeKind::Param => params += 1,
            EdgeKind::Index(_)
            | EdgeKind::Field(..)
            | EdgeKind::ClosurePtr
            | EdgeKind::ClosureEnv => {}
        }
    }

    if let Some(load) = load {
        // We have a load edge that we need to follow, following it is *very* similar to the
        // existing implementation.
        place.local = tri!(traverse(state.cloned(), place, load));
    }

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
        // There is nothing more to do, we have completed resolution
        [] => {
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

    // Check if we directly point to a constant, in that case we can resolve it immediately
    if rest.is_empty()
        && let Some(constant) = state
            .graph
            .constant_bindings
            .find(place.local, projection.kind)
    {
        return ResolutionResult::Resolved(Operand::Constant(constant));
    }

    let Some(edge) = state
        .graph
        .outgoing_edges(place.local)
        .find(|edge| edge.data.kind.matches_projection(projection.kind))
    else {
        let mut dequeue = VecDeque::new_in(state.alloc.clone());
        dequeue.extend(place.projections);

        // We weren't able to find a matching edge, therefore we're unable to resolve this place
        // until the finishing line.
        let place = PlaceMut {
            local: place.local,
            projections: dequeue,
        };

        return ResolutionResult::Incomplete(place);
    };

    // We start to resolve the target place recursively, but *without* our state, this is
    // important so that we don't backtrack early if we don't need to.
    let target = traverse(
        state.cloned().without_visited(),
        PlaceRef {
            local: place.local,
            projections: rest,
        },
        edge,
    );

    // Given the new target, we can continue with the resolution
    resolve(
        state,
        PlaceRef {
            local: tri!(target),
            projections: rest,
        },
    )
}
