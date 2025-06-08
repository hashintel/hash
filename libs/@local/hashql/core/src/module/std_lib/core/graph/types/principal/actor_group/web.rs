use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Web {
    _dependencies: (std_lib::core::graph::types::principal::actor_group::ActorGroup,),
}

impl<'heap> StandardLibraryModule<'heap> for Web {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("web")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // newtype WebId = ActorGroupEntityUuid;
        let actor_group_entity_uuid_ty = lib
            .manifest::<std_lib::core::graph::types::principal::actor_group::ActorGroup>()
            .expect_newtype(heap.intern_symbol("ActorGroupEntityUuid"));
        let entity_uuid_ty = lib.ty.opaque(
            "::graph::principal::actor_group::web::WebId",
            actor_group_entity_uuid_ty.id,
        );
        def.push(
            heap.intern_symbol("WebId"),
            ItemDef::newtype(lib.ty.env, entity_uuid_ty, &[]),
        );

        def
    }
}
