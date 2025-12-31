//! Instruction simplification pass.
//!
//! This pass performs local algebraic simplifications and constant folding on MIR instructions.
//! It operates on individual instructions, replacing complex expressions with simpler equivalents
//! when operands are constants or satisfy algebraic identities.
//!
//! # Simplifications
//!
//! The pass handles three categories of simplifications:
//!
//! ## Constant Folding
//!
//! When both operands of a binary operation or the operand of a unary operation are constants,
//! the operation is evaluated at compile time:
//!
//! - `const 2 + const 3` → `const 5`
//! - `!const true` → `const false`
//!
//! ## Algebraic Identities
//!
//! Operations with one constant operand may simplify based on algebraic laws:
//!
//! - **Identity elements**: `x && true` → `x`, `x | 0` → `x`
//! - **Annihilators**: `x && false` → `false`, `x || true` → `true`
//! - **Boolean equivalences**: `x == true` → `x`, `x == false` → `!x`
//!
//! ## Identical Operand Patterns
//!
//! When both operands reference the same place, certain operations have known results:
//!
//! - **Idempotence**: `x & x` → `x`, `x | x` → `x`
//! - **Reflexive comparisons**: `x == x` → `true`, `x < x` → `false`
//!
//! # Algorithm
//!
//! The pass operates in a single traversal over basic blocks in reverse postorder:
//!
//! 1. At each block entry, propagate constants through block parameters by checking if all
//!    predecessor branches pass the same constant value
//! 2. Visit each instruction, applying simplifications when patterns match
//! 3. Track locals assigned constant values to enable further simplifications within the block
//!
//! The `evaluated` map tracks locals known to hold constant values. When a local is assigned
//! a constant (either directly or as the result of constant folding), it is recorded so that
//! subsequent uses can be treated as constants.
//!
//! # Example
//!
//! Before:
//! ```text
//! bb0:
//!     _1 = const 1
//!     _2 = const 2
//!     _3 = _1 == _2
//!     _4 = _3 && const true
//!     return _4
//! ```
//!
//! After:
//! ```text
//! bb0:
//!     _1 = const 1
//!     _2 = const 2
//!     _3 = const false
//!     _4 = const false
//!     return _4
//! ```
//!
//! # Interaction with Other Passes
//!
//! This pass runs after [`Sroa`], which resolves places through the data dependency graph. SROA
//! ensures that operands are simplified to their canonical forms before [`InstSimplify`] runs, so
//! constants that flow through assignments or block parameters are already exposed.
//!
//! Block parameter propagation in this pass complements SROA: while SROA resolves structural
//! dependencies at the operand level, [`InstSimplify`] propagates constants discovered through
//! folding across block boundaries.
//!
//! # Limitations
//!
//! The pass does not perform fix-point iteration for loops. Constants propagated through
//! back-edges are not discovered because predecessors forming back-edges have not been visited
//! when the loop header is processed. Full loop-carried constant propagation would require
//! iterating until the `evaluated` map stabilizes, which is not implemented as the expected
//! benefit is low.
//!
//! [`Sroa`]: super::Sroa
#[cfg(test)]
mod tests;

use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{
    heap::{BumpAllocator, ResetAllocator, Scratch, TransferInto as _},
    id::IdVec,
    r#type::{environment::Environment, kind::PrimitiveType},
};
use hashql_hir::node::operation::UnOp;

use super::copy_propagation::propagate_block_params;
use crate::{
    body::{
        Body,
        constant::{Constant, Int},
        local::{LocalDecl, LocalSlice, LocalVec},
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::{BinOp, Binary, RValue, Unary},
        statement::Assign,
    },
    context::MirContext,
    intern::Interner,
    pass::{Changed, TransformPass},
    visit::{self, VisitorMut, r#mut::filter},
};

/// Classification of an operand for simplification purposes.
///
/// This enum categorizes operands into cases relevant for constant folding and algebraic
/// simplification.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum OperandKind<'heap> {
    /// A constant integer value, either from a literal or a local known to hold a constant.
    Int(Int),
    /// A place reference that could not be resolved to a constant.
    Place(Place<'heap>),
    /// An operand that cannot be simplified (e.g., non-integer constants).
    Other,
}

impl OperandKind<'_> {
    const fn as_int(&self) -> Option<Int> {
        if let &OperandKind::Int(int) = self {
            Some(int)
        } else {
            None
        }
    }
}

/// Instruction simplification pass.
///
/// Performs constant folding and algebraic simplification on MIR instructions.
pub struct InstSimplify<A: BumpAllocator = Scratch> {
    alloc: A,
}

