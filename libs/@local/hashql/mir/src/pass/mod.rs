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

use core::{
    alloc::Allocator,
    ops::{BitOr, BitOrAssign},
};

use hashql_core::heap::BumpAllocator;

use crate::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
};

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
    Yes = 3,
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

    /// Convert from a `u8` value.
    ///
    /// # Safety
    ///
    /// The caller must ensure that the value is either `0`, `1`, or `3`.
    #[expect(unsafe_code)]
    const unsafe fn from_u8_unchecked(value: u8) -> Self {
        debug_assert!(value == 0 || value == 1 || value == 3);

        match value {
            0 => Self::No,
            1 => Self::Unknown,
            3 => Self::Yes,
            // SAFETY: caller guarantees that the value is valid.
            _ => unsafe { core::hint::unreachable_unchecked() },
        }
    }

    const fn into_u8(self) -> u8 {
        self as u8
    }
}

impl BitOr for Changed {
    type Output = Self;

    #[inline]
    #[expect(unsafe_code)]
    fn bitor(self, rhs: Self) -> Self::Output {
        let result = self.into_u8() | rhs.into_u8();

        // We use `from_u8_unchecked` here because the safe version prevents LLVM from vectorizing
        // loops that use `|=` on slices of `Changed` values.
        // SAFETY: Both operands have valid discriminants (0, 1, or 3). The bitwise OR of any
        // combination of these values produces only 0, 1, or 3, which are all valid discriminants.
        unsafe { Self::from_u8_unchecked(result) }
    }
}

impl BitOrAssign for Changed {
    #[inline]
    fn bitor_assign(&mut self, rhs: Self) {
        *self = *self | rhs;
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

/// Owned storage for tracking per-body change status during global transformations.
///
/// This type owns the underlying [`DefIdVec`] that tracks which bodies have been modified.
/// Use this when you need the change-tracking state to outlive a single pass invocation,
/// such as when running multiple passes in a fixpoint loop.
///
/// For arena-allocated or short-lived state, prefer [`GlobalTransformState::new_in`] which
/// allocates directly from a bump allocator.
///
/// # Example
///
/// ```ignore
/// let mut state = OwnedGlobalTransformState::new_in(bodies, Global);
///
/// loop {
///     let changed = pass.run(context, &mut state.as_mut(), bodies);
///     if changed == Changed::No {
///         break;
///     }
/// }
/// ```
pub struct OwnedGlobalTransformState<A: Allocator> {
    changed: DefIdVec<Changed, A>,
}

impl<A: Allocator> OwnedGlobalTransformState<A> {
    /// Creates a new owned state initialized to [`Changed::No`] for all bodies.
    ///
    /// The `bodies` parameter is used only to determine the domain size; the actual
    /// body contents are not accessed.
    pub fn new_in(bodies: &DefIdSlice<impl Sized>, alloc: A) -> Self {
        Self {
            changed: DefIdVec::from_domain_in(Changed::No, bodies, alloc),
        }
    }

    /// Returns a borrowed [`GlobalTransformState`] view of this owned state.
    ///
    /// This allows passing the state to [`GlobalTransformPass::run`] while retaining
    /// ownership for subsequent iterations.
    pub fn as_mut(&mut self) -> GlobalTransformState<'_> {
        GlobalTransformState::new(&mut self.changed)
    }
}

/// Tracks per-body change status during a [`GlobalTransformPass`] execution.
///
/// This type provides a borrowed view into change-tracking storage, allowing passes to
/// record which bodies they modified. The storage can come from either:
///
/// - An [`OwnedGlobalTransformState`] via [`as_mut`](OwnedGlobalTransformState::as_mut)
/// - A bump allocator via [`new_in`](Self::new_in)
/// - An existing mutable slice via [`new`](Self::new)
///
/// # Usage in Passes
///
/// Global passes receive this as a parameter and should call [`mark`](Self::mark) whenever
/// they modify a body:
///
/// ```ignore
/// fn run(
///     &mut self,
///     context: &mut MirContext<'env, 'heap>,
///     state: &mut GlobalTransformState<'_>,
///     bodies: &mut DefIdSlice<Body<'heap>>,
/// ) -> Changed {
///     for (id, body) in bodies.iter_enumerated_mut() {
///         if self.transform(body) {
///             state.mark(id, Changed::Yes);
///         }
///     }
///     Changed::Yes
/// }
/// ```
pub struct GlobalTransformState<'ctx> {
    changed: &'ctx mut DefIdSlice<Changed>,
}

