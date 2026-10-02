use core::alloc::Allocator;

use crate::{
    module::{
        locals::TypeDef,
        std_lib::{
            self, CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
            core::{func, option::types::option},
            decl,
        },
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Entity {
    _dependencies: (
        std_lib::graph::types::knowledge::entity::Entity,
        std_lib::graph::types::ontology::Ontology,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for Entity {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::GraphEntity;

    fn name() -> Symbol<'heap> {
        sym::entity
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let mut entity_ty = cache
            .request::<std_lib::graph::types::knowledge::entity::Entity>(context)
            .expect_newtype(sym::Entity);
        entity_ty.instantiate(&mut context.instantiate);

        let versioned_url_ty = cache
            .request::<std_lib::graph::types::ontology::Ontology>(context)
            .expect_newtype(sym::VersionedUrl);

        let json_path_ty = cache
            .request::<std_lib::core::json::Json>(context)
            .expect_type(sym::JsonPath);

        // `is_of_type<T>(entity: Entity<T>, depth: Integer, type: VersionedUrl) -> Boolean`
        // see: https://linear.app/hash/issue/H-4741/hashql-support-for-type-guards
        // see: https://linear.app/hash/issue/H-4742/hashql-allow-is-of-type-to-be-queried-using-an-entitytype
        let decl = decl!(context;
            <T>(entity: context.ty.apply([(entity_ty.arguments[0].id, T)], entity_ty.id),
                depth: context.ty.integer(),
                type: versioned_url_ty.id
            ) -> context.ty.boolean()
        );

        func(
            &mut def,
            sym::path::graph::entity::is_of_type,
            [sym::is_of_type],
            decl,
        );

        // `property<T>(entity: Entity<T>, path: JsonPath) -> Option<?>`
        let decl = decl!(context;
            <T>(entity: context.ty.apply([(entity_ty.arguments[0].id, T)], entity_ty.id),
                path: json_path_ty.id
            ) -> option(&context.ty, context.ty.unknown())
        );

        func(
            &mut def,
            sym::path::graph::entity::property,
            [sym::property],
            decl,
        );

        def
    }
}
