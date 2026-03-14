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

use alloc::rc::Rc;
use core::{assert_matches, ops::ControlFlow};

use hashql_core::{
    heap::{self, FromIteratorIn as _, Heap},
    id::{Id as _, IdVec},
    symbol::sym,
    r#type::{TypeBuilder, TypeId, environment::Environment},
};

use super::{
    CallStack, Inputs, Runtime, RuntimeConfig,
    error::InterpretDiagnostic,
    runtime::Yield,
    suspension::Suspension,
    value::{Int, Num, Opaque, Struct, Value},
};
use crate::{
    body::{
        Body,
        constant::Constant,
        operand::Operand,
        rvalue::{Aggregate, AggregateKind, RValue},
        terminator::{GraphRead, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    builder::{BodyBuilder, body},
    def::{DefId, DefIdSlice},
    intern::Interner,
    interpret::error::InterpretDiagnosticCategory,
    op,
};

fn run_body(body: Body<'_>) -> Result<Value<'_>, InterpretDiagnostic> {
    run_body_with_inputs(body, Inputs::new())
}

#[expect(clippy::needless_pass_by_value)]
fn run_body_with_inputs<'heap>(
    body: Body<'heap>,
    inputs: Inputs<'heap>,
) -> Result<Value<'heap>, InterpretDiagnostic> {
    assert_eq!(body.id, DefId::new(0));
    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let callstack = CallStack::new(&runtime, DefId::new(0), []);

    runtime.run(callstack, |_| unreachable!())
}

fn run_bodies<'heap>(
    bodies: &DefIdSlice<Body<'heap>>,
    entry: DefId,
    args: impl IntoIterator<Item = Value<'heap>, IntoIter: ExactSizeIterator>,
) -> Result<Value<'heap>, InterpretDiagnostic> {
    let inputs = Inputs::default();
    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let callstack = CallStack::new(&runtime, entry, args);

    runtime.run(callstack, |_| unreachable!())
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

    let inputs = Inputs::default();
    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let args = [
        Value::Integer(Int::from(10_i128)),
        Value::Integer(Int::from(20_i128)),
    ];
    let callstack = CallStack::new(&runtime, DefId::new(0), args);

    let result = runtime
        .run(callstack, |_| unreachable!())
        .expect("should succeed");
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
fn binary_add_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.+ 2 3;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(5_i128)));
}

#[test]
fn binary_sub_integers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.- 5 3;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(2_i128)));
}

#[test]
fn binary_add_numbers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = bin.+ 2.5 3.5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(6.0)));
}

#[test]
fn binary_sub_numbers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = bin.- 5.5 3.0;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(2.5)));
}

#[test]
fn binary_add_int_number() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = bin.+ 2 3.5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(5.5)));
}

#[test]
fn binary_add_number_int() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = bin.+ 2.5 3;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(5.5)));
}

#[test]
fn binary_sub_int_number() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = bin.- 5 3.5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(1.5)));
}

#[test]
fn binary_sub_number_int() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = bin.- 5.5 3;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(2.5)));
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

    let mut inputs = Inputs::default();
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

    let mut inputs = Inputs::default();
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
    let inputs = Inputs::default();

    let config = RuntimeConfig { recursion_limit: 5 };
    let mut runtime = Runtime::new(config, bodies, &inputs);
    let callstack = CallStack::new(&runtime, DefId::new(0), []);

    let result = runtime
        .run(callstack, |_| unreachable!())
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
fn ice_binary_add_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;

        bb0() {
            tup = tuple 1, 2;
            result = bin.+ tup 3;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with binary add type mismatch");
    assert_eq!(result.category, InterpretDiagnosticCategory::TypeInvariant);
}

#[test]
fn ice_binary_sub_type_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;

        bb0() {
            tup = tuple 1, 2;
            result = bin.- 3 tup;
            return result;
        }
    });

    let result = run_body(body).expect_err("should fail with binary sub type mismatch");
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

// =============================================================================
// Helpers for suspension tests
// =============================================================================

