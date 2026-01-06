use core::alloc::Allocator;

use hashql_core::symbol::Symbol;

use super::value::ValueTypeName;
use crate::body::{constant::Int, local::Local, place::FieldIndex};

#[derive(Debug, Clone)]
pub enum TypeName {
    Detailed(String),
    Terse(&'static str),
}

impl TypeName {
    pub const fn terse(str: &'static str) -> Self {
        Self::Terse(str)
    }
}

impl<A: Allocator> From<ValueTypeName<'_, '_, A>> for TypeName {
    fn from(value: ValueTypeName<'_, '_, A>) -> Self {
        Self::Detailed(value.to_string())
    }
}

#[derive(Debug, Clone)]
pub enum RuntimeError<'heap> {
    // Local hasn't been initialized yet, by all intents and purposes this is an ICE, because
    // *any* step before should have handled this. Be it the MIR or the HIR.
    UninitializedLocal(Local),
    // Again: this is an ICE. typechk should have handled this.
    InvalidIndexType(TypeName, TypeName),
    // Again: this is an ICE. typechk should have handled this.
    InvalidSubscriptType(TypeName),
    // Again: this is an ICE. typechk should have handled this.
    InvalidProjectionType(TypeName),
    // Again: this is an ICE. typechk should have handled this.
    InvalidProjectionByNameType(TypeName),
    // Again: this is an ICE. typechk should have handled this.
    UnknownField(TypeName, FieldIndex),
    // Again: this is an ICE. typechk should have handled this.
    UnknownFieldByName(TypeName, Symbol<'heap>),
    // Again: this is an ICE. This should just... never happen.
    StructFieldLengthMismatch { values: usize, fields: usize },
    // Again: this is an ICE. This should just... never happen.
    InvalidDiscriminantType(TypeName),
    // Again: this is an ICE. This should just... never happen.
    InvalidDiscriminant(Int),
    // Again: this is an ICE. This should just... never happen.
    UnreachableReached,

    // This is actually a proper error, in a future this should be removed. Potentially ICE
    // because the user can't actually use this, so this would only happen if the compiler
    // determined that it fine to turn into a mutable assignment but then turned out that wasn't
    // the case.
    OutOfRange { length: usize, index: Int },
    // ICE, should be caught in program analysis, for now just an ERR because program analysis is
    // not yet implemented.
    InputNotFound(Symbol<'heap>),
}
