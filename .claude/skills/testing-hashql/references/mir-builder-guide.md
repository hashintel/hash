# MIR Builder Guide

Ergonomic API for constructing MIR bodies in tests. Use for testing and benchmarking MIR passes without manual structure boilerplate.

**Source**: `libs/@local/hashql/mir/src/builder/`

## Important

The `body!` macro does not support all MIR constructs. If you need a feature that is not supported, **do not work around it manually** - instead, stop and request that the feature be added to the macro.

For advanced cases not supported by the macro, see [mir-fluent-builder.md](mir-fluent-builder.md).

## Quick Start

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
| `<id>` | DefId (literal or variable) | `0`, `42`, `my_def_id` |
| `<arity>` | Number of function arguments | `0`, `1`, `2` |
| `<return_type>` | Return type | `Int`, `Bool`, `(Int, Bool)` |

The `<id>` can be a numeric literal (`0`, `1`, `42`) or a variable identifier (`callee_id`, `my_def_id`). When using a variable, it must be a `DefId` in scope.

### Types

| Syntax | Description | Example |
| ------ | ----------- | ------- |
| `Int` | Integer type | `Int` |
| `Bool` | Boolean type | `Bool` |
| `Null` | Null type | `Null` |
| `(T1, T2, ...)` | Tuple types | `(Int, Bool, Int)` |
| `(T,)` | Single-element tuple | `(Int,)` |
| `(a: T1, b: T2)` | Struct types | `(a: Int, b: Bool)` |
| `[fn(T1, T2) -> R]` | Closure types | `[fn(Int) -> Int]`, `[fn() -> Bool]` |
| `\|types\| types.custom()` | Custom type expression | `\|t\| t.null()` |

### Projections (Optional)

Declare field projections after `decl` to access struct/tuple fields as places:

```text
@proj <name> = <base>.<field>: <type>, ...;
```

Supports nested projections:

```rust
let body = body!(interner, env; fn@0/0 -> Int {
    decl tup: ((Int, Int), Int), result: Int;
    @proj inner = tup.0: (Int, Int), inner_1 = tup.0.1: Int;

    bb0() {
        result = load inner_1;
        return result;
    }
});
```

### Statements

| Syntax | Description | MIR Equivalent |
| ------ | ----------- | -------------- |
| `let x;` | Mark storage live | `StorageLive(x)` |
| `drop x;` | Mark storage dead | `StorageDead(x)` |
| `x = load <operand>;` | Load value | `Assign(x, Load(operand))` |
| `x = apply <func>;` | Call with no args | `Assign(x, Apply(func, []))` |
| `x = apply <func>, <a1>, <a2>;` | Call with args | `Assign(x, Apply(func, [a1, a2]))` |
| `x = tuple <a>, <b>;` | Create tuple | `Assign(x, Aggregate(Tuple, [a, b]))` |
| `x = struct a: <v1>, b: <v2>;` | Create struct | `Assign(x, Aggregate(Struct, [v1, v2]))` |
| `x = closure <def> <env>;` | Create closure | `Assign(x, Aggregate(Closure, [def, env]))` |
| `x = bin.<op> <lhs> <rhs>;` | Binary operation | `Assign(x, Binary(lhs, op, rhs))` |
| `x = un.<op> <operand>;` | Unary operation | `Assign(x, Unary(op, operand))` |
| `x = input.load! "name";` | Load required input | `Assign(x, Input(Load { required: true }, "name"))` |
| `x = input.load "name";` | Load optional input | `Assign(x, Input(Load { required: false }, "name"))` |
| `x = input.exists "name";` | Check if input exists | `Assign(x, Input(Exists, "name"))` |

### Terminators

| Syntax | Description |
| ------ | ----------- |
| `return <operand>;` | Return from function |
| `goto <block>(<args>...);` | Unconditional jump with args |
| `if <cond> then <tb>(<ta>) else <eb>(<ea>);` | Conditional branch |
| `switch <discr> [<val> => <block>(<args>), ...];` | Switch (no otherwise) |
| `switch <discr> [<val> => <block>(), _ => <block>()];` | Switch with otherwise |
| `unreachable;` | Mark block as unreachable |

### Operands

