use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        CacheId, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Result {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Result {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::CoreResult;

    fn name() -> Symbol<'heap> {
        sym::result
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let t_arg = context.ty.fresh_argument(sym::T);
        let t_ref = context.ty.hydrate_argument(t_arg);
        let t_param = context.ty.param(t_arg);

        let e_arg = context.ty.fresh_argument(sym::E);
        let e_ref = context.ty.hydrate_argument(e_arg);
        let e_param = context.ty.param(e_arg);

        // newtype Ok<T> = T;
        let ok_ty = context.ty.generic(
            [(t_arg, None)],
            context.ty.opaque(sym::path::core::result::Ok, t_param),
        );
        def.push(sym::Ok, ItemDef::newtype(context.ty.env, ok_ty, &[t_ref]));

        // newtype Err<E> = E;
        let err_ty = context.ty.generic(
            [(e_arg, None)],
            context.ty.opaque(sym::path::core::result::Err, e_param),
        );
        def.push(sym::Err, ItemDef::newtype(context.ty.env, err_ty, &[e_ref]));

        // type Result<T, E> = Ok<T> | Err<E>;
        let result_ty = context.ty.union([ok_ty, err_ty]);
        def.push(
            sym::Result,
            ItemDef::newtype(context.ty.env, result_ty, &[t_ref, e_ref]),
        );

        def
    }
}
