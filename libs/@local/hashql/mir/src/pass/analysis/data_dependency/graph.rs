use alloc::alloc::Global;
use core::{alloc::Allocator, fmt};

use hashql_core::{
    graph::{LinkedGraph, NodeId, Predecessors as _, Successors as _, linked::IncidentEdges},
    id::Id as _,
    intern::Interned,
    symbol::Symbol,
};

use super::resolve::{ResolutionResult, ResolutionState};
use crate::{
    body::{
        constant::Constant,
        local::{Local, LocalSlice, LocalVec},
        operand::Operand,
        place::{FieldIndex, Place, PlaceMut, PlaceRef, Projection, ProjectionKind},
    },
    intern::Interner,
};

/// Describes which component of a structured value an edge represents.
///
/// Every dependency edge has an [`EdgeKind`] identifying its structural role. This enables
/// [`DataDependencyGraph::resolve`] to trace projections through aggregate constructions
/// and find the original source of a field access.
///
/// Only *structural* edges are tracked — those that can be resolved through via projections.
/// Non-structural dependencies (binary operands, function arguments, etc.) are not tracked
/// in the graph since they cannot be projected into and are better handled by inspecting
/// the [`RValue`] directly or using dataflow analysis.
///
/// [`RValue`]: crate::body::rvalue::RValue
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EdgeKind<'heap> {
    /// A load operation that copies the entire value.
    ///
    /// Used for [`RValue::Load`](crate::body::rvalue::RValue::Load), where the complete value
    /// flows from source to destination.
    /// This is the only edge kind that [`DataDependencyGraph::resolve`] follows transitively,
    /// because a load always has exactly one source.
    Load,

    /// A block parameter receiving a value from a predecessor.
    ///
    /// Unlike other edge kinds, a block parameter may have multiple incoming edges (one per
    /// predecessor). Resolution through `Param` edges requires all predecessors to agree
    /// on the same source value.
    Param,

    /// A positional component in a tuple aggregate.
    ///
    /// The [`FieldIndex`] corresponds to the tuple position (0, 1, 2, ...).
    Index(FieldIndex),

    /// A named field in a struct aggregate.
    ///
    /// Stores both the positional index and the field name for matching against both
    /// [`ProjectionKind::Field`] and [`ProjectionKind::FieldByName`].
    Field(FieldIndex, Symbol<'heap>),

    /// The function pointer component of a closure (index 0).
    ClosurePtr,

    /// The captured environment component of a closure (index 1).
    ClosureEnv,
}

impl<'heap> EdgeKind<'heap> {
    fn matches_projection_field_index(&self, index: FieldIndex) -> bool {
        let expected = match self {
            &EdgeKind::Field(field_index, _) | &EdgeKind::Index(field_index) => field_index,
            EdgeKind::ClosurePtr => FieldIndex::new(0),
            EdgeKind::ClosureEnv => FieldIndex::new(1),
            EdgeKind::Load | EdgeKind::Param => return false,
        };

        index == expected
    }

    fn matches_projection_field_name(&self, name: Symbol<'heap>) -> bool {
        match self {
            &EdgeKind::Field(_, field_name) => field_name == name,
            EdgeKind::Load
            | EdgeKind::Param
            | EdgeKind::Index(_)
            | EdgeKind::ClosurePtr
            | EdgeKind::ClosureEnv => false,
        }
    }

    pub(crate) fn matches_projection(&self, projection: ProjectionKind<'heap>) -> bool {
        match projection {
            ProjectionKind::Field(index) => self.matches_projection_field_index(index),
            ProjectionKind::FieldByName(name) => self.matches_projection_field_name(name),
            ProjectionKind::Index(_) => false,
        }
    }
}

/// An edge in the data dependency graph.
///
/// Each edge connects a local (the dependent) to another local (the dependency) and carries
/// metadata about which component is being accessed and any remaining projections.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct EdgeData<'heap> {
    /// Which structural component this edge represents.
    ///
    /// Identifies the edge's role in aggregate construction, enabling resolution
    /// to trace projections back to their source.
    pub kind: EdgeKind<'heap>,

    /// The projection path from the dependency local to the actual accessed value.
    ///
    /// For a place like `_1.field.0`, the edge target is `_1` and projections contains
    /// `[.field, .0]`.
    pub projections: Interned<'heap, [Projection<'heap>]>,
}

