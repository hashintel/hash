pub mod web;

pub mod types {
    use crate::{
        module::std_lib,
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    pub struct ActorGroupEntityUuidDependencies {
        pub uuid: TypeId,
    }

    #[must_use]
    pub fn actor_group_entity_uuid(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<ActorGroupEntityUuidDependencies>,
    ) -> TypeId {
        let ActorGroupEntityUuidDependencies { uuid } =
            deps.unwrap_or_else(|| ActorGroupEntityUuidDependencies {
                uuid: std_lib::core::uuid::types::uuid(ty),
            });

        ty.opaque(sym::path::ActorGroupEntityUuid, uuid)
    }
}

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
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

        // newtype ActorGroupEntityUuid = EntityUuid;
        // (we just set it to Uuid to avoid any cycles)
        // see: https://linear.app/hash/issue/H-4616/hashql-use-expression-hoisting
        // see: https://linear.app/hash/issue/H-4735/hashql-convert-rust-types-into-hashql-types
        let uuid_ty = lib
            .manifest::<std_lib::core::uuid::Uuid>()
            .expect_newtype(sym::Uuid)
            .id;
        let actor_group_entity_uuid_ty = types::actor_group_entity_uuid(
            &lib.ty,
            Some(types::ActorGroupEntityUuidDependencies { uuid: uuid_ty }),
        );
        def.push(
            sym::ActorGroupEntityUuid,
            ItemDef::newtype(lib.ty.env, actor_group_entity_uuid_ty, &[]),
        );

        def
    }
}
