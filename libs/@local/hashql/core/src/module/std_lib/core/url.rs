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

    pub(crate) fn url(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::Url, ty.string())
    }
}

pub(in crate::module::std_lib) struct Url {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Url {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("url")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Url = String;
        let url_ty = types::url(&lib.ty);
        def.push(sym::Url, ItemDef::newtype(lib.ty.env, url_ty, &[]));

        def
    }
}
