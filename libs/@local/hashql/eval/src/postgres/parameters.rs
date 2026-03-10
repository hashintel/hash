//! Deduplicated SQL parameter management.
//!
//! The compiler allocates parameters through typed constructors on [`Parameters`]. Each distinct
//! logical value (input binding, constant, temporal axis, etc.) is assigned a stable
//! [`ParameterIndex`], and identical requests yield the same index. The interpreter later uses
//! the reverse mapping to bind runtime values in the correct `$N` order.

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    fmt::{self, Display},
};

use hash_graph_postgres_store::store::postgres::query::Expression;
use hashql_core::{
    collections::{FastHashMap, fast_hash_map_in},
    id::{self, Id as _, IdVec},
    symbol::Symbol,
    value::Primitive,
};
use hashql_mir::{body::place::FieldIndex, def::DefId, interpret::value::Int};

id::newtype!(
    /// Index of a SQL parameter in the compiled query, rendered as `$N` by the SQL formatter.
    #[id(display = !)]
    pub struct ParameterIndex(u32 is 0..=u32::MAX)
);

impl Display for ParameterIndex {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "${}", self.as_u32() + 1)
    }
}

impl From<ParameterIndex> for Expression {
    fn from(value: ParameterIndex) -> Self {
        Self::Parameter(value.as_usize() + 1)
    }
}

/// Interned identity for a SQL parameter.
///
/// Parameters are deduplicated by this key so multiple occurrences of the same logical value
/// (e.g. the same input symbol) share one `$N` placeholder.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Parameter<'heap> {
    /// A user-provided input binding.
    Input(Symbol<'heap>),
    /// An integer constant that does not fit in a `u32`.
    Int(Int),
    /// A primitive constant value (string, bool, etc.).
    Primitive(Primitive<'heap>),
    /// A symbol used as a JSON object key in SQL expressions.
    Symbol(Symbol<'heap>),
    /// A captured-environment field access.
    Env(DefId, FieldIndex),
    /// Temporal axis range provided by the interpreter at execution time.
    ///
    /// The interpreter binds these based on the user's temporal axes configuration:
    /// pinned axis gets a degenerate `[ts, ts]` range, variable axis gets the query
    /// interval. Both use `&&` so the `GiST` index is always usable.
    TemporalAxis(TemporalAxis),
}

impl fmt::Display for Parameter<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Input(symbol) => write!(fmt, "Input({symbol})"),
            Self::Int(int) => write!(fmt, "Int({int})"),
            Self::Primitive(primitive) => write!(fmt, "Primitive({primitive})"),
            Self::Symbol(symbol) => write!(fmt, "Symbol({symbol})"),
            Self::Env(def, field) => write!(fmt, "Env({def}, #{})", field.as_u32()),
            Self::TemporalAxis(axis) => write!(fmt, "TemporalAxis({axis})"),
        }
    }
}

/// Selects which temporal axis a parameter range applies to.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TemporalAxis {
    /// Transaction-time axis.
    Transaction,
    /// Decision-time axis.
    Decision,
}

impl fmt::Display for TemporalAxis {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transaction => fmt.write_str("Transaction"),
            Self::Decision => fmt.write_str("Decision"),
        }
    }
}

/// Deduplicating parameter catalog for a compiled query.
///
/// The compiler requests parameters through typed constructors. Each request returns a stable
/// [`ParameterIndex`], and identical requests yield the same index.
///
/// The interpreter uses the reverse mapping to bind runtime values in the correct order.
pub struct Parameters<'heap, A: Allocator = Global> {
    lookup: FastHashMap<Parameter<'heap>, ParameterIndex, A>,
    reverse: IdVec<ParameterIndex, Parameter<'heap>, A>,
}

