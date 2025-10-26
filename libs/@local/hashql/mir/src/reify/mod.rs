#![expect(clippy::todo)]
use core::{iter, mem};

use hashql_core::{
    collections::FastHashMap,
    heap::{self, Heap},
    id::{
        Id as _, IdCounter, IdVec,
        bit_vec::{BitRelations as _, MixedBitSet},
    },
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
    lower::dataflow::{VariableDefinitions, VariableDependencies},
    node::{
        HirId, Node,
        access::{Access, FieldAccess, IndexAccess},
        branch,
        call::{Call, CallArgument, PointerKind},
        closure::Closure,
        data::{Data, Dict, List, Struct, Tuple},
        graph::{self, Graph},
        kind::NodeKind,
        r#let::{Binding, Let, VarId, VarIdVec},
        operation::{
            BinaryOperation, InputOperation, Operation, TypeConstructor, TypeOperation,
            UnaryOperation,
        },
        thunk::Thunk,
        variable::Variable,
    },
    visit::Visitor as _,
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
        terminator::{self, Branch, Goto, GraphRead, Return, Target, Terminator, TerminatorKind},
    },
    def::{DefId, DefIdVec},
    intern::Interner,
};

pub struct ReifyContext<'mir, 'hir, 'env, 'heap> {
    pub bodies: &'mir mut DefIdVec<Body<'heap>>,
    pub interner: &'mir Interner<'heap>,
    pub environment: &'env Environment<'heap>,
    pub hir: &'hir HirContext<'hir, 'heap>,
    pub heap: &'heap Heap,
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
    GraphRead,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct Rewire {
    kind: RewireKind,
    id: BasicBlockId,
}

impl Rewire {
    const fn goto(id: BasicBlockId) -> Self {
        Self {
            kind: RewireKind::Goto,
            id,
        }
    }

