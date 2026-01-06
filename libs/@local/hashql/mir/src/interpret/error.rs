use super::value::ValueTypeName;
use crate::body::{constant::Int, local::Local};

pub enum RuntimeError<'value, 'heap> {
    // Local hasn't been initialized yet, by all intents and purposes this is an ICE, because
    // *any* step before should have handled this. Be it the MIR or the HIR.
    UninitializedLocal(Local),
    // Again: this is an ICE. typechk should have handled this.
    InvalidIndexType(ValueTypeName<'value, 'heap>, ValueTypeName<'value, 'heap>),
    // Again: this is an ICE. typechk should have handled this.
    InvalidSubscriptType(ValueTypeName<'value, 'heap>),
    // Value is too large to be used as an index, this is an actual execution error,
    // instead of an ICE (although it should never happen).
    InvalidIndex(Int),
}
