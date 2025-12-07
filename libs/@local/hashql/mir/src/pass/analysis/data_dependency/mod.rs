//! Data dependency analysis for MIR.
//!
//! This module provides [`DataDependencyAnalysis`], a pass that constructs a graph representing
//! data dependencies between locals in the MIR. The resulting [`DataDependencyGraph`] can be used
//! to trace which locals a given place ultimately depends on.
//!
//! # Graph Structure
//!
//! The dependency graph uses locals as nodes and tracks dependencies as directed edges. An edge
//! from local `A` to local `B` means "A depends on B" (or equivalently, "A references B").
//!
//! For example, given the statement `_3 = (_1.field, _2)`:
//! - An edge `_3 → _1` is created with slot [`Slot::Index(0)`] and the `.field` projection
//! - An edge `_3 → _2` is created with slot [`Slot::Index(1)`]
//!
//! # Field Sensitivity
//!
//! The analysis is field-sensitive for structured types. When a tuple or struct is constructed,
//! each component is tracked separately via [`Slot`] annotations on edges. This enables
//! [`DataDependencyGraph::resolve`] to trace through projections and find the original source
//! of a specific field access.
//!
//! # Requirements
//!
//! This analysis requires the MIR to be in SSA form. Assignments must target locals directly
//! without projections (i.e., `_1 = ...` is valid, but `_1.field = ...` is not).
//!
//! [`Slot::Index(0)`]: Slot::Index
//! [`Slot::Index(1)`]: Slot::Index
#[cfg(test)]
mod tests;

use alloc::alloc::Global;
use core::{alloc::Allocator, fmt};

use hashql_core::{
    graph::{LinkedGraph, NodeId, linked::Node},
    id::{HasId as _, Id as _},
    intern::Interned,
    symbol::Symbol,
};

use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::Local,
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place, Projection, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, ArgIndex, Binary, RValue, Unary},
        statement::Assign,
        terminator::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, SwitchInt, Target},
    },
    context::MirContext,
    intern::Interner,
    pass::Pass,
    visit::Visitor,
};

/// Describes which component of a structured value an edge represents.
///
/// Every dependency edge has a slot identifying its role in the source expression. This enables
/// precise 1:1 mapping during alias replacement or value reconstruction - given a slot, you know
/// exactly which operand position it corresponds to.
///
/// # Structural vs Non-Structural Slots
///
/// Some slots are *structural* and participate in [`DataDependencyGraph::resolve`]:
/// - [`Load`](Self::Load) - followed transitively to find the original definition
/// - [`Index`](Self::Index), [`Field`](Self::Field) - matched against projections
/// - [`ClosurePtr`](Self::ClosurePtr), [`ClosureEnv`](Self::ClosureEnv) - matched by position
///
/// Other slots are *non-structural* and exist only for reconstruction/replacement purposes.
/// They cannot be resolved through because their values don't have addressable subcomponents.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Slot<'heap> {
    /// A load operation that copies the entire value.
    ///
    /// Used for [`RValue::Load`], where the complete value flows from source to destination.
    /// This is the only slot that [`DataDependencyGraph::resolve`] follows transitively,
    /// because a load always has exactly one source.
    Load,

    /// A block parameter receiving a value from a predecessor.
    ///
    /// Unlike [`Load`](Self::Load), a block can have multiple parameters, so this slot
    /// cannot be followed transitively during resolution (it would be ambiguous which
    /// parameter to follow).
    Param(BasicBlockId, Option<u128>),

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

    /// The function operand of an [`RValue::Apply`].
    ApplyPtr,

    /// An argument operand of an [`RValue::Apply`] at the given index.
    ApplyArg(ArgIndex),

    /// An element in a list, dict, or opaque aggregate at the given index.
    ///
    /// These aggregates don't support field projection, so this slot exists purely for
    /// reconstruction purposes (e.g., rebuilding the aggregate with substituted operands).
    Aggregation(FieldIndex),

    /// The left operand of a binary operation.
    BinaryL,

    /// The right operand of a binary operation.
    BinaryR,

    /// The operand of an unary operation.
    Unary,

    /// The axis operand of a [`GraphReadHead::Entity`].
    GraphReadHeadAxis,

    /// The captured environment of a filter in a graph read body.
    ///
    /// The index corresponds to the position in the `body` vector of the [`GraphRead`].
    GraphReadBodyFilterEnv(usize),
}

