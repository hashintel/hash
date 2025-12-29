use crate::body::{
    Body, Source,
    basic_block::BasicBlockId,
    operand::Operand,
    rvalue::RValue,
    statement::{Assign, Statement, StatementKind},
    terminator::{Return, TerminatorKind},
};

fn all_statements_trivial<'stmt, 'heap: 'stmt>(
    statements: impl IntoIterator<Item = &'stmt Statement<'heap>>,
) -> bool {
    statements
        .into_iter()
        .all(|statement| match statement.kind {
            StatementKind::Nop
            | StatementKind::Assign(Assign {
                lhs: _,
                rhs: RValue::Aggregate(_) | RValue::Load(_),
            }) => true,
            StatementKind::Assign(Assign {
                lhs: _,
                rhs: RValue::Apply(_) | RValue::Binary(_) | RValue::Unary(_) | RValue::Input(_),
            })
            | StatementKind::StorageLive(_)
            | StatementKind::StorageDead(_) => false,
        })
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ReductionKind {
    TrivialThunk,
    ForwardingClosure,
}

impl ReductionKind {
    fn thunk(body: &Body<'_>) -> Option<Self> {
        // We can't have any control-flow, therefore only one bb allowed
        if body.basic_blocks.len() > 1 {
            return None;
        }

        let bb = &body.basic_blocks[BasicBlockId::START];

        // StorageLive and StorageDead are invalid on purpose, this is because them being in a thunk
        // signifies that we have already done liveness analysis.
        let is_trivial = all_statements_trivial(&bb.statements);

        // The return value of the thunk **must** be a return
        if !matches!(bb.terminator.kind, TerminatorKind::Return(_)) {
            return None;
        }

        if is_trivial {
            return Some(Self::TrivialThunk);
        }

        None
    }

    fn closure(body: &Body<'_>) -> Option<Self> {
        // A closure is forwarding in the following cases:
        // 1) The last statement is a closure call
        // 2) Everything leading up to the last statement is considered trivial
        // 3) The return value is the result of the closure call

        // Unlike `analyze_thunk` this is applicable to *any* closure, not just thunks.
        if body.basic_blocks.len() > 1 {
            return None;
        }

        let bb = &body.basic_blocks[BasicBlockId::START];

        // An empty closure is not forwarding
        let [prelude @ .., closure] = &*bb.statements else {
            // An empty basic block is not forwarding, it is considered trivial
            return None;
        };

        if !all_statements_trivial(prelude) {
            return None;
        }

        let StatementKind::Assign(Assign {
            lhs,
            rhs: RValue::Apply(_),
        }) = closure.kind
        else {
            return None;
        };

        if bb.terminator.kind
            == TerminatorKind::Return(Return {
                value: Operand::Place(lhs),
            })
        {
            return Some(Self::ForwardingClosure);
        }

        None
    }

    pub(crate) fn of(body: &Body<'_>) -> Option<Self> {
        // A trivial thunk is one that is a thunk that has a single body, with only trivial
        // assignments, and then returns such a value. So no control-flow.
        // A trivial thunk may create aggregates, but not operate on them, so bin and unops are not
        // allowed.

        // TODO: should we expand the scope here to allow non-thunks to allow as thunks?!
        if matches!(body.source, Source::Thunk(_, _))
            && let Some(target) = Self::thunk(body)
        {
            return Some(target);
        }

        Self::closure(body)
    }
}
