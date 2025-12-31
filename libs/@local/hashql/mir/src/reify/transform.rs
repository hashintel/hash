use hashql_core::{
    collections::TinyVec,
    id::{IdVec, bit_vec::BitRelations as _},
    span::Spanned,
    r#type::{TypeBuilder, TypeId, Typed},
};
use hashql_hir::{
    lower::dataflow::{VariableDefinitions, VariableDependencies},
    node::{
        HirPtr, Node,
        closure::Closure,
        kind::NodeKind,
        r#let::{Binder, Binding, Let},
    },
    visit::Visitor as _,
};

use super::{Reifier, current::CurrentBlock, error::local_variable_unmapped, unwrap_closure_type};
use crate::{
    body::{
        local::{Local, LocalDecl},
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
        hir: HirPtr,
        binder: Option<Binder<'heap>>,
        closure: Closure<'heap>,
    ) -> (Typed<DefId>, Typed<Local>) {
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

        // Now we need to do environment capture, for that create a tuple aggregate of all the
        // captured variables in a new local
        let env_local = self.local_decls.push(LocalDecl {
            span: hir.span,
            r#type: TypeId::PLACEHOLDER, // To be replaced with actual type later
            name: None,
        });

        let mut tuple_elements = IdVec::with_capacity_in(captures.count(), self.context.mir.heap);
        let mut tuple_element_ty = TinyVec::with_capacity(captures.count());

        for var in &captures {
            let Some(capture_local) = self.locals[var] else {
                self.state
                    .diagnostics
                    .push(local_variable_unmapped(hir.span));

                continue;
            };

            tuple_elements.push(Operand::Place(Place::local(capture_local)));

            tuple_element_ty.push(self.local_decls[capture_local].r#type);
        }

        let env_type = TypeBuilder::spanned(hir.span, self.context.mir.env).tuple(tuple_element_ty);
        self.local_decls[env_local].r#type = env_type;

        let closure_type_id = self.context.hir.map.monomorphized_type_id(hir.id);
        let closure_type = unwrap_closure_type(closure_type_id, self.context.mir.env);
        let compiler = Reifier::new(self.context, self.state);
        let ptr = compiler.lower_closure(hir, &captures, env_type, binder, closure, closure_type);

        block.push_statement(Statement {
            span: hir.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(env_local),
                rhs: RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Tuple,
                    operands: tuple_elements,
                }),
            }),
        });

        self.state.var_pool.release(captures);

        (
            Typed {
                value: ptr,
                r#type: closure_type_id,
            },
            Typed {
                value: env_local,
                r#type: env_type,
            },
        )
    }

    fn transform_binding(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        binding: &Binding<'heap>,
    ) {
        let local = self.local_decls.push(LocalDecl {
            span: binding.span,
            r#type: self.context.hir.map.type_id(binding.value.id),
            name: binding.binder.name,
        });
        self.locals.insert(binding.binder.id, local);

        if let Some(rvalue) = self.rvalue(block, binding.binder, local, binding.value) {
            block.push_statement(Statement {
                span: binding.span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(local),
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
        let mut block = CurrentBlock::new(self.context.mir.heap, self.context.mir.interner);
        let body = self.transform_body(&mut block, node);

        (block, body)
    }
}