/// An edge in the data dependency graph.
///
/// Each edge connects a local (the dependent) to another local (the dependency) and carries
/// metadata about which component is being accessed and any remaining projections.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Edge<'heap> {
    /// Which component of the source expression this edge represents.
    ///
    /// Every edge has a slot identifying its exact position in the source expression,
    /// enabling precise reconstruction or replacement of operands.
    slot: Slot<'heap>,

    /// The projection path from the dependency local to the actual accessed value.
    ///
    /// For a place like `_1.field.0`, the edge target is `_1` and projections contains
    /// `[.field, .0]`.
    projections: Interned<'heap, [Projection<'heap>]>,
}

#[expect(clippy::use_debug)]
fn write_graph<A: Allocator>(
    graph: &LinkedGraph<Local, Edge<'_>, A>,
    mut writer: impl fmt::Write,
) -> fmt::Result {
    for edge in graph.edges() {
        let source = edge.source();
        let target = edge.target();
        let Edge { slot, projections } = &edge.data;

        write!(writer, "%{source} -> %{target} [{slot:?}")?;
        if !projections.is_empty() {
            write!(writer, ", projections: ")?;
        }
        for projection in projections {
            write!(writer, "{}", projection.kind)?;
        }
        writeln!(writer, "]")?;
    }

    Ok(())
}

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
pub struct DataDependencyGraph<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<'heap, A: Allocator> DataDependencyGraph<'heap, A> {
    /// Follows [`Slot::Load`] edges from a node until reaching a non-load definition.
    ///
    /// Load edges represent pure value copies, so following them transitively finds the
    /// original definition site of a value.
    fn follow_load<'this>(&'this self, node: &mut &'this Node<Local>) {
        let mut visited = 0;
        let max_depth = self.graph.nodes().len();