/// A single constant value bound to a local via a specific edge kind.
#[derive(Debug, Clone)]
struct ConstantBinding<'heap> {
    kind: EdgeKind<'heap>,
    constant: Constant<'heap>,
}

/// Tracks constant values that flow into locals through structural edges.
///
/// When an aggregate is constructed with constant operands, those constants are recorded
/// here indexed by the local and [`EdgeKind`]. This allows for constant propagation through
/// projections.
#[derive(Debug, Clone)]
pub(crate) struct ConstantBindings<'heap, A: Allocator = Global> {
    inner: LocalVec<Vec<ConstantBinding<'heap>, A>, A>,
}

impl<'heap, A: Allocator> ConstantBindings<'heap, A> {
    pub(crate) fn insert(
        &mut self,
        local: Local,
        edge: EdgeKind<'heap>,
        constant: Constant<'heap>,
    ) {
        self.inner[local].push(ConstantBinding {
            kind: edge,
            constant,
        });
    }

    pub(crate) const fn empty_in(alloc: A) -> Self {
        Self {
            inner: LocalVec::new_in(alloc),
        }
    }

    pub(crate) fn from_domain_in(local_decls: &LocalSlice<impl Sized>, alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            inner: LocalVec::from_domain_in(Vec::new_in(alloc.clone()), local_decls, alloc),
        }
    }

    pub(crate) fn find(
        &self,
        local: Local,
        projection: ProjectionKind<'heap>,
    ) -> Option<Constant<'heap>> {
        self.inner[local]
            .iter()
            .find(|binding| binding.kind.matches_projection(projection))
            .map(|binding| binding.constant)
    }

    pub(crate) fn find_by_kind(
        &self,
        local: Local,
        kind: EdgeKind<'heap>,
    ) -> Option<Constant<'heap>> {
        self.inner[local]
            .iter()
            .find(|binding| binding.kind == kind)
            .map(|binding| binding.constant)
    }

    pub(crate) fn iter_by_kind(
        &self,
        local: Local,
        kind: EdgeKind<'heap>,
    ) -> impl Iterator<Item = Constant<'heap>> {
        self.inner[local]
            .iter()
            .filter(move |binding| binding.kind == kind)
            .map(|binding| binding.constant)
    }
}

/// A data dependency graph with resolved transitive dependencies.
///
/// Created by [`DataDependencyGraph::transient`], this graph has edges that point directly to
/// the ultimate source locals rather than intermediate aggregates. This is useful for analyses
/// that need to know the true origin of data without manually traversing through tuple/struct
/// constructions.
pub struct TransientDataDependencyGraph<'heap, A: Allocator = Global> {
    graph: DataDependencyGraph<'heap, A>,
}

impl<'heap, A: Allocator> TransientDataDependencyGraph<'heap, A> {
    /// Resolves a place to its source operand.
    ///
    /// See [`DataDependencyGraph::resolve`] for details on the resolution algorithm.
    pub fn resolve(&self, interner: &Interner<'heap>, place: PlaceRef<'_, 'heap>) -> Operand<'heap>
    where
        A: Clone,
    {
        self.graph.resolve(interner, place)
    }

    pub fn depends_on(&self, local: Local) -> impl Iterator<Item = Local> {
        self.graph.depends_on(local)
    }

    pub fn dependent_on(&self, local: Local) -> impl Iterator<Item = Local> {
        self.graph.dependent_on(local)
    }
}

impl<A: Allocator> fmt::Display for TransientDataDependencyGraph<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.graph, fmt)
    }
}

#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "required in resolve"
)]
#[derive(Debug)]
pub struct DataDependencyGraph<'heap, A: Allocator = Global> {
    alloc: A,
    pub(super) graph: LinkedGraph<Local, EdgeData<'heap>, A>,
    pub(super) constant_bindings: ConstantBindings<'heap, A>,
}

impl<'heap, A: Allocator> DataDependencyGraph<'heap, A> {
    pub fn depends_on(&self, local: Local) -> impl Iterator<Item = Local> {
        self.graph
            .successors(NodeId::from_usize(local.as_usize()))
            .map(|node| Local::from_usize(node.as_usize()))
    }

    pub fn dependent_on(&self, local: Local) -> impl Iterator<Item = Local> {
        self.graph
            .predecessors(NodeId::from_usize(local.as_usize()))
            .map(|node| Local::from_usize(node.as_usize()))
    }

