// Value v2, now even better™

use std::{
    alloc::{Allocator, Global},
    rc::Rc,
};

use hashql_core::{intern::Interned, symbol::Symbol};

use crate::def::DefId;

enum Value<'heap, A: Allocator = Global> {
    Unit,
    Struct(Struct<'heap, A>),
    Tuple(Tuple<'heap, A>),
    Integer(i128), // boolean no longer exists, null is unit
    // Number(Real), // <- TODO: proper real
    String(Rc<str>),
    Opaque(Opaque<'heap, A>),
    FnPtr(DefId),
}

struct Struct<'heap, A: Allocator = Global> {
    fields: Interned<'heap, [Symbol<'heap>]>,
    values: Rc<[Value<'heap, A>], A>,
}

struct Tuple<'heap, A: Allocator = Global> {
    values: Rc<[Value<'heap, A>], A>, // MUST BE NON-EMPTY, otherwise it's a Unit
}

struct Opaque<'heap, A: Allocator = Global> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap, A>, A>,
}