        while let Some(edge) = self
            .graph
            .outgoing_edges(node.id())
            .find(|edge| matches!(edge.data.slot, Slot::Load))
        {
            visited += 1;
            debug_assert!(visited <= max_depth, "cycle detected in load chain");

            *node = &self.graph[edge.target()];
        }
    }

    /// Resolves a place to its source local by following dependencies through the graph.
    ///
    /// Starting from the place's local, this method attempts to trace each projection in the
    /// place through the dependency graph. For each field projection, it looks for an outgoing
    /// edge with a matching slot and follows it to find where that field's value originated.
    ///
    /// Returns a tuple of:
    /// - The number of projections that were successfully resolved
    /// - The [`Local`] that provides the value at that resolution depth
    ///
    /// Resolution stops early when:
    /// - An [`Index`](ProjectionKind::Index) projection is encountered (dynamic indexing)
    /// - No matching edge is found (opaque value, e.g., function return)
    ///
    /// # Examples
    ///
    /// Given MIR:
    /// ```text
    /// _2 = input()
    /// _3 = (_1, _2)  // tuple construction
    /// _4 = _3.1      // projection
    /// ```
    ///
    /// Resolving `_4` (with no projections) returns `(0, _2)` because:
    /// 1. `_4` has a `Load` edge to `_3`
    /// 2. Following through `_3`, the `.1` projection matches `Index(1)` → `_2`
    ///
    /// Resolving `_3.1` returns `(1, _2)` because the `.1` projection resolves through the
    /// tuple construction.
    pub fn resolve(&self, local: Local, projections: &[Projection<'heap>]) -> (usize, Local) {
        let mut node = &self.graph[NodeId::from_usize(local.as_usize())];

        for (index, projection) in projections.iter().enumerate() {
            self.follow_load(&mut node);

            match projection.kind {
                ProjectionKind::Field(field_index) => {
                    let Some(edge) =
                        self.graph
                            .outgoing_edges(node.id())
                            .find(|edge| match edge.data.slot {
                                Slot::Index(index) if index == field_index => true,
                                Slot::Field(index, _) if index == field_index => true,
                                Slot::ClosurePtr if field_index.as_usize() == 0 => true,
                                Slot::ClosureEnv if field_index.as_usize() == 1 => true,
                                Slot::Load
                                | Slot::Param(..)
                                | Slot::Index(_)
                                | Slot::Field(..)
                                | Slot::ClosurePtr
                                | Slot::ClosureEnv
                                | Slot::ApplyPtr
                                | Slot::ApplyArg(_)
                                | Slot::Aggregation(_)
                                | Slot::BinaryL
                                | Slot::BinaryR
                                | Slot::Unary
                                | Slot::GraphReadHeadAxis
                                | Slot::GraphReadBodyFilterEnv(_) => false,
                            })
                    else {
                        // This is not an error, it simply means that we weren't able to determine
                        // the projection, this may be the case due to an opaque field, such as a
                        // result from a function call.
                        return (index, node.data);
                    };

                    node = &self.graph[edge.target()];
                }
                ProjectionKind::FieldByName(symbol) => {
                    let Some(edge) = self.graph.outgoing_edges(node.id()).find(
                        |edge| matches!(edge.data.slot, Slot::Field(_, field) if field == symbol),
                    ) else {
                        // This is not an error, it simply means that we weren't able to determine
                        // the projection, this may be the case due to an opaque field, such as a
                        // result from a function call.
                        return (index, node.data);
                    };

                    node = &self.graph[edge.target()];
                }
                // We cannot advance, therefore terminate the resolution
                ProjectionKind::Index(_) => return (index, node.data),
            }
        }

        self.follow_load(&mut node);
        (projections.len(), node.data)
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
            let (traveled, target) = self.resolve(target, &data.projections);
            let projections = interner
                .projections
                .intern_slice(&data.projections[traveled..]);

            graph.add_edge(
                source,
                NodeId::new(target.as_usize()),
                Edge {
                    slot: data.slot,
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
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<'heap, A: Allocator> DataDependencyAnalysis<'heap, A> {
    /// Creates a new analysis pass using the specified allocator.
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            graph: LinkedGraph::new_in(alloc),
        }
    }

    /// Creates a new analysis pass, reusing storage from a previous graph.
    ///
    /// This avoids reallocation when running the analysis multiple times on different bodies.
    pub fn new_with(mut graph: DataDependencyGraph<'heap, A>) -> Self {
        graph.graph.clear();

        Self { graph: graph.graph }
    }

    /// Completes the analysis and returns the constructed dependency graph.
    pub fn finish(self) -> DataDependencyGraph<'heap, A> {
        DataDependencyGraph { graph: self.graph }
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

impl<'env, 'heap, A: Allocator> Pass<'env, 'heap> for DataDependencyAnalysis<'heap, A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        self.graph.derive(&body.local_decls, |id, _| id);

        let Ok(()) = DataDependencyAnalysisVisitor {
            analysis: self,
            context,
            terminator_value: None,
            body,
        }
        .visit_body(body);
    }
}

/// Visitor that collects data dependencies during MIR traversal.
struct DataDependencyAnalysisVisitor<'pass, 'env, 'heap, A: Allocator> {
    analysis: &'pass mut DataDependencyAnalysis<'heap, A>,
    context: &'pass mut MirContext<'env, 'heap>,
    body: &'pass Body<'heap>,
    terminator_value: Option<u128>,
}

impl<'heap, A: Allocator> DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    /// Records a dependency edge from `source` to the local in `place`.
    fn collect_place(
        &mut self,
        source: Local,
        slot: Slot<'heap>,
        &Place { local, projections }: &Place<'heap>,
    ) {
        self.analysis.graph.add_edge(
            NodeId::from_usize(source.as_usize()),
            NodeId::from_usize(local.as_usize()),
            Edge { slot, projections },
        );
    }

    /// Records a dependency edge from `source` to the operand, if it's a place.
    ///
    /// Constants have no dependencies and are ignored.
    fn collect_operand(&mut self, source: Local, slot: Slot<'heap>, operand: &Operand<'heap>) {
        match operand {
            Operand::Place(place) => self.collect_place(source, slot, place),
            Operand::Constant(_) => {}
        }
    }
}