impl InstSimplify {
    /// Creates a new [`InstSimplify`].
    #[must_use]
    pub fn new() -> Self {
        Self {
            alloc: Scratch::new(),
        }
    }
}

impl Default for InstSimplify {
    fn default() -> Self {
        Self::new()
    }
}

impl<A: BumpAllocator> InstSimplify<A> {
    /// Creates a new [`InstSimplify`] using the provided allocator.
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }
}

impl<'env, 'heap, A: ResetAllocator> TransformPass<'env, 'heap> for InstSimplify<A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        self.alloc.reset();

        let mut visitor = InstSimplifyVisitor {
            env: context.env,
            interner: context.interner,
            trampoline: None,
            decl: &body.local_decls,
            evaluated: IdVec::with_capacity_in(body.local_decls.len(), &self.alloc),
            changed: false,
        };

        let reverse_postorder = body
            .basic_blocks
            .reverse_postorder()
            .transfer_into(&self.alloc);

        let mut args = Vec::new_in(&self.alloc);

        for &mut id in reverse_postorder {
            for (local, int) in propagate_block_params(&mut args, body, id, |operand| {
                visitor.try_eval(operand).as_int()
            }) {
                visitor.evaluated.insert(local, int);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        visitor.changed.into()
    }
}

/// Visitor that applies instruction simplifications during MIR traversal.
///
/// This visitor implements the core simplification logic. It uses a trampoline pattern to
/// communicate replacement [`RValue`]s from nested rvalue visitors back to the statement visitor,
/// since rvalue visitors only have access to the inner struct, not the enclosing `RValue` enum.
struct InstSimplifyVisitor<'env, 'heap, A: Allocator> {
    env: &'env Environment<'heap>,
    interner: &'env Interner<'heap>,

    /// Temporary slot for rvalue visitors to request replacement of the enclosing [`RValue`].
    trampoline: Option<RValue<'heap>>,

    decl: &'env LocalSlice<LocalDecl<'heap>>,

    /// Map from locals to their known constant values.
    /// Populated when a local is assigned a constant (directly or via folding).
    evaluated: LocalVec<Option<Int>, A>,

    changed: bool,
}

