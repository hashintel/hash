use core::alloc::AllocError;

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
pub const unsafe trait SymbolAllocator<'alloc> {
    /// Interns `name` and returns its [`Symbol`].
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    fn try_alloc_symbol(&self, name: &str) -> Result<Symbol<'alloc>, AllocError>;

    /// Interns `name` and returns its [`Symbol`].
    #[inline]
    fn alloc_symbol(&self, name: &str) -> Symbol<'alloc> {
        match self.try_alloc_symbol(name) {
            Ok(symbol) => symbol,
            Err(_) => {
                todo!()
            }
        }
    }
}
