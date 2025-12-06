use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{
    graph::{LinkedGraph, NodeId, linked::Node},
    id::{HasId as _, Id as _},
    intern::Interned,
    symbol::Symbol,
};

use crate::{
    body::{
        Body,
        local::Local,
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place, Projection, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, RValue, Unary},
        statement::Assign,
        terminator::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, Target},
    },
    context::MirContext,
    intern::Interner,
    pass::Pass,
    visit::Visitor,
};

// We only save slots that have significance when traversing the graph
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Slot<'heap> {
    Load,
    Index(FieldIndex),
    Field(FieldIndex, Symbol<'heap>),
    ClosurePtr,
    ClosureEnv,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Edge<'heap> {
    slot: Option<Slot<'heap>>,
    projections: Interned<'heap, [Projection<'heap>]>,
}

pub struct TransientDataDependencyGraph<'heap, A: Allocator = Global> {
    _graph: LinkedGraph<Local, Edge<'heap>, A>,
}

pub struct DataDependencyGraph<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<'heap, A: Allocator> DataDependencyGraph<'heap, A> {
    fn follow_load<'this>(&'this self, node: &mut &'this Node<Local>) {
        while let Some(edge) = self
            .graph
            .outgoing_edges(node.id())
            .find(|edge| matches!(edge.data.slot, Some(Slot::Load)))
        {
            *node = &self.graph[edge.target()];
        }
    }

    // resolve a projection where possible
    pub fn resolve(&self, Place { local, projections }: Place<'heap>) -> (usize, Local) {
        let mut node = &self.graph[NodeId::from_usize(local.as_usize())];

        for (index, projection) in projections.iter().enumerate() {
            self.follow_load(&mut node);

            match projection.kind {
                ProjectionKind::Field(field_index) => {
                    let Some(edge) = self.graph.outgoing_edges(node.id()).find(|edge| {
                        let Some(slot) = edge.data.slot else {
                            return false;
                        };

                        match slot {
                            Slot::Index(index) if index == field_index => true,
                            Slot::Field(index, _) if index == field_index => true,
                            Slot::ClosurePtr if field_index.as_usize() == 0 => true,
                            Slot::ClosureEnv if field_index.as_usize() == 1 => true,
                            Slot::Load
                            | Slot::Index(_)
                            | Slot::Field(..)
                            | Slot::ClosurePtr
                            | Slot::ClosureEnv => false,
                        }
                    }) else {
                        // This is not an error, it simply means that we weren't able to determine
                        // the projection, this may be the case due to an opaque field, such as a
                        // result from a function call.
                        return (index, node.data);
                    };

                    node = &self.graph[edge.target()];
                }
                ProjectionKind::FieldByName(symbol) => {
                    let Some(edge) = self.graph.outgoing_edges(node.id()).find(
                        |edge| matches!(edge.data.slot, Some(Slot::Field(_, field)) if field == symbol),
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
            let (traveled, target) = self.resolve(Place {
                local: target,
                projections: data.projections,
            });
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

        TransientDataDependencyGraph { _graph: graph }
    }
}

pub struct DataDependencyAnalysis<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<'heap, A: Allocator> DataDependencyAnalysis<'heap, A> {
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            graph: LinkedGraph::new_in(alloc),
        }
    }

    pub fn new_with(mut graph: DataDependencyGraph<'heap, A>) -> Self {
        graph.graph.clear();

        Self { graph: graph.graph }
    }

    pub fn finish(self) -> DataDependencyGraph<'heap, A> {
        DataDependencyGraph { graph: self.graph }
    }
}

impl DataDependencyAnalysis<'_> {
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
            body,
        }
        .visit_body(body);
    }
}

struct DataDependencyAnalysisVisitor<'pass, 'env, 'heap, A: Allocator> {
    analysis: &'pass mut DataDependencyAnalysis<'heap, A>,
    context: &'pass mut MirContext<'env, 'heap>,
    body: &'pass Body<'heap>,
}

impl<'heap, A: Allocator> DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    fn collect_place(
        &mut self,
        source: Local,
        slot: Option<Slot<'heap>>,
        &Place { local, projections }: &Place<'heap>,
    ) {
        self.analysis.graph.add_edge(
            NodeId::from_usize(source.as_usize()),
            NodeId::from_usize(local.as_usize()),
            Edge { slot, projections },
        );
    }

    fn collect_operand(
        &mut self,
        source: Local,
        slot: Option<Slot<'heap>>,
        operand: &Operand<'heap>,
    ) {
        match operand {
            Operand::Place(place) => self.collect_place(source, slot, place),
            Operand::Constant(_) => {}
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
            self.collect_operand(param, Some(Slot::Load), arg);
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
        // graph read is a bit special, because any variable mentioned is a dependency to the
        // terminator block output (which is always the first argument)
        let params = self.body.basic_blocks[*target].params;
        debug_assert_eq!(params.len(), 1);

        let source = params[0];

        match head {
            GraphReadHead::Entity { axis } => {
                self.collect_operand(source, None, axis);
            }
        }

        for body in body {
            match body {
                &GraphReadBody::Filter(_, env) => {
                    // this is just a materialized fat pointer, but we don't record the slot,
                    // because scew the results. We're just dependent on the output of the filter,
                    // **not** the pointer itself.
                    // We're only interested in the local, the output of the graph read depends on
                    // the environment captured by definition.
                    self.collect_operand(
                        source,
                        None,
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
            "dataflow analysis may only work while in SSA form"
        );

        #[expect(clippy::match_same_arms, reason = "intention")]
        match rhs {
            RValue::Load(operand) => {
                self.collect_operand(source, Some(Slot::Load), operand);
            }
            RValue::Binary(Binary { op: _, left, right }) => {
                self.collect_operand(source, None, left);
                self.collect_operand(source, None, right);
            }
            RValue::Unary(Unary { op: _, operand }) => {
                self.collect_operand(source, None, operand);
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Tuple,
                operands,
            }) => {
                for (index, operand) in operands.iter_enumerated() {
                    self.collect_operand(source, Some(Slot::Index(index)), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Struct { fields },
                operands,
            }) => {
                debug_assert_eq!(fields.len(), operands.len());

                for (&field, (index, operand)) in fields.iter().zip(operands.iter_enumerated()) {
                    self.collect_operand(source, Some(Slot::Field(index, field)), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::List,
                operands,
            }) => {
                // list and dict do not have accurate position by design
                for operand in operands.iter() {
                    self.collect_operand(source, None, operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Dict,
                operands,
            }) => {
                for operand in operands.iter() {
                    self.collect_operand(source, None, operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Opaque(_),
                operands,
            }) => {
                for operand in operands.iter() {
                    self.collect_operand(source, None, operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Closure,
                operands,
            }) => {
                debug_assert_eq!(operands.len(), 2);
                let ptr = &operands[FieldIndex::new(0)];
                let env = &operands[FieldIndex::new(1)];

                self.collect_operand(source, Some(Slot::ClosurePtr), ptr);
                self.collect_operand(source, Some(Slot::ClosureEnv), env);
            }
            RValue::Input(_) => {
                // input has no dependencies
            }
            RValue::Apply(Apply {
                function,
                arguments,
            }) => {
                self.collect_operand(source, None, function);

                for (_, argument) in arguments.iter_enumerated() {
                    self.collect_operand(source, None, argument);
                }
            }
        }

        Ok(())
    }
}
