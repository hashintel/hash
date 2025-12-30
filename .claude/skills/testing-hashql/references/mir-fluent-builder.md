# MIR Fluent Builder API

The fluent builder API provides programmatic MIR construction. **Prefer the `body!` macro** for most cases - use this API only when the macro doesn't support a required feature.

**Source**: `libs/@local/hashql/mir/src/builder/`

## Setup

```rust
use hashql_core::{heap::Heap, r#type::{TypeBuilder, environment::Environment}};
use hashql_mir::{builder::BodyBuilder, intern::Interner};

let heap = Heap::new();
let interner = Interner::new(&heap);
let builder = BodyBuilder::new(&interner);
let env = Environment::new(&heap);
```

## `op!` Macro

Creates operators for binary/unary operations:

```rust
use hashql_mir::builder::op;

// Binary: ==, !=, <, <=, >, >=, &, |, +, -, *, /
rv.binary(x, op![==], y)

// Unary: !, neg
rv.unary(op![!], cond)
rv.unary(op![neg], value)
```

## Locals and Types

```rust
let env = Environment::new(&heap);

// Common types
let int_ty = TypeBuilder::synthetic(&env).integer();
let bool_ty = TypeBuilder::synthetic(&env).boolean();
let null_ty = TypeBuilder::synthetic(&env).null();

// Declare locals
let x = builder.local("x", int_ty);  // Returns Place<'heap>
```

## Constants

```rust
let const_42 = builder.const_int(42);
let const_true = builder.const_bool(true);
let const_unit = builder.const_unit();
let const_null = builder.const_null();
let const_fn = builder.const_fn(def_id);
```

## Basic Blocks

```rust
// Reserve without parameters
let bb0 = builder.reserve_block([]);

// Reserve with block parameters (for SSA phi-like merging)
let bb1 = builder.reserve_block([x.local, y.local]);
```

## Building Blocks

```rust
builder
    .build_block(bb0)
    .assign_place(x, |rv| rv.load(const_1))
    .assign_place(y, |rv| rv.binary(x, op![==], x))
    .storage_live(local)
    .storage_dead(local)
    .nop()
    .ret(result);  // Must end with terminator
```

## Terminators

```rust
// Return
builder.build_block(bb).ret(value);

// Goto
builder.build_block(bb0).goto(bb1, []);
builder.build_block(bb0).goto(bb1, [x.into(), y.into()]);

// If-else
builder.build_block(bb0).if_else(cond, bb_then, [], bb_else, []);

// Switch
builder.build_block(bb0).switch(selector, |switch| {
    switch.case(0, bb1, []).case(1, bb2, []).otherwise(bb3, [])
});

// Unreachable
builder.build_block(bb).unreachable();
```

## RValue Methods

| Method | Creates | Example |
| ------ | ------- | ------- |
| `load(operand)` | Copy/move | `rv.load(x)` |
| `binary(l, op, r)` | Binary op | `rv.binary(x, op![+], y)` |
| `unary(op, val)` | Unary op | `rv.unary(op![!], cond)` |
| `tuple([...])` | Tuple | `rv.tuple([x, y, z])` |
| `list([...])` | List | `rv.list([a, b, c])` |
| `struct([...])` | Struct | `rv.r#struct([("x", val)])` |
| `closure(def, env)` | Closure | `rv.closure(def_id, env_place)` |
| `dict([...])` | Dict | `rv.dict([(k, v)])` |
| `apply(fn, args)` | Call | `rv.apply(func, [arg1])` |
| `call(fn)` | Call (no args) | `rv.call(func)` |
| `input(op, name)` | Input | `rv.input(InputOp::Load { required: true }, "x")` |

## Places with Projections

```rust
let tup = builder.local("tup", tuple_ty);
let tup_field_0 = builder.place(|place| place.from(tup).field(0, int_ty));

// Nested projections
let nested = builder.place(|place| {
    place.from(outer).field(0, inner_ty).field(1, int_ty)
});
```

## Complete Example

```rust
use hashql_core::{heap::Heap, r#type::{TypeBuilder, environment::Environment}};
use hashql_mir::{builder::BodyBuilder, intern::Interner, op};

let heap = Heap::new();
let interner = Interner::new(&heap);
let builder = BodyBuilder::new(&interner);
let env = Environment::new(&heap);

let int_ty = TypeBuilder::synthetic(&env).integer();
let x = builder.local("x", int_ty);
let const_1 = builder.const_int(1);

let bb0 = builder.reserve_block([]);
builder
    .build_block(bb0)
    .assign_place(x, |rv| rv.load(const_1))
    .ret(x);

let body = builder.finish(0, int_ty);
```

## When to Use Fluent Builder

Use the fluent builder API when the `body!` macro doesn't support your use case:

- `GraphRead` terminator
- Index projections (e.g., `list[idx]`)
- Complex dynamic DefId manipulation
- Other advanced MIR constructs not yet in the macro

For all other cases, prefer the `body!` macro for clarity and maintainability.
