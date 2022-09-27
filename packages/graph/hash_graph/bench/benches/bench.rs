#![feature(custom_test_frameworks)]
#![test_runner(criterion::runner)]

use criterion::{black_box, Criterion};
use criterion_macro::criterion;

fn fibonacci(n: u64) -> u64 {
    match n {
        0 | 1 => 1,
        n => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[criterion]
fn bench_get_all(c: &mut Criterion) {
    c.bench_function("Fibonacci-Simple", |b| b.iter(|| fibonacci(black_box(10))));
}
