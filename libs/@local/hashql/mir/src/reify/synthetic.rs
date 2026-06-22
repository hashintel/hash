use core::alloc::Allocator;

use hashql_core::{
    heap::Heap,
    id::IdVec,
    intern::Interned,
    span::{SpanId, Spanned},
    symbol::{ConstantSymbol, sym},
    r#type::{TypeBuilder, TypeId},
};
use hashql_hir::{node::HirId, path::QualifiedPath};

use super::{
    ReifyContext, ReifyDiagnosticIssues,
    error::{
        intrinsic_not_first_class, synthetic_binary_arity_mismatch, synthetic_unary_arity_mismatch,
    },
};
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockVec},
        basic_blocks::BasicBlocks,
        constant::Constant,
        local::{LocalDecl, LocalVec},
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, AggregateKind, BinOp, Binary, RValue, UnOp, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, Terminator, TerminatorKind},
    },
    def::{DefId, DefIdVec},
    reify::unwrap_closure_type,
};

/// Constructs a `&'static [Symbol<'static>]` path from `::` separated segments.
///
/// Each segment maps to the corresponding `sym::` constant.
///
/// ```ignore
/// T![::core::math::add]  // expands to &[sym::core, sym::math, sym::add]
/// T![::core::cmp::eq]    // expands to &[sym::core, sym::cmp, sym::eq]
/// ```
#[expect(clippy::min_ident_chars)]
macro_rules! T {
    [:: $($segment:ident)::+] => {
        [
            $(::hashql_core::symbol::sym::$segment::CONST),+
        ]
    };
}

const MAX_LENGTH: usize = 3;

pub(crate) struct Synthetic {
    pub span: SpanId,
    pub r#type: TypeId,

    pub path: &'static [ConstantSymbol],
    pub thunk: Option<DefId>,
    pub body: DefId,
}

impl Synthetic {
    fn create_thunk<'heap>(&self, id: DefId, heap: &'heap Heap) -> Body<'heap> {
        let mut locals = LocalVec::with_capacity_in(1, heap);
        let closure = locals.push(LocalDecl {
            span: self.span,
            r#type: self.r#type,
            name: None,
        });

        let mut statements = Vec::with_capacity_in(1, heap);

        let mut operands = IdVec::with_capacity_in(2, heap);
        operands.push(Operand::Constant(Constant::FnPtr(self.body)));
        operands.push(Operand::Constant(Constant::Unit));

        statements.push(Statement {
            span: self.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(closure),
                rhs: RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Closure,
                    operands,
                }),
            }),
        });

        let mut blocks = BasicBlockVec::with_capacity_in(1, heap);
        blocks.push(BasicBlock {
            params: Interned::empty(),
            statements,
            terminator: Terminator {
                span: self.span,
                kind: TerminatorKind::Return(Return {
                    value: Operand::Place(Place::local(closure)),
                }),
            },
        });
        let blocks = BasicBlocks::new(blocks);

        // We must generate a new thunk for this body. That's easy enough, it's a simple body,
        // that just returns a `closure` with no env.
        Body {
            id,
            span: self.span,
            return_type: self.r#type,
            source: Source::Thunk(HirId::PLACEHOLDER, None),
            local_decls: locals,
            basic_blocks: blocks,
            args: 0,
        }
    }

    pub(crate) fn thunk<'heap, A: Allocator>(
        &mut self,
        bodies: &mut DefIdVec<Body<'heap>, A>,
        heap: &'heap Heap,
    ) -> DefId {
        if let Some(thunk) = self.thunk {
            return thunk;
        }

        let id = bodies.push_with(|id| self.create_thunk(id, heap));
        self.thunk = Some(id);

        id
    }
}

pub(crate) struct Synthetics<S: Allocator> {
    inner: Vec<Synthetic, S>,
}

impl<S: Allocator> Synthetics<S> {
    pub(crate) const fn new_in(alloc: S) -> Self {
        Self {
            inner: Vec::new_in(alloc),
        }
    }

