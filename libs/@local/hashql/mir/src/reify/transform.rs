use hashql_core::{
    id::{IdVec, bit_vec::BitRelations as _},
    span::{SpanId, Spanned},
};
use hashql_hir::{
    lower::dataflow::{VariableDefinitions, VariableDependencies},
    node::{
        Node,
        closure::Closure,
        kind::NodeKind,
        r#let::{Binding, Let},
    },
    visit::Visitor as _,
};

use super::{Reifier, current::CurrentBlock, error::local_variable_unmapped};
use crate::{
    body::{
        local::Local,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, AggregateKind, RValue},
        statement::{Assign, Statement, StatementKind},
    },
    def::DefId,
};

impl<'mir, 'heap> Reifier<'_, 'mir, '_, '_, 'heap> {
    pub(super) fn transform_closure(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        span: SpanId,
        closure: Closure<'heap>,
    ) -> (DefId, Local) {
        let mut dependencies = VariableDependencies::from_set(self.state.var_pool.acquire());
        dependencies.visit_closure(&closure);
        let mut dependencies = dependencies.finish();

        let mut definitions = self.state.var_pool.acquire();
        definitions.clone_from(&self.state.thunks.set);
        let mut definitions = VariableDefinitions::from_set(definitions);
        definitions.visit_closure(&closure);
        let definitions = definitions.finish();

        dependencies.subtract(&definitions);
        self.state.var_pool.release(definitions);
        let captures = dependencies;

        let compiler = Reifier::new(self.context, self.state);
        let ptr = compiler.lower_closure(span, &captures, closure);

        // Now we need to do environment capture, for that create a tuple aggregate of all the
        // captured variables in a new local
        let env_local = self.local_counter.next();
        let mut tuple_elements = IdVec::with_capacity_in(captures.count(), self.context.heap);
        for var in &captures {
            let Some(capture_local) = self.locals[var] else {
                self.state.diagnostics.push(local_variable_unmapped(span));

                continue;
            };

            tuple_elements.push(Operand::Place(Place::local(
                capture_local,
                self.context.interner,
            )));
        }

        block.push_statement(Statement {
            span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(env_local, self.context.interner),
                rhs: RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Tuple,
                    operands: tuple_elements,
                }),
            }),
        });

        self.state.var_pool.release(captures);

        (ptr, env_local)
    }

    fn transform_binding(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        binding: &Binding<'heap>,
    ) {
        let local = self.local_counter.next();
        self.locals.insert(binding.binder.id, local);

        if let Some(rvalue) = self.rvalue(block, binding.binder.id, local, binding.value) {
            block.push_statement(Statement {
                span: binding.span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(local, self.context.interner),
                    rhs: rvalue,
                }),
            });
        }
    }

    pub(super) fn transform_body(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        node: Node<'heap>,
    ) -> Spanned<Operand<'heap>> {
        // The code is in ANF, so either the body is an atom *or* a set of let bindings
        let (bindings, body) = if let NodeKind::Let(Let { bindings, body }) = node.kind {
            (bindings.0, body)
        } else {
            (&[] as &[_], node)
        };

        for binding in bindings {
            self.transform_binding(block, binding);
        }

        // body is always an anf atom, therefore compile to operand
        Spanned {
            value: self.operand(body),
            span: body.span,
        }
    }

    pub(super) fn transform_node(
        &mut self,
        node: Node<'heap>,
    ) -> (CurrentBlock<'mir, 'heap>, Spanned<Operand<'heap>>) {
        let mut block = CurrentBlock::new(self.context.heap, self.context.interner);
        let body = self.transform_body(&mut block, node);

        (block, body)
    }
}
