use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::graph::LinkedGraph;

use crate::{body::Body, context::MirContext, def::DefIdSlice, pass::AnalysisPass};

enum CallKind {
    Invoke,
    Opaque,
}

struct EdgeData {
    kind: CallKind,
}

pub struct CallGraph<A: Allocator = Global> {
    inner: LinkedGraph<(), EdgeData, A>,
}

impl<A: Allocator + Clone> CallGraph<A> {
    pub fn new_in(domain: &DefIdSlice<impl Sized>, alloc: A) -> Self {
        let mut graph = LinkedGraph::new_in(alloc);
        for _ in domain {
            graph.add_node(());
        }

        Self { inner: graph }
    }
}

pub struct CallGraphAnalysis<'graph, A: Allocator = Global> {
    graph: &'graph mut CallGraph<A>,
}

impl<'env, 'heap, A: Allocator> AnalysisPass<'env, 'heap> for CallGraphAnalysis<'_, A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        todo!()
    }
}
