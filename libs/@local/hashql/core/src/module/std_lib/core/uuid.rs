use crate::{
    heap::Heap,
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
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

    fn name(_: &'heap Heap) -> Symbol<'heap> {
        sym::uuid
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Uuid = String;
        let uuid = ItemDef::newtype(lib.ty.env, types::uuid(&lib.ty), &[]);
        def.push(sym::Uuid, uuid);

        def
    }
}
