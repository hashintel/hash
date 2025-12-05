use std::alloc::{Allocator, Global};

use hashql_core::{graph::LinkedGraph, symbol::Symbol};

use crate::body::{local::Local, place::FieldIndex};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Slot<'heap> {
    Index(FieldIndex),
    Field(Symbol<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Edge<'heap> {
    slot: Slot<'heap>,
}

pub struct DataflowAnalysis<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<'heap, A: Allocator> DataflowAnalysis<'heap, A> {
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            graph: LinkedGraph::new_in(alloc),
        }
    }

    pub fn new_with(mut graph: LinkedGraph<Local, Edge<'heap>, A>) -> Self {
        graph.clear();

        Self { graph }
    }
}

impl<'heap> DataflowAnalysis<'heap> {
    pub fn new() -> Self {
        Self::new_in(Global)
    }
}
