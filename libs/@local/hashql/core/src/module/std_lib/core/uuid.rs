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

    pub(crate) fn uuid(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::Uuid, ty.string())
    }
}

pub(in crate::module::std_lib) struct Uuid {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Uuid {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::uuid
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Uuid = String;
        let uuid = ItemDef::newtype(context.ty.env, types::uuid(&context.ty), &[]);
        def.push(sym::Uuid, uuid);

        def
    }
}