/// Constructs a minimal valid temporal axes value for `PinnedTransactionTimeTemporalAxes`.
///
/// The structure mirrors the HashQL type system's temporal axes representation:
///
/// ```text
/// Opaque(PinnedTransactionTimeTemporalAxes,
///     Struct { pinned, variable }
/// )
/// ```
///
/// where `pinned` = `Opaque(TransactionTime, Opaque(Timestamp, Integer(pinned_ms)))` and
/// `variable` wraps an interval with inclusive start and unbounded end.
fn make_temporal_axes<'heap>(
    interner: &Interner<'heap>,
    pinned_ms: i128,
    variable_start_ms: i128,
) -> Value<'heap> {
    // Timestamp(Integer)
    let pinned_timestamp = Value::Opaque(Opaque::new(
        sym::path::Timestamp,
        Rc::new(Value::Integer(Int::from(pinned_ms))),
    ));

    // TransactionTime(Timestamp)
    let pinned = Value::Opaque(Opaque::new(
        sym::path::TransactionTime,
        Rc::new(pinned_timestamp),
    ));

    // Variable interval start: InclusiveTemporalBound(Timestamp(Integer))
    let start_timestamp = Value::Opaque(Opaque::new(
        sym::path::Timestamp,
        Rc::new(Value::Integer(Int::from(variable_start_ms))),
    ));
    let start_bound = Value::Opaque(Opaque::new(
        sym::path::InclusiveTemporalBound,
        Rc::new(start_timestamp),
    ));

    // Variable interval end: UnboundedTemporalBound(Unit)
    let end_bound = Value::Opaque(Opaque::new(
        sym::path::UnboundedTemporalBound,
        Rc::new(Value::Unit),
    ));

    // Interval(Struct { start, end })
    let interval_fields = interner.symbols.intern_slice(&[sym::end, sym::start]);
    let interval_struct = Struct::new_unchecked(interval_fields, Rc::new([end_bound, start_bound]));
    let interval = Value::Opaque(Opaque::new(
        sym::path::Interval,
        Rc::new(Value::Struct(interval_struct)),
    ));

    // DecisionTime(Interval(...))
    let variable = Value::Opaque(Opaque::new(sym::path::DecisionTime, Rc::new(interval)));

    // PinnedTransactionTimeTemporalAxes(Struct { pinned, variable })
    let axes_fields = interner.symbols.intern_slice(&[sym::pinned, sym::variable]);
    let axes_struct = Struct::new_unchecked(axes_fields, Rc::new([pinned, variable]));

    Value::Opaque(Opaque::new(
        sym::path::PinnedTransactionTimeTemporalAxes,
        Rc::new(Value::Struct(axes_struct)),
    ))
}

/// Builds a body: `bb0` loads axis from input, `GraphRead → bb1`, `bb1` returns the result.
///
/// Must be called with `DefId::new(0)` and an "axis" input containing a temporal axes value.
fn make_graph_read_body<'heap>(
    heap: &'heap Heap,
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
) -> Body<'heap> {
    let int_ty = TypeBuilder::synthetic(env).integer();
    let mut builder = BodyBuilder::new(interner);

    let axis = builder.local("axis", int_ty);
    let graph_result = builder.local("graph_result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([graph_result.local]);

    builder
        .build_block(bb0)
        .assign_place(axis, |rv| {
            rv.input(
                hashql_hir::node::operation::InputOp::Load { required: true },
                "axis",
            )
        })
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: heap::Vec::new_in(heap),
            tail: GraphReadTail::Collect,
            target: bb1,
        }));

    builder.build_block(bb1).ret(graph_result);

    let mut body = builder.finish(0, int_ty);
    body.id = DefId::new(0);

    body
}

fn run_graph_read_body<'heap>(
    heap: &'heap Heap,
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
    result_value: &Value<'heap>,
) -> Result<Value<'heap>, InterpretDiagnostic> {
    let body = make_graph_read_body(heap, interner, env);
    let axis_value = make_temporal_axes(interner, 1000, 500);

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut inputs = Inputs::default();
    inputs.insert(heap.intern_symbol("axis"), axis_value);

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let callstack = CallStack::new(&runtime, DefId::new(0), []);

    runtime.run(callstack, |suspension| {
        let Suspension::GraphRead(graph_read) = suspension;
        Ok(graph_read.resolve(result_value.clone()))
    })
}

// =============================================================================
// Suspension / Continuation Protocol
// =============================================================================

