# MIR Builder Guide

Ergonomic API for constructing MIR bodies in tests. Use for testing and benchmarking MIR passes without manual structure boilerplate.

**Source**: `libs/@local/hashql/mir/src/builder.rs`

## Quick Start

```rust
use hashql_core::r#type::{TypeBuilder, environment::Environment};
use hashql_mir::{builder::BodyBuilder, op, scaffold};

scaffold!(heap, interner, builder);
let env = Environment::new(&heap);

// 1. Declare locals
let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
let y = builder.local("y", TypeBuilder::synthetic(&env).integer());

// 2. Create constants
let const_1 = builder.const_int(1);

// 3. Reserve blocks (with optional parameters)
let bb0 = builder.reserve_block([]);

// 4. Build blocks with statements and terminator
builder
    .build_block(bb0)
    .assign_place(x, |rv| rv.load(const_1))
    .assign_place(y, |rv| rv.binary(x, op![==], x))
    .ret(y);

// 5. Finalize
let body = builder.finish(0, TypeBuilder::synthetic(&env).integer());
```

## Core Components

### `scaffold!` Macro

Sets up heap, interner, and builder:

```rust
scaffold!(heap, interner, builder);
let env = Environment::new(&heap);  // Also needed for types
```

### `op!` Macro

Creates operators for binary/unary operations:

```rust
// Binary: ==, !=, <, <=, >, >=, &&, ||, +, -, *, /
rv.binary(x, op![==], y)
rv.binary(a, op![&&], b)

// Unary: !, neg
rv.unary(op![!], cond)
rv.unary(op![neg], value)
```

### Locals and Types

```rust
let env = Environment::new(&heap);

// Common types
let int_ty = TypeBuilder::synthetic(&env).integer();
let bool_ty = TypeBuilder::synthetic(&env).boolean();
let null_ty = TypeBuilder::synthetic(&env).null();
let unknown_ty = TypeBuilder::synthetic(&env).unknown();

// Declare locals
let x = builder.local("x", int_ty);        // Returns Place<'heap>
let cond = builder.local("cond", bool_ty);
```

### Constants

```rust
let const_0 = builder.const_int(0);
let const_42 = builder.const_int(42);
let const_true = builder.const_bool(true);
let const_unit = builder.const_unit();
let const_null = builder.const_null();
let const_fn = builder.const_fn(def_id);
```

### Basic Blocks

```rust
// Reserve without parameters
let bb0 = builder.reserve_block([]);

// Reserve with block parameters (for SSA phi-like merging)
let x_local = x.local;  // Extract Local from Place
let bb1 = builder.reserve_block([x_local, y_local]);
```

## Building Blocks

### Statements

```rust
builder
    .build_block(bb0)
    // Assignment from rvalue
    .assign_place(x, |rv| rv.load(const_1))
    
    // Binary operation
    .assign_place(y, |rv| rv.binary(x, op![==], x))
    
    // Unary operation
    .assign_place(neg_x, |rv| rv.unary(op![neg], x))
    
    // Input operation
    .assign_place(input_val, |rv| rv.input(InputOp::Load { required: true }, "param"))
    
    // Tuple aggregate
    .assign_place(tuple, |rv| rv.tuple([x, y]))
    
    // Storage markers
    .storage_live(local)
    .storage_dead(local)
    
    // No-op
    .nop()
    
    // Must end with terminator
    .ret(result);
```

### Terminators

```rust
// Return
builder.build_block(bb).ret(value);
builder.build_block(bb).ret(const_unit);

// Unconditional goto
builder.build_block(bb0).goto(bb1, []);  // No args
builder.build_block(bb0).goto(bb1, [x.into(), y.into()]);  // With args

// Conditional branch (if-else)
builder
    .build_block(bb0)
    .if_else(cond, bb_then, [], bb_else, []);

// Switch on integer
builder
    .build_block(bb0)
    .switch(selector, |switch| {
        switch
            .case(0, bb1, [])
            .case(1, bb2, [])
            .otherwise(bb3, [])
    });

// Unreachable
builder.build_block(bb).unreachable();

// Custom terminator (for special cases like GraphRead)
builder
    .build_block(bb)
    .finish_with_terminator(TerminatorKind::GraphRead(...));
```