impl<'ctx> GlobalTransformState<'ctx> {
    /// Creates a new state from an existing mutable slice.
    ///
    /// The slice must be pre-sized to match the number of bodies being processed.
    pub const fn new(changed: &'ctx mut DefIdSlice<Changed>) -> Self {
        Self { changed }
    }

    /// Creates a new state by allocating from a bump allocator.
    ///
    /// The allocated storage is initialized to [`Changed::No`] for all bodies. The `bodies`
    /// parameter is used only to determine the domain size; the actual body contents are
    /// not accessed.
    ///
    /// This is useful when the state only needs to live for a single pass invocation and
    /// can be discarded when the allocator is reset.
    pub fn new_in<A: BumpAllocator>(bodies: &DefIdSlice<impl Sized>, alloc: &'ctx A) -> Self {
        let uninit_slice = alloc.allocate_slice_uninit(bodies.len());
        let changed = uninit_slice.write_filled(Changed::No);

        Self {
            changed: DefIdSlice::from_raw_mut(changed),
        }
    }

    /// Records that the body with the given [`DefId`] has changed.
    ///
    /// This uses `|=` semantics, so marking a body as [`Changed::Yes`] will not be
    /// downgraded by a subsequent [`Changed::No`] mark.
    pub fn mark(&mut self, id: DefId, changed: Changed) {
        self.changed[id] |= changed;
    }

    /// Overlays the state from another [`GlobalTransformState`] onto this one.
    ///
    /// This is useful when you want to combine the results of multiple passes into a single
    /// state.
    ///
    /// # Panics
    ///
    /// Panics if the lengths of the two states are not equal.
    pub fn overlay(&mut self, other: &DefIdSlice<Changed>) {
        assert_eq!(self.changed.len(), other.len());

        for (target, &value) in self.changed.iter_mut().zip(other) {
            *target |= value;
        }
    }
}

/// A global transformation pass over MIR.
///
/// Unlike [`TransformPass`] which operates on a single [`Body`], global passes have access to
/// **all** bodies simultaneously via a [`DefIdSlice`]. This enables inter-procedural
/// transformations that need to:
///
/// - Analyze or traverse the call graph
/// - Inline code from callees into callers
/// - Perform whole-program optimizations
///
/// # When to Use
///
/// Use `GlobalTransformPass` when your transformation requires cross-function visibility.
/// For single-function transformations, prefer [`TransformPass`] which is simpler and
/// allows the pass manager more flexibility in scheduling.
///
/// # Implementing a Global Pass
///
/// ```ignore
/// struct MyInterProceduralPass;
///
/// impl<'env, 'heap> GlobalTransformPass<'env, 'heap> for MyInterProceduralPass {
///     fn run(
///         &mut self,
///         context: &mut MirContext<'env, 'heap>,
///         bodies: &mut DefIdSlice<Body<'heap>>,
///     ) -> Changed {
///         // Access any body by DefId, build call graphs, inline across functions, etc.
///         Changed::No
///     }
/// }
/// ```
///
/// [`name`]: GlobalTransformPass::name
pub trait GlobalTransformPass<'env, 'heap> {
    /// Executes the pass on all bodies.
    ///
    /// The `context` provides access to the heap allocator, type environment, interner, and
    /// diagnostic collection. The `bodies` slice allows reading and modifying any function body.
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed;

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

#[cfg(test)]
mod tests {
    use super::Changed;

    #[test]
    fn changed_bitor() {
        for (lhs, rhs, expected) in [
            (Changed::No, Changed::No, Changed::No),
            (Changed::No, Changed::Yes, Changed::Yes),
            (Changed::No, Changed::Unknown, Changed::Unknown),
            (Changed::Yes, Changed::No, Changed::Yes),
            (Changed::Yes, Changed::Yes, Changed::Yes),
            (Changed::Yes, Changed::Unknown, Changed::Yes),
            (Changed::Unknown, Changed::No, Changed::Unknown),
            (Changed::Unknown, Changed::Yes, Changed::Yes),
            (Changed::Unknown, Changed::Unknown, Changed::Unknown),
        ] {
            let result = lhs | rhs;
            assert_eq!(result, expected);
        }
    }
}
