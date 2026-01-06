use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::symbol::Symbol;

use super::value::ValueTypeName;
use crate::body::{local::Local, place::FieldIndex};

#[derive(Debug, Copy, Clone)]
pub enum RuntimeError<'value, 'index, 'heap, A: Allocator = Global> {
    // Local hasn't been initialized yet, by all intents and purposes this is an ICE, because
    // *any* step before should have handled this. Be it the MIR or the HIR.
    UninitializedLocal(Local),
    // Again: this is an ICE. typechk should have handled this.
    InvalidIndexType(
        ValueTypeName<'value, 'heap, A>,
        ValueTypeName<'index, 'heap, A>,
    ),
    // Again: this is an ICE. typechk should have handled this.
    InvalidSubscriptType(ValueTypeName<'value, 'heap, A>),
    // Again: this is an ICE. typechk should have handled this.
    InvalidProjectionType(ValueTypeName<'value, 'heap, A>),
    // Again: this is an ICE. typechk should have handled this.
    InvalidProjectionByNameType(ValueTypeName<'value, 'heap, A>),
    // Again: this is an ICE. typechk should have handled this.
    UnknownField(ValueTypeName<'value, 'heap, A>, FieldIndex),
    // Again: this is an ICE. typechk should have handled this.
    UnknownFieldByName(ValueTypeName<'value, 'heap, A>, Symbol<'heap>),
    // Again: this is an ICE. This should just... never happen.
    StructFieldLengthMismatch {
        values: usize,
        fields: usize,
    },
}
