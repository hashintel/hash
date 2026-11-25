use core::alloc::AllocError;

use crate::symbol::Symbol;

pub const unsafe trait SymbolAllocator<'alloc> {
    fn try_alloc_symbol(&self, name: &str) -> Result<Symbol<'alloc>, AllocError>;

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
