#![expect(clippy::todo)]
use core::{iter, mem};

use hashql_core::{
    heap::{self, Heap},
    id::{Id, IdCounter, IdVec},
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        Type, TypeId,
        environment::Environment,
        kind::{self, ClosureType, TypeKind},
    },
};
use hashql_hir::{
    context::HirContext,
    node::{
        HirId, Node,
        access::{Access, FieldAccess, IndexAccess},
        branch,
        call::{Call, CallArgument, PointerKind},
        closure::Closure,
        data::{Data, Dict, List, Struct, Tuple},
        kind::NodeKind,
        r#let::{Binding, Let, VarIdVec},
        operation::{
            BinaryOperation, InputOperation, Operation, TypeConstructor, TypeOperation,
            UnaryOperation,
        },
        variable::Variable,
    },
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{FieldIndex, Place, Projection},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{Branch, Goto, Return, Target, Terminator, TerminatorKind},
    },
    def::{DefId, DefIdVec},
    intern::Interner,
};

struct ReifyContext<'mir, 'hir, 'env, 'heap> {
    bodies: &'mir mut DefIdVec<Body<'heap>>,
    interner: &'mir Interner<'heap>,
    environment: &'env Environment<'heap>,
    hir: &'hir HirContext<'hir, 'heap>,
    heap: &'heap Heap,
}

struct BodyContext<'mir, 'heap> {
    blocks: &'mir mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Local>,
    counter: IdCounter<Local>,
}

fn unwrap_union_type<'heap>(
    type_id: TypeId,
    env: &Environment<'heap>,
) -> impl IntoIterator<Item = Type<'heap>> {
    let mut stack = vec![type_id];
    iter::from_fn(move || {
        while let Some(current) = stack.pop() {
            let r#type = env.r#type(current);

            match r#type.kind {
                // ignore apply / generic / opaque wrappers
                TypeKind::Apply(kind::Apply {
                    base,
                    substitutions: _,
                })
                | TypeKind::Generic(kind::Generic { base, arguments: _ })
                | TypeKind::Opaque(kind::OpaqueType {
                    name: _,
                    repr: base,
                }) => stack.push(*base),
                // Unions are automatically flattened, order of unions does not matter, so are added
                // to the back
                TypeKind::Union(kind::UnionType { variants }) => stack.extend_from_slice(variants),

                TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Struct(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_)
                | TypeKind::Closure(_)
                | TypeKind::Param(_)
                | TypeKind::Infer(_)
                | TypeKind::Never
                | TypeKind::Unknown => {
                    return Some(r#type);
                }
            }
        }

        None
    })
}

