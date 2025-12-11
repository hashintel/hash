//! Data dependency analysis for MIR.
//!
//! This module provides [`DataDependencyAnalysis`], a pass that constructs a graph representing
//! structural data dependencies between locals in the MIR. The resulting [`DataDependencyGraph`]
//! can be used to trace which locals a given place ultimately depends on via projections.
//!
//! # Graph Structure
//!
//! The dependency graph uses locals as nodes and tracks structural dependencies as directed edges.
//! An edge from local `A` to local `B` means "A structurally depends on B" (i.e., A was
//! constructed from B in a way that can be resolved through field projections).
//!
//! For example, given the statement `_3 = (_1.field, _2)`:
//! - An edge `_3 → _1` is created with kind [`EdgeKind::Index(0)`] and the `.field` projection
//! - An edge `_3 → _2` is created with kind [`EdgeKind::Index(1)`]
//!
//! # Field Sensitivity
//!
//! The analysis is field-sensitive for structured types. When a tuple or struct is constructed,
//! each component is tracked separately via [`EdgeKind`] annotations on edges. This enables
//! [`DataDependencyGraph::resolve`] to trace through projections and find the original source
//! of a specific field access.
//!
//! # Structural vs Non-Structural Dependencies
//!
//! Only *structural* dependencies are tracked — those that can be resolved through via
//! projections (tuples, structs, closures, loads). Non-structural dependencies (binary
//! operations, function calls, etc.) are not tracked since they cannot be projected into.
//! Use dataflow analysis or inspect the [`RValue`] directly for those cases.
//!
//! # Requirements
//!
//! This analysis requires the MIR to be in SSA form. Assignments must target locals directly
//! without projections (i.e., `_1 = ...` is valid, but `_1.field = ...` is not).
//!
//! [`EdgeKind::Index(0)`]: graph::EdgeKind::Index
//! [`EdgeKind::Index(1)`]: graph::EdgeKind::Index
mod graph;
#[cfg(test)]
mod tests;

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    fmt,
    ops::{Index, IndexMut},
};

use hashql_core::{
    graph::{LinkedGraph, NodeId},
    id::Id as _,
};

use self::graph::{Edge, EdgeKind, resolve, write_graph};
use crate::{
    body::{
        Body,
        constant::Constant,
        local::{Local, LocalSlice, LocalVec},
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place},
        rvalue::{Aggregate, AggregateKind, RValue},
        statement::Assign,
        terminator::Target,
    },
    context::MirContext,
    intern::Interner,
    pass::AnalysisPass,
    visit::Visitor,
};

/// A data dependency graph with resolved transitive dependencies.
///
/// Created by [`DataDependencyGraph::transient`], this graph has edges that point directly to
/// the ultimate source locals rather than intermediate aggregates. This is useful for analyses
/// that need to know the true origin of data without manually traversing through tuple/struct
/// constructions.
pub struct TransientDataDependencyGraph<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<A: Allocator> fmt::Display for TransientDataDependencyGraph<'_, A> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_graph(&self.graph, f)
    }
}

#[derive(Debug, Clone)]
struct ConstantBinding<'heap> {
    kind: EdgeKind<'heap>,
    constant: Constant<'heap>,
}

/// Maps each local to its constant bindings.
///
/// A constant binding records when a structural position (identified by [`EdgeKind`]) contains
/// a constant value rather than a reference to another local. This enables resolution to
/// return constants when tracing through aggregate constructions.
#[derive(Debug)]
struct ConstantBindings<'heap, A: Allocator = Global> {
    inner: LocalVec<Vec<ConstantBinding<'heap>, A>, A>,
}

impl<A: Allocator + Clone> ConstantBindings<'_, A> {
    const fn empty_in(alloc: A) -> Self {
        Self {
            inner: LocalVec::new_in(alloc),
        }
    }

    fn from_domain_in(local_decls: &LocalSlice<impl Sized>, alloc: A) -> Self {
        Self {
            inner: LocalVec::from_domain_in(Vec::new_in(alloc.clone()), local_decls, alloc),
        }
    }
}

impl<'heap, A: Allocator> Index<Local> for ConstantBindings<'heap, A> {
    type Output = Vec<ConstantBinding<'heap>, A>;

