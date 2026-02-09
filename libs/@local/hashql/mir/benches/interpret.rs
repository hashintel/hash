#![expect(clippy::min_ident_chars, clippy::significant_drop_tightening)]
#![feature(allocator_api)]

extern crate alloc;

#[path = "common/run.rs"]
mod run;

use alloc::alloc::Global;

use codspeed_criterion_compat::{BenchmarkId, Criterion, criterion_group, criterion_main};
use hashql_core::{
    collections::FastHashMap,
    heap::{ResetAllocator as _, Scratch},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::Body,
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice},
    intern::Interner,
    interpret::{
        CallStack, Runtime, RuntimeConfig,
        value::{Int, Value},
    },
    pass::{
        Changed, GlobalTransformPass as _, OwnedGlobalTransformState,
        transform::{Inline, InlineConfig, PostInline, PreInline},
    },
};

use self::run::run_bencher;

fn create_fibonacci_body<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
    let def = DefId::new(0);
    let func = body!(interner, env; fn@def/1 -> Int {
        decl n: Int, prev1: Int, prev2: Int, a: Int, b: Int, result: Int;

        bb0() {
            switch n [0 => bb1(), 1 => bb1(), _ => bb2()];
        },
        bb1() {
            return n;
        },
        bb2() {
            prev1 = bin.- n 1;
            prev2 = bin.- n 2;
            a = apply def, prev1;
            b = apply def, prev2;
            result = bin.+ a b;
            return result;
        }
    });

    let mut bodies = [func];
    let bodies_mut = DefIdSlice::from_raw_mut(&mut bodies);

    let mut scratch = Scratch::new();

    let mut context = MirContext {
        heap: env.heap,
        env,
        interner,
        diagnostics: DiagnosticIssues::new(),
    };
    let mut state = OwnedGlobalTransformState::new_in(bodies_mut, Global);

    let mut pre = PreInline::new_in(&mut scratch);
    let _: Changed = pre.run(&mut context, &mut state.as_mut(), bodies_mut);
    scratch.reset();

    let mut inline = Inline::new_in(InlineConfig::default(), &mut scratch);
    let _: Changed = inline.run(&mut context, &mut state.as_mut(), bodies_mut);
    scratch.reset();

    let mut post = PostInline::new_in(context.heap, &mut scratch);
    let _: Changed = post.run(&mut context, &mut state.as_mut(), bodies_mut);
    scratch.reset();

    bodies
}

fn fibonacci_recursive(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("fibonacci_recursive");

    for n in [8_i128, 16, 24] {
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |bencher, n| {
            run_bencher(bencher, create_fibonacci_body, |_, bodies, scratch| {
                let scratch = &*scratch;
                let bodies = DefIdSlice::from_raw(bodies);

                let mut runtime = Runtime::new_in(
                    RuntimeConfig::default(),
                    bodies,
                    FastHashMap::default(),
                    scratch,
                );
                let callstack =
                    CallStack::new(&runtime, DefId::new(0), [Value::Integer(Int::from(*n))]);

                let Ok(Value::Integer(int)) = runtime.run(callstack) else {
                    unreachable!()
                };

                int
            });
        });
    }
}

criterion_group!(benches, fibonacci_recursive);
criterion_main!(benches);
