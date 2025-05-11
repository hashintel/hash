use hashql_core::{
    intern::{InternMap, InternSet, Interned},
    symbol::Ident,
};

use crate::node::{Node, PartialNode};

pub struct Interner<'heap> {
    pub idents: InternSet<'heap, [Ident<'heap>]>,
    pub nodes: InternSet<'heap, [Node<'heap>]>,
    pub node: InternMap<'heap, Node<'heap>>,
}

impl<'heap> Interner<'heap> {
    pub fn intern_idents(&self, idents: &[Ident<'heap>]) -> Interned<'heap, [Ident<'heap>]> {
        self.idents.intern_slice(idents)
    }

    pub fn intern_nodes(&self, nodes: &[Node<'heap>]) -> Interned<'heap, [Node<'heap>]> {
        self.nodes.intern_slice(nodes)
    }

    pub fn intern_node(&self, node: PartialNode<'heap>) -> Node<'heap> {
        self.node.intern_partial(node)
    }
}
