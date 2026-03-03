#![expect(clippy::min_ident_chars, reason = "tests")]
use std::{assert_matches, io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::InstSimplify;
use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        constant::Constant,
        operand::Operand,
        rvalue::RValue,
        statement::{Assign, StatementKind},
    },
    builder::body,
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
    pass::{Changed, TransformPass as _},
    pretty::TextFormatOptions,
};

#[track_caller]
fn assert_inst_simplify_pass<'heap>(
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
    let mut text_format = TextFormatOptions {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
        annotations: (),
    }
    .build();

    let mut bodies = [body];

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let changed = InstSimplify::new().run(context, &mut bodies[0]);
    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    )
    .expect("infallible");

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/inst_simplify"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests constant folding for addition.
#[test]
fn const_fold_add() {
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

    assert_inst_simplify_pass(
        "const_fold_add",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for subtraction.
#[test]
fn const_fold_sub() {
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

    assert_inst_simplify_pass(
        "const_fold_sub",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that addition overflow is not folded (returns None from `checked_add`).
#[test]
fn const_fold_add_overflow() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.+ 170141183460469231731687303715884105727 1;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "const_fold_add_overflow",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that subtraction underflow is not folded (returns None from `checked_sub`).
#[test]
fn const_fold_sub_overflow() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.- (-0x8000_0000_0000_0000_0000_0000_0000_0000) 1;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "const_fold_sub_overflow",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for bitwise AND on integers.
#[test]
fn const_fold_bit_and() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.& 2 3;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "const_fold_bit_and",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for bitwise OR on integers.
#[test]
fn const_fold_bit_or() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = bin.| 2 1;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "const_fold_bit_or",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for unary NOT.
#[test]
fn const_fold_unary_not() {
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

    assert_inst_simplify_pass(
        "const_fold_unary_not",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for unary negation.
#[test]
fn const_fold_unary_neg() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = un.neg (-5);
            return result;
        }
    });

    assert_inst_simplify_pass(
        "const_fold_unary_neg",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests identity simplification for addition with zero on the right (x + 0 => x).
#[test]
fn identity_add_zero() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.+ x 0;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identity_add_zero",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests identity simplification for addition with zero on the left (0 + x => x).
#[test]
fn identity_add_zero_left() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.+ 0 x;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identity_add_zero_left",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests identity simplification for subtraction with zero (x - 0 => x).
#[test]
fn identity_sub_zero() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.- x 0;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identity_sub_zero",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests simplification of 0 - x => -x.
#[test]
fn zero_sub_place() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.- 0 x;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "zero_sub_place",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests cancellation simplification for subtraction with identical operands (x - x => 0).
#[test]
fn identical_operand_sub() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.- x x;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identical_operand_sub",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests identity simplification for bitwise OR with zero.
#[test]
fn identity_bit_or_zero() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.| x 0;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identity_bit_or_zero",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests idempotent simplification for bitwise AND with identical operands.
#[test]
fn identical_operand_bit_and() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.& x x;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identical_operand_bit_and",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests idempotent simplification for bitwise OR with identical operands.
#[test]
fn identical_operand_bit_or() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            result = bin.| x x;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "identical_operand_bit_or",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant propagation through block params with single predecessor.
#[test]
fn block_param_single_predecessor() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl p: Int, result: Bool;

        bb0() {
            goto bb1(5);
        },
        bb1(p) {
            result = bin.== p 5;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "block_param_single_predecessor",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant propagation when all predecessors agree on value.
#[test]
fn block_param_predecessors_agree() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Bool {
        decl cond: Int, p: Int, result: Bool;

        bb0() {
            switch cond [0 => bb1(), 1 => bb2()];
        },
        bb1() {
            goto bb3(42);
        },
        bb2() {
            goto bb3(42);
        },
        bb3(p) {
            result = bin.== p 42;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "block_param_predecessors_agree",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests no propagation when predecessors disagree on value.
#[test]
fn block_param_predecessors_disagree() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Bool {
        decl cond: Int, p: Int, result: Bool;

        bb0() {
            switch cond [0 => bb1(), 1 => bb2()];
        },
        bb1() {
            goto bb3(1);
        },
        bb2() {
            goto bb3(2);
        },
        bb3(p) {
            result = bin.== p 1;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "block_param_predecessors_disagree",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that idempotent simplification propagates constants through the result.
#[test]
fn idempotent_to_const_forwarding() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, result: Bool;

        bb0() {
            x = load 42;
            y = bin.& x x;
            result = bin.== y 42;
            return result;
        }
    });

    assert_inst_simplify_pass(
        "idempotent_to_const_forwarding",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that an empty tuple aggregate is simplified to a unit constant.
#[test]
fn empty_tuple_to_unit() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> () {
        decl result: ();

        bb0() {
            result = tuple;
            return result;
        }
    });

    let changed = InstSimplify::new().run(
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &mut body,
    );
    assert_eq!(changed, Changed::Yes);
    assert_matches!(
        body.basic_blocks[BasicBlockId::START].statements[0].kind,
        StatementKind::Assign(Assign {
            lhs: _,
            rhs: RValue::Load(Operand::Constant(Constant::Unit))
        })
    );
}