fn unwrap_closure_type<'heap>(type_id: TypeId, env: &Environment<'heap>) -> ClosureType<'heap> {
    let closure_type = unwrap_union_type(type_id, env)
        .into_iter()
        .next()
        .unwrap_or_else(|| unreachable!("There must be a least one item present"));

    #[expect(clippy::wildcard_enum_match_arm, reason = "readability")]
    match closure_type.kind {
        TypeKind::Closure(closure) => *closure,
        _ => unreachable!("type must be a closure"),
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum RewireKind {
    Goto,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct Rewire {
    kind: RewireKind,
    id: BasicBlockId,
}

impl Rewire {
    fn goto(id: BasicBlockId) -> Self {
        Self {
            kind: RewireKind::Goto,
            id,
        }
    }
}

struct CurrentBlock<'mir, 'heap> {
    heap: &'heap Heap,
    interner: &'mir Interner<'heap>,

    block: BasicBlock<'heap>,
    rewire: Vec<Rewire>,
}

impl<'mir, 'heap> CurrentBlock<'mir, 'heap> {
    fn new(heap: &'heap Heap, interner: &'mir Interner<'heap>) -> Self {
        CurrentBlock {
            heap,
            interner,
            block: Self::empty_block(heap, interner),
            rewire: Vec::new(),
        }
    }

    fn push_statement(&mut self, statement: Statement<'heap>) {
        self.block.statements.push(statement);
    }

    fn empty_block(heap: &'heap Heap, interner: &Interner<'heap>) -> BasicBlock<'heap> {
        BasicBlock {
            params: interner.locals.intern_slice(&[]),
            statements: heap::Vec::new_in(heap),
            // This terminator is temporary and is going to get replaced once finished
            terminator: Terminator {
                span: SpanId::SYNTHETIC,
                kind: TerminatorKind::Unreachable,
            },
        }
    }

    fn complete(
        mut block: BasicBlock<'heap>,
        terminator: Terminator<'heap>,
        rewire: &mut Vec<Rewire>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        debug_assert_eq!(block.terminator.kind, TerminatorKind::Unreachable);
        block.terminator = terminator;

        let block_id = blocks.push(block);

        for rewire in rewire.drain(..) {
            let terminator = &mut blocks[rewire.id].terminator.kind;

            match (rewire.kind, terminator) {
                (
                    RewireKind::Goto,
                    TerminatorKind::Goto(Goto {
                        target: Target { block, args: _ },
                    }),
                ) => {
                    *block = block_id;
                }
                (RewireKind::Goto, _) => {
                    unreachable!("`RewireKind::Goto` is always paired with a goto terminator")
                }
            }
        }

        block_id
    }

    fn terminate(
        &mut self,
        terminator: Terminator<'heap>,
        rewire: impl IntoIterator<Item = Rewire>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        // Finishes the current block, and starts a new one
        let previous = mem::replace(&mut self.block, Self::empty_block(self.heap, self.interner));
        let id = Self::complete(previous, terminator, &mut self.rewire, blocks);

        self.rewire.extend(rewire);

        id
    }

    fn finish(
        mut self,
        terminator: Terminator<'heap>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        Self::complete(self.block, terminator, &mut self.rewire, blocks)
    }
}

struct ClosureCompiler<'mir, 'hir, 'env, 'heap> {
    context: &'mir mut ReifyContext<'mir, 'hir, 'env, 'heap>,
    blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Option<Local>>,
    local_counter: IdCounter<Local>,
    // current_block: BasicBlock<'heap>,
    // current_block_id: Option<BasicBlockId>,

    // result_into: Option<Local>, // if none it's a `Return` call
}

impl<'mir, 'hir, 'env, 'heap> ClosureCompiler<'mir, 'hir, 'env, 'heap> {
    fn compile_local(&self, node: Node<'heap>) -> Local {
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

    fn compile_place(&self, node: Node<'heap>) -> Place<'heap> {
        let mut projections = Vec::new();

        let mut current = node;
        loop {
            match current.kind {
                NodeKind::Access(Access::Field(FieldAccess { expr, field })) => {
                    let type_id = self.context.hir.map.type_id(current.id);

                    let mut items =
                        unwrap_union_type(type_id, self.context.environment).into_iter();
                    let first = items.next().unwrap_or_else(|| {
                        unreachable!("union types are guaranteed to be non-empty")
                    });

                    // Check what type the first element is, if it is a tuple we know that all types
                    // will be tuples, as indices do not constitute valid identifiers and can
                    // therefore not be used as field names in structs.
                    match first.kind {
                        TypeKind::Tuple(_) => {
                            let Ok(index) = field.value.as_str().parse() else {
                                todo!("diagnostic: value too big to be used as index (err)")
                            };

                            projections.push(Projection::Field(FieldIndex::new(index)));
                        }
                        TypeKind::Struct(_) => {
                            // TODO: in the future we must check if this is the only (closed) struct
                            // type, if that is the case, we can use `Projection::Field` instead,
                            // otherwise we must fall back to using the slower `FieldByName`.

                            projections.push(Projection::FieldByName(field.value));
                        }
                        TypeKind::Opaque(_)
                        | TypeKind::Primitive(_)
                        | TypeKind::Intrinsic(_)
                        | TypeKind::Union(_)
                        | TypeKind::Intersection(_)
                        | TypeKind::Closure(_)
                        | TypeKind::Apply(_)
                        | TypeKind::Generic(_)
                        | TypeKind::Param(_)
                        | TypeKind::Infer(_)
                        | TypeKind::Never
                        | TypeKind::Unknown => unreachable!("other types cannot be indexed"),
                    }

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

    fn compile_operand(&self, node: Node<'heap>) -> Operand<'heap> {
        match node.kind {
            NodeKind::Variable(Variable::Qualified(_)) => {
                todo!("diagnostic: not supported (yet)") // <- would be an FnPtr
            }
            NodeKind::Data(Data::Primitive(primitive)) => {
                Operand::Constant(Constant::Primitive(primitive))
            }
            _ => Operand::Place(self.compile_place(node)),
        }
    }

    fn compile_rvalue_data(&self, data: Data<'heap>) -> RValue<'heap> {
        match data {
            Data::Primitive(primitive) => {
                RValue::Load(Operand::Constant(Constant::Primitive(primitive)))
            }
            Data::Struct(Struct { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.heap);
                let mut field_names = Vec::with_capacity(fields.len());

                for field in fields {
                    field_names.push(field.name.value);
                    operands.push(self.compile_operand(field.value));
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
                    operands.push(self.compile_operand(field.key));
                    operands.push(self.compile_operand(field.value));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Dict,
                    operands,
                })
            }
            Data::Tuple(Tuple { fields }) => {
                let mut operands = IdVec::with_capacity_in(fields.len(), self.context.heap);
                for &field in fields {
                    operands.push(self.compile_operand(field));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Tuple,
                    operands,
                })
            }
            Data::List(List { elements }) => {
                let mut operands = IdVec::with_capacity_in(elements.len(), self.context.heap);
                for &element in elements {
                    operands.push(self.compile_operand(element));
                }

                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::List,
                    operands,
                })
            }
        }
    }

    fn compile_type_ctor(&mut self, hir_id: HirId, span: SpanId, name: Symbol<'heap>) -> DefId {
        // TODO: only recompile if we really need to
        let input = Local::new(0);
        let output = Local::new(1);

        let closure_type = unwrap_closure_type(
            self.context.hir.map.type_id(hir_id),
            self.context.environment,
        );
        let has_input = !closure_type.params.is_empty();

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

        let bb = BasicBlock {
            params: self.context.interner.locals.intern_slice(&[]),
            statements,
            terminator: Terminator {
                span,
                kind: TerminatorKind::Return(Return {
                    value: Operand::Place(Place::local(output, self.context.interner)),
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
        hir_id: HirId,
        span: SpanId,
        operation: TypeOperation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            TypeOperation::Assertion(_) => {
                todo!("diagnostic: assertions no longer exist in HIR(ANF)")
            }
            TypeOperation::Constructor(TypeConstructor { name }) => {
                let def = self.compile_type_ctor(hir_id, span, name);
                RValue::Load(Operand::Constant(Constant::FnPtr(def)))
            }
        }
    }

    fn compile_rvalue_binary_operation(
        &self,
        BinaryOperation { op, left, right }: BinaryOperation<'heap>,
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
        UnaryOperation { op, expr }: UnaryOperation<'heap>,
    ) -> RValue<'heap> {
        let operand = self.compile_operand(expr);

        RValue::Unary(Unary {
            op: op.value,
            operand,
        })
    }

    const fn compile_rvalue_input_operation(
        InputOperation { op, name }: InputOperation<'heap>,
    ) -> RValue<'heap> {
        RValue::Input(Input {
            op: op.value,
            name: name.value,
        })
    }

    fn compile_rvalue_operation(
        &mut self,
        hir_id: HirId,
        span: SpanId,
        operation: Operation<'heap>,
    ) -> RValue<'heap> {
        match operation {
            Operation::Type(type_operation) => {
                self.compile_rvalue_type_operation(hir_id, span, type_operation)
            }
            Operation::Binary(binary_operation) => {
                self.compile_rvalue_binary_operation(binary_operation)
            }
            Operation::Unary(unary_operation, _) => {
                self.compile_rvalue_unary_operation(unary_operation)
            }
            Operation::Input(input_operation) => {
                Self::compile_rvalue_input_operation(input_operation)
            }
        }
    }

    fn compile_rvalue_variable(&self, node: Node<'heap>) -> RValue<'heap> {
        RValue::Load(self.compile_operand(node))
    }

    fn compile_rvalue_access(&self, node: Node<'heap>) -> RValue<'heap> {
        RValue::Load(self.compile_operand(node))
    }

    fn compile_rvalue_call_thin(
        &self,
        function: Node<'heap>,
        call_arguments: &[CallArgument<'heap>],
    ) -> RValue<'heap> {
        let mut arguments = IdVec::with_capacity_in(call_arguments.len(), self.context.heap);

        for CallArgument { span: _, value } in call_arguments {
            arguments.push(self.compile_operand(*value));
        }

        // A thin call is very simple, as the calling convention means that we do not need to worry
        // about the environment (which would be the first argument).
        RValue::Apply(Apply {
            function: self.compile_operand(function),
            arguments,
        })
    }

    fn compile_rvalue_call_fat(
        &self,
        function: Node<'heap>,
        call_arguments: &[CallArgument<'heap>],
    ) -> RValue<'heap> {
        // The argument to a fat call *must* be a place, it cannot be a constant, because a constant
        // cannot represent a fat-pointer, which is only constructed using an aggregate.
        let function = match self.compile_operand(function) {
            Operand::Place(place) => place,
            Operand::Constant(_) => todo!("diagnostic: fat calls on constants are not supported"),
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
            arguments.push(self.compile_operand(*value));
        }

        RValue::Apply(Apply {
            function: Operand::Place(function_pointer),
            arguments,
        })
    }

    fn compile_rvalue_call(
        &self,
        Call {
            kind,
            function,
            arguments,
        }: Call<'heap>,
    ) -> RValue<'heap> {
        match kind {
            PointerKind::Fat => self.compile_rvalue_call_fat(function, &arguments),
            PointerKind::Thin => self.compile_rvalue_call_thin(function, &arguments),
        }
    }

    fn terminate_goto(
        &mut self,
        block: CurrentBlock<'mir, 'heap>,
        operand: Spanned<Operand<'heap>>,
    ) -> BasicBlockId {
        block.finish(
            Terminator {
                span: operand.span,
                kind: TerminatorKind::Goto(Goto {
                    target: Target {
                        // This is going to get replaced once terminated
                        block: BasicBlockId::PLACEHOLDER,
                        args: self
                            .context
                            .interner
                            .operands
                            .intern_slice(&[operand.value]),
                    },
                }),
            },
            &mut self.blocks,
        )
    }

    fn compile_branch_if(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        span: SpanId,
        branch::If { test, then, r#else }: branch::If<'heap>,
    ) {
        let test = self.compile_operand(test);

        let (then, then_operand) = self.compile_node(then);
        let (r#else, else_operand) = self.compile_node(r#else);

        // We now need to wire *both* to be goto to the next block
        let then = self.terminate_goto(then, then_operand);
        let r#else = self.terminate_goto(r#else, else_operand);

        block.terminate(
            Terminator {
                span,
                kind: TerminatorKind::Branch(Branch {
                    test,
                    then: Target::block(then, self.context.interner),
                    r#else: Target::block(r#else, self.context.interner),
                }),
            },
            [Rewire::goto(then), Rewire::goto(r#else)],
            &mut self.blocks,
        );
    }

    fn compile_branch(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        span: SpanId,
        branch: branch::Branch<'heap>,
    ) {
        match branch {
            branch::Branch::If(r#if) => self.compile_branch_if(block, span, r#if),
        }
    }

    fn compile_closure(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        span: SpanId,
        closure: Closure<'heap>,
    ) {
        // We first need to figure out the environment that we need to capture, these are variables
        // that are referenced out of scope (upvars).
        todo!()
    }

    fn compile_binding(&mut self, block: &mut CurrentBlock<'mir, 'heap>, binding: &Binding<'heap>) {
        let local = self.local_counter.next();
        self.locals.insert(binding.binder.id, local);

        let rvalue = match binding.value.kind {
            NodeKind::Data(data) => self.compile_rvalue_data(data),
            NodeKind::Variable(_) => self.compile_rvalue_variable(binding.value),
            NodeKind::Let(_) => unreachable!("HIR(ANF) does not have nested let bindings"),
            NodeKind::Operation(operation) => {
                self.compile_rvalue_operation(binding.value.id, binding.value.span, operation)
            }
            NodeKind::Access(_) => self.compile_rvalue_access(binding.value),
            NodeKind::Call(call) => self.compile_rvalue_call(call),
            NodeKind::Branch(branch) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.compile_branch(block, binding.value.span, branch);
                return;
            }
            // This turns into two statements, the first captures the environment, the second create
            // the FnPtr aggregate
            NodeKind::Closure(closure) => todo!(),
            // We can easily support this, but using a very similar logic to the one in
            // `NodeKind::Closure`
            NodeKind::Thunk(_) => unreachable!("HIR(ANF) does not support nested thunks"),
            NodeKind::Graph(graph) => todo!(), // this turns into a terminator
        };

        block.push_statement(Statement {
            span: binding.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place {
                    local,
                    projections: self.context.interner.projections.intern_slice(&[]),
                },
                rhs: rvalue,
            }),
        });
    }

    fn compile_node(
        &mut self,
        node: Node<'heap>,
    ) -> (CurrentBlock<'mir, 'heap>, Spanned<Operand<'heap>>) {
        // The code is in ANF, so either the body is an atom *or* a set of let bindings
        let (bindings, body) = match node.kind {
            NodeKind::Let(Let { bindings, body }) => (bindings.0, body),
            _ => (&[] as &[_], node),
        };

        let mut block = CurrentBlock::new(self.context.heap, self.context.interner);

        for binding in bindings {
            self.compile_binding(&mut block, binding);
        }

        // body is always an anf atom, therefore compile to operand
        let body = Spanned {
            value: self.compile_operand(body),
            span: body.span,
        };

        // The final terminator is still set to `Unreachable`, the caller must set the goto if
        // required
        (block, body)
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
pub fn from_hir<'heap>(node: &Node<'heap>, context: &mut ReifyContext<'_, '_, '_, 'heap>) -> DefId {
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
