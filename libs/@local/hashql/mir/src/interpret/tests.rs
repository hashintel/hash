//! Tests for the MIR interpreter runtime.
//!
//! These tests verify end-to-end execution of MIR code, covering:
//! - Basic execution (constants, locals, loads)
//! - Binary and unary operations
//! - Control flow (goto, switch, conditionals)
//! - Function calls and returns
//! - Aggregate construction
//! - Input operations
//! - Error conditions
#![expect(
    clippy::min_ident_chars,
    clippy::panic_in_result_fn,
    clippy::similar_names
)]

use hashql_core::{
    collections::FastHashMap,
    heap::{FromIteratorIn as _, Heap},
    id::{Id as _, IdVec},
    symbol::Symbol,
    r#type::{TypeId, environment::Environment},
};

use super::{CallStack, Runtime, RuntimeConfig, error::InterpretDiagnostic, value::Value};
use crate::{
    body::{
        Body,
        constant::{Constant, Int},
        operand::Operand,
        rvalue::{Aggregate, AggregateKind, RValue},
    },
    builder::{BodyBuilder, body},
    def::{DefId, DefIdSlice},
    intern::Interner,
    interpret::error::InterpretDiagnosticCategory,
};

fn run_body(body: Body<'_>) -> Result<Value<'_>, InterpretDiagnostic> {
    run_body_with_inputs(body, FastHashMap::default())
}

fn run_body_with_inputs<'heap>(
    body: Body<'heap>,
    inputs: FastHashMap<Symbol<'heap>, Value<'heap>>,
) -> Result<Value<'heap>, InterpretDiagnostic> {
    assert_eq!(body.id, DefId::new(0));
    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, inputs);
    let callstack = CallStack::new(&runtime, DefId::new(0), []);

    runtime.run(callstack)
}

fn run_bodies<'heap>(
    bodies: &DefIdSlice<Body<'heap>>,
    entry: DefId,
    args: impl IntoIterator<Item = Value<'heap>>,
) -> Result<Value<'heap>, InterpretDiagnostic> {
    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, FastHashMap::default());
    let callstack = CallStack::new(&runtime, entry, args);

    runtime.run(callstack)
}

// =============================================================================
// Basic Execution
// =============================================================================

#[test]
fn run_returns_integer_constant() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl;

        bb0() {
            return 42;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(42_i128)));
}

#[test]
fn run_returns_boolean_true() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl;

        bb0() {
            return true;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn run_returns_unit() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            return ();
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Unit);
}

#[test]
fn run_loads_local_and_returns() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 99;
            return x;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(99_i128)));
}

#[test]
fn entry_function_with_args() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/2 -> Bool {
        decl a: Int, b: Int, result: Bool;

        bb0() {
            result = bin.< a b;
            return result;
        }
    });

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, FastHashMap::default());
    let args = [
        Value::Integer(Int::from(10_i128)),
        Value::Integer(Int::from(20_i128)),
    ];
    let callstack = CallStack::new(&runtime, DefId::new(0), args);

    let result = runtime.run(callstack).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

// =============================================================================
// Binary Operations
// =============================================================================

#[test]
fn binary_eq_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = bin.== 5 5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn binary_ne_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = bin.!= 5 3;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn binary_lt_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = bin.< 3 5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn binary_lte_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = bin.<= 5 5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn binary_gt_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = bin.> 5 3;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn binary_gte_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = bin.>= 5 5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn binary_bitand_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.& 0b1100 0b1010;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(0b1000_i128)));
}

#[test]
fn binary_bitor_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.| 0b1100 0b1010;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(0b1110_i128)));
}

// =============================================================================
// Unary Operations
// =============================================================================

#[test]
fn unary_not_true() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = un.! true;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(false)));
}

#[test]
fn unary_not_false() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = un.! false;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn unary_neg_integer() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = un.neg 42;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(-42_i128)));
}

#[test]
fn unary_bitnot_integer() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = un.~ 0b1100;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(!Int::from(0b1100_i128)));
}

// =============================================================================
// Control Flow
// =============================================================================

#[test]
fn goto_transfers_control() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl;

        bb0() {
            goto bb1();
        },
        bb1() {
            return 100;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(100_i128)));
}

#[test]
fn goto_with_block_params() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1(42);
        },
        bb1(x) {
            return x;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(42_i128)));
}

#[test]
fn if_then_else_takes_then_branch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            return 1;
        },
        bb2() {
            return 2;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(1_i128)));
}

#[test]
fn if_then_else_takes_else_branch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool;

        bb0() {
            cond = load false;
            if cond then bb1() else bb2();
        },
        bb1() {
            return 1;
        },
        bb2() {
            return 2;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(2_i128)));
}

