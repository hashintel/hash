use crate::{
    heap::Heap,
    module::std_lib::{self, ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Url {
    _dependencies: (std_lib::core::graph::types::ontology::Ontology,),
}

impl<'heap> StandardLibraryModule<'heap> for Url {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("url")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Url = String;
        let url_ty = lib.ty.opaque("::core::url::Url", lib.ty.string());
        let url = ItemDef::newtype(lib.ty.env, url_ty, &[]);
        def.push(heap.intern_symbol("Url"), url);

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype BaseUrl = Url;
        let base_url_ty = lib.ty.opaque("::core::url::BaseUrl", url_ty);
        let base_url = ItemDef::newtype(lib.ty.env, base_url_ty, &[]);
        def.push(heap.intern_symbol("BaseUrl"), base_url);

        // newtype VersionedUrl = (base_url: BaseUrl, version: OntologyTypeVersion);
        let ontology_type_version = lib
            .manifest::<std_lib::core::graph::types::ontology::Ontology>()
            .expect_newtype(heap.intern_symbol("OntologyTypeVersion"));
        let versioned_url_ty = lib.ty.opaque(
            "::core::url::VersionedUrl",
            lib.ty.r#struct([
                ("base_url", base_url_ty),
                ("version", ontology_type_version.id),
            ]),
        );
        let versioned_url = ItemDef::newtype(lib.ty.env, versioned_url_ty, &[]);
        def.push(lib.heap.intern_symbol("VersionedUrl"), versioned_url);

        def
    }
}
