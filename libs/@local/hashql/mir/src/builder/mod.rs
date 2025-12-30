//! Ergonomic builder for constructing MIR bodies.
//!
//! This module provides a fluent API for building MIR bodies without the boilerplate
//! of manually constructing all the intermediate structures. It is primarily useful
//! for testing and benchmarking MIR passes.
//!
//! # Example
//!
//! ```
//! use hashql_core::{id::Id, r#type::TypeId};
//! use hashql_mir::{op, scaffold, builder::BodyBuilder};
//!
//! // Set up the heap, interner, and builder
//! scaffold!(heap, interner, builder);
//!
//! // Declare local variables (using TypeId::MAX as a placeholder type)
//! let x = builder.local("x", TypeId::MAX);
//! let y = builder.local("y", TypeId::MAX);
//! let z = builder.local("z", TypeId::MAX);
//!
//! // Reserve basic blocks
//! let entry = builder.reserve_block([]);
//!
//! // Create constants
//! let const_5 = builder.const_int(5);
//! let const_3 = builder.const_int(3);
//!
//! // Build the entry block with statements and terminator
//! builder
//!     .build_block(entry)
//!     .assign_place(x, |rv| rv.load(const_5))
//!     .assign_place(y, |rv| rv.load(const_3))
//!     .assign_place(z, |rv| rv.binary(x, op![==], y))
//!     .ret(z);
//!
//! // Finalize the body
//! let body = builder.finish(0, TypeId::MAX);
//! ```
#![expect(clippy::field_scoped_visibility_modifiers)]

mod base;
mod basic_block;
mod body;
mod operand;
mod place;
mod rvalue;
mod switch;

pub use self::{
    base::BaseBuilder,
    basic_block::BasicBlockBuilder,
    body::{BodyBuilder, body},
    operand::OperandBuilder,
    place::PlaceBuilder,
    rvalue::RValueBuilder,
    switch::SwitchBuilder,
};

/// Macro for creating binary and unary operators.
///
/// This macro provides a convenient way to create operator values for use with
/// [`RValueBuilder::binary`] and [`RValueBuilder::unary`].
///
/// # Binary Operators
///
/// Comparison and logical operators are supported:
///
/// ```
/// use hashql_mir::body::rvalue::BinOp;
/// use hashql_mir::op;
///
/// // Bitwise
/// assert!(matches!(op![&], BinOp::BitAnd));
/// assert!(matches!(op![|], BinOp::BitOr));
///
/// // Comparison
/// assert!(matches!(op![==], BinOp::Eq));
/// assert!(matches!(op![!=], BinOp::Ne));
/// assert!(matches!(op![<], BinOp::Lt));
/// assert!(matches!(op![<=], BinOp::Lte));
/// assert!(matches!(op![>], BinOp::Gt));
/// assert!(matches!(op![>=], BinOp::Gte));
/// ```
///
/// Arithmetic operators are also available (`op![+]`, `op![-]`, `op![*]`, `op![/]`),
/// though they use uninhabited marker types in the current type system.
///
/// # Unary Operators
///
/// ```
/// use hashql_hir::node::operation::UnOp;
/// use hashql_mir::op;
///
/// assert!(matches!(op![!], UnOp::Not));
/// assert!(matches!(op![neg], UnOp::Neg)); // `neg` is used since `-` alone is ambiguous
/// ```
#[macro_export]
macro_rules! op {
    // Binary operators
    [+] => { $crate::body::rvalue::BinOp::Add };
    [-] => { $crate::body::rvalue::BinOp::Sub };
    [*] => { $crate::body::rvalue::BinOp::Mul };
    [/] => { $crate::body::rvalue::BinOp::Div };
    [==] => { $crate::body::rvalue::BinOp::Eq };
    [!=] => { $crate::body::rvalue::BinOp::Ne };
    [<] => { $crate::body::rvalue::BinOp::Lt };
    [<=] => { $crate::body::rvalue::BinOp::Lte };
    [>] => { $crate::body::rvalue::BinOp::Gt };
    [>=] => { $crate::body::rvalue::BinOp::Gte };
    [&] => { $crate::body::rvalue::BinOp::BitAnd };
    [|] => { $crate::body::rvalue::BinOp::BitOr };

    // Unary operators
    [!] => { hashql_hir::node::operation::UnOp::Not };
    [neg] => { hashql_hir::node::operation::UnOp::Neg };
}

/// Scaffold macro for setting up MIR builder infrastructure.
///
/// Creates the heap, interner, and body builder needed for constructing MIR.
/// This is the recommended way to initialize the builder for tests and benchmarks.
///
/// # Example
///
/// ```
/// use hashql_core::{id::Id, r#type::TypeId};
/// use hashql_mir::{builder::BodyBuilder, scaffold};
///
/// scaffold!(heap, interner, builder);
///
/// let x = builder.local("x", TypeId::MAX);
/// let entry = builder.reserve_block([]);
/// builder.build_block(entry).ret(x);
/// let body = builder.finish(0, TypeId::MAX);
/// ```
#[macro_export]
macro_rules! scaffold {
    ($heap:ident, $interner:ident, $builder:ident) => {
        let $heap = hashql_core::heap::Heap::new();
        let $interner = $crate::intern::Interner::new(&$heap);
        let mut $builder = $crate::builder::BodyBuilder::new(&$interner);
    };
}

#[doc(hidden)]
pub mod _private {
    pub use super::{
        basic_block::bb,
        operand::{BuildOperand, operand},
        rvalue::rvalue,
    };
}

pub use op;
pub use scaffold;