#[test]
fn switch_matches_first_arm() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl selector: Int;

        bb0() {
            selector = load 0;
            switch selector [0 => bb1(), 1 => bb2(), _ => bb3()];
        },
        bb1() {
            return 100;
        },
        bb2() {
            return 200;
        },
        bb3() {
            return 300;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(100_i128)));
}

#[test]
fn switch_matches_otherwise() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl selector: Int;

        bb0() {
            selector = load 99;
            switch selector [0 => bb1(), 1 => bb2(), _ => bb3()];
        },
        bb1() {
            return 100;
        },
        bb2() {
            return 200;
        },
        bb3() {
            return 300;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(300_i128)));
}

#[test]
fn diamond_cfg_merges_correctly() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, result: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(10);
        },
        bb2() {
            goto bb3(20);
        },
        bb3(result) {
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(10_i128)));
}

#[test]
fn loop_with_back_edge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, result: Int;

        bb0() {
            cond = load true;
            goto bb1();
        },
        bb1() {
            if cond then bb2() else bb3();
        },
        bb2() {
            cond = load false;
            goto bb1();
        },
        bb3() {
            result = load 42;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(42_i128)));
}

// =============================================================================
// Function Calls
// =============================================================================

#[test]
fn apply_simple_function() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(1);

    let caller = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply callee_id;
            return result;
        }
    });

    let callee = body!(interner, env; fn@callee_id/0 -> Int {
        decl;

        bb0() {
            return 77;
        }
    });

    let result = run_bodies(DefIdSlice::from_raw(&[caller, callee]), DefId::new(0), [])
        .expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(77_i128)));
}

#[test]
fn apply_function_with_args() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(1);

    let caller = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = apply callee_id, 10, 20;
            return result;
        }
    });

    let callee = body!(interner, env; fn@callee_id/2 -> Bool {
        decl a: Int, b: Int, result: Bool;

        bb0() {
            result = bin.< a b;
            return result;
        }
    });

    let result = run_bodies(DefIdSlice::from_raw(&[caller, callee]), DefId::new(0), [])
        .expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn nested_function_calls() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let is_less_id = DefId::new(1);
    let negate_id = DefId::new(2);

    let main = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool, temp: Bool;

        bb0() {
            temp = apply is_less_id, 3, 4;
            result = apply negate_id, temp;
            return result;
        }
    });

    let is_less = body!(interner, env; fn@is_less_id/2 -> Bool {
        decl a: Int, b: Int, result: Bool;

        bb0() {
            result = bin.< a b;
            return result;
        }
    });

    let negate = body!(interner, env; fn@negate_id/1 -> Bool {
        decl x: Bool, result: Bool;

        bb0() {
            result = un.! x;
            return result;
        }
    });

    let result = run_bodies(
        DefIdSlice::from_raw(&[main, is_less, negate]),
        DefId::new(0),
        [],
    )
    .expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(false)));
}

// =============================================================================
// Aggregates
// =============================================================================

#[test]
fn aggregate_tuple_and_return() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> (Int, Int) {
        decl tup: (Int, Int);

        bb0() {
            tup = tuple 1, 2;
            return tup;
        }
    });

    let result = run_body(body).expect("should succeed");
    let Value::Tuple(tuple) = result else {
        panic!("expected tuple, got {result:?}");
    };

    assert_eq!(tuple.len().get(), 2);
}

#[test]
fn aggregate_struct_and_return() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> (a: Int, b: Bool) {
        decl s: (a: Int, b: Bool);

        bb0() {
            s = struct a: 42, b: true;
            return s;
        }
    });

    let result = run_body(body).expect("should succeed");
    let Value::Struct(s) = result else {
        panic!("expected struct, got {result:?}");
    };

    assert_eq!(s.len(), 2);
}

#[test]
fn tuple_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;
        @proj second = tup.1: Int;

        bb0() {
            tup = tuple 10, 20;
            result = load second;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(20_i128)));
}

#[test]
fn struct_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl s: (x: Int, y: Int), result: Int;
        @proj y_field = s.1: Int;

        bb0() {
            s = struct x: 100, y: 200;
            result = load y_field;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(200_i128)));
}

// =============================================================================
// Input Operations
// =============================================================================

#[test]
fn input_load_returns_value() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = input.load "my_input";
            return result;
        }
    });

    let mut inputs = FastHashMap::default();
    inputs.insert(
        heap.intern_symbol("my_input"),
        Value::Integer(Int::from(999_i128)),
    );

    let result = run_body_with_inputs(body, inputs).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(999_i128)));
}

