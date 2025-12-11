use super::basic_block::BasicBlockId;

/// A precise location identifying a specific statement within the MIR control flow graph.
///
/// A [`Location`] uniquely identifies a program point by specifying both the basic block
/// and the statement index within that block.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Location {
    /// The basic block containing this location.
    ///
    /// Identifies which block in the control flow graph this location refers to.
    pub block: BasicBlockId,

    /// The index within the basic block.
    ///
    /// The index utilizes the following numbering scheme:
    ///
    /// - `0`: Block header (entry point)
    /// - `1..n-1`: Statements within the block (1-indexed, so `1` is the first statement)
    /// - `n`: Block terminator (exit point, where n = 1 + number of statements)
    ///
    /// This scheme allows every program point in a block to be uniquely identified,
    /// including points before any statements execute (header) and after all statements
    /// complete (terminator).
    pub statement_index: usize,
}

impl Location {
    pub const PLACEHOLDER: Location = Location {
        block: BasicBlockId::PLACEHOLDER,
        statement_index: usize::MAX,
    };
}
