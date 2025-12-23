use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{
    graph::{LinkedGraph, NodeId},
    id::Id,
};

use crate::{
    body::{Body, location::Location, rvalue::Apply},
    context::MirContext,
    def::{DefId, DefIdSlice},
    pass::AnalysisPass,
    visit::Visitor,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum CallKind {
    Apply(Location),
    Filter(Location),
    Opaque,
}

pub struct CallGraph<A: Allocator = Global> {
    inner: LinkedGraph<(), CallKind, A>,
}

impl<A: Allocator + Clone> CallGraph<A> {
    pub fn new_in(domain: &DefIdSlice<impl Sized>, alloc: A) -> Self {
        let mut graph = LinkedGraph::new_in(alloc);
        graph.derive(domain, |_, _| ());

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

struct CallGraphVisitor<'graph, A: Allocator = Global> {
    kind: CallKind,
    current: DefId,
    graph: &'graph mut CallGraph<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for CallGraphVisitor<'_, A> {
    type Result = Result<(), !>;

    fn visit_def_id(&mut self, location: Location, def_id: DefId) -> Self::Result {
        let source = NodeId::from_usize(self.current.as_usize());
        let target = NodeId::from_usize(def_id.as_usize());

        self.graph.inner.add_edge(source, target, self.kind);
        Ok(())
    }

    fn visit_rvalue_apply(
        &mut self,
        location: Location,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> Self::Result {
        debug_assert!(self.kind.is_none());
        self.kind = Some(Place::Function);
        self.visit_operand(location, function)?;
        self.kind = None;

        for argument in arguments.iter() {
            self.visit_operand(location, argument)?;
        }

        Ok(())
    }
}