    /// Creates a transient graph with all edges resolved to their ultimate sources.
    ///
    /// Each edge in the original graph is traced through [`resolve`](Self::resolve), producing
    /// a new graph where edges point directly to canonical source locals. Constants discovered
    /// during resolution are recorded as constant bindings rather than edges.
    ///
    /// This is useful for analyses that need direct access to data origins without manually
    /// traversing intermediate aggregates.
    pub fn transient(&self, interner: &Interner<'heap>) -> TransientDataDependencyGraph<'heap, A>
    where
        A: Clone,
    {
        let mut graph = LinkedGraph::new_in(self.alloc.clone());
        graph.derive(&self.constant_bindings.inner, |local, _| local);

        // Clone bindings since we only add to them during transient construction.
        let mut constant_bindings = self.constant_bindings.clone();

        // Resolve each edge and add to the new graph or constant bindings.
        for edge in self.graph.edges() {
            let place = PlaceRef {
                local: Local::from_usize(edge.target().as_usize()),
                projections: &edge.data.projections,
            };

            match self.resolve(interner, place) {
                Operand::Place(resolved) => {
                    graph.add_edge(
                        edge.source(),
                        NodeId::from_usize(resolved.local.as_usize()),
                        EdgeData {
                            kind: edge.data.kind,
                            projections: resolved.projections,
                        },
                    );
                }
                Operand::Constant(constant) => {
                    constant_bindings.insert(
                        Local::from_usize(edge.source().as_usize()),
                        edge.data.kind,
                        constant,
                    );
                }
            }
        }

        TransientDataDependencyGraph {
            graph: DataDependencyGraph {
                alloc: self.alloc.clone(),
                graph,
                constant_bindings,
            },
        }
    }

    /// Resolves a place to its ultimate source operand.
    ///
    /// Traces the place through the dependency graph, following `Load` edges transitively
    /// and `Param` edges when all predecessors are in consensus. Returns either the resolved
    /// [`Place`] (possibly with remaining projections) or a propagated [`Constant`].
    ///
    /// [`Place`]: crate::body::place::Place
    /// [`Constant`]: crate::body::constant::Constant
    pub fn resolve(&self, interner: &Interner<'heap>, place: PlaceRef<'_, 'heap>) -> Operand<'heap>
    where
        A: Clone,
    {
        let result = super::resolve::resolve(
            ResolutionState {
                graph: self,
                interner,
                alloc: self.alloc.clone(),
                visited: None,
            },
            place,
        );

        match result {
            ResolutionResult::Backtrack => {
                unreachable!("Backtrack returned at top level; cycle detection should be internal")
            }
            ResolutionResult::Resolved(operand) => operand,
            ResolutionResult::Incomplete(PlaceMut {
                local,
                mut projections,
            }) => {
                // Materialize a Place with the remaining unresolved projections.
                Operand::Place(Place {
                    local,
                    projections: interner
                        .projections
                        .intern_slice(projections.make_contiguous()),
                })
            }
        }
    }

    pub(crate) const fn new(
        alloc: A,
        graph: LinkedGraph<Local, EdgeData<'heap>, A>,
        constant_bindings: ConstantBindings<'heap, A>,
    ) -> Self {
        Self {
            alloc,
            graph,
            constant_bindings,
        }
    }

    pub(crate) fn outgoing_edges<'this>(
        &'this self,
        local: Local,
    ) -> IncidentEdges<'this, Local, EdgeData<'heap>, A> {
        let node_id = NodeId::from_usize(local.as_usize());

        self.graph.outgoing_edges(node_id)
    }
}

impl<A: Allocator> fmt::Display for DataDependencyGraph<'_, A> {
    #[expect(clippy::use_debug)]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for edge in self.graph.edges() {
            let source = edge.source();
            let target = edge.target();
            let EdgeData { kind, projections } = &edge.data;

            write!(fmt, "%{source} -> %{target} [{kind:?}")?;
            if !projections.is_empty() {
                write!(fmt, ", projections: ")?;
            }
            for projection in projections {
                write!(fmt, "{}", projection.kind)?;
            }
            writeln!(fmt, "]")?;
        }

        for (local, bindings) in self.constant_bindings.inner.iter_enumerated() {
            for ConstantBinding { kind, constant } in bindings {
                writeln!(fmt, "{local} -> {constant} [{kind:?}]")?;
            }
        }

        Ok(())
    }
}