impl<'heap, A: Allocator> InstSimplifyVisitor<'_, 'heap, A> {
    /// Attempts to evaluate an operand to a known constant or classify it for simplification.
    ///
    /// Returns `Int` if the operand is a constant integer or a local known to hold one,
    /// `Place` if it's a non-constant place, or `Other` for operands that can't be simplified.
    fn try_eval(&self, operand: Operand<'heap>) -> OperandKind<'heap> {
        if let Operand::Constant(Constant::Int(int)) = operand {
            return OperandKind::Int(int);
        }

        if let Operand::Place(place) = operand
            && place.projections.is_empty()
            && let Some(&int) = self.evaluated.lookup(place.local)
        {
            return OperandKind::Int(int);
        }

        if let Operand::Place(place) = operand {
            return OperandKind::Place(place);
        }

        OperandKind::Other
    }

    /// Evaluates a binary operation on two constant integers.
    fn eval_bin_op(lhs: Int, op: BinOp, rhs: Int) -> Int {
        let lhs = lhs.as_int();
        let rhs = rhs.as_int();

        let result = match op {
            BinOp::BitAnd => lhs & rhs,
            BinOp::BitOr => lhs | rhs,
            BinOp::Eq => i128::from(lhs == rhs),
            BinOp::Ne => i128::from(lhs != rhs),
            BinOp::Lt => i128::from(lhs < rhs),
            BinOp::Lte => i128::from(lhs <= rhs),
            BinOp::Gt => i128::from(lhs > rhs),
            BinOp::Gte => i128::from(lhs >= rhs),
        };

        Int::from(result)
    }

    /// Evaluates a unary operation on a constant integer.
    fn eval_un_op(op: UnOp, operand: Int) -> Int {
        let value = operand.as_int();

        let result = match op {
            UnOp::Not => {
                let Some(value) = operand.as_bool() else {
                    unreachable!("only boolean values can be negated");
                };

                i128::from(!value)
            }
            UnOp::Neg => -value,
            UnOp::BitNot => !value,
        };

        Int::from(result)
    }

    /// Attempts to simplify a binary operation with a constant left operand and place right
    /// operand.
    ///
    /// Handles identity elements, annihilators, and boolean equivalences where the constant
    /// is on the left side of the operation.
    #[expect(clippy::match_same_arms)]
    fn simplify_bin_op_left(
        &self,
        lhs: Int,
        op: BinOp,
        rhs: Place<'heap>,
    ) -> Option<RValue<'heap>> {
        let rhs_type = rhs.type_id(self.decl);
        let is_bool =
            self.env.r#type(rhs_type).kind.primitive().copied() == Some(PrimitiveType::Boolean);

        match (op, lhs.as_int()) {
            // true && rhs => rhs (identity)
            (BinOp::BitAnd, 1) if is_bool => Some(RValue::Load(Operand::Place(rhs))),
            // false && rhs => false (annihilator)
            (BinOp::BitAnd, 0) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(false.into()))))
            }
            (BinOp::BitAnd, _) => None,
            // 0 | rhs => rhs (identity)
            (BinOp::BitOr, 0) => Some(RValue::Load(Operand::Place(rhs))),
            // true || rhs => true (annihilator)
            (BinOp::BitOr, 1) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(true.into()))))
            }
            (BinOp::BitOr, _) => None,
            // true == rhs => rhs (boolean equivalence)
            (BinOp::Eq, 1) if is_bool => Some(RValue::Load(Operand::Place(rhs))),
            // false == rhs => !rhs (boolean equivalence)
            (BinOp::Eq, 0) if is_bool => Some(RValue::Unary(Unary {
                op: UnOp::Not,
                operand: Operand::Place(rhs),
            })),
            (BinOp::Eq, _) => None,
            // false != rhs => rhs (boolean equivalence)
            (BinOp::Ne, 0) if is_bool => Some(RValue::Load(Operand::Place(rhs))),
            // true != rhs => !rhs (boolean equivalence)
            (BinOp::Ne, 1) if is_bool => Some(RValue::Unary(Unary {
                op: UnOp::Not,
                operand: Operand::Place(rhs),
            })),
            (BinOp::Ne, _) => None,
            (BinOp::Lt, _) => None,
            (BinOp::Lte, _) => None,
            (BinOp::Gt, _) => None,
            (BinOp::Gte, _) => None,
        }
    }

    /// Attempts to simplify a binary operation with a place left operand and constant right
    /// operand.
    ///
    /// Handles identity elements, annihilators, and boolean equivalences where the constant
    /// is on the right side of the operation.
    #[expect(clippy::match_same_arms)]
    fn simplify_bin_op_right(
        &self,
        lhs: Place<'heap>,
        op: BinOp,
        rhs: Int,
    ) -> Option<RValue<'heap>> {
        let lhs_type = lhs.type_id(self.decl);
        let is_bool =
            self.env.r#type(lhs_type).kind.primitive().copied() == Some(PrimitiveType::Boolean);

        match (op, rhs.as_int()) {
            // lhs && true => lhs (identity)
            (BinOp::BitAnd, 1) if is_bool => Some(RValue::Load(Operand::Place(lhs))),
            // lhs && false => false (annihilator)
            (BinOp::BitAnd, 0) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(false.into()))))
            }
            (BinOp::BitAnd, _) => None,
            // lhs | 0 => lhs (identity)
            (BinOp::BitOr, 0) => Some(RValue::Load(Operand::Place(lhs))),
            // lhs || true => true (annihilator)
            (BinOp::BitOr, 1) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(true.into()))))
            }
            (BinOp::BitOr, _) => None,
            // lhs == true => lhs (boolean equivalence)
            (BinOp::Eq, 1) if is_bool => Some(RValue::Load(Operand::Place(lhs))),
            // lhs == false => !lhs (boolean equivalence)
            (BinOp::Eq, 0) if is_bool => Some(RValue::Unary(Unary {
                op: UnOp::Not,
                operand: Operand::Place(lhs),
            })),
            (BinOp::Eq, _) => None,
            // lhs != false => lhs (boolean equivalence)
            (BinOp::Ne, 0) if is_bool => Some(RValue::Load(Operand::Place(lhs))),
            // lhs != true => !lhs (boolean equivalence)
            (BinOp::Ne, 1) if is_bool => Some(RValue::Unary(Unary {
                op: UnOp::Not,
                operand: Operand::Place(lhs),
            })),
            (BinOp::Ne, _) => None,
            (BinOp::Lt, _) => None,
            (BinOp::Lte, _) => None,
            (BinOp::Gt, _) => None,
            (BinOp::Gte, _) => None,
        }
    }

    /// Attempts to simplify a binary operation where both operands are the same place.
    ///
    /// Handles idempotent operations (`x & x`, `x | x`) and reflexive comparisons
    /// (`x == x`, `x < x`, etc.) that have known results regardless of the actual value.
    #[expect(clippy::match_same_arms)]
    fn simplify_bin_op_place(
        lhs: Place<'heap>,
        op: BinOp,
        rhs: Place<'heap>,
    ) -> Option<RValue<'heap>> {
        // Check if both places refer to the same location (same local and projections).
        let is_same = lhs.local == rhs.local
            && lhs.projections.len() == rhs.projections.len()
            && lhs
                .projections
                .iter()
                .zip(rhs.projections)
                .all(|(lhs, rhs)| lhs.kind == rhs.kind);

        if !is_same {
            return None;
        }

        let bool = match op {
            // x & x => x (idempotent)
            BinOp::BitAnd => return Some(RValue::Load(Operand::Place(lhs))),
            // x | x => x (idempotent)
            BinOp::BitOr => return Some(RValue::Load(Operand::Place(lhs))),
            // x == x => true (reflexive)
            BinOp::Eq => true,
            // x != x => false (irreflexive)
            BinOp::Ne => false,
            // x < x => false (irreflexive)
            BinOp::Lt => false,
            // x <= x => true (reflexive)
            BinOp::Lte => true,
            // x > x => false (irreflexive)
            BinOp::Gt => false,
            // x >= x => true (reflexive)
            BinOp::Gte => true,
        };

        Some(RValue::Load(Operand::Constant(Constant::Int(bool.into()))))
    }
}

