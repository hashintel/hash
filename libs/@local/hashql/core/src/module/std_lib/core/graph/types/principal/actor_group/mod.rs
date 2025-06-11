pub(in crate::module::std_lib) mod web;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct ActorGroup {
    _dependencies: (std_lib::core::uuid::Uuid,),
}

impl<'heap> StandardLibraryModule<'heap> for ActorGroup {
    type Children = (self::web::Web,);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("actor_group")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // newtype ActorGroupEntityUuid = EntityUuid;
        // (we just set it to Uuid to avoid any cycles)
        // see: https://linear.app/hash/issue/H-4616/hashql-use-expression-hoisting
        // see: https://linear.app/hash/issue/H-4735/hashql-convert-rust-types-into-hashql-types
        let uuid_ty = lib
            .manifest::<std_lib::core::uuid::Uuid>()
            .expect_newtype(heap.intern_symbol("Uuid"));
        let entity_uuid_ty = lib.ty.opaque(
            "::core::graph::types::principal::actor_group::ActorGroupEntityUuid",
            uuid_ty.id,
        );
        def.push(
            heap.intern_symbol("ActorGroupEntityUuid"),
            ItemDef::newtype(lib.ty.env, entity_uuid_ty, &[]),
        );

        def
    }
}
