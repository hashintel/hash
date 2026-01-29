use hashql_core::id;

use crate::pass::simplify_type_name;

id::newtype!(
    pub struct TargetId(u8 is 0..=0xF0)
);

impl TargetId {
    pub const EMBEDDING: Self = Self(0x02);
    pub const INTERPRETER: Self = Self(0x01);
    pub const POSTGRES: Self = Self(0x00);
}

/// A backend capable of executing MIR statements.
///
/// Each target represents a different execution environment with its own capabilities and
/// performance characteristics. The execution planner uses statement placement analysis to
/// determine which statements each target can handle, then selects the optimal target based on
/// cost.
///
/// Currently supported targets:
/// - [`Postgres`]: Pushes operations into SQL for database-side execution
/// - [`Embedding`]: Routes vector operations to the embedding store
/// - [`Interpreter`]: Executes in the HashQL runtime (universal fallback)
pub trait ExecutionTarget {
    /// Returns the unique identifier for this target.
    ///
    /// Used to distinguish between targets when comparing costs or storing per-target data.
    fn id(&self) -> TargetId;

    /// Returns a human-readable name for this target.
    ///
    /// By default derived from the type name; used for diagnostics and debugging output.
    fn name(&self) -> &str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }
}

/// Execution target that pushes operations into SQL queries.
///
/// Supports constants, arithmetic, comparisons, and entity field access for columns stored in
/// Postgres. Operations are translated to SQL and executed database-side, avoiding data transfer
/// overhead.
pub struct Postgres;

impl ExecutionTarget for Postgres {
    fn id(&self) -> TargetId {
        TargetId::POSTGRES
    }
}

/// Execution target for the HashQL runtime interpreter.
///
/// The universal fallback that can execute any MIR statement. Used when specialized targets
/// cannot handle an operation, or when the operation requires runtime features like closures.
pub struct Interpreter;

impl ExecutionTarget for Interpreter {
    fn id(&self) -> TargetId {
        TargetId::INTERPRETER
    }
}

/// Execution target for vector embedding operations.
///
/// Routes vector similarity searches and embedding lookups to the dedicated embedding store.
/// Only supports accessing the `encodings.vectors` path on entities.
pub struct Embedding;

impl ExecutionTarget for Embedding {
    fn id(&self) -> TargetId {
        TargetId::EMBEDDING
    }
}