    #[expect(unsafe_code)]
    pub(crate) fn find_or_insert<A: Allocator>(
        &mut self,
        context: &mut ReifyContext<A, S>,
        diagnostics: &mut ReifyDiagnosticIssues,

        hir_id: Spanned<HirId>,
        path: QualifiedPath<'_>,
    ) -> Option<&mut Synthetic> {
        let mut buffer = [sym::dummy::CONST; MAX_LENGTH];
        if path.0.len() > MAX_LENGTH {
            // The path is longer than our maximum length, and therefore cannot be part of an
            // intrinsic path
            return None;
        }

        for (index, segment) in path.0.iter().enumerate() {
            let symbol = segment.value.as_constant()?;

            buffer[index] = symbol;
        }

        // The actual path that we compare against
        let path = &buffer[..path.0.len()];

        // first check if we already have that path, in which case we can just return it
        if let Some(index) = self
            .inner
            .iter_mut()
            .position(|synthetic| synthetic.path == path)
        {
            // SAFETY: We know the position exists, so this is safe, workaround as we cannot use
            // `find_mut` here because of NLL.
            return Some(unsafe { self.inner.get_unchecked_mut(index) });
        }

        let builder = SyntheticBuilder {
            context,
            diagnostics,
            hir_id,
            inner: &mut self.inner,
        };

        macro_rules! binary {
            (:: $($seg:ident)::+ => $op:expr) => {
                Some(builder.binary(
                    ::hashql_core::symbol::sym::path::$($seg)::+::CONST,
                    &T![:: $($seg)::+],
                    $op,
                ))
            };
        }

        macro_rules! unary {
            (:: $($seg:ident)::+ => $op:expr) => {
                Some(builder.unary(
                    ::hashql_core::symbol::sym::path::$($seg)::+::CONST,
                    &T![:: $($seg)::+],
                    $op,
                ))
            };
        }

        #[rustfmt::skip]
        #[expect(clippy::match_same_arms, reason = "readability")]
        match path {
            // comparison
            &T![::core::cmp::gt]  => binary!(::core::cmp::gt  => BinOp::Gt),
            &T![::core::cmp::lt]  => binary!(::core::cmp::lt  => BinOp::Lt),
            &T![::core::cmp::gte] => binary!(::core::cmp::gte => BinOp::Gte),
            &T![::core::cmp::lte] => binary!(::core::cmp::lte => BinOp::Lte),
            &T![::core::cmp::eq]  => binary!(::core::cmp::eq  => BinOp::Eq),
            &T![::core::cmp::ne]  => binary!(::core::cmp::ne  => BinOp::Ne),

            // boolean
            &T![::core::bool::and] => binary!(::core::bool::and => BinOp::BitAnd),
            &T![::core::bool::or]  => binary!(::core::bool::or  => BinOp::BitOr),
            &T![::core::bool::not] => unary!(::core::bool::not  => UnOp::BitNot),

            // arithmetic (only add/sub are currently constructible in MIR)
            &T![::core::math::add] => binary!(::core::math::add => BinOp::Add),
            &T![::core::math::sub] => binary!(::core::math::sub => BinOp::Sub),

            // bitwise (only and/or are currently constructible in MIR)
            &T![::core::bits::and] => binary!(::core::bits::and => BinOp::BitAnd),
            &T![::core::bits::or]  => binary!(::core::bits::or  => BinOp::BitOr),
            &T![::core::bits::not] => unary!(::core::bits::not  => UnOp::BitNot),

            // MIR ops exist but are unconstructible (BinOp variants carry `!`)
            &T![::core::math::mul]
            | &T![::core::math::div]
            | &T![::core::math::rem]
            | &T![::core::math::r#mod]
            | &T![::core::math::pow]
            | &T![::core::bits::xor]
            | &T![::core::bits::shl]
            | &T![::core::bits::shr] => None,

            // math functions without direct MIR ops
            &T![::core::math::sqrt] | &T![::core::math::cbrt] | &T![::core::math::root] => None,

            // graph syntactic forms (not first-classable)
            &T![::graph::head::entities] => {
                diagnostics.push(
                    intrinsic_not_first_class(hir_id.span, sym::path::graph_head_entities)
                        .generalize(),
                );
                None
            }
            &T![::graph::body::filter] => {
                diagnostics.push(
                    intrinsic_not_first_class(hir_id.span, sym::path::graph_body_filter)
                        .generalize(),
                );
                None
            }
            &T![::graph::tail::collect] => {
                diagnostics.push(
                    intrinsic_not_first_class(hir_id.span, sym::path::graph_tail_collect)
                        .generalize(),
                );
                None
            }

            // not a known intrinsic path
            _ => None,
        }
    }
}

struct SyntheticBuilder<'syn, 'ctx, 'mir, 'hir, 'env, 'heap, A: Allocator, S: Allocator> {
    context: &'ctx mut ReifyContext<'mir, 'hir, 'env, 'heap, A, S>,
    diagnostics: &'ctx mut ReifyDiagnosticIssues,

    inner: &'syn mut Vec<Synthetic, S>,

    hir_id: Spanned<HirId>,
}

impl<'syn, A: Allocator, S: Allocator> SyntheticBuilder<'syn, '_, '_, '_, '_, '_, A, S> {
    fn binary(
        mut self,
        name: ConstantSymbol,
        path: &'static [ConstantSymbol],
        op: BinOp,
    ) -> &'syn mut Synthetic {
        let (r#type, body) = self.build_binary(name, op);

        self.inner.push_mut(Synthetic {
            span: self.hir_id.span,
            r#type,
            path,
            thunk: None,
            body,
        })
    }

    fn unary(
        mut self,
        name: ConstantSymbol,
        path: &'static [ConstantSymbol],
        op: UnOp,
    ) -> &'syn mut Synthetic {
        let (r#type, body) = self.build_unary(name, op);

        self.inner.push_mut(Synthetic {
            span: self.hir_id.span,
            r#type,
            path,
            thunk: None,
            body,
        })
    }

