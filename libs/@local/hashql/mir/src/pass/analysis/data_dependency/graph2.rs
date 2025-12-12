// When we try to resolve, there are the following cases:
// - We're inside of something that can be recursive, and recursion has happened, in which case we
//   backtrack
// - We initiate a recursive resolution, which may fail or not
// - We're resolving, but resolution has stopped, because it is incomplete, this happens when we get
//   a `Place` with projections back.
// - We're resolving, but resolution can continue, in that case the projections that we're carrying
//   must be empty, as otherwise we cannot continue

use std::{
    alloc::{Allocator, Global},
    collections::VecDeque,
};

use hashql_core::{
    graph::{LinkedGraph, NodeId, linked::IncidentEdges},
    id::{Id, bit_vec::DenseBitSet},
};

use super::{
    ConstantBinding,
    graph::{Edge, EdgeKind},
};
use crate::{
    body::{
        constant::Constant,
        local::{Local, LocalVec},
        operand::Operand,
        place::{Place, PlaceMut, PlaceRef, ProjectionKind},
    },
    intern::Interner,
};

#[derive(Debug)]
struct ConstantBindings<'heap, A: Allocator = Global> {
    inner: LocalVec<Vec<ConstantBinding<'heap>, A>, A>,
}

impl<'heap, A: Allocator> ConstantBindings<'heap, A> {
    fn find(&self, local: Local, projection: ProjectionKind<'heap>) -> Option<Constant<'heap>> {
        self.inner[local]
            .iter()
            .find(|binding| binding.kind.matches_projection(projection))
            .map(|binding| binding.constant)
    }
}

#[derive(Debug)]
struct DataDependencyGraph<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
    constant_bindings: ConstantBindings<'heap, A>,
}

impl<'heap, A: Allocator> DataDependencyGraph<'heap, A> {
    fn outgoing_edges<'this>(
        &'this self,
        local: Local,
    ) -> IncidentEdges<'this, Local, Edge<'heap>, A> {
        let node_id = NodeId::new(local.as_usize());

        self.graph.outgoing_edges(node_id)
    }
}

struct ResolutionState<'env, 'heap, A: Allocator> {
    graph: &'env DataDependencyGraph<'heap, A>,
    interner: &'env Interner<'heap>,
    alloc: A,
    visited: Option<DenseBitSet<Local>>,
}

impl<'env, 'heap, A: Allocator> ResolutionState<'env, 'heap, A> {}

enum ResolutionResult<'heap, A: Allocator> {
    // We're currently in a recursive resolution, hit a cycle and must backtrack until we're at
    // the place that initiated it
    Backtrack,
    Resolved(Operand<'heap>),
    // If incomplete, then we prepend/append our projections that need to take place
    Incomplete(PlaceMut<'heap, A>),
}

fn resolve<'heap, A: Allocator + Clone>(
    ResolutionState {
        graph,
        interner,
        alloc,
        visited,
    }: ResolutionState<'_, 'heap, A>,
    place: PlaceRef<'_, 'heap>,
) -> ResolutionResult<'heap, A> {
    // The first implementation is without follow semantics (for now)
    let PlaceRef { local, projections } = place;

    let mut edges = 0_usize;
    let mut params = 0_usize;
    let mut loads = 0_usize;
    for edge in graph.outgoing_edges(place.local) {
        edges += 1;

        match edge.data.kind {
            // load can only be there alone
            EdgeKind::Load => loads += 1,
            EdgeKind::Param => params += 1,
            _ => {}
        }
    }

    let (projection, rest) = match projections {
        // There is nothing more to do, we have completed resolution
        [] => {
            return ResolutionResult::Resolved(Operand::Place(Place::local(local, interner)));
        }
        [projection, rest @ ..] => (projection, rest),
    };

    // Check if we point to a constant, in that case we can resolve it immediately
    if rest.is_empty()
        && let Some(constant) = graph.constant_bindings.find(local, projection.kind)
    {
        return ResolutionResult::Resolved(Operand::Constant(constant));
    }

    let Some(edge) = graph
        .outgoing_edges(place.local)
        .find(|edge| edge.data.kind.matches_projection(projection.kind))
    else {
        let mut dequeue = VecDeque::new_in(alloc.clone());
        dequeue.extend(projections);

        // We weren't able to find a matching edge, therefore we're unable to resolve this place
        // until the finishing line.
        let place = PlaceMut {
            local,
            projections: dequeue,
        };

        return ResolutionResult::Incomplete(place);
    };

    // We found a matching edge, which means we can continue resolution (using the rest). The
    // important part is:
    // - the edge itself has projections associated with it that must first be resolved.
    let target = PlaceRef {
        local: Local::new(edge.target().as_usize()),
        projections: edge.data.projections.0,
    };

    // We start to resolve the target place recursively, but *without* our state, this is
    // important so that we don't backtrack early if we don't need to.
    let result = resolve(
        ResolutionState {
            graph,
            interner,
            alloc: alloc.clone(),
            visited: None,
        },
        target,
    );

    // TODO: reconcile
    let target = match result {
        ResolutionResult::Backtrack => {
            unreachable!("state is only valid in case we initiated backtracking, which we didn't.")
        }
        ResolutionResult::Incomplete(mut place) => {
            // We weren't able to resolve the place, therefore terminate with our incomplete state
            place.projections.extend_front(projections.iter().copied());
            return ResolutionResult::Incomplete(place);
        }
        ResolutionResult::Resolved(Operand::Constant(_)) => {
            unreachable!("type-check makes it so that we wouldn't traverse into a constant")
        }
        ResolutionResult::Resolved(Operand::Place(place)) if place.projections.is_empty() => {
            // In the case that the place returned as any projections we promote to unresolved,
            // because we cannot continue.
            place.local
        }
        ResolutionResult::Resolved(Operand::Place(place)) => {
            // In the case that the place returned as any projections we promote to unresolved,
            // because we cannot continue.
            let mut dequeue =
                VecDeque::with_capacity_in(projections.len() + place.projections.len(), alloc);
            dequeue.extend(projections);
            dequeue.extend(place.projections);

            let place = PlaceMut {
                local: place.local,
                projections: dequeue,
            };

            // We cannot continue resolving the place, because it has projections
            return ResolutionResult::Incomplete(place);
        }
    };

    // Given the new target, we can continue with the resolution
    return resolve(
        ResolutionState {
            graph,
            interner,
            alloc,
            visited,
        },
        PlaceRef {
            local: target,
            projections: rest,
        },
    );
}
