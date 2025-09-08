use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{
            self, ModuleDef, StandardLibraryModule,
            core::{func, option::option},
            decl,
        },
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Entity {
    _dependencies: (
        std_lib::graph::types::knowledge::entity::Entity,
        std_lib::graph::types::ontology::Ontology,
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

        let mut entity_ty = lib
            .manifest::<std_lib::graph::types::knowledge::entity::Entity>()
            .expect_newtype(heap.intern_symbol("Entity"));
        entity_ty.instantiate(&mut lib.instantiate);

        let versioned_url_ty = lib
            .manifest::<std_lib::graph::types::ontology::Ontology>()
            .expect_newtype(heap.intern_symbol("VersionedUrl"));

        let json_path_ty = lib
            .manifest::<std_lib::core::json::Json>()
            .expect_type(heap.intern_symbol("JsonPath"));

        // `is_of_type<T>(entity: Entity<T>, depth: Integer, type: VersionedUrl) -> Boolean`
        // see: https://linear.app/hash/issue/H-4741/hashql-support-for-type-guards
        // see: https://linear.app/hash/issue/H-4742/hashql-allow-is-of-type-to-be-queried-using-an-entitytype
        let decl = decl!(lib;
            <T>(entity: lib.ty.apply([(entity_ty.arguments[0].id, T)], entity_ty.id),
                depth: lib.ty.integer(),
                type: versioned_url_ty.id
            ) -> lib.ty.boolean()
        );

        func(lib, &mut def, "::graph::entity::is_of_type", &[], decl);

        // `property<T>(entity: Entity<T>, path: JsonPath) -> Option<?>`
        let decl = decl!(lib;
            <T>(entity: lib.ty.apply([(entity_ty.arguments[0].id, T)], entity_ty.id),
                path: json_path_ty.id
            ) -> option(lib, lib.ty.unknown())
        );

        func(lib, &mut def, "::graph::entity::property", &[], decl);

        def
    }
}
