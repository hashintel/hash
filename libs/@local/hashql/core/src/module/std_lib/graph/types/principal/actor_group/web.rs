use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(crate) mod types {
    use crate::{
        module::std_lib,
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    pub(crate) struct WebIdDependencies {
        pub actor_group_entity_uuid: TypeId,
    }

    pub(crate) fn web_id(ty: &TypeBuilder<'_, '_>, deps: Option<WebIdDependencies>) -> TypeId {
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

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("web")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype WebId = ActorGroupEntityUuid;
        let actor_group_entity_uuid_ty = lib
            .manifest::<std_lib::graph::types::principal::actor_group::ActorGroup>()
            .expect_newtype(sym::ActorGroupEntityUuid)
            .id;
        let web_id_ty = types::web_id(
            &lib.ty,
            Some(types::WebIdDependencies {
                actor_group_entity_uuid: actor_group_entity_uuid_ty,
            }),
        );
        def.push(sym::WebId, ItemDef::newtype(lib.ty.env, web_id_ty, &[]));

        def
    }
}
