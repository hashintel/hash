//! Tests for terminator placement analysis.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;
use core::fmt::{self, Display};
use std::{io::Write as _, path::PathBuf};

use hashql_core::{
    heap::Heap,
    id::{Id as _, bit_vec::FiniteBitSet},
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, builder::TypeBuilder, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{Cost, TerminatorCostVec, TerminatorPlacement};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
        local::LocalVec,
        operand::Operand,
        terminator::{GraphRead, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    builder::{BodyBuilder, body},
    context::MirContext,
    intern::Interner,
    pass::{
        analysis::size_estimation::{BodyFootprint, Footprint, InformationRange},
        execution::target::{TargetBitSet, TargetId},
    },
    pretty::TextFormatOptions,
};

fn target_set(targets: &[TargetId]) -> TargetBitSet {
    let mut set = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
    for &target in targets {
        set.insert(target);
    }
    set
}

fn all_targets() -> TargetBitSet {
    let mut set = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
    set.insert_range(TargetId::MIN..=TargetId::MAX);
    set
}

type TargetBitSetSlice = BasicBlockSlice<TargetBitSet>;

fn build_targets<'set>(
    body: &Body<'_>,
    per_block: &'set [TargetBitSet],
) -> &'set TargetBitSetSlice {
    assert_eq!(body.basic_blocks.len(), per_block.len());

    TargetBitSetSlice::from_raw(per_block)
}

fn make_scalar_footprint<'heap>(
    body: &Body<'heap>,
    heap: &'heap Heap,
) -> BodyFootprint<&'heap Heap> {
    BodyFootprint {
        args: body.args,
        locals: LocalVec::from_elem_in(Footprint::scalar(), body.local_decls.len(), heap),
        returns: Footprint::scalar(),
    }
}

fn make_full_footprint<'heap>(body: &Body<'heap>, heap: &'heap Heap) -> BodyFootprint<&'heap Heap> {
    BodyFootprint {
        args: body.args,
        locals: LocalVec::from_elem_in(Footprint::full(), body.local_decls.len(), heap),
        returns: Footprint::full(),
    }
}

fn assert_snapshot<'heap>(
    name: &'static str,
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    edges: &TerminatorCostVec<&'heap Heap>,
) {
    let formatter = Formatter::new(context.heap);
    let type_formatter = TypeFormatter::new(&formatter, context.env, TypeFormatterOptions::terse());

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: type_formatter,
        annotations: (),
    }
    .build();

    text_format.format_body(body).expect("formatting failed");

    write!(text_format.writer, "\n\n{:=^50}\n\n", " Terminator Edges ").expect("infallible");

    write!(text_format.writer, "{}", format_edge_summary(edges)).expect("formatting failed");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/execution/terminator_placement"));
    settings.set_prepend_module_to_snapshot(false);

    let _guard = settings.bind_to_scope();

    let output = String::from_utf8_lossy(&text_format.writer);
    assert_snapshot!(name, output);
}

fn format_edge_summary<A: core::alloc::Allocator>(
    edges: &TerminatorCostVec<A>,
) -> impl Display + '_ {
    fmt::from_fn(move |fmt| {
        for block in 0..(edges.offsets.len() - 1) {
            let block_id = BasicBlockId::new(block as u32);
            let matrices = edges.of(block_id);
            writeln!(fmt, "{block_id}:")?;
            for (index, matrix) in matrices.iter().enumerate() {
                write!(fmt, "  edge[{index}]:")?;

                for (source, target, edge) in matrix.iter() {
                    let Some(cost) = edge else { continue };

                    write!(
                        fmt,
                        "{}->{}={}",
                        source.abbreviation(),
                        target.abbreviation(),
                        cost
                    )?;
                }

                writeln!(fmt)?;
            }
        }
        Ok(())
    })
}

#[test]
fn terminator_cost_vec_successor_counts() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl value: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            value = load 0;
            switch value [0 => bb2(), 1 => bb2(), _ => bb2()];
        },
        bb2() {
            return 0;
        },
        bb3() {
            unreachable;
        }
    });

    let costs = TerminatorCostVec::new(&body.basic_blocks, &heap);

    assert_eq!(costs.of(BasicBlockId::new(0)).len(), 1);
    assert_eq!(costs.of(BasicBlockId::new(1)).len(), 3);
    assert_eq!(costs.of(BasicBlockId::new(2)).len(), 0);
    assert_eq!(costs.of(BasicBlockId::new(3)).len(), 0);
}

#[test]
fn goto_allows_cross_backend_non_postgres() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl value: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            value = load 10;
            return value;
        }
    });

    let targets = [
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
    ];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(BasicBlockId::new(0))[0];
    assert_eq!(
        matrix.get(TargetId::Interpreter, TargetId::Embedding),
        Some(cost!(1))
    );
}

#[test]
fn switchint_blocks_cross_backend() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl selector: Int, result: Int;

        bb0() {
            selector = load 1;
            switch selector [0 => bb1(), _ => bb2()];
        },
        bb1() {
            return 0;
        },
        bb2() {
            result = load 10;
            return result;
        }
    });

    let targets = [
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
    ];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(BasicBlockId::new(0))[0];
    assert_eq!(matrix.get(TargetId::Interpreter, TargetId::Embedding), None);
    assert_eq!(
        matrix.get(TargetId::Embedding, TargetId::Interpreter),
        Some(cost!(1))
    );
}

