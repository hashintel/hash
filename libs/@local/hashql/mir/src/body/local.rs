//! Local variable representation for HashQL MIR.
//!
//! Local variables in the MIR represent storage locations that can hold values
//! during execution. They are the primary way to represent variables, temporaries,
//! and intermediate computation results in the MIR.

use hashql_core::{id, span::SpanId, symbol::Symbol, r#type::TypeId};

id::newtype!(
    /// A unique identifier for a local variable in the HashQL MIR.
    ///
    /// Local variables represent storage locations within a function's execution context.
    /// They can represent user-declared variables, compiler-generated temporaries,
    /// or intermediate values needed during computation.
    ///
    /// # Usage Patterns
    ///
    /// Local variables are used in several contexts:
    /// - **User Variables**: Variables explicitly declared in the source code
    /// - **Temporaries**: Compiler-generated storage for intermediate computations
    /// - **Parameters**: Function parameters and basic block parameters
    /// - **Return Values**: Storage for function return values
    ///
    /// # Lifetime and Scope
    ///
    /// Each [`Local`] is valid within the scope of a single function body. The MIR
    /// uses explicit storage management through [`StorageLive`] and [`StorageDead`]
    /// statements to track when local variables are active.
    pub struct Local(usize is 0..=usize::MAX)
);

id::newtype_collections!(pub type Local* from Local);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct LocalDecl<'heap> {
    pub span: SpanId,
    pub r#type: TypeId,

    pub name: Option<Symbol<'heap>>,
}
