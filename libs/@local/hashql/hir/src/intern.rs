use hashql_core::{
    heap::Heap,
    intern::{InternMap, InternSet, Interned},
    span::Spanned,
    symbol::Ident,
    r#type::TypeId,
};

use crate::node::{
    Node, PartialNode, call::CallArgument, closure::ClosureParam, graph::read::GraphReadBody,
};

#[derive(Debug)]
pub struct Interner<'heap> {
    pub nodes: InternSet<'heap, [Node<'heap>]>,
    pub idents: InternSet<'heap, [Ident<'heap>]>,
    pub type_ids: InternSet<'heap, [Spanned<TypeId>]>,
    pub closure_params: InternSet<'heap, [ClosureParam<'heap>]>,
    pub call_arguments: InternSet<'heap, [CallArgument<'heap>]>,
    pub graph_read_body: InternSet<'heap, [GraphReadBody<'heap>]>,

    pub node: InternMap<'heap, Node<'heap>>,
}

impl<'heap> Interner<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            nodes: InternSet::new(heap),
            idents: InternSet::new(heap),
            type_ids: InternSet::new(heap),

            closure_params: InternSet::new(heap),
            call_arguments: InternSet::new(heap),
            graph_read_body: InternSet::new(heap),

            node: InternMap::new(heap),
        }
    }

    pub fn intern_nodes(&self, nodes: &[Node<'heap>]) -> Interned<'heap, [Node<'heap>]> {
        self.nodes.intern_slice(nodes)
    }

    pub fn intern_idents(&self, idents: &[Ident<'heap>]) -> Interned<'heap, [Ident<'heap>]> {
        self.idents.intern_slice(idents)
    }

    pub fn intern_type_ids(
        &self,
        type_ids: &[Spanned<TypeId>],
    ) -> Interned<'heap, [Spanned<TypeId>]> {
        self.type_ids.intern_slice(type_ids)
    }

    pub fn intern_closure_params(
        &self,
        closure_params: &[ClosureParam<'heap>],
    ) -> Interned<'heap, [ClosureParam<'heap>]> {
        self.closure_params.intern_slice(closure_params)
    }

    pub fn intern_call_arguments(
        &self,
        call_args: &[CallArgument<'heap>],
    ) -> Interned<'heap, [CallArgument<'heap>]> {
        self.call_arguments.intern_slice(call_args)
    }

    pub fn intern_node(&self, node: PartialNode<'heap>) -> Node<'heap> {
        self.node.intern_partial(node)
    }
}
