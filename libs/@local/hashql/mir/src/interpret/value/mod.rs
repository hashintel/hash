// Value v2, now even better™

use alloc::rc::Rc;
use core::cmp;

use hashql_core::{intern::Interned, symbol::Symbol};
use imbl::shared_ptr::RcK;

use crate::def::DefId;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Value<'heap> {
    // Primitives
    Unit,
    Integer(Int), // boolean no longer exists, null is unit
    Number(Num),
    String(Str),
    Pointer(Ptr),

    // Aggregates
    Opaque(Opaque<'heap>),
    Struct(Struct<'heap>),
    Tuple(Tuple<'heap>),

    // Collections
    List(List<'heap>),
    Dict(Dict<'heap>),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct List<'heap> {
    inner: imbl::GenericVector<Value<'heap>, RcK>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Dict<'heap> {
    inner: imbl::GenericOrdMap<Value<'heap>, Value<'heap>, RcK>,
}

#[derive(Debug, Copy, Clone)]
struct Num {
    value: f64, // For now no arbitrary precision
}

impl PartialEq for Num {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for Num {}

impl PartialOrd for Num {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Num {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.value.total_cmp(&other.value)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Int {
    value: i128,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Ptr {
    value: DefId,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Str {
    value: Rc<str>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Struct<'heap> {
    fields: Interned<'heap, [Symbol<'heap>]>,
    values: Rc<[Value<'heap>]>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Tuple<'heap> {
    values: Rc<[Value<'heap>]>, // MUST BE NON-EMPTY, otherwise it's a Unit
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Opaque<'heap> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap>>,
}