#[test]
fn start_suspend_resume_return() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = make_graph_read_body(&heap, &interner, &env);
    let axis_value = make_temporal_axes(&interner, 1000, 500);

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut inputs = Inputs::default();
    inputs.insert(heap.intern_symbol("axis"), axis_value);

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let mut callstack = CallStack::new(&runtime, DefId::new(0), []);

    // start → should suspend at the GraphRead
    let result = runtime.start(&mut callstack).expect("start should succeed");
    let Yield::Suspension(Suspension::GraphRead(suspension)) = result else {
        panic!("expected GraphRead suspension, got return");
    };

    // Resolve with a value and resume
    let continuation = suspension.resolve(Value::Integer(Int::from(42_i128)));
    let result = runtime
        .resume(&mut callstack, continuation)
        .expect("resume should succeed");

    let Yield::Return(value) = result else {
        panic!("expected return after resume, got suspension");
    };
    assert_eq!(value, Value::Integer(Int::from(42_i128)));
}

#[test]
fn run_with_suspension_handler() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let result = run_graph_read_body(&heap, &interner, &env, &Value::Integer(Int::from(99_i128)))
        .expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(99_i128)));
}

#[test]
fn multi_suspension_round_trip() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Build a body with two sequential GraphReads:
    // bb0: load axis, GraphRead → bb1
    // bb1: receive first result, GraphRead → bb2
    // bb2: receive second result, add first + second, return
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let mut builder = BodyBuilder::new(&interner);

    let axis = builder.local("axis", int_ty);
    let first_result = builder.local("first_result", int_ty);
    let second_result = builder.local("second_result", int_ty);
    let sum = builder.local("sum", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([first_result.local]);
    let bb2 = builder.reserve_block([second_result.local]);

    builder
        .build_block(bb0)
        .assign_place(axis, |rv| {
            rv.input(
                hashql_hir::node::operation::InputOp::Load { required: true },
                "axis",
            )
        })
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: heap::Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb1,
        }));

    builder
        .build_block(bb1)
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: heap::Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb2,
        }));

    builder
        .build_block(bb2)
        .assign_place(sum, |rv| rv.binary(first_result, op![+], second_result))
        .ret(sum);

    let mut body = builder.finish(0, int_ty);
    body.id = DefId::new(0);

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut inputs = Inputs::default();
    inputs.insert(
        heap.intern_symbol("axis"),
        make_temporal_axes(&interner, 1000, 500),
    );

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let mut callstack = CallStack::new(&runtime, DefId::new(0), []);

    // First suspension
    let result = runtime.start(&mut callstack).expect("start should succeed");
    let Yield::Suspension(Suspension::GraphRead(suspension)) = result else {
        panic!("expected first GraphRead suspension");
    };
    let continuation = suspension.resolve(Value::Integer(Int::from(10_i128)));

    // Second suspension
    let result = runtime
        .resume(&mut callstack, continuation)
        .expect("first resume should succeed");
    let Yield::Suspension(Suspension::GraphRead(suspension)) = result else {
        panic!("expected second GraphRead suspension");
    };
    let continuation = suspension.resolve(Value::Integer(Int::from(32_i128)));

    // Final return: 10 + 32 = 42
    let result = runtime
        .resume(&mut callstack, continuation)
        .expect("second resume should succeed");
    let Yield::Return(value) = result else {
        panic!("expected return after second resume");
    };
    assert_eq!(value, Value::Integer(Int::from(42_i128)));
}

// =============================================================================
// run_until_transition
// =============================================================================

#[test]
fn transition_breaks_at_target_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1 → bb2 (return)
    // Transition fires on bb1 (continue returns false).
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            goto bb2(42);
        },
        bb2(x) {
            return x;
        }
    });

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);
    let inputs = Inputs::default();

    let bb1 = crate::body::basic_block::BasicBlockId::new(1);

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let mut callstack = CallStack::new(&runtime, DefId::new(0), []);
    runtime.reset();

    let result = runtime.run_until_transition::<!>(&mut callstack, |block| block != bb1);
    assert_matches!(result, Ok(ControlFlow::Break(())));

    // Callstack should be positioned at bb1
    let current = callstack
        .current_block::<()>()
        .expect("callstack should not be empty");
    assert_eq!(current, bb1);
}

#[test]
fn transition_runs_to_completion_when_continue_always_true() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl;

        bb0() {
            goto bb1();
        },
        bb1() {
            return 42;
        }
    });

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);
    let inputs = Inputs::default();

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let mut callstack = CallStack::new(&runtime, DefId::new(0), []);
    runtime.reset();

    let result = runtime.run_until_transition::<!>(&mut callstack, |_| true);
    assert_matches!(result, Ok(ControlFlow::Continue(Yield::Return(value))) if value == Value::Integer(Int::from(42_i128)));
}