    fn index(&self, index: Local) -> &Self::Output {
        &self.inner[index]
    }
}

impl<A: Allocator> IndexMut<Local> for ConstantBindings<'_, A> {
    fn index_mut(&mut self, index: Local) -> &mut Self::Output {
        &mut self.inner[index]
    }
}

/// A graph representing data dependencies between locals in MIR.
///
/// Nodes are [`Local`]s and edges represent "depends on" relationships. Following outgoing edges
/// from a local reveals what data it was constructed from.
///
/// # Edge Direction
///
/// Edges point from dependent to dependency: if local `_3` is assigned from `_1` and `_2`,
/// there will be edges `_3 → _1` and `_3 → _2`.
///
/// # Usage
///
/// Use [`resolve`](Self::resolve) to trace a [`Place`] through the dependency graph and find
/// the local that ultimately provides its value.
#[derive(Debug)]
pub struct DataDependencyGraph<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
    constant_bindings: ConstantBindings<'heap, A>,
}

impl<'heap, A: Allocator> DataDependencyGraph<'heap, A> {
    pub fn resolve(&self, interner: &Interner<'heap>, place: Place<'heap>) -> Place<'heap> {
        let (traveled, local) = resolve(&self.graph, place.local, &place.projections);
        let projections = interner
            .projections
            .intern_slice(&place.projections[traveled..]);

        Place { local, projections }
    }

    /// Creates a transient graph with resolved dependencies.
    ///
    /// The transient graph "flattens" dependencies by resolving projections eagerly. Each edge
    /// in the original graph is traced through [`resolve`](Self::resolve), and a new edge is
    /// created pointing directly to the resolved target with only the unresolved projection
    /// suffix remaining.
    ///
    /// This is useful for analyses that need direct access to ultimate data sources without
    /// manually traversing intermediate aggregates.
    pub fn transient(&self, interner: &Interner<'heap>) -> TransientDataDependencyGraph<'heap, A>
    where
        A: Clone,
    {
        // We know the estimate required of data via the previous graph, therefore clone and then
        // clear the edges, this automatically gives us an estimate of the data required.
        let mut graph = self.graph.clone();
        graph.clear_edges();

        for edge in self.graph.edges() {
            let source = edge.source();
            let target = Local::new(edge.target().as_usize());
            let data = &edge.data;

            // Creating the transient graph is straightforward, we simply resolve the edge, via the
            // projections, and given the resulting projections we add a new edge between the new
            // and old target.
            let Place {
                local: target,
                projections,
            } = self.resolve(
                interner,
                Place {
                    local: target,
                    projections: data.projections,
                },
            );

            graph.add_edge(
                source,
                NodeId::new(target.as_usize()),
                Edge {
                    kind: data.kind,
                    projections,
                },
            );
        }

        TransientDataDependencyGraph { graph }
    }
}

impl<A: Allocator> fmt::Display for DataDependencyGraph<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_graph(&self.graph, fmt)
    }
}

/// A MIR pass that builds a [`DataDependencyGraph`].
///
/// This pass traverses the MIR body and records data dependencies between locals. After running,
/// call [`finish`](Self::finish) to obtain the resulting [`DataDependencyGraph`].
///
/// # Reuse
///
/// To avoid repeated allocations, use [`new_with`](Self::new_with) to recycle a previously
/// constructed graph's storage.
pub struct DataDependencyAnalysis<'heap, A: Allocator = Global> {
    alloc: A,
    graph: LinkedGraph<Local, Edge<'heap>, A>,
    constant_bindings: ConstantBindings<'heap, A>,
}

impl<'heap, A: Allocator> DataDependencyAnalysis<'heap, A> {
    /// Creates a new analysis pass using the specified allocator.
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            alloc: alloc.clone(),
            graph: LinkedGraph::new_in(alloc.clone()),
            constant_bindings: ConstantBindings::empty_in(alloc),
        }
    }

    /// Completes the analysis and returns the constructed dependency graph.
    pub fn finish(self) -> DataDependencyGraph<'heap, A> {
        DataDependencyGraph {
            graph: self.graph,
            constant_bindings: self.constant_bindings,
        }
    }
}

impl DataDependencyAnalysis<'_> {
    /// Creates a new analysis pass using the global allocator.
    #[must_use]
    pub fn new() -> Self {
        Self::new_in(Global)
    }
}

