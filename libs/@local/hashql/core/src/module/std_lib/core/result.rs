use crate::{
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Result {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Result {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::result
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let t_arg = lib.ty.fresh_argument(sym::T);
        let t_ref = lib.ty.hydrate_argument(t_arg);
        let t_param = lib.ty.param(t_arg);

        let e_arg = lib.ty.fresh_argument(sym::E);
        let e_ref = lib.ty.hydrate_argument(e_arg);
        let e_param = lib.ty.param(e_arg);

        // newtype Ok<T> = T;
        let ok_ty = lib.ty.generic(
            [(t_arg, None)],
            lib.ty.opaque(sym::path::core::result::Ok, t_param),
        );
        def.push(sym::Ok, ItemDef::newtype(lib.ty.env, ok_ty, &[t_ref]));

        // newtype Err<E> = E;
        let err_ty = lib.ty.generic(
            [(e_arg, None)],
            lib.ty.opaque(sym::path::core::result::Err, e_param),
        );
        def.push(sym::Err, ItemDef::newtype(lib.ty.env, err_ty, &[e_ref]));

        // type Result<T, E> = Ok<T> | Err<E>;
        let result_ty = lib.ty.union([ok_ty, err_ty]);
        def.push(
            sym::Result,
            ItemDef::newtype(lib.ty.env, result_ty, &[t_ref, e_ref]),
        );

        def
    }
}
