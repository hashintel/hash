pub(in crate::module::std_lib) mod web;

use ::core::marker::PhantomData;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct ActorGroup {
    dependencies: PhantomData<(std_lib::core::uuid::Uuid,)>,
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
        let uuid_ty = lib
            .manifest::<std_lib::core::uuid::Uuid>()
            .expect_newtype(heap.intern_symbol("Uuid"));
        let entity_uuid_ty = lib.ty.opaque(
            "::graph::principal::actor_group::ActorGroupEntityUuid",
            uuid_ty.id,
        );
        def.push(
            heap.intern_symbol("ActorGroupEntityUuid"),
            ItemDef::newtype(lib.ty.env, entity_uuid_ty, &[]),
        );

        def
    }
}
