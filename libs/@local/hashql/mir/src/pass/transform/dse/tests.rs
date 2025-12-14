#![allow(clippy::min_ident_chars)]
use alloc::alloc::Global;

use super::ReverseDependencyMatrix;
use crate::body::local::{Local, LocalSlice};

fn collect_row(matrix: &ReverseDependencyMatrix, local: Local) -> Vec<Local> {
    matrix
        .matrix
        .row(local)
        .map(|row| row.iter().collect())
        .unwrap_or_default()
}

#[test]
fn linear_chain() {
    let locals = [(); 3];
    let domain = LocalSlice::from_raw(&locals);
    let [a, b, c] = domain.ids().collect_array().expect("should be exactly 3");

    let mut matrix = ReverseDependencyMatrix::new_in(domain, Global);

    matrix.insert(b, a); // B -> A
    matrix.insert(c, b); // C -> B

    matrix.transitive_closure();

    assert_eq!(collect_row(&matrix, a), [] as [Local; 0]);
    assert_eq!(collect_row(&matrix, b), [a]);
    assert_eq!(collect_row(&matrix, c), [a, b]);
}

#[test]
fn diamond() {
    let locals = [(); 4];
    let domain = LocalSlice::from_raw(&locals);
    let [a, b, c, d] = domain.ids().collect_array().expect("should be exactly 4");

    let mut matrix = ReverseDependencyMatrix::new_in(domain, Global);

    matrix.insert(b, a); // B -> A
    matrix.insert(c, a); // C -> A
    matrix.insert(d, b); // D -> B
    matrix.insert(d, c); // D -> C

    matrix.transitive_closure();

    assert_eq!(collect_row(&matrix, a), [] as [Local; 0]);
    assert_eq!(collect_row(&matrix, b), [a]);
    assert_eq!(collect_row(&matrix, c), [a]);
    assert_eq!(collect_row(&matrix, d), [a, b, c]);
}

#[test]
fn cycle() {
    let locals = [(); 3];
    let domain = LocalSlice::from_raw(&locals);
    let [a, b, c] = domain.ids().collect_array().expect("should be exactly 3");

    let mut matrix = ReverseDependencyMatrix::new_in(domain, Global);

    matrix.insert(b, a); // B -> A
    matrix.insert(c, b); // C -> B
    matrix.insert(a, c); // A -> C

    matrix.transitive_closure();

    assert_eq!(collect_row(&matrix, a), [a, b, c]);
    assert_eq!(collect_row(&matrix, b), [a, b, c]);
    assert_eq!(collect_row(&matrix, c), [a, b, c]);
}

#[test]
fn no_dependencies() {
    let locals = [(); 3];
    let domain = LocalSlice::from_raw(&locals);
    let [a, b, c] = domain.ids().collect_array().expect("should be exactly 3");

    let mut matrix = ReverseDependencyMatrix::new_in(domain, Global);

    matrix.transitive_closure();

    assert_eq!(collect_row(&matrix, a), [] as [Local; 0]);
    assert_eq!(collect_row(&matrix, b), [] as [Local; 0]);
    assert_eq!(collect_row(&matrix, c), [] as [Local; 0]);
}

#[test]
fn single_edge() {
    let locals = [(); 2];
    let domain = LocalSlice::from_raw(&locals);
    let [a, b] = domain.ids().collect_array().expect("should be exactly 2");

    let mut matrix = ReverseDependencyMatrix::new_in(domain, Global);

    matrix.insert(b, a); // B -> A

    matrix.transitive_closure();

    assert_eq!(collect_row(&matrix, a), [] as [Local; 0]);
    assert_eq!(collect_row(&matrix, b), [a]);
}

#[test]
fn self_loop() {
    let locals = [(); 2];
    let domain = LocalSlice::from_raw(&locals);
    let [a, b] = domain.ids().collect_array().expect("should be exactly 2");

    let mut matrix = ReverseDependencyMatrix::new_in(domain, Global);

    matrix.insert(a, a); // A -> A
    matrix.insert(b, a); // B -> A

    matrix.transitive_closure();

    assert_eq!(collect_row(&matrix, a), [a]);
    assert_eq!(collect_row(&matrix, b), [a]);
}
