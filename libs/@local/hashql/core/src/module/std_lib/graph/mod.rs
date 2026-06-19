use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) mod body;
pub(in crate::module::std_lib) mod entity;
pub(in crate::module::std_lib) mod head;
pub(in crate::module::std_lib) mod tail;
pub mod temporal;
pub(in crate::module::std_lib) mod tmp;
pub mod types;

pub(in crate::module::std_lib) struct Graph {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Graph {
    type Children = (
        self::temporal::Temporal,
        self::head::Head,
        self::body::Body,
        self::tail::Tail,
        self::entity::Entity,
        self::tmp::Tmp,
        self::types::Types,
    );

    fn name() -> Symbol<'heap> {
        sym::graph
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // newtype Graph<T> = ('marker: T)
        //
        // The internal data is intentionally inaccessible to user code. Instead, it's used
        // internally to track the graph's type information. The field is named `'marker` using an
        // identifier that cannot be referenced in user code (`'` is not a valid symbol in any
        // identifier).
        let t_arg = context.ty.fresh_argument(sym::T);
        let t_ref = context.ty.hydrate_argument(t_arg);
        let t_param = context.ty.param(t_arg);

        let graph_ty = context.ty.generic(
            [t_arg],
            context.ty.opaque(
                sym::path::graph::Graph,
                context.ty.r#struct([(sym::internal::marker, t_param)]),
            ),
        );
        def.push(
            sym::Graph,
            // Export as `type` rather than `newtype` since Graph is not intended to be
            // user-constructible
            ItemDef::r#type(context.ty.env, graph_ty, &[t_ref]),
        );

        def
    }
}