impl Default for DataDependencyAnalysis<'_> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'env, 'heap, A: Allocator + Clone> AnalysisPass<'env, 'heap>
    for DataDependencyAnalysis<'heap, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        let mut graph = LinkedGraph::new_in(self.alloc.clone());
        let mut constant_bindings =
            ConstantBindings::from_domain_in(&body.local_decls, self.alloc.clone());

        graph.derive(&body.local_decls, |id, _| id);

        let Ok(()) = DataDependencyAnalysisVisitor {
            graph: &mut graph,
            constant_bindings: &mut constant_bindings,
            context,
            body,
        }
        .visit_body(body);

        self.graph = graph;
        self.constant_bindings = constant_bindings;
    }
}

/// Visitor that collects data dependencies during MIR traversal.
struct DataDependencyAnalysisVisitor<'pass, 'env, 'heap, A: Allocator> {
    graph: &'pass mut LinkedGraph<Local, Edge<'heap>, A>,
    constant_bindings: &'pass mut ConstantBindings<'heap, A>,
    #[expect(dead_code, reason = "will be used in future")]
    context: &'pass mut MirContext<'env, 'heap>,
    body: &'pass Body<'heap>,
}

impl<'heap, A: Allocator> DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    /// Records a structural dependency edge from `source` to the local in `place`.
    fn collect_place(
        &mut self,
        source: Local,
        kind: EdgeKind<'heap>,
        &Place { local, projections }: &Place<'heap>,
    ) {
        self.graph.add_edge(
            NodeId::from_usize(source.as_usize()),
            NodeId::from_usize(local.as_usize()),
            Edge { kind, projections },
        );
    }

    /// Records a structural dependency from `source` to the operand.
    ///
    /// For places, creates an edge in the graph.
    /// For constants, records a constant binding for later resolution.
    fn collect_operand(&mut self, source: Local, kind: EdgeKind<'heap>, operand: &Operand<'heap>) {
        match operand {
            Operand::Place(place) => self.collect_place(source, kind, place),
            &Operand::Constant(constant) => {
                self.constant_bindings[source].push(ConstantBinding { kind, constant });
            }
        }
    }
}

impl<'heap, A: Allocator> Visitor<'heap> for DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_target(
        &mut self,
        _: Location,
        &Target { block, args }: &Target<'heap>,
    ) -> Self::Result {
        let params = self.body.basic_blocks[block].params;
        debug_assert_eq!(params.len(), args.len());

        for (&param, arg) in params.iter().zip(args.iter()) {
            self.collect_operand(param, EdgeKind::Param, arg);
        }

        Ok(())
    }

    fn visit_statement_assign(
        &mut self,
        _: Location,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Self::Result {
        let source = lhs.local;
        assert!(
            lhs.projections.is_empty(),
            "dataflow analysis requires SSA form: assignment to {:?} has projections",
            lhs.local
        );

        match rhs {
            RValue::Load(operand) => {
                self.collect_operand(source, EdgeKind::Load, operand);
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Tuple,
                operands,
            }) => {
                for (index, operand) in operands.iter_enumerated() {
                    self.collect_operand(source, EdgeKind::Index(index), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Struct { fields },
                operands,
            }) => {
                debug_assert_eq!(fields.len(), operands.len());

                for (&field, (index, operand)) in fields.iter().zip(operands.iter_enumerated()) {
                    self.collect_operand(source, EdgeKind::Field(index, field), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Closure,
                operands,
            }) => {
                debug_assert_eq!(operands.len(), 2);
                let ptr = &operands[FieldIndex::new(0)];
                let env = &operands[FieldIndex::new(1)];

                self.collect_operand(source, EdgeKind::ClosurePtr, ptr);
                self.collect_operand(source, EdgeKind::ClosureEnv, env);
            }
            // Non-structural: no edges created, dependencies handled via dataflow/RValue inspection
            RValue::Binary(_)
            | RValue::Unary(_)
            | RValue::Apply(_)
            | RValue::Input(_)
            | RValue::Aggregate(Aggregate {
                kind: AggregateKind::List | AggregateKind::Dict | AggregateKind::Opaque(_),
                ..
            }) => {}
        }

        Ok(())
    }
}
