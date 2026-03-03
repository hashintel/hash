use hashql_core::{
    heap::Heap,
    intern::{InternSet, Interned},
    span::Spanned,
    symbol::Ident,
    r#type::TypeId,
};

use crate::node::{
    Node, NodeData,
    call::CallArgument,
    closure::ClosureParam,
    data::{DictField, StructField},
    graph::read::GraphReadBody,
    r#let::Binding,
};

#[derive(Debug)]
pub struct Interner<'heap> {
    pub nodes: InternSet<'heap, [Node<'heap>]>,
    pub idents: InternSet<'heap, [Ident<'heap>]>,
    pub type_ids: InternSet<'heap, [Spanned<TypeId>]>,
    pub closure_params: InternSet<'heap, [ClosureParam<'heap>]>,
    pub call_arguments: InternSet<'heap, [CallArgument<'heap>]>,
    pub graph_read_body: InternSet<'heap, [GraphReadBody<'heap>]>,
    pub bindings: InternSet<'heap, [Binding<'heap>]>,

    pub node: InternSet<'heap, NodeData<'heap>>,

    struct_fields: InternSet<'heap, [StructField<'heap>]>,
    pub dict_fields: InternSet<'heap, [DictField<'heap>]>,
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
            struct_fields: InternSet::new(heap),
            dict_fields: InternSet::new(heap),
            bindings: InternSet::new(heap),

            node: InternSet::new(heap),
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

    /// Interns a slice of struct fields.
    ///
    /// # Panics
    ///
    /// With debug assertions enabled, this function will panic if there are duplicate field names.
    pub fn intern_struct_fields(
        &self,
        fields: &mut [StructField<'heap>],
    ) -> Interned<'heap, [StructField<'heap>]> {
        if cfg!(debug_assertions) {
            // Ensure that struct fields do not have duplicate field names
            let mut seen = hashql_core::collections::fast_hash_set_with_capacity(fields.len());
            for field in &*fields {
                assert!(
                    seen.insert(field.name.value),
                    "Duplicate field name: {}",
                    field.name.value
                );
            }
        }

        // We can safely use unstable_by_key here because struct fields do not have duplicate field
        // names
        fields.sort_unstable_by_key(|field| field.name.value);

        self.struct_fields.intern_slice(fields)
    }

    pub fn intern_dict_fields(
        &self,
        fields: &[DictField<'heap>],
    ) -> Interned<'heap, [DictField<'heap>]> {
        self.dict_fields.intern_slice(fields)
    }

    pub fn intern_node(&self, node: NodeData<'heap>) -> Interned<'heap, NodeData<'heap>> {
        self.node.intern(node)
    }
}
