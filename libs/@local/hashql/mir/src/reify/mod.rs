#![expect(clippy::todo)]
use hashql_core::{
    heap::{self, Heap},
    id::{IdCounter, IdVec},
    span::SpanId,
    symbol::Symbol,
    r#type::{TypeId, environment::Environment},
};
use hashql_hir::node::{
    Node,
    access::{Access, FieldAccess, IndexAccess},
    data::{Data, Dict, List, Struct, Tuple},
    kind::NodeKind,
    r#let::{Binding, Let, VarIdVec},
    operation::{BinaryOperation, Operation, TypeConstructor, TypeOperation, UnaryOperation},
    variable::Variable,
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{Place, Projection},
        rvalue::{Aggregate, AggregateKind, Binary, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, Terminator, TerminatorKind},
    },
    def::{DefId, DefIdVec},
    intern::Interner,
};

struct ReifyContext<'ctx, 'heap> {
    bodies: &'ctx mut DefIdVec<Body<'heap>>,
    interner: &'ctx Interner<'heap>,
    environment: &'ctx Environment<'heap>,
    heap: &'heap Heap,
}

struct BodyContext<'ctx, 'heap> {
    blocks: &'ctx mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Local>,
    counter: IdCounter<Local>,
}

struct BlockCompiler<'ctx, 'reify, 'heap> {
    context: &'ctx mut ReifyContext<'reify, 'heap>,
    blocks: &'ctx mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Option<Local>>,

    current_block: BasicBlock<'heap>,
    current_block_id: Option<BasicBlockId>,

    result_into: Option<Local>, // if none it's a `Return` call
}

impl<'ctx, 'reify, 'heap> BlockCompiler<'ctx, 'reify, 'heap> {
    fn compile_local(&self, node: &Node<'heap>) -> Local {
        match node.kind {
            NodeKind::Variable(Variable::Local(local)) => self.locals[local.id.value]
                .unwrap_or_else(|| {
                    unreachable!(
                        "The variable should have been assigned to a local before reaching this \
                         point."
                    )
                }),
            _ => todo!("diagnostic: should never happen (ICE)"),
        }
    }

    fn compile_place(&self, node: &Node<'heap>) -> Place<'heap> {
        let mut projections = Vec::new();

        let mut current = node;
        loop {
            match current.kind {
                NodeKind::Access(Access::Field(FieldAccess { expr, field })) => {
                    // TODO: this isn't correct, we need type information here to know *what* we're
                    // targetting, is it a (closed) struct, is it a tuple?

                    // todo: in case of closed structs specialize into a `Projection::Field`, as the
                    // order is complete
                    // (requires type information)
                    projections.push(Projection::FieldByName(field.value));
                    current = expr;
                }
                NodeKind::Access(Access::Index(IndexAccess { expr, index })) => {
                    projections.push(Projection::Index(self.compile_local(index)));
                    current = expr;
                }
                _ => break,
            }
        }

        // At this point the variable *must* be a local, due to HIR(ANF) rules
        let local = self.compile_local(current);
        // projections are built outside -> inside, we need to reverse them
        projections.reverse();

        Place {
            local,
            projections: self.context.interner.projections.intern_slice(&projections),
        }
    }

    fn compile_operand(&self, node: &Node<'heap>) -> Operand<'heap> {
        match node.kind {
            NodeKind::Variable(Variable::Qualified(_)) => {
                todo!("diagnostic: not supported (yet)") // <- would be an FnPtr
            }
            &NodeKind::Data(Data::Primitive(primitive)) => {
                Operand::Constant(Constant::Primitive(primitive))
            }
            _ => Operand::Place(self.compile_place(node)),
        }
    }

    fn compile_rvalue_data(&self, data: &Data<'heap>) -> RValue<'heap> {
        match data {
            &Data::Primitive(primitive) => {
                RValue::Load(Operand::Constant(Constant::Primitive(primitive)))
            }
            Data::Struct(Struct { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.heap);
                let mut field_names = Vec::with_capacity(fields.len());

                for field in fields {
                    field_names.push(field.name.value);
                    operands.push(self.compile_operand(&field.value));
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
                    operands.push(self.compile_operand(&field.key));
                    operands.push(self.compile_operand(&field.value));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Dict,
                    operands,
                })
            }
            Data::Tuple(Tuple { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.heap);
                for field in fields {
                    operands.push(self.compile_operand(field));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Tuple,
                    operands,
                })
            }
            Data::List(List { elements }) => {
                let mut operands = IdVec::with_capacity_in(elements.len(), self.context.heap);
                for element in elements {
                    operands.push(self.compile_operand(element));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::List,
                    operands,
                })
            }
        }
    }