| Syntax | Description |
| ------ | ----------- |
| `x`, `cond` | Place (local variable or projection) |
| `42`, `-5` | Integer literal (i64) |
| `3.14` | Float literal (f64) |
| `true`, `false` | Boolean literal |
| `()` | Unit |
| `null` | Null |
| `def_id` | DefId variable (for function pointers) |

### Operators

**Binary** (`bin.<op>`): `==`, `!=`, `<`, `<=`, `>`, `>=`, `&`, `|`, `+`, `-`, `*`, `/`

**Unary** (`un.<op>`): `!`, `neg`

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

### Switch Statement

```rust
let body = body!(interner, env; fn@0/0 -> Null {
    decl selector: Int;

    bb0() {
        selector = load 0;
        switch selector [0 => bb1(), 1 => bb2(), _ => bb3()];
    },
    bb1() {
        return null;
    },
    bb2() {
        return null;
    },
    bb3() {
        return null;
    }
});
```

### Direct Function Calls

Use a `DefId` variable directly:

```rust
let callee_id = DefId::new(1);

let body = body!(interner, env; fn@0/0 -> Int {
    decl result: Int;

    bb0() {
        result = apply callee_id;
        return result;
    }
});
```

### Indirect Function Calls (via local)

Load a DefId into a local, then apply the local:

```rust
let callee_id = DefId::new(1);

let body = body!(interner, env; fn@0/0 -> Int {
    decl func: [fn(Int) -> Int], result: Int;

    bb0() {
        func = load callee_id;
        result = apply func, 1;
        return result;
    }
});
```

### Multiple Bodies with DefId Variables

When creating multiple bodies that reference each other:

```rust
let callee_id = DefId::new(1);
let caller_id = DefId::new(0);

let caller = body!(interner, env; fn@caller_id/0 -> Int {
    decl result: Int;

    bb0() {
        result = apply callee_id;
        return result;
    }
});

let callee = body!(interner, env; fn@callee_id/0 -> Int {
    decl ret: Int;

    bb0() {
        return ret;
    }
});
```

### Struct Aggregate

```rust
let body = body!(interner, env; fn@0/0 -> (a: Int, b: Bool) {
    decl result: (a: Int, b: Bool);

    bb0() {
        result = struct a: 42, b: true;
        return result;
    }
});
```

### Closure with Projections

```rust
// body0: function that takes captured env and returns it
let body0 = body!(interner, env; fn@0/1 -> Int {
    decl env_arg: Int, result: Int;

    bb0() {
        result = load env_arg;
        return result;
    }
});

// body1: creates closure, calls it via projections
let body1 = body!(interner, env; fn@1/0 -> Int {
    decl captured: Int, closure: [fn(Int) -> Int], result: Int;
    @proj closure_fn = closure.0: [fn(Int) -> Int], closure_env = closure.1: Int;

    bb0() {
        captured = load 55;
        closure = closure (body0.id) captured;
        result = apply closure_fn, closure_env;
        return result;
    }
});
```

### Projections in Terminators

Projected places can be used as operands in terminators:

```rust
let body = body!(interner, env; fn@0/0 -> Int {
    decl tup: (Int, Int), result: Int;
    @proj tup_0 = tup.0: Int, tup_1 = tup.1: Int;

    bb0() {
        tup = tuple 1, 2;
        if tup_0 then bb1(tup_0) else bb2(tup_1);
    },
    bb1(result) {
        return result;
    },
    bb2(result) {
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

## Examples in Codebase

Real test examples in `libs/@local/hashql/mir/src/pass/`:

**Transform passes** (`transform/`):

- `administrative_reduction/tests.rs`
- `dse/tests.rs` - Dead Store Elimination
- `ssa_repair/tests.rs` - SSA Repair
- `cfg_simplify/tests.rs` - CFG Simplification
- `dbe/tests.rs` - Dead Block Elimination
- `cp/tests.rs` - Constant Propagation
- `dle/tests.rs` - Dead Local Elimination
- `inst_simplify/tests.rs` - Instruction Simplification

**Analysis passes** (`analysis/`):

- `callgraph/tests.rs` - Call graph analysis
- `data_dependency/tests.rs` - Data dependency analysis
- `dataflow/liveness/tests.rs` - Liveness analysis
