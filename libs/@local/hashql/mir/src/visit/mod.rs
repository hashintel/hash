//! MIR visitor traits for traversal and transformation.
//!
//! This module provides two visitor patterns for working with MIR structures:
//!
//! - [`Visitor`]: Immutable traversal for analysis without modification
//! - [`VisitorMut`]: Mutable traversal for in-place transformation
//!
//! # Key Characteristics
//!
//! Both visitors share common patterns:
//!
//! 1. **Depth-First Traversal**: Visitors traverse the MIR in depth-first order through basic
//!    blocks, statements, and terminators.
//!
//! 2. **Location Tracking**: Every visit method receives a [`Location`] identifying the precise
//!    program point being visited.
//!
//! 3. **Child Control**: Each overridden visit method has full control over traversal. You can:
//!    - Process a node and then call `walk_*` for default child traversal
//!    - Manually traverse only specific children
//!    - Skip child traversal entirely
//!
//! 4. **Fallible Operations**: Both visitors support the [`Try`] trait, allowing early termination
//!    on errors or control flow conditions.
//!
//! # Choosing a Visitor
//!
//! **Use [`Visitor`] (immutable) when you need to:**
//! - Analyze MIR without modifying it
//! - Collect statistics or perform dataflow analysis
//! - Validate invariants or perform linting
//! - Search for specific patterns
//!
//! **Use [`VisitorMut`] (mutable) when you need to:**
//! - Transform or optimize MIR in-place
//! - Replace patterns with more efficient equivalents
//! - Normalize MIR structure
//! - Inject instrumentation or tracking
//!
//! **Always prefer [`Visitor`] when modification isn't required** - it's simpler, safer,
//! and more efficient.
//!
//! [`Location`]: crate::body::location::Location
//! [`Try`]: core::ops::Try

pub mod r#mut;
pub mod r#ref;

pub use r#mut::VisitorMut;
pub use r#ref::Visitor;