impl<'heap, A: Allocator> VisitorMut<'heap> for InstSimplifyVisitor<'_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_rvalue_binary(
        &mut self,
        _: Location,
        Binary { op, left, right }: &mut Binary<'heap>,
    ) -> Self::Result<()> {
        // Dispatch to the appropriate simplification based on operand classification.
        // SROA has already resolved structural dependencies, so constants are directly visible.
        match (self.try_eval(*left), self.try_eval(*right)) {
            (OperandKind::Int(lhs), OperandKind::Int(rhs)) => {
                let result = Self::eval_bin_op(lhs, *op, rhs);
                self.trampoline = Some(RValue::Load(Operand::Constant(Constant::Int(result))));
            }
            (OperandKind::Place(lhs), OperandKind::Int(rhs)) => {
                let result = self.simplify_bin_op_right(lhs, *op, rhs);
                if let Some(result) = result {
                    self.trampoline = Some(result);
                }
            }
            (OperandKind::Int(lhs), OperandKind::Place(rhs)) => {
                let result = self.simplify_bin_op_left(lhs, *op, rhs);
                if let Some(result) = result {
                    self.trampoline = Some(result);
                }
            }
            (OperandKind::Place(lhs), OperandKind::Place(rhs)) => {
                let result = Self::simplify_bin_op_place(lhs, *op, rhs);
                if let Some(result) = result {
                    self.trampoline = Some(result);
                }
            }
            _ => {}
        }

        Ok(())
    }

    fn visit_rvalue_unary(
        &mut self,
        _: Location,
        Unary { op, operand }: &mut Unary<'heap>,
    ) -> Self::Result<()> {
        if let OperandKind::Int(value) = self.try_eval(*operand) {
            let result = Self::eval_un_op(*op, value);
            self.trampoline = Some(RValue::Load(Operand::Constant(Constant::Int(result))));
        }

        Ok(())
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        debug_assert!(self.trampoline.is_none());

        // Walk the RHS first, which may set `trampoline` if a simplification applies.
        Ok(()) = visit::r#mut::walk_statement_assign(self, location, assign);

        let Some(trampoline) = self.trampoline.take() else {
            // No simplification occurred, but we still need to track constants for propagation.
            if let RValue::Load(Operand::Constant(Constant::Int(int))) = assign.rhs
                && assign.lhs.projections.is_empty()
            {
                self.evaluated.insert(assign.lhs.local, int);
            }

            return Ok(());
        };

        self.changed = true;

        // If the simplified RHS is a constant, record it for future simplifications.
        if let RValue::Load(Operand::Constant(Constant::Int(int))) = trampoline
            && assign.lhs.projections.is_empty()
        {
            self.evaluated.insert(assign.lhs.local, int);
        }

        // If the simplified RHS is a place, and has a constant associated with it, record it
        // forward for future simplifications, this is important in cases where we simplify into
        // idempotent positions, given: `y = x & x`, we simplify to `y = x`. Therefore if `x` is
        // already a constant, we can propagate it.
        if let RValue::Load(Operand::Place(place)) = trampoline
            && place.projections.is_empty()
            && let Some(&int) = self.evaluated.lookup(place.local)
        {
            self.evaluated.insert(assign.lhs.local, int);
        }

        assign.rhs = trampoline;

        Ok(())
    }
}
