use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(crate) mod types {
    use crate::{
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    pub(crate) fn url(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::Url, ty.string())
    }
}

pub(in crate::module::std_lib) struct Url {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Url {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::url
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Url = String;
        let url_ty = types::url(&context.ty);
        def.push(sym::Url, ItemDef::newtype(context.ty.env, url_ty, &[]));

        def
    }
}
