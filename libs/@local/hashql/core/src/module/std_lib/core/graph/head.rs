use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{self, ModuleDef, StandardLibraryModule, core::func},
    },
    symbol::Symbol,
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Head {
    _dependencies: (std_lib::core::graph::Graph,),
}

impl<'heap> StandardLibraryModule<'heap> for Head {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("head")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        let graph = lib.manifest::<std_lib::core::graph::Graph>();

        let time_axis_ty = graph.expect_newtype(heap.intern_symbol("TimeAxis"));
        let graph_ty = graph.expect_newtype(heap.intern_symbol("Graph"));

        todo!();

        def
    }
}
