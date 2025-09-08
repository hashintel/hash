pub(in crate::module::std_lib) mod entity_type;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Ontology {
    _dependencies: (std_lib::core::url::Url,),
}

impl<'heap> StandardLibraryModule<'heap> for Ontology {
    type Children = (self::entity_type::EntityType,);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("ontology")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // newtype OntologyTypeVersion = String;
        let ontology_type_version_ty = lib
            .ty
            .opaque("::graph::ontology::OntologyTypeVersion", lib.ty.string());
        def.push(
            heap.intern_symbol("OntologyTypeVersion"),
            ItemDef::newtype(lib.ty.env, ontology_type_version_ty, &[]),
        );

        let url_ty = lib
            .manifest::<std_lib::core::url::Url>()
            .expect_newtype(heap.intern_symbol("Url"))
            .id;

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype BaseUrl = Url;
        let base_url_ty = lib.ty.opaque("::graph::types::ontology::BaseUrl", url_ty);
        let base_url = ItemDef::newtype(lib.ty.env, base_url_ty, &[]);
        def.push(heap.intern_symbol("BaseUrl"), base_url);

        // newtype VersionedUrl = (base_url: BaseUrl, version: OntologyTypeVersion);
        let versioned_url_ty = lib.ty.opaque(
            "::graph::types::ontology::VersionedUrl",
            lib.ty.r#struct([
                ("base_url", base_url_ty),
                ("version", ontology_type_version_ty),
            ]),
        );
        let versioned_url = ItemDef::newtype(lib.ty.env, versioned_url_ty, &[]);
        def.push(lib.heap.intern_symbol("VersionedUrl"), versioned_url);

        def
    }
}
