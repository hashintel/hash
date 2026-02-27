use hashql_core::id::{IdArray, bit_vec::FiniteBitSet};

/// Execution backend that a basic block can be assigned to.
///
/// The placement solver assigns exactly one target to each basic block in a query body. Targets
/// are ordered by specificity: `Interpreter` handles everything, `Postgres` handles most
/// relational operations, and `Embedding` handles only vector encoding projections.
///
/// The discriminant order determines iteration order in [`TargetId::all`] and affects cost
/// estimation during placement. The interpreter is evaluated last so it can incorporate traversal
/// costs computed by the other backends.
#[hashql_core::id]
pub enum TargetId {
    /// In-process evaluator that supports all MIR operations.
    ///
    /// Acts as the universal fallback when no specialized backend can handle a block.
    Interpreter,
    /// Translates MIR blocks into SQL for execution against a PostgreSQL database.
    ///
    /// Supports constants, arithmetic, aggregates (excluding closures), inputs, and entity field
    /// projections that map to columns or JSONB paths.
    Postgres,
    /// Dispatches vector encoding lookups to a dedicated embedding service.
    ///
    /// Only supports entity projections that access the `encodings.vectors` path.
    Embedding,
}

impl TargetId {
    pub const VARIANT_COUNT_U32: u32 = match u32::try_from(Self::VARIANT_COUNT) {
        Ok(count) => count,
        Err(_) => unreachable!(),
    };
    pub const VARIANT_COUNT_U8: u8 = match u8::try_from(Self::VARIANT_COUNT) {
        Ok(count) => count,
        Err(_) => unreachable!(),
    };

    #[must_use]
    pub const fn abbreviation(self) -> &'static str {
        match self {
            Self::Interpreter => "I",
            Self::Postgres => "P",
            Self::Embedding => "E",
        }
    }
}

pub(crate) type TargetBitSet = FiniteBitSet<TargetId, u8>;
pub(crate) type TargetArray<T> = IdArray<TargetId, T, { TargetId::VARIANT_COUNT }>;
