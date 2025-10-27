mod atom;
mod current;
mod rvalue;
mod terminator;
mod transform;
mod types;

use hashql_core::{
    collections::{
        FastHashMap,
        pool::{MixedBitSetPool, MixedBitSetRecycler, Pool},
    },
    heap::Heap,
    id::{Id as _, IdCounter, IdVec, bit_vec::MixedBitSet},
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::environment::Environment,
};
use hashql_hir::{
    context::HirContext,
    node::{
        HirId, Node,
        closure::Closure,
        kind::NodeKind,
        r#let::{Let, VarId, VarIdVec},
        operation::TypeConstructor,
        thunk::Thunk,
        variable::Variable,
    },
};

use self::{current::CurrentBlock, types::unwrap_closure_type};
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockVec},
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{FieldIndex, Place, Projection},
        rvalue::{Aggregate, AggregateKind, RValue},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, Terminator, TerminatorKind},
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

    var_pool: MixedBitSetPool<VarId>,
}

struct Reifier<'ctx, 'mir, 'hir, 'env, 'heap> {
    context: &'ctx mut ReifyContext<'mir, 'hir, 'env, 'heap>,
    state: &'ctx mut CrossCompileState<'heap>,

    blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Option<Local>>,
    local_counter: IdCounter<Local>,
}

impl<'ctx, 'mir, 'hir, 'env, 'heap> Reifier<'ctx, 'mir, 'hir, 'env, 'heap> {
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

    fn lower_impl(
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

    fn lower_closure(
        self,
        span: SpanId,
        captures: &MixedBitSet<VarId>,
        closure: Closure<'heap>,
    ) -> DefId {
        self.lower_impl(
            Source::Closure,
            span,
            closure.signature.params.iter().map(|param| param.name.id),
            Some(captures),
            |this, block| this.transform_body(block, closure.body),
        )
    }

    fn lower_thunk(self, span: SpanId, thunk: Thunk<'heap>) -> DefId {
        self.lower_impl(
            Source::Thunk,
            span,
            [] as [VarId; 0],
            None,
            |this, block| this.transform_body(block, thunk.body),
        )
    }

    fn lower_ctor(self, hir_id: HirId, span: SpanId, ctor: TypeConstructor<'heap>) -> DefId {
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

        self.lower_impl(Source::Ctor(ctor.name), span, param, None, |this, block| {
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
        var_pool: MixedBitSetPool::with_recycler(
            8,
            MixedBitSetRecycler {
                domain_size: context.hir.counter.var.size(),
            },
        ),
    };

    for binding in bindings {
        let NodeKind::Thunk(thunk) = binding.value.kind else {
            panic!("ICE: diagnostic: top level must be thunks");
        };

        let compiler = Reifier::new(context, &mut state);
        let def_id = compiler.lower_thunk(binding.value.span, thunk);
        state.thunks.insert(binding.binder.id, def_id);
    }

    state.thunks.defs[local.id.value]
        .unwrap_or_else(|| panic!("ICE: diagnostic: local must be a thunk"))
}
