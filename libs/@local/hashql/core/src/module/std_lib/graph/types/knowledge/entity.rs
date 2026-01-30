use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule, core::option::option},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Entity {
    _dependencies: (
        std_lib::core::uuid::Uuid,
        std_lib::graph::types::principal::actor_group::web::Web,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for Entity {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("entity")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // newtype EntityUuid = Uuid;
        let uuid_ty = lib
            .manifest::<std_lib::core::uuid::Uuid>()
            .expect_newtype(heap.intern_symbol("Uuid"));
        let entity_uuid_ty = lib
            .ty
            .opaque("::graph::types::knowledge::entity::EntityUuid", uuid_ty.id);
        def.push(
            heap.intern_symbol("EntityUuid"),
            ItemDef::newtype(lib.ty.env, entity_uuid_ty, &[]),
        );

        // newtype DraftId = Uuid;
        let draft_id_ty = lib
            .ty
            .opaque("::graph::types::knowledge::entity::DraftId", uuid_ty.id);
        def.push(
            heap.intern_symbol("DraftId"),
            ItemDef::newtype(lib.ty.env, draft_id_ty, &[]),
        );

        // newtype EntityEditionId = Uuid;
        let entity_edition_id_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityEditionId",
            uuid_ty.id,
        );
        def.push(
            heap.intern_symbol("EntityEditionId"),
            ItemDef::newtype(lib.ty.env, entity_edition_id_ty, &[]),
        );

        // newtype EntityId = (web_id: WebId, entity_uuid: EntityUuid, draft_id: Option<DraftId>)
        let web_id = lib
            .manifest::<std_lib::graph::types::principal::actor_group::web::Web>()
            .expect_newtype(heap.intern_symbol("WebId"));
        let entity_id_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityId",
            lib.ty.r#struct([
                ("web_id", web_id.id),
                ("entity_uuid", entity_uuid_ty),
                ("draft_id", option(lib, draft_id_ty)),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityId"),
            ItemDef::newtype(lib.ty.env, entity_id_ty, &[]),
        );

        // newtype EntityRecordId = (entity_id: EntityId, edition_id: EntityEditionId)
        let entity_record_id_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityRecordId",
            lib.ty.r#struct([
                ("entity_id", entity_id_ty),
                ("edition_id", entity_edition_id_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityRecordId"),
            ItemDef::newtype(lib.ty.env, entity_record_id_ty, &[]),
        );

        // newtype LinkData = (left_entity_id: EntityId, right_entity_id: EntityId)
        let link_data_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::LinkData",
            lib.ty.r#struct([
                ("left_entity_id", entity_id_ty),
                ("right_entity_id", entity_id_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("LinkData"),
            ItemDef::newtype(lib.ty.env, link_data_ty, &[]),
        );

        // newtype Entity<T> = (id: EntityRecordId, properties: T, link_data: Option<LinkData>)
        let t_arg = lib.ty.fresh_argument("T");
        let t_ref = lib.ty.hydrate_argument(t_arg);
        let t_param = lib.ty.param(t_arg);
        let entity_ty = lib.ty.generic(
            [t_arg],
            lib.ty.opaque(
                sym::path::Entity,
                lib.ty.r#struct([
                    ("id", entity_record_id_ty),
                    ("properties", t_param),
                    ("link_data", option(lib, link_data_ty)),
                ]),
            ),
        );
        def.push(
            heap.intern_symbol("Entity"),
            ItemDef::newtype(lib.ty.env, entity_ty, &[t_ref]),
        );

        def
    }
}
