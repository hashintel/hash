#![expect(
    clippy::significant_drop_tightening,
    reason = "criterion_group! owns the Criterion instance"
)]

extern crate alloc;

use alloc::alloc::Global;
use core::hint::black_box;

use codspeed_criterion_compat::{Criterion, Throughput, criterion_group, criterion_main};
use hashql_core::{heap::Heap, span::SpanTable};
use hashql_diagnostics::source::SourceId;
use hashql_syntax_jexpr::{
    Parser, ParserOptions,
    bench::{parse_cst, tokenize},
};

const QUERY: &str = include_str!("fixtures/filter-diamond-cfg.jsonc");

fn lex(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("lexer");
    let plain = format!("\"{}\"", "abcdefgh".repeat(512));
    let escaped = format!("\"{}\"", r"path\/to\n".repeat(256));
    let unicode = format!("\"{}\"", r"\u0041\u00e9\uD83e\uDD80".repeat(64));
    let numbers = "0 42 -3.14159 6.022e+23 ".repeat(64);

    for (name, source) in [
        ("query_tokens", QUERY),
        ("plain_string", plain.as_str()),
        ("escaped_string", escaped.as_str()),
        ("unicode_escapes", unicode.as_str()),
        ("json_numbers", numbers.as_str()),
    ] {
        group.throughput(Throughput::Bytes(source.len() as u64));
        group.bench_function(name, |bencher| bencher.iter(|| tokenize(black_box(source))));
    }
    group.finish();
}

fn parse(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("parser");
    group.throughput(Throughput::Bytes(QUERY.len() as u64));
    group.bench_function("query_cst", |bencher| {
        bencher.iter(|| parse_cst(black_box(QUERY)));
    });
    group.bench_function("query_ast", |bencher| {
        bencher.iter(|| {
            let heap = Heap::new();
            let mut spans = SpanTable::new(SourceId::new_unchecked(0));
            black_box(
                Parser::new(&heap, &mut spans, ParserOptions::default())
                    .parse_expr_in(black_box(QUERY), Global)
                    .expect("benchmark query should parse"),
            );
        });
    });
    group.finish();
}

criterion_group!(benches, lex, parse);
criterion_main!(benches);
