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
    graph::{LinkedGraph, NodeId},
    id::Id as _,
};

use super::graph::{Edge, resolve, write_graph};
use crate::{
    body::{
        Body,
        constant::Constant,
        local::{Local, LocalVec},
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, RValue, Unary},
        statement::Assign,
        terminator::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, SwitchInt, Target},
    },
    context::MirContext,
    intern::Interner,
    pass::{AnalysisPass, analysis::data::graph::Slot},
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
struct SlotConst<'heap> {
    slot: Slot<'heap>,
    constant: Constant<'heap>,
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
    constants: LocalVec<Vec<SlotConst<'heap>, A>, A>,
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
    alloc: A,
    graph: LinkedGraph<Local, Edge<'heap>, A>,
    constants: LocalVec<Vec<SlotConst<'heap>, A>, A>,
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
            constants: LocalVec::new_in(alloc),
        }
    }

    /// Completes the analysis and returns the constructed dependency graph.
    pub fn finish(self) -> DataDependencyGraph<'heap, A> {
        DataDependencyGraph {
            graph: self.graph,
            constants: self.constants,
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
        let mut constants = LocalVec::from_domain_in(
            Vec::new_in(self.alloc.clone()),
            &body.local_decls,
            self.alloc.clone(),
        );

        graph.derive(&body.local_decls, |id, _| id);

        let Ok(()) = DataDependencyAnalysisVisitor {
            graph: &mut graph,
            constants: &mut constants,
            context,
            terminator_value: None,
            body,
        }
        .visit_body(body);

        self.graph = graph;
        self.constants = constants;
    }
}

/// Visitor that collects data dependencies during MIR traversal.
struct DataDependencyAnalysisVisitor<'pass, 'env, 'heap, A: Allocator> {
    graph: &'pass mut LinkedGraph<Local, Edge<'heap>, A>,
    constants: &'pass mut LocalVec<Vec<SlotConst<'heap>, A>, A>,
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
        self.graph.add_edge(
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
            &Operand::Constant(constant) => {
                self.constants[source].push(SlotConst { slot, constant });
            }
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
