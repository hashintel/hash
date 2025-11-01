use core::mem;

use hashql_core::{
    heap::{self, Heap},
    span::SpanId,
};

use crate::{
    body::{
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        local::Local,
        operand::Operand,
        statement::Statement,
        terminator::{Goto, GraphRead, Target, Terminator, TerminatorKind},
    },
    intern::Interner,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum RewireKind {
    Goto,
    GraphRead,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ForwardRef {
    kind: RewireKind,
    id: BasicBlockId,
}

impl ForwardRef {
    pub(crate) const fn goto(id: BasicBlockId) -> Self {
        Self {
            kind: RewireKind::Goto,
            id,
        }
    }

    pub(crate) const fn graph_read(id: BasicBlockId) -> Self {
        Self {
            kind: RewireKind::GraphRead,
            id,
        }
    }
}

/// Builder for constructing MIR basic blocks during reification.
///
/// `CurrentBlock` manages the construction of a single basic block, accumulating
/// statements and handling control flow.
pub(crate) struct CurrentBlock<'mir, 'heap> {
    heap: &'heap Heap,
    interner: &'mir Interner<'heap>,

    block: BasicBlock<'heap>,
    slot: Option<BasicBlockId>,
    forward_ref: Vec<ForwardRef>,
}

impl<'mir, 'heap> CurrentBlock<'mir, 'heap> {
    pub(crate) fn new(heap: &'heap Heap, interner: &'mir Interner<'heap>) -> Self {
        Self {
            heap,
            interner,
            block: Self::empty_block(heap, interner),
            slot: None,
            forward_ref: Vec::new(),
        }
    }

    pub(crate) fn replace_params(&mut self, params: &[Local]) {
        debug_assert!(self.block.params.is_empty());
        self.block.params = self.interner.locals.intern_slice(params);
    }

    pub(crate) fn push_statement(&mut self, statement: Statement<'heap>) {
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

    pub(crate) fn complete(
        mut block: BasicBlock<'heap>,
        terminator: Terminator<'heap>,
        forward_ref: &mut Vec<ForwardRef>,
        slot: &mut Option<BasicBlockId>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        debug_assert_eq!(block.terminator.kind, TerminatorKind::Unreachable);
        block.terminator = terminator;

        let block_id = if let Some(slot) = slot.take() {
            blocks[slot] = block;
            slot
        } else {
            blocks.push(block)
        };

        for forward in forward_ref.drain(..) {
            let terminator = &mut blocks[forward.id].terminator.kind;

            match (forward.kind, terminator) {
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

    pub(crate) fn reserve(&mut self, blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>) {
        self.slot = Some(blocks.push(Self::empty_block(self.heap, self.interner)));
    }

    pub(crate) fn terminate<const N: usize>(
        &mut self,
        terminator: Terminator<'heap>,
        forward_ref: impl FnOnce(BasicBlockId) -> [ForwardRef; N],
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        // Finishes the current block, and starts a new one
        let previous = mem::replace(&mut self.block, Self::empty_block(self.heap, self.interner));
        let id = Self::complete(
            previous,
            terminator,
            &mut self.forward_ref,
            &mut self.slot,
            blocks,
        );

        self.forward_ref.extend_from_slice(&forward_ref(id));

        id
    }

    pub(crate) fn finish(
        mut self,
        terminator: Terminator<'heap>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        Self::complete(
            self.block,
            terminator,
            &mut self.forward_ref,
            &mut self.slot,
            blocks,
        )
    }

    pub(crate) fn finish_goto(
        self,
        span: SpanId,
        block: BasicBlockId,
        args: &[Operand<'heap>],
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> BasicBlockId {
        let args = self.interner.operands.intern_slice(args);

        self.finish(
            Terminator {
                span,
                kind: TerminatorKind::Goto(Goto {
                    target: Target { block, args },
                }),
            },
            blocks,
        )
    }
}
