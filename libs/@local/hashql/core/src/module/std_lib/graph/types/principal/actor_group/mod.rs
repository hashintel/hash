use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        self, CacheId, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext,
        StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

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

pub(in crate::module::std_lib) struct ActorGroup {
    _dependencies: (std_lib::core::uuid::Uuid,),
}

impl<'heap> StandardLibraryModule<'heap> for ActorGroup {
    type Children = (self::web::Web,);

    const CACHE_ID: CacheId = CacheId::GraphTypesPrincipalActorGroup;

    fn name() -> Symbol<'heap> {
        sym::actor_group
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // newtype ActorGroupEntityUuid = EntityUuid;
        // (we just set it to Uuid to avoid any cycles)
        // see: https://linear.app/hash/issue/H-4616/hashql-use-expression-hoisting
        // see: https://linear.app/hash/issue/H-4735/hashql-convert-rust-types-into-hashql-types
        let uuid_ty = cache
            .request::<std_lib::core::uuid::Uuid>(context)
            .expect_newtype(sym::Uuid)
            .id;
        let actor_group_entity_uuid_ty = types::actor_group_entity_uuid(
            &context.ty,
            Some(types::ActorGroupEntityUuidDependencies { uuid: uuid_ty }),
        );
        def.push(
            sym::ActorGroupEntityUuid,
            ItemDef::newtype(context.ty.env, actor_group_entity_uuid_ty, &[]),
        );

        def
    }
}
