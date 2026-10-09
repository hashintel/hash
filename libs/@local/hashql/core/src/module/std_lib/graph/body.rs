use core::alloc::Allocator;

use crate::{
    module::{
        locals::TypeDef,
        std_lib::{
            self, CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
            core::func, decl,
        },
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Body {
    _dependencies: (std_lib::graph::Graph,),
}

impl<'heap> StandardLibraryModule<'heap> for Body {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::GraphBody;

    fn name() -> Symbol<'heap> {
        sym::body
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let graph = cache.request::<std_lib::graph::Graph>(context);

        let mut graph_param = graph.expect_type(sym::Graph);
        let mut graph_returns = graph_param;

        graph_param.instantiate(&mut context.instantiate);
        graph_returns.instantiate(&mut context.instantiate);

        // `filter<T>(graph: Graph<T>, predicate: fn(vertex: T) -> bool) -> Graph<T>;`
        // Once https://linear.app/hash/issue/H-4741/hashql-support-for-type-guards lands this will change to:
        // `filter<T, U>(graph: Graph<T>, predicate: fn(vertex: T) -> entity is U) -> Graph<U>;`
        let decl = decl!(context;
            <T>(graph: context.ty.apply([(graph_param.arguments[0].id, T)], graph_param.id),
                predicate: context.ty.closure([T], context.ty.boolean())
            ) -> context.ty.apply([(graph_returns.arguments[0].id, T)], graph_returns.id)
        );

        func(&mut def, sym::path::graph_body_filter, [sym::filter], decl);

        def
    }
}
