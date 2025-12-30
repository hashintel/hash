# MIR Builder Guide

Ergonomic API for constructing MIR bodies in tests. Use for testing and benchmarking MIR passes without manual structure boilerplate.

**Source**: `libs/@local/hashql/mir/src/builder/`

## Important

The `body!` macro does not support all MIR constructs. If you need a feature that is not supported, **do not work around it manually** - instead, stop and request that the feature be added to the macro.

## Quick Start

Two approaches are available:

1. **`body!` macro** (preferred for complex CFG) - Declarative, IR-like syntax
2. **Fluent builder API** - Programmatic construction for simple cases

### `body!` Macro (Preferred)

```rust
use hashql_core::{heap::Heap, r#type::environment::Environment};
use hashql_mir::{builder::body, intern::Interner};

let heap = Heap::new();
let interner = Interner::new(&heap);
let env = Environment::new(&heap);

let body = body!(interner, env; fn@0/1 -> Int {
    decl x: Int, cond: Bool;

    bb0() {
        cond = load true;
        if cond then bb1() else bb2();
    },
    bb1() {
        goto bb3(1);
    },
    bb2() {
        goto bb3(2);
    },
    bb3(x) {
        return x;
    }
});
```

### Fluent Builder API

```rust
use hashql_core::r#type::{TypeBuilder, environment::Environment};
use hashql_mir::{builder::BodyBuilder, op, scaffold};

scaffold!(heap, interner, builder);
let env = Environment::new(&heap);

let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
let const_1 = builder.const_int(1);

let bb0 = builder.reserve_block([]);
builder
    .build_block(bb0)
    .assign_place(x, |rv| rv.load(const_1))
    .ret(x);

let body = builder.finish(0, TypeBuilder::synthetic(&env).integer());
```

## `body!` Macro Syntax

```text
body!(interner, env; <source> @ <id> / <arity> -> <return_type> {
    decl <local>: <type>, ...;

    <block>(<params>...) {
        <statements>...
    },
    ...
})
```

### Header

| Component | Description | Example |
| --------- | ----------- | ------- |
| `<source>` | Body source type | `fn` (closure) or `thunk` |
| `<id>` | DefId numeric literal | `0`, `1`, `42` |
| `<arity>` | Number of function arguments | `0`, `1`, `2` |
| `<return_type>` | Return type | `Int`, `Bool`, `(Int, Bool)` |

### Types

| Syntax | Description |
| ------ | ----------- |
| `Int` | Integer type |
| `Bool` | Boolean type |
| `(T1, T2, ...)` | Tuple types |
| `\|types\| types.custom()` | Custom type expression |

### Statements

| Syntax | Description | MIR Equivalent |
| ------ | ----------- | -------------- |
| `let x;` | Mark storage live | `StorageLive(x)` |
| `drop x;` | Mark storage dead | `StorageDead(x)` |
| `x = load <operand>;` | Load value | `Assign(x, Load(operand))` |
| `x = apply <func>;` | Call with no args | `Assign(x, Apply(func, []))` |
| `x = apply <func>, <a1>, <a2>;` | Call with args | `Assign(x, Apply(func, [a1, a2]))` |
| `x = tuple <a>, <b>;` | Create tuple | `Assign(x, Aggregate(Tuple, [a, b]))` |
| `x = bin.<op> <lhs> <rhs>;` | Binary operation | `Assign(x, Binary(lhs, op, rhs))` |
| `x = un.<op> <operand>;` | Unary operation | `Assign(x, Unary(op, operand))` |

### Terminators

| Syntax | Description |
| ------ | ----------- |
| `return <operand>;` | Return from function |
| `goto <block>(<args>...);` | Unconditional jump with args |
| `if <cond> then <tb>(<ta>) else <eb>(<ea>);` | Conditional branch |

### Operands

| Syntax | Description |
| ------ | ----------- |
| `x`, `cond` | Place (local variable) |
| `42`, `-5` | Integer literal (i64) |
| `3.14` | Float literal (f64) |
| `true`, `false` | Boolean literal |
| `()` | Unit |
| `null` | Null |
| `fn() @ def_id` | Function pointer |

### Operators

**Binary** (`bin.<op>`): `==`, `!=`, `<`, `<=`, `>`, `>=`, `&`, `|`, `+`, `-`, `*`, `/`

**Unary** (`un.<op>`): `!`, `neg`

## Fluent Builder Reference

### `scaffold!` Macro

Sets up heap, interner, and builder:

```rust
scaffold!(heap, interner, builder);
let env = Environment::new(&heap);  // Also needed for types
```

### `op!` Macro

Creates operators for fluent builder binary/unary operations:

```rust
// Binary: ==, !=, <, <=, >, >=, &, |, +, -, *, /
rv.binary(x, op![==], y)

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

// Declare locals
let x = builder.local("x", int_ty);  // Returns Place<'heap>
```

### Constants

```rust
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
let bb1 = builder.reserve_block([x.local, y.local]);
```

### Building Blocks

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

### Terminators

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

## Common Patterns

### Diamond CFG (Branch and Merge)

```rust
let body = body!(interner, env; fn@0/0 -> Int {
    decl x: Int, cond: Bool;

    bb0() {
        cond = load true;
        if cond then bb1() else bb2();
    },
    bb1() {
        goto bb3(1);
    },
    bb2() {
        goto bb3(2);
    },
    bb3(x) {
        return x;
    }
});
```

### Loop

```rust
let body = body!(interner, env; fn@0/0 -> Int {
    decl x: Int, cond: Bool;

    bb0() {
        x = load 0;
        goto bb1();
    },
    bb1() {
        cond = bin.< x 10;
        x = bin.+ x 1;
        if cond then bb1() else bb2();
    },
    bb2() {
        return x;
    }
});
```

### Function Calls

```rust
let body = body!(interner, env; fn@1/0 -> Int {
    decl result: Int;

    bb0() {
        result = apply fn() @ callee_def_id;
        return result;
    }
});
```

## Test Harness Pattern

Standard pattern used across transform pass tests:

```rust
use std::{io::Write as _, path::PathBuf};
use bstr::ByteVec as _;
use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use crate::{
    builder::body,
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
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

    // Run the pass and capture change status
    let changed = YourPass::new().run(context, &mut bodies[0]);
    
    // Include Changed value in snapshot
    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    ).expect("infallible");

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

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

## RValue Types (Fluent Builder)

| Method | Creates | Example |
| ------ | ------- | ------- |
| `load(operand)` | Copy/move | `rv.load(x)` |
| `binary(l, op, r)` | Binary op | `rv.binary(x, op![+], y)` |
| `unary(op, val)` | Unary op | `rv.unary(op![!], cond)` |
| `tuple([...])` | Tuple | `rv.tuple([x, y, z])` |
| `list([...])` | List | `rv.list([a, b, c])` |
| `struct([...])` | Struct | `rv.r#struct([("x", val)])` |
| `dict([...])` | Dict | `rv.dict([(k, v)])` |
| `apply(fn, args)` | Call | `rv.apply(func, [arg1])` |
| `call(fn)` | Call (no args) | `rv.call(func)` |
| `input(op, name)` | Input | `rv.input(InputOp::Load { required: true }, "x")` |

## Examples in Codebase

Real test examples in `libs/@local/hashql/mir/src/pass/transform/`:

- `administrative_reduction/tests.rs` - Administrative reduction (uses `body!` macro)
- `dse/tests.rs` - Dead Store Elimination
- `ssa_repair/tests.rs` - SSA Repair
- `cfg_simplify/tests.rs` - CFG Simplification
- `dbe/tests.rs` - Dead Block Elimination