    const fn graph_read(id: BasicBlockId) -> Self {
        Self {
            kind: RewireKind::GraphRead,
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

    fn replace_params(&mut self, params: &[Local]) {
        debug_assert!(self.block.params.is_empty());
        self.block.params = self.interner.locals.intern_slice(params);
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
                (
                    RewireKind::GraphRead,
                    TerminatorKind::GraphRead(GraphRead {
                        head: _,
                        body: _,
                        tail: _,
                        target,
                    }),
                ) => {
                    *target = block_id;
                }
                (RewireKind::GraphRead, _) => {
                    unreachable!(
                        "`RewireKind::GraphRead` is always paired with a graph read terminator"
                    )
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

pub struct Thunks {
    // Thunks are very sparse, and are always only the first few ids, as we do not allow for nested
    // thunks, therefore we can safely use a vector here without blowing up memory usage.
    defs: VarIdVec<Option<DefId>>,
    set: MixedBitSet<VarId>,
}

impl Thunks {
    fn insert(&mut self, var: VarId, def: DefId) {
        self.defs.insert(var, def);
        self.set.insert(var);
    }
}

struct CrossCompileState<'heap> {
    thunks: Thunks,

    // Already created constructors
    ctor: FastHashMap<Symbol<'heap>, DefId>,
}

struct ClosureCompiler<'ctx, 'mir, 'hir, 'env, 'heap> {
    context: &'ctx mut ReifyContext<'mir, 'hir, 'env, 'heap>,
    state: &'ctx mut CrossCompileState<'heap>,

    blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Option<Local>>,
    local_counter: IdCounter<Local>,
}

impl<'ctx, 'mir, 'hir, 'env, 'heap> ClosureCompiler<'ctx, 'mir, 'hir, 'env, 'heap> {
    const fn new(
        context: &'ctx mut ReifyContext<'mir, 'hir, 'env, 'heap>,
        state: &'ctx mut CrossCompileState<'heap>,
    ) -> Self {
        let blocks = BasicBlockVec::new_in(context.heap);

        Self {
            context,
            state,
            blocks,
            locals: VarIdVec::new(),
            local_counter: IdCounter::new(),
        }
    }

    fn local(&self, node: Node<'heap>) -> Local {
        let NodeKind::Variable(Variable::Local(local)) = node.kind else {
            panic!("ICE: only local variables are allowed to be local")
        };

        let Some(local) = self.locals[local.id.value] else {
            panic!(
                "ICE: The variable should have been assigned to a local before reaching this \
                 point."
            )
        };

        local
    }

    fn place(&self, node: Node<'heap>) -> Place<'heap> {
        let mut projections = Vec::new();

        let mut current = node;
        loop {
            match current.kind {
                NodeKind::Access(Access::Field(FieldAccess { expr, field })) => {
                    let type_id = self.context.hir.map.type_id(current.id);

                    let mut items =
                        unwrap_union_type(type_id, self.context.environment).into_iter();
                    let first = items.next().unwrap_or_else(|| {
                        panic!("ICE: union types are guaranteed to be non-empty")
                    });

                    // Check what type the first element is, if it is a tuple we know that all types
                    // will be tuples, as indices do not constitute valid identifiers and can
                    // therefore not be used as field names in structs.
                    match first.kind {
                        TypeKind::Tuple(_) => {
                            let Ok(index) = field.value.as_str().parse() else {
                                todo!("ERR: value too big to be used as index")
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
                    projections.push(Projection::Index(self.local(index)));
                    current = expr;
                }
                NodeKind::Data(_)
                | NodeKind::Variable(_)
                | NodeKind::Let(_)
                | NodeKind::Operation(_)
                | NodeKind::Call(_)
                | NodeKind::Branch(_)
                | NodeKind::Closure(_)
                | NodeKind::Thunk(_)
                | NodeKind::Graph(_) => break,
            }
        }

        // At this point the variable *must* be a local, due to HIR(ANF) rules
        let local = self.local(current);
        // projections are built outside -> inside, we need to reverse them
        projections.reverse();

        Place {
            local,
            projections: self.context.interner.projections.intern_slice(&projections),
        }
    }

    fn operand(&self, node: Node<'heap>) -> Operand<'heap> {
        match node.kind {
            NodeKind::Variable(Variable::Qualified(_)) => {
                todo!("diagnostic: not supported (yet)") // <- would be an FnPtr
            }
            NodeKind::Data(Data::Primitive(primitive)) => {
                Operand::Constant(Constant::Primitive(primitive))
            }
            NodeKind::Variable(Variable::Local(local))
                if let Some(&ptr) = self
                    .state
                    .thunks
                    .defs
                    .get(local.id.value)
                    .and_then(Option::as_ref) =>
            {
                Operand::Constant(Constant::FnPtr(ptr))
            }
            NodeKind::Data(_)
            | NodeKind::Variable(_)
            | NodeKind::Let(_)
            | NodeKind::Operation(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Branch(_)
            | NodeKind::Closure(_)
            | NodeKind::Thunk(_)
            | NodeKind::Graph(_) => Operand::Place(self.place(node)),
        }
    }

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
                todo!("diagnostic: assertions no longer exist in HIR(ANF)")
            }
            TypeOperation::Constructor(ctor @ TypeConstructor { name }) => {
                if let Some(&ptr) = self.state.ctor.get(&name) {
                    return RValue::Load(Operand::Constant(Constant::FnPtr(ptr)));
                }

                let compiler = ClosureCompiler::new(self.context, self.state);
                let ptr = compiler.compile_ctor(hir_id, span, ctor);
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
        destination: Local,
        span: SpanId,
        branch::If { test, then, r#else }: branch::If<'heap>,
    ) {
        let test = self.operand(test);

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

        // Change the new block to take a single argument, which is where to store the result
        block.replace_params(&[destination]);
    }

    fn transform_branch(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        branch: branch::Branch<'heap>,
    ) {
        match branch {
            branch::Branch::If(r#if) => self.compile_branch_if(block, destination, span, r#if),
        }
    }

    fn transform_closure(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        span: SpanId,
        closure: Closure<'heap>,
    ) -> (DefId, Local) {
        let mut dependencies = VariableDependencies::new(self.context.hir);
        dependencies.visit_closure(&closure);
        let mut dependencies = dependencies.finish();

        let mut definitions = VariableDefinitions::from_set(self.state.thunks.set.clone());
        definitions.visit_closure(&closure);
        let definitions = definitions.finish();

        dependencies.subtract(&definitions);
        let captures = dependencies;

        let compiler = ClosureCompiler::new(self.context, self.state);
        let ptr = compiler.compile_closure(span, &captures, closure);

        // Now we need to do environment capture, for that create a tuple aggregate of all the
        // captured variables in a new local
        let env_local = self.local_counter.next();
        let mut tuple_elements = IdVec::with_capacity_in(captures.count(), self.context.heap);
        for var in &captures {
            let capture_local = self.locals[var].unwrap_or_else(|| {
                unreachable!("diagnostic: ICE - must have had a local assigned")
            });
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

        (ptr, env_local)
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
        let compiler = ClosureCompiler::new(self.context, self.state);
        let ptr = compiler.compile_thunk(span, thunk);
        self.state.thunks.insert(var, ptr);

        RValue::Load(Operand::Constant(Constant::FnPtr(ptr)))
    }

    fn transform_graph_read_head(
        &self,
        head: graph::GraphReadHead<'heap>,
    ) -> terminator::GraphReadHead<'heap> {
        match head {
            graph::GraphReadHead::Entity { axis } => terminator::GraphReadHead::Entity {
                axis: self.operand(axis),
            },
        }
    }

    const fn transform_graph_read_tail(tail: graph::GraphReadTail) -> terminator::GraphReadTail {
        match tail {
            graph::GraphReadTail::Collect => terminator::GraphReadTail::Collect,
        }
    }

    fn transform_graph_read_body(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        body: graph::GraphReadBody<'heap>,
    ) -> terminator::GraphReadBody {
        match body {
            graph::GraphReadBody::Filter(filter) => {
                let NodeKind::Closure(closure) = filter.kind else {
                    panic!("ICE: expected closure filter")
                };

                let (ptr, env) = self.transform_closure(block, filter.span, closure);
                terminator::GraphReadBody::Filter(ptr, env)
            }
        }
    }

    fn transform_graph_read_bodies(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        bodies: &[graph::GraphReadBody<'heap>],
    ) -> heap::Vec<'heap, terminator::GraphReadBody> {
        let mut result = heap::Vec::with_capacity_in(bodies.len(), self.context.heap);

        result.extend(
            bodies
                .iter()
                .map(|&body| self.transform_graph_read_body(block, body)),
        );

        result
    }

    fn transform_graph_read(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        graph::GraphRead { head, body, tail }: graph::GraphRead<'heap>,
    ) {
        let head = self.transform_graph_read_head(head);
        let body = self.transform_graph_read_bodies(block, &body);
        let tail = Self::transform_graph_read_tail(tail);

        let terminator = Terminator {
            span,
            kind: TerminatorKind::GraphRead(GraphRead {
                head,
                body,
                tail,
                target: BasicBlockId::PLACEHOLDER,
            }),
        };

        let prev = block.terminate(terminator, [], &mut self.blocks);
        block.rewire.push(Rewire::graph_read(prev));

        // Change the new block to take a single argument, which is where to store the result
        block.replace_params(&[destination]);
    }

    fn transform_graph(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        graph: Graph<'heap>,
    ) {
        match graph {
            Graph::Read(read) => self.transform_graph_read(block, destination, span, read),
        }
    }

    fn transform_binding(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        binding: &Binding<'heap>,
    ) {
        let local = self.local_counter.next();
        self.locals.insert(binding.binder.id, local);

        let rvalue = match binding.value.kind {
            NodeKind::Data(data) => self.rvalue_data(data),
            NodeKind::Variable(_) => self.rvalue_variable(binding.value),
            NodeKind::Let(_) => unreachable!("HIR(ANF) does not have nested let bindings"),
            NodeKind::Operation(operation) => {
                self.rvalue_operation(binding.value.id, binding.value.span, operation)
            }
            NodeKind::Access(_) => self.rvalue_access(binding.value),
            NodeKind::Call(call) => self.rvalue_call(call),
            NodeKind::Branch(branch) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.transform_branch(block, local, binding.value.span, branch);
                return;
            }
            NodeKind::Closure(closure) => self.rvalue_closure(block, binding.value.span, closure),
            NodeKind::Thunk(thunk) => {
                self.rvalue_thunk(binding.value.span, binding.binder.id, thunk)
            }
            NodeKind::Graph(graph) => {
                // This turns into a terminator, and therefore does not contribute a statement
                let () = self.transform_graph(block, local, binding.value.span, graph);
                return;
            }
        };

        block.push_statement(Statement {
            span: binding.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(local, self.context.interner),
                rhs: rvalue,
            }),
        });
    }

    fn compile_body(
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

    fn compile_node(
        &mut self,
        node: Node<'heap>,
    ) -> (CurrentBlock<'mir, 'heap>, Spanned<Operand<'heap>>) {
        let mut block = CurrentBlock::new(self.context.heap, self.context.interner);
        let body = self.compile_body(&mut block, node);

        (block, body)
    }

    fn compile_impl(
        mut self,
        source: Source<'heap>,
        span: SpanId,
        params: impl IntoIterator<Item = VarId>,
        captures: Option<&MixedBitSet<VarId>>,
        on_block: impl FnOnce(&mut Self, &mut CurrentBlock<'mir, 'heap>) -> Spanned<Operand<'heap>>,
    ) -> DefId {
        let mut args = 0;

        // Closures and type constructors are fat pointers, the reason is that they are
        // constructible by users and therefore always correspond to a fat call.
        // In the future we might want to specialize `ctor` in a way that allows us to move them to
        // be thin calls (although that would require that we move functions into a separate type
        // from closures).
        let env = if matches!(source, Source::Closure | Source::Ctor(_)) {
            let local = self.local_counter.next();
            args += 1;

            local
        } else {
            debug_assert!(captures.is_none());

            // ends up never being used
            Local::MAX
        };

        for param in params {
            let local = self.local_counter.next();
            args += 1;

            self.locals.insert(param, local);
        }

        let mut block = CurrentBlock::new(self.context.heap, self.context.interner);

        // For each of the variables mentioned, create a local variable statement, which is a
        // projection inside of a tuple.
        for (index, capture) in captures.into_iter().flatten().enumerate() {
            let local = self.local_counter.next();
            self.locals.insert(capture, local);

            block.push_statement(Statement {
                span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(local, self.context.interner),
                    rhs: RValue::Load(Operand::Place(Place {
                        local: env,
                        projections: self
                            .context
                            .interner
                            .projections
                            .intern_slice(&[Projection::Field(FieldIndex::new(index))]),
                    })),
                }),
            });
        }

        let body = on_block(&mut self, &mut block);

        block.finish(
            Terminator {
                span: body.span,
                kind: TerminatorKind::Return(Return { value: body.value }),
            },
            &mut self.blocks,
        );

        let block = Body {
            span,
            source,
            basic_blocks: self.blocks,
            args,
        };

        self.context.bodies.push(block)
    }

    fn compile_closure(
        self,
        span: SpanId,
        captures: &MixedBitSet<VarId>,
        closure: Closure<'heap>,
    ) -> DefId {
        self.compile_impl(
            Source::Closure,
            span,
            closure.signature.params.iter().map(|param| param.name.id),
            Some(captures),
            |this, block| this.compile_body(block, closure.body),
        )
    }

    fn compile_thunk(self, span: SpanId, thunk: Thunk<'heap>) -> DefId {
        self.compile_impl(
            Source::Thunk,
            span,
            [] as [VarId; 0],
            None,
            |this, block| this.compile_body(block, thunk.body),
        )
    }

    fn compile_ctor(self, hir_id: HirId, span: SpanId, ctor: TypeConstructor<'heap>) -> DefId {
        let closure_type = unwrap_closure_type(
            self.context.hir.map.type_id(hir_id),
            self.context.environment,
        );

        let param = if closure_type.params.is_empty() {
            None
        } else {
            // Because the function is pure, we invent a 0 parameter as the local, meaning that we
            // compile it in isolation
            Some(VarId::new(0))
        };

        self.compile_impl(Source::Ctor(ctor.name), span, param, None, |this, block| {
            let output = this.local_counter.next();
            let lhs = Place::local(output, this.context.interner);

            let operand = if let Some(param) = param {
                Operand::Place(Place::local(
                    this.locals[param]
                        .unwrap_or_else(|| unreachable!("We just verified this local exists")),
                    this.context.interner,
                ))
            } else {
                Operand::Constant(Constant::Unit)
            };

            let mut operands = IdVec::with_capacity_in(1, this.context.heap);
            operands.push(operand);

            let rhs = RValue::Aggregate(Aggregate {
                kind: AggregateKind::Opaque(ctor.name),
                operands,
            });

            block.push_statement(Statement {
                span,
                kind: StatementKind::Assign(Assign { lhs, rhs }),
            });

            Spanned {
                value: Operand::Place(lhs),
                span,
            }
        })
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
pub fn from_hir<'heap>(node: Node<'heap>, context: &mut ReifyContext<'_, '_, '_, 'heap>) -> DefId {
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
        panic!(
            "ICE: HIR(ANF) after thunking guarantees that the outer return type is an identifier"
        );
    };

    let Variable::Local(local) = variable else {
        panic!("ICE: error that cross module references aren't supported yet");
    };

    let thunks = Thunks {
        defs: VarIdVec::new(),
        set: MixedBitSet::new_empty(context.hir.counter.var.size()),
    };
    let mut state = CrossCompileState {
        thunks,
        ctor: FastHashMap::default(),
    };

    for binding in bindings {
        let NodeKind::Thunk(thunk) = binding.value.kind else {
            panic!("ICE: diagnostic: top level must be thunks");
        };

        let compiler = ClosureCompiler::new(context, &mut state);
        let def_id = compiler.compile_thunk(binding.value.span, thunk);
        state.thunks.insert(binding.binder.id, def_id);
    }

    state.thunks.defs[local.id.value]
        .unwrap_or_else(|| panic!("ICE: diagnostic: local must be a thunk"))
}