    fn build_binary(&mut self, name: ConstantSymbol, op: BinOp) -> (TypeId, DefId) {
        let closure_type_id = self
            .context
            .hir
            .map
            .monomorphized_type_id(self.hir_id.value);
        let closure_type = unwrap_closure_type(closure_type_id, self.context.mir.env);

        // Thunking wraps the qualified variable type as `() -> ClosureType`.
        // If we see a no-arg closure, unwrap its return type to get the actual signature.
        let closure_type = if closure_type.params.is_empty() {
            unwrap_closure_type(closure_type.returns, self.context.mir.env)
        } else {
            closure_type
        };

        let [lhs_type, rhs_type] =
            closure_type
                .params
                .as_array::<2>()
                .copied()
                .unwrap_or_else(|| {
                    self.diagnostics.push(
                        synthetic_binary_arity_mismatch(
                            self.hir_id.span,
                            name.into(),
                            closure_type.params.len(),
                        )
                        .generalize(),
                    );

                    let builder = TypeBuilder::spanned(self.hir_id.span, self.context.mir.env);

                    [builder.unknown(), builder.unknown()]
                });

        let env_type =
            TypeBuilder::spanned(self.hir_id.span, self.context.mir.env).tuple([] as [TypeId; 0]);

        let mut locals = LocalVec::with_capacity_in(4, self.context.mir.heap);
        // env is the first argument per fat closure ABI
        let _env = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: env_type,
            name: None,
        });
        let lhs_id = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: lhs_type,
            name: Some(sym::lhs),
        });
        let rhs_id = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: rhs_type,
            name: Some(sym::rhs),
        });
        let output = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: closure_type.returns,
            name: None,
        });

        let mut statements = Vec::with_capacity_in(1, self.context.mir.heap);
        statements.push(Statement {
            span: self.hir_id.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(output),
                rhs: RValue::Binary(Binary {
                    op,
                    left: Operand::Place(Place::local(lhs_id)),
                    right: Operand::Place(Place::local(rhs_id)),
                }),
            }),
        });

        let mut blocks = BasicBlockVec::with_capacity_in(1, self.context.mir.heap);
        blocks.push(BasicBlock {
            params: Interned::empty(),
            statements,
            terminator: Terminator {
                span: self.hir_id.span,
                kind: TerminatorKind::Return(Return {
                    value: Operand::Place(Place::local(output)),
                }),
            },
        });
        let blocks = BasicBlocks::new(blocks);

        let body = self.context.bodies.push_with(|id| Body {
            id,
            span: self.hir_id.span,
            return_type: closure_type.returns,
            source: Source::Synthetic(name.into()),
            local_decls: locals,
            basic_blocks: blocks,
            args: 3,
        });

        (closure_type_id, body)
    }

    fn build_unary(&mut self, name: ConstantSymbol, op: UnOp) -> (TypeId, DefId) {
        let closure_type_id = self
            .context
            .hir
            .map
            .monomorphized_type_id(self.hir_id.value);
        let closure_type = unwrap_closure_type(closure_type_id, self.context.mir.env);

        // Thunking wraps the qualified variable type as `() -> ClosureType`.
        // If we see a no-arg closure, unwrap its return type to get the actual signature.
        let closure_type = if closure_type.params.is_empty() {
            unwrap_closure_type(closure_type.returns, self.context.mir.env)
        } else {
            closure_type
        };

        let [operand_type] = closure_type
            .params
            .as_array::<1>()
            .copied()
            .unwrap_or_else(|| {
                self.diagnostics.push(
                    synthetic_unary_arity_mismatch(
                        self.hir_id.span,
                        name.into(),
                        closure_type.params.len(),
                    )
                    .generalize(),
                );

                let builder = TypeBuilder::spanned(self.hir_id.span, self.context.mir.env);

                [builder.unknown()]
            });

        let env_type =
            TypeBuilder::spanned(self.hir_id.span, self.context.mir.env).tuple([] as [TypeId; 0]);

        let mut locals = LocalVec::with_capacity_in(3, self.context.mir.heap);
        // env is the first argument per fat closure ABI
        let _env = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: env_type,
            name: None,
        });
        let operand_id = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: operand_type,
            name: Some(sym::lhs),
        });
        let output = locals.push(LocalDecl {
            span: self.hir_id.span,
            r#type: closure_type.returns,
            name: None,
        });

        let mut statements = Vec::with_capacity_in(1, self.context.mir.heap);
        statements.push(Statement {
            span: self.hir_id.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(output),
                rhs: RValue::Unary(Unary {
                    op,
                    operand: Operand::Place(Place::local(operand_id)),
                }),
            }),
        });

        let mut blocks = BasicBlockVec::with_capacity_in(1, self.context.mir.heap);
        blocks.push(BasicBlock {
            params: Interned::empty(),
            statements,
            terminator: Terminator {
                span: self.hir_id.span,
                kind: TerminatorKind::Return(Return {
                    value: Operand::Place(Place::local(output)),
                }),
            },
        });
        let blocks = BasicBlocks::new(blocks);

        let body = self.context.bodies.push_with(|id| Body {
            id,
            span: self.hir_id.span,
            return_type: closure_type.returns,
            source: Source::Synthetic(name.into()),
            local_decls: locals,
            basic_blocks: blocks,
            args: 2,
        });

        (closure_type_id, body)
    }
}
