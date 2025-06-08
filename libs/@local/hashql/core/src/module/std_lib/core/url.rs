use crate::{
    heap::Heap,
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Url;

impl<'heap> StandardLibraryModule<'heap> for Url {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("url")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Url = String;
        let url_ty = lib.ty.opaque("::core::url::Url", lib.ty.string());
        let url = ItemDef::newtype(lib.ty.env, url_ty, &[]);
        def.push(lib.heap.intern_symbol("Url"), url);

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype BaseUrl = Url;
        let base_url_ty = lib.ty.opaque("::core::url::BaseUrl", url_ty);
        let base_url = ItemDef::newtype(lib.ty.env, base_url_ty, &[]);
        def.push(lib.heap.intern_symbol("BaseUrl"), base_url);

        def
    }
}
