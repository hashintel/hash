mod atom;
mod current;
mod error;
mod rvalue;
mod terminator;
mod transform;
mod types;

use hashql_core::{
    collections::{
        FastHashMap,
        pool::{MixedBitSetPool, MixedBitSetRecycler},
    },
    heap::Heap,
    id::{Id as _, IdCounter, IdVec, bit_vec::MixedBitSet},
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::environment::Environment,
};
use hashql_diagnostics::{Failure, Status};
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

use self::{
    current::CurrentBlock,
    error::{
        ReifyDiagnosticCategory, ReifyDiagnosticIssues, expected_anf_thunk, expected_anf_variable,
        external_modules_unsupported, local_not_thunk,
    },
    types::unwrap_closure_type,
};
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

/// Context for the reification process, providing access to all necessary compiler state.
///
/// This structure contains the essential components needed to transform HIR(ANF) into MIR,
/// including symbol tables, type information, and memory management.
pub struct ReifyContext<'mir, 'hir, 'env, 'heap> {
    /// Mutable reference to the collection of MIR bodies being generated.
    pub bodies: &'mir mut DefIdVec<Body<'heap>>,

    /// Symbol and projection interner for efficient string and data structure reuse.
    pub interner: &'mir Interner<'heap>,

    /// Type environment containing all type definitions and constraints.
    pub environment: &'env Environment<'heap>,

    /// HIR context containing the source nodes and variable mappings.
    pub hir: &'hir HirContext<'hir, 'heap>,

    /// Memory allocator for heap-allocated MIR structures.
    pub heap: &'heap Heap,
}

/// Tracks the mapping between variable IDs and their corresponding thunk definition IDs.
///
/// Thunks represent top-level bindings that have been converted to callable functions.
/// This structure maintains both a sparse vector mapping and a bit set for membership testing.
///
/// # Memory Usage
///
/// Thunks are sparse and limited to the first few IDs since nested thunks are not allowed.
/// Using a vector here is memory-efficient given this constraint.
pub struct Thunks {
    defs: VarIdVec<Option<DefId>>,
    set: MixedBitSet<VarId>,
}

impl Thunks {
    fn insert(&mut self, var: VarId, def: DefId) {
        self.defs.insert(var, def);
        self.set.insert(var);
    }
}

/// State shared across the entire reification process for a single module.
///
/// This structure maintains global state needed throughout reification, including
/// thunk mappings, constructor definitions, and memory pools for efficient allocation.
struct CrossCompileState<'heap> {
    /// Mapping of variable IDs to their thunk definitions.
    thunks: Thunks,

    /// Collection of diagnostics encountered during reification.
    diagnostics: ReifyDiagnosticIssues,

    /// Cache of already-created type constructors to avoid duplication.
    ctor: FastHashMap<Symbol<'heap>, DefId>,

    var_pool: MixedBitSetPool<VarId>,
}

