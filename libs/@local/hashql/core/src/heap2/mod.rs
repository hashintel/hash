#![expect(unsafe_code)]

mod phase;
mod reset;
mod scope;
mod symbol;

pub use self::{
    phase::PhaseAllocator,
    reset::ResetAllocator,
    scope::{ScopeAllocator, Scoped},
    symbol::SymbolAllocator,
};