## Common Patterns

### Diamond CFG (Branch and Merge)

```rust
let bb0 = builder.reserve_block([]);
let bb_then = builder.reserve_block([]);
let bb_else = builder.reserve_block([]);
let bb_merge = builder.reserve_block([]);

builder
    .build_block(bb0)
    .assign_place(cond, |rv| rv.load(const_true))
    .if_else(cond, bb_then, [], bb_else, []);

builder
    .build_block(bb_then)
    .assign_place(x, |rv| rv.load(const_1))
    .goto(bb_merge, []);

builder
    .build_block(bb_else)
    .assign_place(x, |rv| rv.load(const_2))
    .goto(bb_merge, []);

builder.build_block(bb_merge).ret(x);
```

### Loop

```rust
let bb_entry = builder.reserve_block([]);
let bb_header = builder.reserve_block([]);
let bb_exit = builder.reserve_block([]);

builder
    .build_block(bb_entry)
    .assign_place(x, |rv| rv.load(const_0))
    .goto(bb_header, []);

builder
    .build_block(bb_header)
    .assign_place(cond, |rv| rv.binary(x, op![<], const_10))
    .assign_place(x, |rv| rv.binary(x, op![+], const_1))
    .if_else(cond, bb_header, [], bb_exit, []);

builder.build_block(bb_exit).ret(x);
```

### Block Parameters (SSA Merge)

```rust
// For values that differ across branches
let x_local = x.local;
let bb_merge = builder.reserve_block([x_local]);

builder.build_block(bb_then).goto(bb_merge, [const_1]);
builder.build_block(bb_else).goto(bb_merge, [const_2]);
builder.build_block(bb_merge).ret(x);  // x receives value from param
```

## Test Harness Pattern

Standard pattern used across transform pass tests:

```rust
use std::path::PathBuf;
use bstr::ByteVec as _;
use hashql_core::{
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use crate::{
    builder::{op, scaffold},
    context::MirContext,
    def::DefIdSlice,
    pass::TransformPass as _,
    pretty::TextFormat,
};

#[track_caller]
fn assert_pass<'heap>(
    name: &'static str,
    body: Body<'heap>,
    context: &mut MirContext<'_, 'heap>,
) {
    let formatter = Formatter::new(context.heap);
    let mut formatter = TypeFormatter::new(
        &formatter,
        context.env,
        TypeFormatterOptions::terse().with_qualified_opaque_names(true),
    );
    let mut text_format = TextFormat {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
    };

    let mut bodies = [body];

    // Format before
    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    text_format
        .writer
        .extend(b"\n\n------------------------------------\n\n");

    // Run the pass
    YourPass::new().run(context, &mut bodies[0]);

    // Format after
    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    // Snapshot configuration
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/your_pass"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

#[test]
fn test_case() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    // Build MIR...
    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_pass(
        "test_case",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
```

## RValue Types

| Method | Creates | Example |
|--------|---------|---------|
| `load(operand)` | Copy/move | `rv.load(x)` |
| `binary(l, op, r)` | Binary op | `rv.binary(x, op![+], y)` |
| `unary(op, val)` | Unary op | `rv.unary(op![!], cond)` |
| `tuple([...])` | Tuple | `rv.tuple([x, y, z])` |
| `list([...])` | List | `rv.list([a, b, c])` |
| `struct([...])` | Struct | `rv.r#struct([("x", val)])` |
| `dict([...])` | Dict | `rv.dict([(k, v)])` |
| `apply(fn, args)` | Call | `rv.apply(func, [arg1])` |
| `input(op, name)` | Input | `rv.input(InputOp::Load { required: true }, "x")` |

## Examples in Codebase

Real test examples in `libs/@local/hashql/mir/src/pass/transform/`:

- `dse/tests.rs` - Dead Store Elimination
- `ssa_repair/tests.rs` - SSA Repair
- `cfg_simplify/tests.rs` - CFG Simplification
- `dbe/tests.rs` - Dead Block Elimination
