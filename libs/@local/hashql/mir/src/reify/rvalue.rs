use hashql_core::{id::IdVec, span::SpanId};
use hashql_hir::node::{
    HirId, Node,
    call::{Call, CallArgument, PointerKind},
    closure::Closure,
    data::{Data, Dict, List, Struct, Tuple},
    kind::NodeKind,
    r#let::VarId,
    operation::{
        BinaryOperation, InputOperation, Operation, TypeConstructor, TypeOperation, UnaryOperation,
    },
    thunk::Thunk,
};

use super::{CurrentBlock, Reifier};
use crate::body::{
    constant::Constant,
    local::Local,
    operand::Operand,
    place::{FieldIndex, Place, Projection},
    rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
};

impl<'mir, 'heap> Reifier<'_, 'mir, '_, '_, 'heap> {
    fn rvalue_data(&self, data: Data<'heap>) -> RValue<'heap> {
        match data {
            Data::Primitive(primitive) => {
                RValue::Load(Operand::Constant(Constant::Primitive(primitive)))
            }
            Data::Struct(Struct { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.heap);
                let mut field_names = Vec::with_capacity(fields.len());

                for field in fields {
                    field_names.push(field.name.value);
                    operands.push(self.operand(field.value));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Struct {
                        fields: self.context.interner.symbols.intern_slice(&field_names),
                    },
                    operands,
                })
            }
            Data::Dict(Dict { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len() * 2, self.context.heap);
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
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.heap);
                for &field in fields {
                    operands.push(self.operand(field));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Tuple,
                    operands,
                })
            }
            Data::List(List { elements }) => {
                let mut operands = IdVec::with_capacity_in(elements.len(), self.context.heap);
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
        hir_id: HirId,
        span: SpanId,
        operation: TypeOperation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            TypeOperation::Assertion(_) => {
                panic!("ICE: assertions no longer exist in HIR(ANF)")
            }
            TypeOperation::Constructor(ctor @ TypeConstructor { name }) => {
                if let Some(&ptr) = self.state.ctor.get(&name) {
                    return RValue::Load(Operand::Constant(Constant::FnPtr(ptr)));
                }

                let compiler = Reifier::new(self.context, self.state);
                let ptr = compiler.lower_ctor(hir_id, span, ctor);
                self.state.ctor.insert(name, ptr);

                let ptr = Operand::Constant(Constant::FnPtr(ptr));
                let env = Operand::Constant(Constant::Unit);
                let mut operands = IdVec::with_capacity_in(2, self.context.heap);
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
        &self,
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
        &self,
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

    fn rvalue_operation(
        &mut self,
        hir_id: HirId,
        span: SpanId,
        operation: Operation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            Operation::Type(type_operation) => {
                self.rvalue_type_operation(hir_id, span, type_operation)
            }
            Operation::Binary(binary_operation) => self.rvalue_binary_operation(binary_operation),
            Operation::Unary(unary_operation, _) => self.rvalue_unary_operation(unary_operation),
            Operation::Input(input_operation) => Self::rvalue_input_operation(input_operation),
        }
    }

    fn rvalue_variable(&self, node: Node<'heap>) -> RValue<'heap> {
        RValue::Load(self.operand(node))
    }

    fn rvalue_access(&self, node: Node<'heap>) -> RValue<'heap> {
        RValue::Load(self.operand(node))
    }

    fn rvalue_call_thin(
        &self,
        function: Node<'heap>,
        call_arguments: &[CallArgument<'heap>],
    ) -> RValue<'heap> {
        let mut arguments = IdVec::with_capacity_in(call_arguments.len(), self.context.heap);

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
        &self,
        function: Node<'heap>,
        call_arguments: &[CallArgument<'heap>],
    ) -> RValue<'heap> {
        // The argument to a fat call *must* be a place, it cannot be a constant, because a constant
        // cannot represent a fat-pointer, which is only constructed using an aggregate.
        let function = match self.operand(function) {
            Operand::Place(place) => place,
            Operand::Constant(_) => panic!(
                "ICE: fat calls on constants are not supported - should not even happen in the \
                 first place"
            ),
        };

        // To the function we add two projections, one for the function pointer, and one for the
        // captured environment
        let function_pointer =
            function.project(self.context.interner, Projection::Field(FieldIndex::new(0)));
        let environment =
            function.project(self.context.interner, Projection::Field(FieldIndex::new(1)));

        let mut arguments = IdVec::with_capacity_in(call_arguments.len() + 1, self.context.heap);

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
        &self,
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
        span: SpanId,
        closure: Closure<'heap>,
    ) -> RValue<'heap> {
        let (ptr, env) = self.transform_closure(block, span, closure);

        // We first need to figure out the environment that we need to capture, these are variables
        // that are referenced out of scope (upvars).
        let mut closure_operands = IdVec::with_capacity_in(2, self.context.heap);
        closure_operands.push(Operand::Constant(Constant::FnPtr(ptr)));
        closure_operands.push(Operand::Place(Place::local(env, self.context.interner)));

        RValue::Aggregate(Aggregate {
            kind: AggregateKind::Closure,
            operands: closure_operands,
        })
    }

    fn rvalue_thunk(&mut self, span: SpanId, var: VarId, thunk: Thunk<'heap>) -> RValue<'heap> {
        // Thunks have no dependencies, and therefore no captures
        let compiler = Reifier::new(self.context, self.state);
        let ptr = compiler.lower_thunk(span, thunk);
        self.state.thunks.insert(var, ptr);

        RValue::Load(Operand::Constant(Constant::FnPtr(ptr)))
    }

    pub(super) fn rvalue(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        var: VarId,
        local: Local,
        node: Node<'heap>,
    ) -> Option<RValue<'heap>> {
        let rvalue = match node.kind {
            NodeKind::Data(data) => self.rvalue_data(data),
            NodeKind::Variable(_) => self.rvalue_variable(node),
            NodeKind::Let(_) => unreachable!("HIR(ANF) does not have nested let bindings"),
            NodeKind::Operation(operation) => self.rvalue_operation(node.id, node.span, operation),
            NodeKind::Access(_) => self.rvalue_access(node),
            NodeKind::Call(call) => self.rvalue_call(call),
            NodeKind::Branch(branch) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.terminator_branch(block, local, node.span, branch);
                return None;
            }
            NodeKind::Closure(closure) => self.rvalue_closure(block, node.span, closure),
            NodeKind::Thunk(thunk) => self.rvalue_thunk(node.span, var, thunk),
            NodeKind::Graph(graph) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.terminator_graph(block, local, node.span, graph);
                return None;
            }
        };

        Some(rvalue)
    }
}
