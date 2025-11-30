use hashql_core::{
    id::{Id as _, IdVec},
    symbol::sym,
    r#type::{TypeBuilder, Typed, builder},
};
use hashql_hir::node::{
    HirPtr, Node,
    call::{Call, CallArgument, PointerKind},
    closure::Closure,
    data::{Data, Dict, List, Struct, Tuple},
    kind::NodeKind,
    r#let::Binder,
    operation::{
        BinaryOperation, InputOperation, Operation, TypeConstructor, TypeOperation, UnaryOperation,
    },
    thunk::Thunk,
};

use super::{
    CurrentBlock, Reifier,
    error::{fat_call_on_constant, nested_let_bindings_in_anf, unexpected_assertion},
};
use crate::body::{
    constant::Constant,
    local::Local,
    operand::Operand,
    place::{FieldIndex, Place, ProjectionKind},
    rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
};

impl<'mir, 'heap> Reifier<'_, 'mir, '_, '_, 'heap> {
    fn rvalue_data(&mut self, data: Data<'heap>) -> RValue<'heap> {
        match data {
            Data::Primitive(primitive) => {
                RValue::Load(Operand::Constant(Constant::Primitive(primitive)))
            }
            Data::Struct(Struct { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.mir.heap);
                let mut field_names = Vec::with_capacity(fields.len());

                for field in fields {
                    field_names.push(field.name.value);
                    operands.push(self.operand(field.value));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Struct {
                        fields: self.context.mir.interner.symbols.intern_slice(&field_names),
                    },
                    operands,
                })
            }
            Data::Dict(Dict { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len() * 2, self.context.mir.heap);
                for field in fields {
                    operands.push(self.operand(field.key));
                    operands.push(self.operand(field.value));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Dict,
                    operands,
                })
            }
            Data::Tuple(Tuple { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.mir.heap);
                for &field in fields {
                    operands.push(self.operand(field));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Tuple,
                    operands,
                })
            }
            Data::List(List { elements }) => {
                let mut operands = IdVec::with_capacity_in(elements.len(), self.context.mir.heap);
                for &element in elements {
                    operands.push(self.operand(element));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::List,
                    operands,
                })
            }
        }
    }

    fn rvalue_type_operation(
        &mut self,
        hir: HirPtr,
        operation: TypeOperation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            TypeOperation::Assertion(_) => {
                self.state.diagnostics.push(unexpected_assertion(hir.span));

                // Return a bogus value, so that lowering can continue
                RValue::Load(Operand::Constant(Constant::Unit))
            }
            TypeOperation::Constructor(ctor @ TypeConstructor { name }) => {
                if let Some(&ptr) = self.state.ctor.get(&name) {
                    return RValue::Load(Operand::Constant(Constant::FnPtr(ptr)));
                }

                let compiler = Reifier::new(self.context, self.state);
                let ptr = compiler.lower_ctor(hir, ctor);
                self.state.ctor.insert(name, ptr);

                let ptr = Operand::Constant(Constant::FnPtr(ptr));
                let env = Operand::Constant(Constant::Unit);
                let mut operands = IdVec::with_capacity_in(2, self.context.mir.heap);
                operands.push(ptr);
                operands.push(env);

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Closure,
                    operands,
                })
            }
        }
    }

    fn rvalue_binary_operation(
        &mut self,
        BinaryOperation { op, left, right }: BinaryOperation<'heap>,
    ) -> RValue<'heap> {
        let left = self.operand(left);
        let right = self.operand(right);

        RValue::Binary(Binary {
            op: op.value,
            left,
            right,
        })
    }

    fn rvalue_unary_operation(
        &mut self,
        UnaryOperation { op, expr }: UnaryOperation<'heap>,
    ) -> RValue<'heap> {
        let operand = self.operand(expr);

        RValue::Unary(Unary {
            op: op.value,
            operand,
        })
    }

    const fn rvalue_input_operation(
        InputOperation { op, name }: InputOperation<'heap>,
    ) -> RValue<'heap> {
        RValue::Input(Input {
            op: op.value,
            name: name.value,
        })
    }

    fn rvalue_operation(&mut self, hir: HirPtr, operation: Operation<'heap>) -> RValue<'heap> {
        match operation {
            Operation::Type(type_operation) => self.rvalue_type_operation(hir, type_operation),
            Operation::Binary(binary_operation) => self.rvalue_binary_operation(binary_operation),
            Operation::Unary(unary_operation, _) => self.rvalue_unary_operation(unary_operation),
            Operation::Input(input_operation) => Self::rvalue_input_operation(input_operation),
        }
    }

    fn rvalue_variable(&mut self, node: Node<'heap>) -> RValue<'heap> {
        RValue::Load(self.operand(node))
    }

    fn rvalue_access(&mut self, node: Node<'heap>) -> RValue<'heap> {
        RValue::Load(self.operand(node))
    }

    fn rvalue_call_thin(
        &mut self,
        function: Node<'heap>,
        call_arguments: &[CallArgument<'heap>],
    ) -> RValue<'heap> {
        let mut arguments = IdVec::with_capacity_in(call_arguments.len(), self.context.mir.heap);

        for CallArgument { span: _, value } in call_arguments {
            arguments.push(self.operand(*value));
        }

        // A thin call is very simple, as the calling convention means that we do not need to worry
        // about the environment (which would be the first argument).
        RValue::Apply(Apply {
            function: self.operand(function),
            arguments,
        })
    }

    fn rvalue_call_fat(
        &mut self,
        function: Node<'heap>,
        call_arguments: &[CallArgument<'heap>],
    ) -> RValue<'heap> {
        let function_span = function.span;
        // The argument to a fat call *must* be a place, it cannot be a constant, because a constant
        // cannot represent a fat-pointer, which is only constructed using an aggregate.
        let function = match self.operand(function) {
            Operand::Place(place) => place,
            Operand::Constant(_) => {
                self.state
                    .diagnostics
                    .push(fat_call_on_constant(function.span));

                // Return a bogus value / place that can be used to continue lowering
                Place::local(Local::MAX, self.context.mir.interner)
            }
        };

        // To the function we add two projections, one for the function pointer, and one for the
        // captured environment
        let function_pointer = function.project(
            self.context.mir.interner,
            function.type_id(&self.local_decls),
            ProjectionKind::Field(FieldIndex::new(0)),
        );
        let environment = function.project(
            self.context.mir.interner,
            // The environment is intentionally opaque because:
            // 1. It should never be inspected outside of the call boundary
            // 2. For closures nested inside of values, the type will always be represented as a
            //    `Closure`, so won't have a tuple associated with it, therefore reconstruction of
            //    the environment isn't possible.
            // 3. The environment is immediately destructured at function entry, this projection
            //    exists only to pass it as an argument
            TypeBuilder::spanned(function_span, self.context.mir.env).opaque(
                sym::internal::ClosureEnv,
                builder::lazy(|_, builder| builder.unknown()),
            ),
            ProjectionKind::Field(FieldIndex::new(1)),
        );

        let mut arguments =
            IdVec::with_capacity_in(call_arguments.len() + 1, self.context.mir.heap);

        arguments.push(Operand::Place(environment));

        for CallArgument { span: _, value } in call_arguments {
            arguments.push(self.operand(*value));
        }

        RValue::Apply(Apply {
            function: Operand::Place(function_pointer),
            arguments,
        })
    }

    fn rvalue_call(
        &mut self,
        Call {
            kind,
            function,
            arguments,
        }: Call<'heap>,
    ) -> RValue<'heap> {
        match kind {
            PointerKind::Fat => self.rvalue_call_fat(function, &arguments),
            PointerKind::Thin => self.rvalue_call_thin(function, &arguments),
        }
    }

    fn rvalue_closure(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        hir: HirPtr,
        binder: Binder<'heap>,
        closure: Closure<'heap>,
    ) -> RValue<'heap> {
        let (
            Typed {
                r#type: _,
                value: ptr,
            },
            Typed {
                r#type: _,
                value: env,
            },
        ) = self.transform_closure(block, hir, Some(binder), closure);

        // We first need to figure out the environment that we need to capture, these are variables
        // that are referenced out of scope (upvars).
        let mut closure_operands = IdVec::with_capacity_in(2, self.context.mir.heap);
        closure_operands.push(Operand::Constant(Constant::FnPtr(ptr)));
        closure_operands.push(Operand::Place(Place::local(env, self.context.mir.interner)));

        RValue::Aggregate(Aggregate {
            kind: AggregateKind::Closure,
            operands: closure_operands,
        })
    }

    fn rvalue_thunk(
        &mut self,
        hir: HirPtr,
        binder: Binder<'heap>,
        thunk: Thunk<'heap>,
    ) -> RValue<'heap> {
        // Thunks have no dependencies, and therefore no captures
        let compiler = Reifier::new(self.context, self.state);
        let ptr = compiler.lower_thunk(hir, binder, thunk);
        self.state.thunks.insert(binder.id, ptr);

        RValue::Load(Operand::Constant(Constant::FnPtr(ptr)))
    }

    pub(super) fn rvalue(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        binder: Binder<'heap>,
        local: Local,
        node: Node<'heap>,
    ) -> Option<RValue<'heap>> {
        let rvalue = match node.kind {
            NodeKind::Data(data) => self.rvalue_data(data),
            NodeKind::Variable(_) => self.rvalue_variable(node),
            NodeKind::Let(_) => {
                self.state
                    .diagnostics
                    .push(nested_let_bindings_in_anf(node.span));
                return None;
            }
            NodeKind::Operation(operation) => self.rvalue_operation(node.ptr(), operation),
            NodeKind::Access(_) => self.rvalue_access(node),
            NodeKind::Call(call) => self.rvalue_call(call),
            NodeKind::Branch(branch) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.terminator_branch(block, local, node.span, branch);
                return None;
            }
            NodeKind::Closure(closure) => self.rvalue_closure(block, node.ptr(), binder, closure),
            NodeKind::Thunk(thunk) => self.rvalue_thunk(node.ptr(), binder, thunk),
            NodeKind::Graph(graph) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.terminator_graph(block, local, node.span, graph);
                return None;
            }
        };

        Some(rvalue)
    }
}
