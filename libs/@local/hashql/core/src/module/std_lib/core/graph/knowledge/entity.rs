use core::marker::PhantomData;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Entity {
    dependencies: PhantomData<(std_lib::core::uuid::Uuid,)>,
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

        def
    }
}