/// The core reification engine that converts individual HIR nodes to MIR bodies.
///
/// Each `Reifier` instance is responsible for converting a single function/thunk/closure
/// from HIR to MIR. It maintains its own local state for basic blocks, variable mappings,
/// and local allocation while sharing global state through the context and cross-compile state.
struct Reifier<'ctx, 'mir, 'hir, 'env, 'heap> {
    /// Reference to the global reification context.
    context: &'ctx mut ReifyContext<'mir, 'hir, 'env, 'heap>,

    /// Reference to the shared cross-compilation state.
    state: &'ctx mut CrossCompileState<'heap>,

    /// Basic blocks being constructed for the current function body.
    blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,

    /// Mapping from HIR variable IDs to MIR local IDs for the current function.
    locals: VarIdVec<Option<Local>>,

    /// Counter for generating fresh local IDs.
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

    /// Core implementation for lowering HIR constructs to MIR bodies.
    ///
    /// This method handles the common logic for converting thunks, closures, and type
    /// constructors into MIR function bodies. It manages parameter binding, capture
    /// handling, and basic block construction.
    ///
    /// # Parameters
    ///
    /// - `source`: The type of construct being lowered (thunk, closure, constructor)
    /// - `span`: Source location for error reporting
    /// - `params`: Function parameters to bind to locals
    /// - `captures`: Variables captured from outer scopes (closures only)
    /// - `on_block`: Callback to generate the function body
    ///
    /// # Returns
    ///
    /// The definition ID of the newly created MIR body.
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

    /// Lowers a closure to a MIR body with proper capture handling.
    ///
    /// Closures require special handling for captured variables, which are passed
    /// as environment parameters and unpacked into local variables.
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

    /// Lowers a thunk (lazy computation) to a MIR body.
    ///
    /// Thunks have no parameters or captures, making them the simplest
    /// construct to lower.
    fn lower_thunk(self, span: SpanId, thunk: Thunk<'heap>) -> DefId {
        self.lower_impl(
            Source::Thunk,
            span,
            [] as [VarId; 0],
            None,
            |this, block| this.transform_body(block, thunk.body),
        )
    }

    /// Lowers a type constructor to a MIR body.
    ///
    /// Type constructors create instances of opaque types. They may take
    /// parameters depending on their signature.
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
// see: https://linear.app/hash/issue/BE-67/hashql-implement-modules
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
/// Converts HIR(ANF) nodes to MIR by reifying thunks and closures into executable bodies.
///
/// This function is the main entry point for the reification process, which transforms
/// High-level Intermediate Representation (HIR) in A-Normal Form (ANF) into
/// Mid-level Intermediate Representation (MIR). The process converts functional constructs
/// like thunks and closures into imperative basic blocks with explicit control flow.
///
/// # Input Requirements
///
/// The input `node` must satisfy several invariants maintained by earlier compiler passes:
///
/// - **HIR(ANF) structure**: The node must be in A-Normal Form after the normalization pass.
/// - **Top-level bindings**: All bindings at the module level must be thunks.
/// - **Variable resolution**: All variables must be properly resolved (no dangling references).
/// - **Type checking**: All type constraints and indexing operations must be validated.
///
/// # Process Overview
///
/// 1. **Structure validation**: Ensures the root node is a `Let` with thunk bindings
/// 2. **Thunk processing**: Each top-level binding (thunk) is lowered to a MIR body
/// 3. **Closure handling**: Nested closures are analyzed for captures and lowered separately
/// 4. **Body generation**: Creates basic blocks with statements and terminators
/// 5. **Definition mapping**: Maps variable IDs to their corresponding definition IDs
///
/// # Errors
///
/// This function can fail with various diagnostic categories:
///
/// - **Unsupported features**: External modules, qualified variables
/// - **HIR invariant violations**: Missing thunks, invalid ANF structure
/// - **Variable mapping errors**: Unresolved locals, missing assignments
/// - **Type invariant violations**: Non-indexable types, invalid closures
///
/// # Current Limitations
///
/// - **Single module only**: Multi-module support is not yet implemented
/// - **No external references**: Cross-module dependencies are unsupported
/// - **Flat thunk structure**: No nested thunks are allowed
///
/// See [BE-67](https://linear.app/hash/issue/BE-67/hashql-implement-modules) for
/// planned multi-module architecture.
pub fn from_hir<'heap>(
    node: Node<'heap>,
    context: &mut ReifyContext<'_, '_, '_, 'heap>,
) -> Status<DefId, ReifyDiagnosticCategory, SpanId> {
    // The node is already in HIR(ANF) - each node will be a thunk.
    let NodeKind::Let(Let { bindings, body }) = node.kind else {
        // Per HIR(ANF) rules, the body must be an atom, additionally the top level body must be a
        // simple identifier. As there is no `let`, we can assume that it is a reference to a
        // variable, as we haven't defined any variables yet, the body must be a qualified variable,
        // which means module system, which isn't supported yet.
        return Status::Err(Failure::new(external_modules_unsupported(node.span)));
    };

    // The body will be a (local) variable
    let NodeKind::Variable(variable) = body.kind else {
        return Status::Err(Failure::new(expected_anf_variable(body.span)));
    };

    let Variable::Local(local) = variable else {
        return Status::Err(Failure::new(external_modules_unsupported(node.span)));
    };

    let thunks = Thunks {
        defs: VarIdVec::new(),
        set: MixedBitSet::new_empty(context.hir.counter.var.size()),
    };
    let mut state = CrossCompileState {
        thunks,
        ctor: FastHashMap::default(),
        diagnostics: ReifyDiagnosticIssues::new(),
        var_pool: MixedBitSetPool::with_recycler(
            8,
            MixedBitSetRecycler {
                domain_size: context.hir.counter.var.size(),
            },
        ),
    };

    for binding in bindings {
        let NodeKind::Thunk(thunk) = binding.value.kind else {
            state.diagnostics.push(expected_anf_thunk(binding.span));

            continue;
        };

        let compiler = Reifier::new(context, &mut state);
        let def_id = compiler.lower_thunk(binding.value.span, thunk);
        state.thunks.insert(binding.binder.id, def_id);
    }

    let Some(def_id) = state.thunks.defs[local.id.value] else {
        let mut failure = Failure::new(local_not_thunk(local.id.span));
        failure.secondary = state.diagnostics;

        return Status::Err(failure);
    };

    state.diagnostics.into_status(def_id)
}