#[test]
fn transition_fires_on_reentry_after_continuation_apply() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0: load axis, GraphRead → bb1
    // bb1: return result
    // Transition fires on bb1 (continue returns false on bb1).
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let mut builder = BodyBuilder::new(&interner);

    let axis = builder.local("axis", int_ty);
    let graph_result = builder.local("graph_result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([graph_result.local]);

    let bb1_id = bb1;

    builder
        .build_block(bb0)
        .assign_place(axis, |rv| {
            rv.input(
                hashql_hir::node::operation::InputOp::Load { required: true },
                "axis",
            )
        })
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: heap::Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb1,
        }));

    builder.build_block(bb1).ret(graph_result);

    let mut body = builder.finish(0, int_ty);
    body.id = DefId::new(0);

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);

    let mut inputs = Inputs::default();
    inputs.insert(
        heap.intern_symbol("axis"),
        make_temporal_axes(&interner, 1000, 500),
    );

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let mut callstack = CallStack::new(&runtime, DefId::new(0), []);
    runtime.reset();

    // First call: should suspend at GraphRead (bb0 is allowed)
    let result = runtime.run_until_transition::<!>(&mut callstack, |block| block != bb1_id);
    let Ok(ControlFlow::Continue(Yield::Suspension(Suspension::GraphRead(suspension)))) = result
    else {
        panic!("expected suspension, got {result:?}");
    };

    // Apply continuation → sets current block to bb1
    let continuation = suspension.resolve(Value::Integer(Int::from(42_i128)));
    continuation
        .apply::<!>(&mut callstack)
        .expect("apply should succeed");

    // Second call: transition should fire immediately on bb1 (before stepping)
    let result = runtime.run_until_transition::<!>(&mut callstack, |block| block != bb1_id);
    let Ok(ControlFlow::Break(())) = result else {
        panic!("expected Break at bb1 after continuation, got {result:?}");
    };

    let current = callstack
        .current_block::<()>()
        .expect("callstack should not be empty");
    assert_eq!(current, bb1_id);
}

// =============================================================================
// CallStack edge cases
// =============================================================================

#[test]
fn unwind_produces_correct_frames() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // main (DefId 0) calls inner (DefId 1), inner triggers an error.
    let inner_id = DefId::new(1);

    let main = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply inner_id;
            return result;
        }
    });

    let inner = body!(interner, env; fn@inner_id/0 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    let result = run_bodies(DefIdSlice::from_raw(&[main, inner]), DefId::new(0), []);
    let error = result.expect_err("should fail with uninitialized local");

    // The error should include stack trace info (manifested as labels in the diagnostic)
    assert_eq!(error.category, InterpretDiagnosticCategory::LocalAccess);
    // Primary label from inner + secondary "called from here" from main = at least 2 labels
    assert!(
        error.labels.len() >= 2,
        "expected at least 2 labels (error site + call site), got {}",
        error.labels.len()
    );
}

#[test]
fn block_param_aliasing_swap() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // goto bb1(b, a) where bb1 params are (a, b)
    // Without the scratch-based staging, naive sequential assignment would clobber.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, result: Int;

        bb0() {
            a = load 1;
            b = load 2;
            goto bb1(b, a);
        },
        bb1(a, b) {
            result = bin.- a b;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    // After swap: a=2, b=1. result = 2 - 1 = 1.
    assert_eq!(result, Value::Integer(Int::from(1_i128)));
}

// =============================================================================
// Minor gaps
// =============================================================================

#[test]
fn unary_neg_number() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Num {
        decl result: Num;

        bb0() {
            result = un.neg 3.5;
            return result;
        }
    });

    let result = run_body(body).expect("should succeed");
    assert_eq!(result, Value::Number(Num::from(-3.5)));
}

#[test]
fn callstack_new_in_runs_to_completion() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl;

        bb0() {
            return 77;
        }
    });

    let bodies = [body];
    let bodies = DefIdSlice::from_raw(&bodies);
    let inputs = Inputs::default();

    let mut runtime = Runtime::new(RuntimeConfig::default(), bodies, &inputs);
    let callstack = CallStack::new_in::<()>(&bodies[DefId::new(0)], [], alloc::alloc::Global)
        .expect("new_in should succeed");

    let result = runtime
        .run(callstack, |_| unreachable!())
        .expect("should succeed");
    assert_eq!(result, Value::Integer(Int::from(77_i128)));
}