#[test]
fn switchint_edge_targets_are_branch_specific() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl selector: Int;

        bb0() {
            selector = load 1;
            switch selector [0 => bb1(), _ => bb2()];
        },
        bb1() {
            return 0;
        },
        bb2() {
            return 1;
        }
    });

    let targets = [
        all_targets(),
        target_set(&[TargetId::Interpreter]),
        target_set(&[TargetId::Embedding]),
    ];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrices = costs.of(BasicBlockId::new(0));
    let first = matrices[0];
    let second = matrices[1];

    assert!(
        first
            .get(TargetId::Interpreter, TargetId::Interpreter)
            .is_some()
    );
    assert!(
        first
            .get(TargetId::Embedding, TargetId::Interpreter)
            .is_some()
    );
    assert!(
        first
            .get(TargetId::Interpreter, TargetId::Embedding)
            .is_none()
    );

    assert!(
        second
            .get(TargetId::Embedding, TargetId::Embedding)
            .is_some()
    );
    assert!(
        second
            .get(TargetId::Interpreter, TargetId::Embedding)
            .is_some()
    );
    assert!(
        second
            .get(TargetId::Embedding, TargetId::Interpreter)
            .is_none()
    );
}

#[test]
fn graphread_interpreter_only() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let unit_ty = TypeBuilder::synthetic(&env).tuple([] as [hashql_core::r#type::TypeId; 0]);
    let entity_ty = TypeBuilder::synthetic(&env).opaque("Entity", int_ty);

    let mut builder = BodyBuilder::new(&interner);
    let _env_local = builder.local("env", unit_ty);
    let _vertex = builder.local("vertex", entity_ty);
    let axis = builder.local("axis", int_ty);

    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb1,
        }));

    builder.build_block(bb1).ret(const_0);

    let body = builder.finish(2, int_ty);

    let targets = [all_targets(), all_targets()];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(bb0)[0];
    assert_eq!(
        matrix.get(TargetId::Interpreter, TargetId::Interpreter),
        Some(cost!(0))
    );
    assert_eq!(matrix.get(TargetId::Interpreter, TargetId::Embedding), None);
    assert_eq!(matrix.get(TargetId::Embedding, TargetId::Interpreter), None);
    assert_eq!(matrix.get(TargetId::Postgres, TargetId::Interpreter), None);
}

#[test]
fn postgres_incoming_removed() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl value: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            value = load 10;
            return value;
        }
    });

    let targets = [all_targets(), all_targets()];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(BasicBlockId::new(0))[0];
    assert_eq!(matrix.get(TargetId::Interpreter, TargetId::Postgres), None);
    assert_eq!(matrix.get(TargetId::Embedding, TargetId::Postgres), None);
    assert_eq!(
        matrix.get(TargetId::Postgres, TargetId::Postgres),
        Some(cost!(0))
    );
}

#[test]
fn postgres_removed_in_loops() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl value: Int;

        bb0() {
            value = load 0;
            goto bb1();
        },
        bb1() {
            goto bb0();
        }
    });

    let targets = [all_targets(), all_targets()];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(BasicBlockId::new(0))[0];
    assert_eq!(matrix.get(TargetId::Postgres, TargetId::Postgres), None);
    assert_eq!(matrix.get(TargetId::Postgres, TargetId::Interpreter), None);
    assert_eq!(
        matrix.get(TargetId::Interpreter, TargetId::Interpreter),
        Some(cost!(0))
    );
}

#[test]
fn transfer_cost_counts_live_and_params() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl live: Int, param: Int, cond: Bool;

        bb0() {
            live = load 10;
            cond = load true;
            if cond then bb1(param) else bb2();
        },
        bb1(param) {
            return live;
        },
        bb2() {
            return 0;
        }
    });

    let targets = [
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
    ];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(BasicBlockId::new(0))[0];
    assert_eq!(
        matrix.get(TargetId::Postgres, TargetId::Interpreter),
        Some(cost!(2))
    );
}

#[test]
fn transfer_cost_is_max_for_unbounded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl value: [List Int], cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            return value;
        },
        bb2() {
            return 0;
        }
    });

    let targets = [
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
    ];

    let footprint = make_full_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    let matrix = costs.of(BasicBlockId::new(0))[0];
    assert_eq!(
        matrix.get(TargetId::Postgres, TargetId::Interpreter),
        Some(Cost::MAX)
    );
}

#[test]
fn terminator_placement_snapshot() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl selector: Int, live: Int, param: Int;

        bb0() {
            live = load 10;
            selector = load 1;
            switch selector [0 => bb1(param), _ => bb2()];
        },
        bb1(param) {
            return live;
        },
        bb2() {
            return 0;
        }
    });

    let targets = [
        all_targets(),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
    ];

    let footprint = make_scalar_footprint(&body, &heap);
    let placement = TerminatorPlacement::new_in(InformationRange::zero(), Global);
    let costs = placement.terminator_placement(
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &footprint,
        build_targets(&body, &targets),
    );

    assert_snapshot(
        "terminator_placement_snapshot",
        &MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        &body,
        &costs,
    );
}
