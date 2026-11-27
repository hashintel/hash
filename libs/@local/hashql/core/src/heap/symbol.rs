use alloc::alloc::handle_alloc_error;
use core::alloc::{AllocError, Layout};

use super::AllocatorPointer;
use crate::symbol::Symbol;

/// An allocator that interns strings as [`Symbol`]s.
///
/// Interning stores each distinct string once per arena, and equal strings yield equal symbols.
/// [`Symbol`] compares and hashes by identity without reading the string, which is correct only
/// under that guarantee.
///
/// # Safety
///
/// Implementors must ensure that the string a returned [`Symbol`] refers to stays valid and
/// unchanged for all of `'alloc`.
///
/// # Example
///
/// ```
/// use hashql_core::{
///     heap::{Heap, SymbolAllocator},
///     symbol::Symbol,
/// };
///
/// fn qualified<'alloc, A>(alloc: A, module: &str, name: &str) -> Symbol<'alloc>
/// where
///     A: SymbolAllocator<'alloc>,
/// {
///     alloc.alloc_symbol(&format!("{module}::{name}"))
/// }
///
/// let heap = Heap::new();
/// let first = qualified(&heap, "math", "total price");
/// let second = qualified(&heap, "math", "total price");
///
/// assert_eq!(first.as_str(), "math::total price");
/// // Equal strings intern to one symbol, which compares by address.
/// assert_eq!(first, second);
/// ```
pub const unsafe trait SymbolAllocator<'alloc>: AllocatorPointer {
    /// Interns `name` and returns its [`Symbol`].
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    fn try_alloc_symbol(self, name: &str) -> Result<Symbol<'alloc>, AllocError>;

    /// Interns `name` and returns its [`Symbol`].
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_alloc_symbol`] to handle that failure yourself.
    ///
    /// [`try_alloc_symbol`]: Self::try_alloc_symbol
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn alloc_symbol(self, name: &str) -> Symbol<'alloc> {
        match self.try_alloc_symbol(name) {
            Ok(symbol) => symbol,
            Err(_) => {
                let layout = Layout::for_value(name);
                handle_alloc_error(layout)
            }
        }
    }
}
