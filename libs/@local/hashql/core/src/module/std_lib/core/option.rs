use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        CacheId, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub mod types {
    use crate::{
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    // create a concrete monomorphized instance of `Option`
    #[must_use]
    pub fn option(ty: &TypeBuilder<'_, '_>, value: TypeId) -> TypeId {
        let none = ty.opaque(sym::path::None, ty.null());
        let some = ty.opaque(sym::path::Some, value);

        ty.union([none, some])
    }
}

pub(in crate::module::std_lib) struct Option {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Option {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::CoreOption;

    fn name() -> Symbol<'heap> {
        sym::option
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // Option is simply a union between two opaque types, when the constructor only takes a
        // `Null` the constructor automatically allows for no-value.
        let t_arg = context.ty.fresh_argument(sym::T);
        let t_ref = context.ty.hydrate_argument(t_arg);
        let t_param = context.ty.param(t_arg);

        // newtype None = Null;
        let none_ty = context.ty.opaque(sym::path::None, context.ty.null());
        def.push(sym::None, ItemDef::newtype(context.ty.env, none_ty, &[]));

        // newtype Some<T> = T;
        let some_ty = context
            .ty
            .generic([(t_arg, None)], context.ty.opaque(sym::path::Some, t_param));
        def.push(
            sym::Some,
            ItemDef::newtype(context.ty.env, some_ty, &[t_ref]),
        );

        // type Option<T> = Some<T> | None;
        let option_ty = context.ty.union([some_ty, none_ty]);
        def.push(
            sym::Option,
            ItemDef::r#type(context.ty.env, option_ty, &[t_ref]),
        );

        def
    }
}
