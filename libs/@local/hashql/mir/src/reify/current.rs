use core::mem;

use hashql_core::{
    heap::{self, Heap},
    intern::Interned,
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
    pub(crate) fn goto(id: impl Into<BasicBlockId>) -> Self {
        Self {
            kind: RewireKind::Goto,
            id: id.into(),
        }
    }

    pub(crate) fn graph_read(id: impl Into<BasicBlockId>) -> Self {
        Self {
            kind: RewireKind::GraphRead,
            id: id.into(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct EntryBlock(pub BasicBlockId);
impl From<EntryBlock> for BasicBlockId {
    fn from(entry: EntryBlock) -> Self {
        entry.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ExitBlock(pub BasicBlockId);
impl From<ExitBlock> for BasicBlockId {
    fn from(exit: ExitBlock) -> Self {
        exit.0
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
    entry: Option<BasicBlockId>,
    forward_ref: Vec<ForwardRef>,
}

impl<'mir, 'heap> CurrentBlock<'mir, 'heap> {
    pub(crate) const fn new(heap: &'heap Heap, interner: &'mir Interner<'heap>) -> Self {
        Self {
            heap,
            interner,
            block: Self::empty_block(heap),
            slot: None,
            entry: None,
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

    const fn empty_block(heap: &'heap Heap) -> BasicBlock<'heap> {
        BasicBlock {
            params: Interned::empty(),
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
        forward_ref: &mut Vec<ForwardRef>,
        slot: &mut Option<BasicBlockId>,
        entry: &mut Option<BasicBlockId>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> (EntryBlock, ExitBlock) {
        debug_assert_eq!(block.terminator.kind, TerminatorKind::Unreachable);
        block.terminator = terminator;

        let block_id = if let Some(slot) = slot.take() {
            blocks[slot] = block;
            slot
        } else {
            blocks.push(block)
        };

        let entry_block = EntryBlock(*entry.get_or_insert(block_id));

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

        (entry_block, ExitBlock(block_id))
    }

    pub(crate) fn reserve(&mut self, blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>) {
        self.slot = Some(blocks.push(Self::empty_block(self.heap)));
    }

    pub(crate) fn terminate<const N: usize>(
        &mut self,
        terminator: Terminator<'heap>,
        forward_ref: impl FnOnce(BasicBlockId) -> [ForwardRef; N],
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> ExitBlock {
        // Finishes the current block, and starts a new one
        let previous = mem::replace(&mut self.block, Self::empty_block(self.heap));
        let (_, id) = Self::complete(
            previous,
            terminator,
            &mut self.forward_ref,
            &mut self.slot,
            &mut self.entry,
            blocks,
        );

        self.forward_ref.extend_from_slice(&forward_ref(id.0));

        id
    }

    pub(crate) fn finish(
        mut self,
        terminator: Terminator<'heap>,
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> (EntryBlock, ExitBlock) {
        let (entry, exit) = Self::complete(
            self.block,
            terminator,
            &mut self.forward_ref,
            &mut self.slot,
            &mut self.entry,
            blocks,
        );

        (entry, exit)
    }

    pub(crate) fn finish_goto(
        self,
        span: SpanId,
        block: BasicBlockId,
        args: &[Operand<'heap>],
        blocks: &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    ) -> (EntryBlock, ExitBlock) {
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