#[test]
fn input_exists_returns_true() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = input.exists "my_input";
            return result;
        }
    });

    let mut inputs = FastHashMap::default();
    inputs.insert(
        heap.intern_symbol("my_input"),
        Value::Integer(Int::from(1_i128)),
    );

    let result = run_body_with_inputs(body, inputs).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(true)));
}

#[test]
fn input_exists_returns_false() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl result: Bool;

        bb0() {
            result = input.exists "missing_input";
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(false)));
}

// =============================================================================
// Error Conditions
// =============================================================================

#[test]
fn input_load_missing_fails() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = input.load "missing_input";
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with missing input");
    assert_eq!(
        result.category,
        InterpretDiagnosticCategory::InputResolution
    );
}

#[test]
fn recursion_limit_exceeded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let self_id = DefId::new(0);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply self_id;
            return result;
        }
    });

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let config = RuntimeConfig { recursion_limit: 5 };
    let mut runtime = Runtime::new(config, bodies, FastHashMap::default());
    let callstack = CallStack::new(&runtime, DefId::new(0), []);

    let result = runtime
        .run(callstack)
        .expect_err("should fail with recursion limit");
    assert_eq!(result.category, InterpretDiagnosticCategory::RuntimeLimit);
}

#[test]
fn out_of_range_list_index() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let mut builder = BodyBuilder::new(&interner);

    let list = builder.local("list", TypeId::MAX);
    let idx = builder.local("idx", TypeId::MAX);
    let result = builder.local("result", TypeId::MAX);

    let const1 = builder.const_int(1);
    let const2 = builder.const_int(2);
    let const99 = builder.const_int(99);

    let list_indexed = builder.place(|place| place.from(list).index(idx.local, TypeId::MAX));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(idx, |rv| rv.load(const99))
        .assign_place(list, |rv| rv.list([const1, const2]))
        .assign_place(list_indexed, |rv| rv.load(const99))
        .assign_place(result, |rv| rv.load(list_indexed))
        .ret(result);

    let mut body = builder.finish(0, TypeId::MAX);
    body.id = DefId::new(0);

    let result = run_body(body).expect_err("should fail with out of range");
    assert_eq!(result.category, InterpretDiagnosticCategory::BoundsCheck);
}

// =============================================================================
// ICE Tests (Internal Compiler Errors)
// =============================================================================
// These tests verify that the interpreter correctly detects invariant violations
// in malformed MIR that should never be produced by a correct compiler.

#[test]
fn ice_uninitialized_local() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    let result = run_body(body).expect_err("should fail with uninitialized local");
    assert_eq!(result.category, InterpretDiagnosticCategory::LocalAccess);
}

#[test]
fn ice_unreachable_reached() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl;

        bb0() {
            unreachable;
        }
    });

    let result = run_body(body).expect_err("should fail with unreachable");
    assert_eq!(result.category, InterpretDiagnosticCategory::ControlFlow);
}

#[test]
fn ice_invalid_discriminant() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl selector: Int;

        bb0() {
            selector = load 99;
            switch selector [0 => bb1(), 1 => bb2()];
        },
        bb1() {
            return 1;
        },
        bb2() {
            return 2;
        }
    });

    let result = run_body(body).expect_err("should fail with invalid discriminant");
    assert_eq!(result.category, InterpretDiagnosticCategory::ControlFlow);
}

