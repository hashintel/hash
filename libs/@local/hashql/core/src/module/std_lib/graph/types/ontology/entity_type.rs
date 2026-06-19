use crate::{
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule, core::option::types::option},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct EntityType {
    _dependencies: (
        std_lib::graph::types::principal::actor_group::web::Web,
        std_lib::graph::types::ontology::Ontology,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for EntityType {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::entity_type
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype EntityTypeMetadata = (web_id: Option<WebId>)
        let web_id = lib
            .manifest::<std_lib::graph::types::principal::actor_group::web::Web>()
            .expect_newtype(sym::WebId);
        let entity_type_metadata_ty = lib.ty.opaque(
            sym::path::graph::types::ontology::entity_type::EntityTypeMetadata,
            lib.ty.r#struct([(sym::web_id, option(&lib.ty, web_id.id))]),
        );
        def.push(
            sym::EntityTypeMetadata,
            ItemDef::newtype(lib.ty.env, entity_type_metadata_ty, &[]),
        );

        // newtype EntityType = (id: VersionedUrl, metadata: EntityTypeMetadata)
        let versioned_url = lib
            .manifest::<std_lib::graph::types::ontology::Ontology>()
            .expect_newtype(sym::VersionedUrl);
        let entity_id_ty = lib.ty.opaque(
            sym::path::graph::types::ontology::entity_type::EntityType,
            lib.ty.r#struct([
                (sym::id, versioned_url.id),
                (sym::metadata, entity_type_metadata_ty),
            ]),
        );
        def.push(
            sym::EntityType,
            ItemDef::newtype(lib.ty.env, entity_id_ty, &[]),
        );

        def
    }
}
