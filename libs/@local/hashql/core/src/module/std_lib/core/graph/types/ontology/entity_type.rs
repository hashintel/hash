use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule, core::option::option},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct EntityType {
    _dependencies: (
        std_lib::core::graph::types::principal::actor_group::web::Web,
        std_lib::core::graph::types::ontology::Ontology,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for EntityType {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("entity_type")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // newtype EntityTypeMetadata = (web_id: Option<WebId>)
        let web_id = lib
            .manifest::<std_lib::core::graph::types::principal::actor_group::web::Web>()
            .expect_newtype(heap.intern_symbol("WebId"));
        let entity_type_metadata_ty = lib.ty.opaque(
            "::core::graph::types::ontology::entity_type::EntityTypeMetadata",
            lib.ty.r#struct([("web_id", option(lib, web_id.id))]),
        );
        def.push(
            heap.intern_symbol("EntityTypeMetadata"),
            ItemDef::newtype(lib.ty.env, entity_type_metadata_ty, &[]),
        );

        // newtype EntityType = (id: VersionedUrl, metadata: EntityTypeMetadata)
        let versioned_url = lib
            .manifest::<std_lib::core::graph::types::ontology::Ontology>()
            .expect_newtype(heap.intern_symbol("VersionedUrl"));
        let entity_id_ty = lib.ty.opaque(
            "::core::graph::types::ontology::entity_type::EntityType",
            lib.ty.r#struct([
                ("id", versioned_url.id),
                ("metadata", entity_type_metadata_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityType"),
            ItemDef::newtype(lib.ty.env, entity_id_ty, &[]),
        );

        def
    }
}