#[test]
fn ice_apply_non_pointer() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, result: Int;

        bb0() {
            x = load 42;
            result = apply x;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with apply non-pointer");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_invalid_projection_type() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, result: Int;
        @proj field = x.0: Int;

        bb0() {
            x = load 42;
            result = load field;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with invalid projection type");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_unknown_field() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;
        @proj field = tup.5: Int;

        bb0() {
            tup = tuple 1, 2;
            result = load field;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with unknown field");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_binary_bitand_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;

        bb0() {
            tup = tuple 1, 2;
            result = bin.& tup 3;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with binary bitand type mismatch");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_binary_bitor_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;

        bb0() {
            tup = tuple 1, 2;
            result = bin.| 3 tup;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with binary bitor type mismatch");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_unary_not_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, result: Int;

        bb0() {
            x = load 42;
            result = un.! x;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with unary not type mismatch");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_unary_bitnot_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;

        bb0() {
            tup = tuple 1, 2;
            result = un.~ tup;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with unary bitnot type mismatch");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_unary_neg_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;

        bb0() {
            tup = tuple 1, 2;
            result = un.neg tup;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with unary neg type mismatch");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_invalid_discriminant_type() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int);

        bb0() {
            tup = tuple 0, 1;
            switch tup [0 => bb1(), _ => bb2()];
        },
        bb1() {
            return 1;
        },
        bb2() {
            return 2;
        }
    });

    let result = run_body(body).expect_err("should fail with invalid discriminant type");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

// =============================================================================
// ICE Tests using Fluent Builder API
// =============================================================================
// These tests use the fluent builder for constructs not supported by the macro.

#[test]
fn ice_invalid_subscript_type() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let mut builder = BodyBuilder::new(&interner);

    let x = builder.local("x", TypeId::MAX);
    let idx = builder.local("idx", TypeId::MAX);
    let result = builder.local("result", TypeId::MAX);

    let const0 = builder.const_int(0);
    let const42 = builder.const_int(42);

    let x_indexed = builder.place(|place| place.from(x).index(idx.local, TypeId::MAX));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const42))
        .assign_place(idx, |rv| rv.load(const0))
        .assign_place(result, |rv| rv.load(x_indexed))
        .ret(result);

    let mut body = builder.finish(0, TypeId::MAX);
    body.id = DefId::new(0);

    let result = run_body(body).expect_err("should fail with invalid subscript type");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_invalid_index_type() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let mut builder = BodyBuilder::new(&interner);

    let list = builder.local("list", TypeId::MAX);
    let idx = builder.local("idx", TypeId::MAX);
    let result = builder.local("result", TypeId::MAX);

    let const0 = builder.const_int(0);
    let const1 = builder.const_int(1);
    let const2 = builder.const_int(2);

    let list_indexed = builder.place(|place| place.from(list).index(idx.local, TypeId::MAX));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(list, |rv| rv.list([const1, const2]))
        .assign_place(idx, |rv| rv.tuple([const0]))
        .assign_place(result, |rv| rv.load(list_indexed))
        .ret(result);

    let mut body = builder.finish(0, TypeId::MAX);
    body.id = DefId::new(0);

    let result = run_body(body).expect_err("should fail with invalid index type");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_invalid_projection_by_name_type() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let mut builder = BodyBuilder::new(&interner);

    let x = builder.local("x", TypeId::MAX);
    let result = builder.local("result", TypeId::MAX);

    let const42 = builder.const_int(42);

    let field_name = heap.intern_symbol("field");
    let x_field = builder.place(|place| place.from(x).field_by_name(field_name, TypeId::MAX));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const42))
        .assign_place(result, |rv| rv.load(x_field))
        .ret(result);

    let mut body = builder.finish(0, TypeId::MAX);
    body.id = DefId::new(0);

    let result = run_body(body).expect_err("should fail with invalid projection by name type");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_unknown_field_by_name() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let mut builder = BodyBuilder::new(&interner);

    let s = builder.local("s", TypeId::MAX);
    let result = builder.local("result", TypeId::MAX);

    let const42 = builder.const_int(42);

    let wrong_field = heap.intern_symbol("nonexistent");
    let s_field = builder.place(|place| place.from(s).field_by_name(wrong_field, TypeId::MAX));

    let bb0 = builder.reserve_block([]);

    let field_a = heap.intern_symbol("a");

    builder
        .build_block(bb0)
        .assign_place(s, |rv| rv.r#struct([(field_a, const42)]))
        .assign_place(result, |rv| rv.load(s_field))
        .ret(result);

    let mut body = builder.finish(0, TypeId::MAX);
    body.id = DefId::new(0);

    let result = run_body(body).expect_err("should fail with unknown field by name");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_struct_field_length_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let mut builder = BodyBuilder::new(&interner);

    let s = builder.local("s", TypeId::MAX);

    let bb0 = builder.reserve_block([]);

    let field_a = heap.intern_symbol("a");
    let field_b = heap.intern_symbol("b");
    let field_c = heap.intern_symbol("c");

    let fields = interner.symbols.intern_slice(&[field_a, field_b, field_c]);

    let malformed_aggregate = RValue::Aggregate(Aggregate {
        kind: AggregateKind::Struct { fields },
        operands: IdVec::from_iter_in([Operand::Constant(Constant::Int(Int::from(1_i128)))], &heap),
    });

    builder
        .build_block(bb0)
        .assign_place(s, |_rv| malformed_aggregate)
        .ret(s);

    let mut body = builder.finish(0, TypeId::MAX);
    body.id = DefId::new(0);

    let result = run_body(body).expect_err("should fail with struct field length mismatch");
    assert_eq!(
        result.category,
        InterpretDiagnosticCategory::StructuralInvariant
    );
}