impl<'heap, A: Allocator> Parameters<'heap, A> {
    pub(crate) fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            lookup: fast_hash_map_in(alloc.clone()),
            reverse: IdVec::new_in(alloc),
        }
    }

    fn get_or_insert(&mut self, param: Parameter<'heap>) -> ParameterIndex {
        *self
            .lookup
            .entry(param)
            .or_insert_with(|| self.reverse.push(param))
    }

    pub(crate) fn input(&mut self, name: Symbol<'heap>) -> ParameterIndex {
        self.get_or_insert(Parameter::Input(name))
    }

    /// Allocates a parameter for a symbol used as a JSON object key in SQL expressions.
    pub(crate) fn symbol(&mut self, name: Symbol<'heap>) -> ParameterIndex {
        self.get_or_insert(Parameter::Symbol(name))
    }

    pub(crate) fn int(&mut self, value: Int) -> ParameterIndex {
        self.get_or_insert(Parameter::Int(value))
    }

    pub(crate) fn primitive(&mut self, primitive: Primitive<'heap>) -> ParameterIndex {
        self.get_or_insert(Parameter::Primitive(primitive))
    }

    pub(crate) fn env(&mut self, body: DefId, field: FieldIndex) -> ParameterIndex {
        self.get_or_insert(Parameter::Env(body, field))
    }

    pub(crate) fn temporal_axis(&mut self, axis: TemporalAxis) -> ParameterIndex {
        self.get_or_insert(Parameter::TemporalAxis(axis))
    }

    /// Returns the number of distinct parameters allocated so far.
    pub fn len(&self) -> usize {
        self.reverse.len()
    }

    /// Returns `true` if no parameters have been allocated.
    pub fn is_empty(&self) -> bool {
        self.reverse.is_empty()
    }

    pub fn iter(&self) -> impl ExactSizeIterator<Item = &Parameter<'heap>> + DoubleEndedIterator {
        self.reverse.iter()
    }
}

impl<'this, 'heap> IntoIterator for &'this Parameters<'heap> {
    type Item = &'this Parameter<'heap>;

    type IntoIter = impl ExactSizeIterator<Item = &'this Parameter<'heap>> + DoubleEndedIterator;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<A: Allocator> fmt::Display for Parameters<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, param) in self.reverse.iter_enumerated() {
            if index.as_usize() > 0 {
                fmt.write_str("\n")?;
            }
            write!(fmt, "{index}: {param}")?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use alloc::alloc::Global;

    use hashql_core::{
        heap::Heap,
        id::Id as _,
        value::{Primitive, String},
    };
    use hashql_mir::{body::place::FieldIndex, def::DefId, interpret::value::Int};

    use super::{Parameters, TemporalAxis};

    #[test]
    fn input_dedup() {
        let heap = Heap::new();
        let sym = heap.intern_symbol("x");

        let mut params = Parameters::new_in(Global);
        let a = params.input(sym);
        let b = params.input(sym);

        assert_eq!(a, b);
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn category_isolation() {
        let heap = Heap::new();
        let sym = heap.intern_symbol("x");

        let mut params = Parameters::new_in(Global);
        let input_idx = params.input(sym);
        let symbol_idx = params.symbol(sym);

        assert_ne!(input_idx, symbol_idx);
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn temporal_axis_stable() {
        let mut params = Parameters::new_in(Global);
        let a = params.temporal_axis(TemporalAxis::Transaction);
        let b = params.temporal_axis(TemporalAxis::Transaction);

        assert_eq!(a, b);
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn int_dedup() {
        let mut params = Parameters::new_in(Global);
        let a = params.int(Int::from(42_i128));
        let b = params.int(Int::from(42_i128));

        assert_eq!(a, b);
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn primitive_dedup() {
        let heap = Heap::new();
        let string = String::new(heap.intern_symbol("hello"));

        let mut params = Parameters::new_in(Global);
        let a = params.primitive(Primitive::String(string));
        let b = params.primitive(Primitive::String(string));

        assert_eq!(a, b);
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn env_dedup() {
        let mut params = Parameters::new_in(Global);
        let a = params.env(DefId::MIN, FieldIndex::new(0));
        let b = params.env(DefId::MIN, FieldIndex::new(0));

        assert_eq!(a, b);
        assert_eq!(params.len(), 1);
    }
}
