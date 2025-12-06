//! MIR transformation passes.
//!
//! This module provides the infrastructure for defining and running transformation passes over
//! HashQL MIR bodies. Passes are used to analyze, optimize, and transform the control-flow graph
//! representation of HashQL functions.
//!
//! # Overview
//!
//! A pass is a self-contained transformation or analysis that operates on a [`Body`]. Passes can
//! modify the MIR in place (transformation passes) or collect information without modification
//! (analysis passes). The [`Pass`] trait provides a uniform interface for both kinds.

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
/// [`name`]: Pass::name
pub trait Pass<'env, 'heap> {
    /// Executes the pass on the given `body`.
    ///
    /// The `context` provides access to the heap allocator, type environment, interner, and
    /// diagnostic collection. The `body` can be read and modified in place.
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>);

    /// Returns a human-readable name for this pass.
    ///
    /// The default implementation extracts the type name without module path or generic
    /// parameters. Override this method to provide a custom name.
    fn name(&self) -> &'static str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }
}
