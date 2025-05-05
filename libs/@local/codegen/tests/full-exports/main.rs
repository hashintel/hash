use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use insta::assert_snapshot;

#[test]
fn type_system() {
    let mut collection = TypeCollection::default();
    collection.register::<type_system::principal::Principal>();
    collection.register_transitive_types();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("type_system") {
            generator.add_type_declaration_by_id(type_id);
        }
    }

    assert_snapshot!("type_system::Typescript", generator.write());
}

#[test]
fn depends_on_type_system() {
    #[derive(specta::Type)]
    #[expect(dead_code)]
    struct DependsOnTypeSystem {
        principal: type_system::principal::Principal,
    }

    let mut collection = TypeCollection::default();
    collection.register::<DependsOnTypeSystem>();
    collection.register_transitive_types();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("full_exports") {
            generator.add_type_declaration_by_id(type_id);
        }
    }

    assert_snapshot!("depends_on_type_system::Typescript", generator.write());
}
