use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule, core::option::option},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Entity {
    _dependencies: (
        std_lib::core::uuid::Uuid,
        std_lib::core::graph::principal::actor_group::web::Web,
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
            .opaque("::graph::knowledge::entity::EntityUuid", uuid_ty.id);
        def.push(
            heap.intern_symbol("EntityUuid"),
            ItemDef::newtype(lib.ty.env, entity_uuid_ty, &[]),
        );

        // newtype DraftId = Uuid;
        let draft_id_ty = lib
            .ty
            .opaque("::graph::knowledge::entity::DraftId", uuid_ty.id);
        def.push(
            heap.intern_symbol("DraftId"),
            ItemDef::newtype(lib.ty.env, draft_id_ty, &[]),
        );

        // newtype EntityId = (web_id: WebId, entity_uuid: EntityUuid, draft_id: Option<DraftId>)
        let web_id = lib
            .manifest::<std_lib::core::graph::principal::actor_group::web::Web>()
            .expect_newtype(heap.intern_symbol("WebId"));
        let entity_id_ty = lib.ty.opaque(
            "::graph::knowledge::entity::EntityId",
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

        def
    }
}
