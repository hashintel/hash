//! External input values for the interpreter.
//!
//! HashQL is a referentially transparent functional language — the same query with the same inputs
//! always produces the same result. [`Inputs`] is the mechanism for injecting values that vary
//! between executions, serving as the functional equivalent of environment variables.
//!
//! In J-Expr syntax, inputs are declared with `["input", "name", "Type"]` and optionally given
//! defaults via `["input", "name", "Type", {"#literal": value}]`. At runtime, the interpreter
//! resolves these declarations against the [`Inputs`] provided to the [`Runtime`].
//!
//! [`Runtime`]: super::Runtime

use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{
    collections::{
        fast_hash_map, fast_hash_map_in, fast_hash_map_with_capacity,
        fast_hash_map_with_capacity_in,
    },
    symbol::Symbol,
};

use super::value::Value;

/// External input values available during interpretation.
///
/// Maps input names (as interned [`Symbol`]s) to their runtime [`Value`]s. The interpreter
/// consults this map when evaluating [`InputOp::Load`] (retrieve a value) and
/// [`InputOp::Exists`] (test whether a value was provided).
///
/// # Examples
///
/// ```
/// use hashql_core::symbol::sym;
/// use hashql_mir::interpret::{
///     Inputs,
///     value::{Int, Value},
/// };
///
/// let mut inputs = Inputs::new();
/// inputs.insert(sym::foo, Value::Integer(Int::from(42_i64)));
///
/// assert!(inputs.contains(sym::foo));
/// assert_eq!(
///     inputs.get(sym::foo),
///     Some(&Value::Integer(Int::from(42_i64)))
/// );
/// assert!(!inputs.contains(sym::bar));
/// ```
///
/// [`InputOp::Load`]: hashql_hir::node::operation::InputOp::Load
/// [`InputOp::Exists`]: hashql_hir::node::operation::InputOp::Exists
pub struct Inputs<'heap, A: Allocator = Global> {
    inner: hashql_core::collections::FastHashMap<Symbol<'heap>, Value<'heap, A>, A>,
}

impl Inputs<'_> {
    /// Creates an empty input set.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::Inputs;
    ///
    /// let inputs = Inputs::new();
    /// assert!(inputs.is_empty());
    /// ```
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: fast_hash_map(),
        }
    }

    /// Creates an empty input set with the given capacity.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::Inputs;
    ///
    /// let inputs = Inputs::with_capacity(8);
    /// assert!(inputs.is_empty());
    /// ```
    #[inline]
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: fast_hash_map_with_capacity(capacity),
        }
    }
}

impl Default for Inputs<'_> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'heap, A: Allocator> Inputs<'heap, A> {
    /// Creates an empty input set in the given allocator.
    #[inline]
    #[must_use]
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            inner: fast_hash_map_in(alloc),
        }
    }

    /// Creates an empty input set with the given capacity in the given allocator.
    #[inline]
    #[must_use]
    pub fn with_capacity_in(capacity: usize, alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            inner: fast_hash_map_with_capacity_in(capacity, alloc),
        }
    }

    /// Inserts an input value, returning the previous value if the name was already present.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::symbol::sym;
    /// use hashql_mir::interpret::{Inputs, value::Value};
    ///
    /// let mut inputs = Inputs::new();
    /// assert!(inputs.insert(sym::foo, Value::Unit).is_none());
    /// assert!(inputs.insert(sym::foo, Value::Unit).is_some());
    /// ```
    #[inline]
    pub fn insert(
        &mut self,
        name: Symbol<'heap>,
        value: Value<'heap, A>,
    ) -> Option<Value<'heap, A>> {
        self.inner.insert(name, value)
    }

    /// Returns the value for the given input name.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::symbol::sym;
    /// use hashql_mir::interpret::{
    ///     Inputs,
    ///     value::{Int, Value},
    /// };
    ///
    /// let mut inputs = Inputs::new();
    /// inputs.insert(sym::foo, Value::Integer(Int::from(10_i64)));
    ///
    /// assert_eq!(
    ///     inputs.get(sym::foo),
    ///     Some(&Value::Integer(Int::from(10_i64)))
    /// );
    /// assert_eq!(inputs.get(sym::bar), None);
    /// ```
    #[inline]
    #[must_use]
    pub fn get(&self, name: Symbol<'heap>) -> Option<&Value<'heap, A>> {
        self.inner.get(&name)
    }

    /// Returns whether an input with the given name has been provided.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::symbol::sym;
    /// use hashql_mir::interpret::{Inputs, value::Value};
    ///
    /// let mut inputs = Inputs::new();
    /// inputs.insert(sym::foo, Value::Unit);
    ///
    /// assert!(inputs.contains(sym::foo));
    /// assert!(!inputs.contains(sym::bar));
    /// ```
    #[inline]
    #[must_use]
    pub fn contains(&self, name: Symbol<'heap>) -> bool {
        self.inner.contains_key(&name)
    }

    /// Returns the number of inputs.
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns whether the input set is empty.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}
