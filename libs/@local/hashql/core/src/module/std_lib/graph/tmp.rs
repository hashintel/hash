use core::alloc::Allocator;

use crate::{
    intern::Interned,
    module::{
        locals::TypeDef,
        std_lib::{
            self, CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
            core::func,
        },
    },
    symbol::{Symbol, sym},
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Tmp {
    _dependencies: (std_lib::graph::temporal::Temporal,),
}

impl<'heap> StandardLibraryModule<'heap> for Tmp {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::GraphTmp;

    fn name() -> Symbol<'heap> {
        sym::tmp
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let query_temporal_axes_ty = cache
            .request::<std_lib::graph::temporal::Temporal>(context)
            .expect_type(sym::QueryTemporalAxes);

        // ::graph::tmp::decision_time_now() -> TimeAxis
        func(
            &mut def,
            sym::path::graph::tmp::decision_time_now,
            [sym::decision_time_now],
            TypeDef {
                id: context
                    .ty
                    .closure([] as [TypeId; 0], query_temporal_axes_ty.id),
                arguments: Interned::empty(),
            },
        );

        def
    }
}
