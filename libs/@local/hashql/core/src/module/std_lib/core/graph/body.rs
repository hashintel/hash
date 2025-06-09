use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{self, ModuleDef, StandardLibraryModule, core::func, decl},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Body {
    _dependencies: (std_lib::core::graph::Graph,),
}

impl<'heap> StandardLibraryModule<'heap> for Body {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("body")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        let graph = lib.manifest::<std_lib::core::graph::Graph>();

        let mut graph_param = graph.expect_type(heap.intern_symbol("Graph"));
        let mut graph_returns = graph_param;

        graph_param.instantiate(&mut lib.instantiate);
        graph_returns.instantiate(&mut lib.instantiate);

        // `filter<T>(graph: Graph<T>, predicate: fn(entity: T) -> bool) -> Graph<T>;`
        // Once https://linear.app/hash/issue/H-4741/hashql-support-for-type-guards lands this will change to:
        // `filter<T, U>(graph: Graph<T>, predicate: fn(entity: T) -> entity is U) -> Graph<U>;`
        let decl = decl!(lib;
            <T>(graph: lib.ty.apply([(graph_param.arguments[0].id, T)], graph_param.id),
                predicate: lib.ty.closure([T], lib.ty.boolean())
            ) -> lib.ty.apply([(graph_returns.arguments[0].id, T)], graph_returns.id)
        );

        func(lib, &mut def, "::core::graph::body::filter", &[], decl);

        def
    }
}
