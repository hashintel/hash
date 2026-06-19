use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        self, CacheId, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext,
        StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub mod types {
    use crate::{
        module::std_lib,
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    pub struct WebIdDependencies {
        pub actor_group_entity_uuid: TypeId,
    }

    #[must_use]
    pub fn web_id(ty: &TypeBuilder<'_, '_>, deps: Option<WebIdDependencies>) -> TypeId {
        let WebIdDependencies {
            actor_group_entity_uuid,
        } = deps.unwrap_or_else(|| WebIdDependencies {
            actor_group_entity_uuid:
                std_lib::graph::types::principal::actor_group::types::actor_group_entity_uuid(
                    ty, None,
                ),
        });

        ty.opaque(sym::path::WebId, actor_group_entity_uuid)
    }
}

pub(in crate::module::std_lib) struct Web {
    _dependencies: (std_lib::graph::types::principal::actor_group::ActorGroup,),
}

impl<'heap> StandardLibraryModule<'heap> for Web {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::GraphTypesPrincipalActorGroupWeb;

    fn name() -> Symbol<'heap> {
        sym::web
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // newtype WebId = ActorGroupEntityUuid;
        let actor_group_entity_uuid_ty = cache
            .request::<std_lib::graph::types::principal::actor_group::ActorGroup>(context)
            .expect_newtype(sym::ActorGroupEntityUuid)
            .id;
        let web_id_ty = types::web_id(
            &context.ty,
            Some(types::WebIdDependencies {
                actor_group_entity_uuid: actor_group_entity_uuid_ty,
            }),
        );
        def.push(sym::WebId, ItemDef::newtype(context.ty.env, web_id_ty, &[]));

        def
    }
}
