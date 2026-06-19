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

pub(in crate::module::std_lib) struct Head {
    _dependencies: (
        std_lib::graph::Graph,
        std_lib::graph::temporal::Temporal,
        std_lib::graph::types::knowledge::entity::Entity,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for Head {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::head
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let query_temporal_axes_ty = cache
            .request::<std_lib::graph::temporal::Temporal>(context)
            .expect_type(sym::QueryTemporalAxes);

        let mut graph_ty = cache
            .request::<std_lib::graph::Graph>(context)
            .expect_type(sym::Graph);
        graph_ty.instantiate(&mut context.instantiate);

        let mut entity = cache
            .request::<std_lib::graph::types::knowledge::entity::Entity>(context)
            .expect_newtype(sym::Entity);
        entity.instantiate(&mut context.instantiate);

        // ::graph::head::entities(axis: TimeAxis) -> Graph<Entity<?>>;
        let entities_returns = context.ty.apply(
            [(
                graph_ty.arguments[0].id,
                context
                    .ty
                    .apply([(entity.arguments[0].id, context.ty.unknown())], entity.id),
            )],
            graph_ty.id,
        );
        func(
            &mut def,
            sym::path::graph_head_entities,
            [sym::entities],
            decl!(context; <>(axis: query_temporal_axes_ty.id) -> entities_returns),
        );

        def
    }
}
