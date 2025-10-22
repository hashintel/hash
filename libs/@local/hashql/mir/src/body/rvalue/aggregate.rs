//! Aggregate construction representation for HashQL MIR.
//!
//! Aggregate operations represent the construction of structured data types
//! such as tuples, structs, lists, dictionaries, and other composite values
//! from their component parts.

use hashql_core::{heap::Heap, id::IdVec, intern::Interned, symbol::Symbol};

use crate::{
    body::{operand::Operand, place::FieldIndex},
    def::DefId,
};

/// The kind of aggregate value being constructed.
///
/// Aggregate kinds specify the structure and semantics of composite values
/// that are built from multiple component operands. Each kind has different
/// rules for how operands are interpreted and combined.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AggregateKind<'heap> {
    /// Construct a tuple from ordered operands.
    ///
    /// Tuples are ordered collections of heterogeneous values where each
    /// position can have a different type. The operands are interpreted
    /// positionally to form the tuple elements.
    Tuple,

    /// Construct a struct from ordered field operands.
    ///
    /// Structs are collections of named fields with heterogeneous values.
    /// The operands correspond to the struct's fields in declaration order,
    /// and each field may have a different type.
    Struct {
        fields: Interned<'heap, [Symbol<'heap>]>,
    },

    /// Construct a list from ordered element operands.
    ///
    /// Lists are ordered collections of homogeneous values where all elements
    /// have the same type. The operands represent the individual list elements
    /// in their final order.
    List,

    /// Construct a dictionary from alternating key-value operands.
    ///
    /// Dictionaries are collections of key-value pairs. The operands are
    /// interpreted as alternating keys and values: `[key1, value1, key2, value2, ...]`.
    Dict,

    /// Construct an opaque wrapper around inner data.
    ///
    /// Opaque types provide type abstraction by wrapping inner data with
    /// a named type boundary. The [`Symbol`] identifies the opaque type name,
    /// and the operands (typically length 1) contain the wrapped inner data.
    Opaque(Symbol<'heap>),

    /// Construct a closure with captured environment.
    ///
    /// Closures are function values that capture variables from their
    /// surrounding scope. The operands (`len = 2`) are used to construct a fat pointer, which is a
    /// tuple where the first element is a pointer to the function and the second element is the
    /// captured environment data.
    Closure,
}

/// An aggregate construction operation in the HashQL MIR.
///
/// Aggregate operations create structured data types by combining multiple
/// component operands according to the rules specified by the aggregate kind.
/// They are essential for constructing composite values such as tuples,
/// structs, collections, and other complex data structures.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Aggregate<'heap> {
    /// The kind of aggregate value being constructed.
    ///
    /// This [`AggregateKind`] determines how the operands should be interpreted
    /// and combined to form the final composite value. Different kinds have
    /// different semantics for operand usage and result structure.
    pub kind: AggregateKind<'heap>,

    /// The component operands used to construct the aggregate value.
    ///
    /// This collection of [`Operand`]s provides the values that will be
    /// combined according to the aggregate kind's semantics. The interpretation
    /// of these operands depends on the specific [`AggregateKind`].
    pub operands: IdVec<FieldIndex, Operand<'heap>, &'heap Heap>,
}