    fn compile_type_ctor(&mut self, span: SpanId, name: Symbol<'heap>) -> DefId {
        // TODO: only recompile if we really need to
        let input = Local::new(0);
        let output = Local::new(1);

        // TODO: actually, we can check if by the arity of the function, we need type information
        // for that
        let has_input = true;

        let mut operands = IdVec::with_capacity_in(1, self.context.heap);
        if has_input {
            operands.push(Operand::Place(Place {
                local: input,
                projections: self.context.interner.projections.intern_slice(&[]),
            }));
        } else {
            operands.push(Operand::Constant(Constant::Unit));
        }

        let statement = Statement {
            span,
            kind: StatementKind::Assign(Assign {
                lhs: Place {
                    local: output,
                    projections: self.context.interner.projections.intern_slice(&[]),
                },
                rhs: RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Opaque(name),
                    operands,
                }),
            }),
        };

        let mut statements = heap::Vec::with_capacity_in(1, self.context.heap);
        statements.push(statement);

        let mut r#return = Vec::with_capacity_in(1, self.context.heap);
        r#return.push(Operand::Place(Place {
            local: output,
            projections: self.context.interner.projections.intern_slice(&[]),
        }));

        let bb = BasicBlock {
            params: self.context.interner.locals.intern_slice(&[]),
            statements,
            terminator: Terminator {
                span,
                kind: TerminatorKind::Return(Return {
                    values: r#return.into_boxed_slice(),
                }),
            },
        };

        let mut basic_blocks = IdVec::with_capacity_in(1, self.context.heap);
        basic_blocks.push(bb);

        let body = Body {
            span,
            source: Source::Ctor(name),
            basic_blocks,
            args: usize::from(has_input),
        };

        self.context.bodies.push(body)
    }

    fn compile_rvalue_type_operation(
        &mut self,
        span: SpanId,
        operation: &TypeOperation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            TypeOperation::Assertion(_) => {
                todo!("diagnostic: assertions no longer exist in HIR(ANF)")
            }
            TypeOperation::Constructor(TypeConstructor {
                name,
                closure: _,
                arguments: _,
            }) => {
                let def = self.compile_type_ctor(span, *name);
                RValue::Load(Operand::Constant(Constant::FnPtr(def)))
            }
        }
    }

    fn compile_rvalue_binary_operation(
        &self,
        BinaryOperation { op, left, right }: &BinaryOperation<'heap>,
    ) -> RValue<'heap> {
        let left = self.compile_operand(left);
        let right = self.compile_operand(right);

        RValue::Binary(Binary {
            op: op.value,
            left,
            right,
        })
    }

    fn compile_rvalue_unary_operation(
        &self,
        UnaryOperation { op, expr }: &UnaryOperation<'heap>,
    ) -> RValue<'heap> {
        let operand = self.compile_operand(expr);

        RValue::Unary(Unary {
            op: op.value,
            operand,
        })
    }

    fn compile_rvalue_operation(
        &mut self,
        span: SpanId,
        operation: &Operation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            Operation::Type(type_operation) => {
                self.compile_rvalue_type_operation(span, type_operation)
            }
            Operation::Binary(binary_operation) => {
                self.compile_rvalue_binary_operation(binary_operation)
            }
            Operation::Unary(unary_operation, _) => {
                self.compile_rvalue_unary_operation(unary_operation)
            }
        }
    }

    fn compile_binding(&mut self, binding: &Binding<'heap>) {
        let rvalue = match binding.value.kind {
            NodeKind::Data(data) => self.compile_rvalue_data(data),
            NodeKind::Variable(variable) => todo!(),
            NodeKind::Let(_) => unreachable!("HIR(ANF) does not have nested let bindings"),
            NodeKind::Input(input) => todo!(), // Transform into INPUT_EXISTS + INPUT_LOAD calls
            NodeKind::Operation(operation) => {
                self.compile_rvalue_operation(binding.value.span, operation)
            }
            NodeKind::Access(access) => todo!(),
            NodeKind::Call(call) => todo!(),
            NodeKind::Branch(branch) => todo!(),
            NodeKind::Closure(closure) => todo!(),
            NodeKind::Thunk(thunk) => todo!(),
            NodeKind::Graph(graph) => todo!(),
        };
    }
}

// TODO: Extend to multiple packages and modules
//
// Architecture for multi-package support:
//
// ## Structure
// - Each package is identified by `PackageId` and contains modules identified by `ModuleId`
//   (flat-map)
// - Each module contains items (excluding submodules) referenced by `ItemId`
// - Packages form a DAG to handle dependencies
//
// ## Algorithm per package
// 1. **Input**: `ModuleIdVec<Node<'heap>>` for all modules in the package
// 2. **Context**: `PackageIdVec<ModuleIdVec<ItemIdVec<DefId>>>` graph of previously processed items
//    (may be flattened)
// 3. **Pre-allocation**: Reserve bodies for all top-level items (as thunks)
// 4. **Mapping**: Build `(ModuleId, ItemId) -> DefId` index for all items
// 5. **Body generation**: Process each node, creating bodies and handling nested closures
// 6. **Resolution**:
//    - Internal references `(PackageId::CURRENT, ModuleId, ItemId)`: use local mapping
//    - External references: lookup in previously resolved items graph
//
// This design enables incremental compilation by processing packages independently while
// maintaining cross-package reference resolution.
pub fn from_hir<'heap>(node: &Node<'heap>, context: &mut ReifyContext<'_, 'heap>) -> DefId {
    // The node is already in HIR(ANF) - each node will be a thunk.
    let NodeKind::Let(Let { bindings, body }) = node.kind else {
        // It is only a body, per thunking rules this will only be a local identifier
        unreachable!(
            "external modules are currently unsupported upstream, and anything else will result \
             in at least a single thunk"
        );
    };

    // The body will be a (local) variable
    let NodeKind::Variable(variable) = body.kind else {
        unreachable!(
            "Hir(ANF) after thunking guarantees that the outer return type is an identifier"
        );
    };

    let Variable::Local(local) = variable else {
        todo!("error that cross module references aren't supported yet");
    };

    // TODO: with_capacity
    let mut references = VarIdVec::new();

    // The bindings here are purposefully empty, we use them as references, and then insert them
    // later.
    for binding in bindings {
        references.insert(
            binding.binder.id,
            context.bodies.push(Body {
                span: binding.span,
                source: Source::Thunk,
                basic_blocks: BasicBlockVec::new_in(context.heap),
                args: 0,
            }),
        );
    }

    // For each binding, create the basic-block body
    // for binding in bindings {
    //     let def = references[binding.binder.id]
    //         .unwrap_or_else(|| unreachable!("This has just been created"));

    //     let body = compile_body(def, &binding.value, context);
    //     context.bodies[def] = body;
    // }

    todo!()
}
