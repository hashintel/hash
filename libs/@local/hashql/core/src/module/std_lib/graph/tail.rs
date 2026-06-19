use core::alloc::Allocator;

use crate::{
    module::{
        locals::TypeDef,
        std_lib::{
            self, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
            core::func, decl,
        },
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

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let graph = cache.request::<std_lib::graph::Graph>(context);

        let mut graph_ty = graph.expect_type(sym::Graph);
        graph_ty.instantiate(&mut context.instantiate);

        // `collect<T>(graph: Graph<T>) -> List<T>;`
        let decl = decl!(context;
            <T>(graph: context.ty.apply([(graph_ty.arguments[0].id, T)], graph_ty.id)) -> context.ty.list(T)
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
