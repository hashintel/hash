//! HashQL MIR body representation.
//!
//! This module contains the core data structures for representing the body of a HashQL function or
//! query in Mid-level Intermediate Representation (MIR). The MIR is a control-flow graph (with
//! data-flow information) based representation that makes analysis and optimization easier than
//! working with the original AST.
//!
//! The main entry point is the [`Body`] structure, which contains a collection of [`BasicBlock`]s
//! that form the control-flow graph of the function.

use hashql_core::{heap::Heap, span::SpanId};

use self::basic_block::{BasicBlock, BasicBlockVec};
use crate::def::DefId;

pub mod basic_block;
pub mod constant;
pub mod local;
pub mod operand;
pub mod place;
pub mod rvalue;
pub mod statement;
pub mod terminator;

/// The source context that generated this MIR body.
///
/// Different kinds of HashQL constructs generate MIR bodies in different contexts,
/// and this enum tracks what kind of source construct this body represents. This
/// information is useful for optimization, analysis, and debugging.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Source {
    /// A closure body with captured environment.
    ///
    /// This variant represents MIR generated from a closure expression that
    /// captures variables from its surrounding scope. The [`DefId`] identifies
    /// the closure definition, and the body will contain logic to access the
    /// captured environment along with the closure's executable code.
    ///
    /// Closure bodies typically have arguments that include both the closure's
    /// parameters and any captured variables that need to be passed in.
    Closure(DefId),

    /// A constant evaluation thunk.
    ///
    /// This variant represents MIR generated for lazy evaluation of constant
    /// expressions. The [`DefId`] identifies the constant definition, and the
    /// body contains the computation needed to evaluate the constant value.
    ///
    /// Thunk bodies always have `args = 0` since constants don't take parameters,
    /// and they typically end with a [`Return`] statement providing the constant value.
    ///
    /// [`Return`]: crate::body::terminator::Return
    Thunk(DefId),

    /// A compiler intrinsic function.
    ///
    /// This variant represents MIR generated for built-in operations that have
    /// special compiler support or runtime behavior. The [`DefId`] identifies the intrinsic
    /// definition.
    ///
    /// The body of an intrinsic function is typically empty, as the intrinsic
    /// operation is handled directly by the compiler or runtime.
    Intrinsic(DefId),
}

/// The MIR body of a HashQL function or query.
///
/// A [`Body`] represents the executable content of a HashQL function as a control-flow graph
/// composed of basic blocks. Each basic block contains a sequence of statements followed by
/// a terminator that determines control flow to other blocks.
///
/// # Structure and Execution
///
/// - **Entry Point**: The first basic block (index 0) is always the entry point.
/// - **Arguments**: Function parameters are allocated as the first `args` locals.
/// - **Control Flow**: Execution follows terminators to navigate between blocks.
/// - **Memory Management**: All data is allocated on the provided heap for efficient sharing.
///
/// # Local Variable Layout
///
/// Local variables are allocated in a specific order:
/// - **Local 0**: Reserved for return value temporary (if needed)
/// - **Locals 1..=args**: Function arguments provided by caller
/// - **Locals (args+1)..**: User variables and compiler temporaries
///
/// # Span Information
///
/// Unlike other representations, spans are added selectively to this MIR level to optimize memory
/// usage and improve interning efficiency while maintaining sufficient debugging information.
pub struct Body<'heap> {
    /// The source location span for this entire body.
    ///
    /// This [`SpanId`] tracks the source location of the function, closure,
    /// or constant that generated this MIR body.
    pub span: SpanId,

    /// The collection of basic blocks that make up this body's control-flow graph.
    ///
    /// This [`BasicBlockVec`] contains all the basic blocks in this body, indexed
    /// by [`BasicBlockId`]. The first block (index 0) is always the entry point
    /// where execution begins.
    ///
    /// [`BasicBlockId`]: crate::body::basic_block::BasicBlockId
    pub basic_blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,

    /// The number of arguments this function takes.
    ///
    /// This value determines how many local variables (starting from local 1)
    /// are reserved for function arguments that will be provided by the caller.
    /// These argument locals can be assumed to be initialized when execution begins.
    ///
    /// # Argument Layout
    ///
    /// - **args = 0**: No arguments (constants, thunks)
    /// - **args = n**: Locals 1 through n are function parameters
    ///
    /// Closures always have at least one argument, which is the closure's environment.
    pub args: usize,
}
