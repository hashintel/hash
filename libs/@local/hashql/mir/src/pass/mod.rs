//! MIR transformation and analysis passes.
//!
//! This module provides the infrastructure for defining and running passes over HashQL MIR bodies.
//! Passes are used to analyze, optimize, and transform the control-flow graph representation of
//! HashQL functions.
//!
//! # Overview
//!
//! A pass is a self-contained transformation or analysis that operates on a [`Body`]. There are
//! two kinds of passes:
//!
//! - **Transform passes** ([`TransformPass`]): Modify the MIR in place (optimization, lowering)
//! - **Analysis passes** ([`AnalysisPass`]): Collect information without modification
//!
//! # Submodules
//!
//! - [`analysis`]: Static analysis infrastructure including dataflow analysis framework
//! - [`transform`]: MIR transformation passes

use crate::{body::Body, context::MirContext};

pub mod analysis;
pub mod transform;

/// Extracts the simple type name from a fully qualified type path.
///
/// Takes a fully qualified Rust type name (e.g., `crate::pass::transform::MyPass<T>`) and returns
/// just the base type name without the module path or generic parameters (e.g., `MyPass`).
///
/// This is used to provide human-readable pass names for debugging and logging purposes.
const fn simplify_type_name(name: &'static str) -> &'static str {
    // The function is more complicated than it should due to the const constraint, but a const
    // constraint means that the created constant only needs to be created once and can be supplied
    // as a default.
    let bytes = name.as_bytes();

    let mut index = bytes.len();
    while index > 0 && bytes[index - 1] != b':' {
        index -= 1;
    }

    // We now have everything *after* an `:`, but generics may still exist, aka: Foo<Bar>
    let (_, bytes) = bytes.split_at(index);

    index = 0;
    while index < bytes.len() && bytes[index] != b'<' {
        index += 1;
    }

    // We now split at the first `<`, therefore also removing all nested generics
    let (bytes, _) = bytes.split_at(index);

    match core::str::from_utf8(bytes) {
        Ok(name) => name,
        Err(_) => {
            panic!("bytes comes from valid utf-8 and should retain being valid utf8")
        }
    }
}

/// Indicates whether a pass modified the MIR.
///
/// Passes return this to signal whether they made changes, enabling the pass manager to skip
/// dependent re-analyses when nothing changed.
#[must_use]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Changed {
    /// The pass definitely made modifications.
    Yes = 2,
    /// The pass may have made modifications, but precise tracking was not possible.
    Unknown = 1,
    /// The pass made no modifications.
    No = 0,
}

impl Changed {
    /// Returns `true` if the MIR may have changed.
    ///
    /// This is the conservative choice: returns `true` for both [`Changed::Yes`] and
    /// [`Changed::Unknown`], ensuring dependent analyses are invalidated when in doubt, but may
    /// result in unnecessary passes to be run.
    #[must_use]
    pub const fn conservative(self) -> bool {
        match self {
            Self::Yes | Self::Unknown => true,
            Self::No => false,
        }
    }

    /// Returns `true` only if the MIR definitely changed.
    ///
    /// This is the optimistic choice: returns `true` only for [`Changed::Yes`], assuming
    /// [`Changed::Unknown`] did not actually modify anything. Use with caution, as this may
    /// skip necessary re-runs of passes.
    #[must_use]
    pub const fn optimistic(self) -> bool {
        match self {
            Self::Yes => true,
            Self::Unknown | Self::No => false,
        }
    }
}

impl From<bool> for Changed {
    fn from(value: bool) -> Self {
        if value { Self::Yes } else { Self::No }
    }
}

/// A transformation or analysis pass over MIR.
///
/// Passes operate on a [`Body`] within a [`MirContext`], allowing them to read and modify the
/// control-flow graph, access type information, and report diagnostics.
///
/// # Implementing a Pass
///
/// To implement a pass, define a struct and implement this trait:
///
/// ```ignore
/// struct MyOptimizationPass;
///
/// impl<'env, 'heap> Pass<'env, 'heap> for MyOptimizationPass {
///     fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
///         // Perform transformations on `body`
///     }
/// }
/// ```
///
/// The [`name`] method provides a default implementation that extracts the type name for logging
/// and debugging purposes. Override it if you need a custom name.
///
/// [`name`]: TransformPass::name
pub trait TransformPass<'env, 'heap> {
    /// Executes the pass on the given `body`.
    ///
    /// The `context` provides access to the heap allocator, type environment, interner, and
    /// diagnostic collection. The `body` can be read and modified in place.
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed;

    /// Returns a human-readable name for this pass.
    ///
    /// The default implementation extracts the type name without module path or generic
    /// parameters. Override this method to provide a custom name.
    fn name(&self) -> &'static str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }
}

/// An analysis pass over MIR.
///
/// Analysis passes inspect a [`Body`] without modifying it, typically to collect information
/// for diagnostics, optimization decisions, or validation.
///
/// # Implementing an Analysis Pass
///
/// ```ignore
/// struct UnusedVariableAnalysis;
///
/// impl<'env, 'heap> AnalysisPass<'env, 'heap> for UnusedVariableAnalysis {
///     fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
///         // Analyze `body` and report diagnostics via `context`
///     }
/// }
/// ```
///
/// For dataflow analyses, consider using the [`analysis::dataflow`] framework instead,
/// which provides fixed-point iteration and handles control-flow automatically.
///
/// [`analysis::dataflow`]: crate::pass::analysis::dataflow
pub trait AnalysisPass<'env, 'heap> {
    /// Executes the analysis pass on the given `body`.
    ///
    /// The `context` provides access to the heap allocator, type environment, interner, and
    /// diagnostic collection. The `body` is read-only.
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>);

    /// Returns a human-readable name for this pass.
    ///
    /// The default implementation extracts the type name without module path or generic
    /// parameters. Override this method to provide a custom name.
    fn name(&self) -> &'static str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }
}
