use super::basic_block::BasicBlockId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Location {
    pub block: BasicBlockId,
    pub statement_index: usize,
}
