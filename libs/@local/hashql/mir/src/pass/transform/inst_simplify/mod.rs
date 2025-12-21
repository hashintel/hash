use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{
    graph::Predecessors as _,
    heap::{BumpAllocator, Scratch, TransferInto as _},
    id::IdVec,
    r#type::{environment::Environment, kind::PrimitiveType},
};
use hashql_hir::node::operation::UnOp;

use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
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
    pass::TransformPass,
    visit::{self, VisitorMut, r#mut::filter},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum OperandKind<'heap> {
    Int(Int),
    Place(Place<'heap>),
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

pub struct InstSimplify<A: BumpAllocator = Scratch> {
    alloc: A,
}

impl InstSimplify {
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
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }

    fn propagate_block_params<'heap>(
        args: &mut Vec<Option<Int>, &A>,
        visitor: &mut InstSimplifyVisitor<'_, 'heap, &A>,
        body: &Body<'heap>,
        id: BasicBlockId,
    ) {
        let pred = body.basic_blocks.predecessors(id);

        // If we have any predecessor that doesn't have explicit params (aka an effect) we cannot
        // propagate anything
        if pred
            .clone()
            .any(|pred| body.basic_blocks[pred].terminator.kind.is_effectful())
        {
            return;
        }

        // Check any predecessors of the basic block, if they all agree on the same value, we
        // can copy their value.
        let mut targets = pred
            .flat_map(|pred| body.basic_blocks[pred].terminator.kind.successor_targets())
            .filter(|&target| target.block == id);

        // There's nothing to propagate (aka there are no targets)
        let Some(first) = targets.next() else {
            return;
        };

        // These are our reference values, all branches must have the same `Option` value, as us.
        args.extend(first.args.iter().map(|&arg| visitor.try_eval(arg).as_int()));

        for target in targets {
            debug_assert_eq!(args.len(), target.args.len());

            for (lhs, &rhs) in args.iter_mut().zip(target.args.iter()) {
                let rhs = visitor.try_eval(rhs).as_int();
                if *lhs != rhs {
                    *lhs = None;
                }
            }
        }

        for (&local, constant) in body.basic_blocks[id].params.iter().zip(args.drain(..)) {
            if let Some(constant) = constant {
                visitor.evaluated.insert(local, constant);
            }
        }
    }
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap> for InstSimplify<A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        self.alloc.reset();

        let mut visitor = InstSimplifyVisitor {
            env: context.env,
            interner: context.interner,
            trampoline: None,
            decl: &body.local_decls,
            evaluated: IdVec::with_capacity_in(body.local_decls.len(), &self.alloc),
        };

        let reverse_postorder = body
            .basic_blocks
            .reverse_postorder()
            .transfer_into(&self.alloc);

        let mut args = Vec::new_in(&self.alloc);

        for &mut id in reverse_postorder {
            Self::propagate_block_params(&mut args, &mut visitor, body, id);

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }
    }
}

struct InstSimplifyVisitor<'env, 'heap, A: Allocator> {
    env: &'env Environment<'heap>,
    interner: &'env Interner<'heap>,
    trampoline: Option<RValue<'heap>>,
    decl: &'env LocalSlice<LocalDecl<'heap>>,
    evaluated: LocalVec<Option<Int>, A>,
}

impl<'heap, A: Allocator> InstSimplifyVisitor<'_, 'heap, A> {
    fn try_eval(&self, operand: Operand<'heap>) -> OperandKind<'heap> {
        if let Operand::Constant(Constant::Int(int)) = operand {
            return OperandKind::Int(int);
        }

        if let Operand::Place(place) = operand
            && place.projections.is_empty()
            && let Some(int) = self.evaluated[place.local]
        {
            return OperandKind::Int(int);
        }

        if let Operand::Place(place) = operand {
            return OperandKind::Place(place);
        }

        OperandKind::Other
    }

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
            // true && rhs => rhs
            (BinOp::BitAnd, 1) if is_bool => Some(RValue::Load(Operand::Place(rhs))),
            // false && rhs => false
            (BinOp::BitAnd, 0) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(false.into()))))
            }
            (BinOp::BitAnd, _) => None,
            // 0 | rhs => rhs
            (BinOp::BitOr, 0) => Some(RValue::Load(Operand::Place(rhs))),
            // true || rhs => true
            (BinOp::BitOr, 1) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(true.into()))))
            }
            (BinOp::BitOr, _) => None,
            // 1 == rhs => rhs
            (BinOp::Eq, 1) if is_bool => Some(RValue::Load(Operand::Place(rhs))),
            // 0 == rhs => not(rhs)
            (BinOp::Eq, 0) if is_bool => Some(RValue::Unary(Unary {
                op: UnOp::Not,
                operand: Operand::Place(rhs),
            })),
            (BinOp::Eq, _) => None,
            // 0 != rhs => rhs
            (BinOp::Ne, 0) if is_bool => Some(RValue::Load(Operand::Place(rhs))),
            // 1 != rhs => not(rhs)
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
            // lhs && true => lhs
            (BinOp::BitAnd, 1) if is_bool => Some(RValue::Load(Operand::Place(lhs))),
            // rhs && false => false
            (BinOp::BitAnd, 0) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(false.into()))))
            }
            (BinOp::BitAnd, _) => None,
            // lhs | 0 => lhs
            (BinOp::BitOr, 0) => Some(RValue::Load(Operand::Place(lhs))),
            // rhs || 1 => true
            (BinOp::BitOr, 1) if is_bool => {
                Some(RValue::Load(Operand::Constant(Constant::Int(true.into()))))
            }
            (BinOp::BitOr, _) => None,
            // lhs == 1 => lhs
            (BinOp::Eq, 1) if is_bool => Some(RValue::Load(Operand::Place(lhs))),
            // lhs == 0 => not(lhs)
            (BinOp::Eq, 0) if is_bool => Some(RValue::Unary(Unary {
                op: UnOp::Not,
                operand: Operand::Place(lhs),
            })),
            (BinOp::Eq, _) => None,
            // lhs != 0 => lhs == 1 => lhs
            (BinOp::Ne, 0) if is_bool => Some(RValue::Load(Operand::Place(lhs))),
            // lhs != 1 => lhs == 0 => not(lhs)
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

    #[expect(clippy::match_same_arms)]
    fn simplify_bin_op_place(
        lhs: Place<'heap>,
        op: BinOp,
        rhs: Place<'heap>,
    ) -> Option<RValue<'heap>> {
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
            // x & x => x
            BinOp::BitAnd => return Some(RValue::Load(Operand::Place(lhs))),
            // x | x => x
            BinOp::BitOr => return Some(RValue::Load(Operand::Place(lhs))),
            // x == x => true
            BinOp::Eq => true,
            // x != x => false
            BinOp::Ne => false,
            // x < x => false
            BinOp::Lt => false,
            // x <= x => true
            BinOp::Lte => true,
            // x > x => false
            BinOp::Gt => false,
            // x >= x => true
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
        // If both values are non-opaque (aka `Integer`) we evaluate them.
        // Because we run after SROA, we can assume that the constants are already in place where
        // they can be evaluated.
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

        Ok(()) = visit::r#mut::walk_statement_assign(self, location, assign);

        let Some(trampoline) = self.trampoline.take() else {
            return Ok(());
        };

        if let RValue::Load(Operand::Constant(Constant::Int(int))) = trampoline
            && assign.lhs.projections.is_empty()
        {
            self.evaluated.insert(assign.lhs.local, int);
        }

        assign.rhs = trampoline;

        Ok(())
    }
}
