use crate::body::basic_block::BasicBlockId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Goto {
    pub target: BasicBlockId,
}
