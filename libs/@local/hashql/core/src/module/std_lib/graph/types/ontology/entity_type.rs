use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        self, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
        core::option::types::option,
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

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // newtype EntityTypeMetadata = (web_id: Option<WebId>)
        let web_id = cache
            .request::<std_lib::graph::types::principal::actor_group::web::Web>(context)
            .expect_newtype(sym::WebId);
        let entity_type_metadata_ty = context.ty.opaque(
            sym::path::graph::types::ontology::entity_type::EntityTypeMetadata,
            context
                .ty
                .r#struct([(sym::web_id, option(&context.ty, web_id.id))]),
        );
        def.push(
            sym::EntityTypeMetadata,
            ItemDef::newtype(context.ty.env, entity_type_metadata_ty, &[]),
        );

        // newtype EntityType = (id: VersionedUrl, metadata: EntityTypeMetadata)
        let versioned_url = cache
            .request::<std_lib::graph::types::ontology::Ontology>(context)
            .expect_newtype(sym::VersionedUrl);
        let entity_id_ty = context.ty.opaque(
            sym::path::graph::types::ontology::entity_type::EntityType,
            context.ty.r#struct([
                (sym::id, versioned_url.id),
                (sym::metadata, entity_type_metadata_ty),
            ]),
        );
        def.push(
            sym::EntityType,
            ItemDef::newtype(context.ty.env, entity_id_ty, &[]),
        );

        def
    }
}
