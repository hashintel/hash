use crate::{
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{self, ModuleDef, StandardLibraryModule, core::func, decl},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Tail {
    _dependencies: (std_lib::graph::Graph,),
}

impl<'heap> StandardLibraryModule<'heap> for Tail {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::tail
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        let graph = lib.manifest::<std_lib::graph::Graph>();

        let mut graph_ty = graph.expect_type(heap.intern_symbol("Graph"));
        graph_ty.instantiate(&mut lib.instantiate);

        // `collect<T>(graph: Graph<T>) -> List<T>;`
        let decl = decl!(lib;
            <T>(graph: lib.ty.apply([(graph_ty.arguments[0].id, T)], graph_ty.id)) -> lib.ty.list(T)
        );

        func(
            &mut def,
            sym::path::graph_tail_collect,
            [sym::collect],
            decl,
        );

        def
    }
}