impl<'heap, A: Allocator> Visitor<'heap> for DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_terminator_switch_int(
        &mut self,
        location: Location,
        SwitchInt {
            discriminant,
            targets,
        }: &SwitchInt<'heap>,
    ) -> Self::Result {
        self.visit_operand(location, discriminant)?;

        for (value, target) in targets.iter() {
            self.terminator_value = Some(value);
            self.visit_target(location, &target)?;
        }

        self.terminator_value = None;
        if let Some(target) = targets.otherwise() {
            self.visit_target(location, &target)?;
        }

        Ok(())
    }

    fn visit_target(
        &mut self,
        location: Location,
        &Target { block, args }: &Target<'heap>,
    ) -> Self::Result {
        let params = self.body.basic_blocks[block].params;
        debug_assert_eq!(params.len(), args.len());

        for (&param, arg) in params.iter().zip(args.iter()) {
            self.collect_operand(
                param,
                Slot::Param(location.block, self.terminator_value),
                arg,
            );
        }

        Ok(())
    }

    fn visit_terminator_graph_read(
        &mut self,
        _: Location,
        GraphRead {
            head,
            body,
            tail,
            target,
        }: &GraphRead<'heap>,
    ) -> Self::Result {
        // Graph read is special: all referenced variables become dependencies of the target
        // block's output parameter (which is always the first and only parameter).
        let params = self.body.basic_blocks[*target].params;
        debug_assert_eq!(params.len(), 1);

        let source = params[0];

        match head {
            GraphReadHead::Entity { axis } => {
                self.collect_operand(source, Slot::GraphReadHeadAxis, axis);
            }
        }

        for (index, body) in body.iter().enumerate() {
            match body {
                &GraphReadBody::Filter(_, env) => {
                    // We record the environment local as a dependency but without a slot.
                    // Recording the slot would skew results because we depend on the filter's
                    // output semantically, not on the closure's internal structure. The captured
                    // environment affects what data flows into the filter.
                    self.collect_operand(
                        source,
                        Slot::GraphReadBodyFilterEnv(index),
                        &Operand::Place(Place::local(env, self.context.interner)),
                    );
                }
            }
        }

        match tail {
            GraphReadTail::Collect => {}
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
                self.collect_operand(source, Slot::Load, operand);
            }
            RValue::Binary(Binary { op: _, left, right }) => {
                self.collect_operand(source, Slot::BinaryL, left);
                self.collect_operand(source, Slot::BinaryR, right);
            }
            RValue::Unary(Unary { op: _, operand }) => {
                self.collect_operand(source, Slot::Unary, operand);
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Tuple,
                operands,
            }) => {
                for (index, operand) in operands.iter_enumerated() {
                    self.collect_operand(source, Slot::Index(index), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Struct { fields },
                operands,
            }) => {
                debug_assert_eq!(fields.len(), operands.len());

                for (&field, (index, operand)) in fields.iter().zip(operands.iter_enumerated()) {
                    self.collect_operand(source, Slot::Field(index, field), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::List | AggregateKind::Dict | AggregateKind::Opaque(_),
                operands,
            }) => {
                for (index, operand) in operands.iter_enumerated() {
                    self.collect_operand(source, Slot::Aggregation(index), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Closure,
                operands,
            }) => {
                debug_assert_eq!(operands.len(), 2);
                let ptr = &operands[FieldIndex::new(0)];
                let env = &operands[FieldIndex::new(1)];

                self.collect_operand(source, Slot::ClosurePtr, ptr);
                self.collect_operand(source, Slot::ClosureEnv, env);
            }
            RValue::Input(_) => {
                // Input has no dependencies; it's a source of external data.
            }
            RValue::Apply(Apply {
                function,
                arguments,
            }) => {
                self.collect_operand(source, Slot::ApplyPtr, function);

                for (index, argument) in arguments.iter_enumerated() {
                    self.collect_operand(source, Slot::ApplyArg(index), argument);
                }
            }
        }

        Ok(())
    }
}
