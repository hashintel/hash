extern crate alloc;

mod enums;
mod lists;
mod maps;
mod structs;
mod tuples;

use std::process::ExitCode;

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use insta::assert_snapshot;
use libtest_mimic::{Arguments, Trial};
use type_system::principal;

#[derive(Debug)]
pub enum CodegenTarget {
    Typescript,
}

fn register_types(collection: &mut TypeCollection) {
    // Register enums
    collection.register::<enums::EnumExternal>();
    collection.register::<enums::EnumInternal>();
    collection.register::<enums::EnumAdjacent>();
    collection.register::<enums::EnumUntagged>();

    // Register structs
    collection.register::<structs::StructUnit>();
    collection.register::<structs::StructUnnamedSingle>();
    collection.register::<structs::StructUnnamedDouble>();
    collection.register::<structs::StructUnnamedTriple>();
    collection.register::<structs::StructSimple>();
    collection.register::<structs::StructEmpty>();
    collection.register::<structs::StructOptional>();
    collection.register::<structs::StructNested>();
    collection.register::<structs::StructSimpleFlattened>();
    collection.register::<structs::StructMultipleFlattened>();
    collection.register::<structs::StructFlattenedEnum>();
    collection.register::<structs::StructNestedTypeFlattened>();
    collection.register::<structs::StructNestedInterfaceFlattened>();

    // Register lists
    collection.register::<lists::ListPrimitives>();
    collection.register::<lists::ListOptionals>();
    collection.register::<lists::ListNested>();
    collection.register::<lists::ListStructs>();
    collection.register::<lists::ListCollections>();

    // Register maps
    collection.register::<maps::MapStringKey>();
    collection.register::<maps::MapNumericKey>();
    collection.register::<maps::MapStructValue>();
    collection.register::<maps::MapEnumKey>();
    collection.register::<maps::MapNested>();
    collection.register::<maps::MapOptional>();

    // Register tuples
    collection.register::<tuples::TupleEmpty>();
    collection.register::<tuples::TupleSingle>();
    collection.register::<tuples::TupleDouble>();
    collection.register::<tuples::TupleMultiple>();
    collection.register::<tuples::TupleNested>();
    collection.register::<tuples::TupleOptional>();

    // Register a recursive type
    collection.register::<type_system::knowledge::PropertyValue>();

    // Register principals
    // Note, that transitive types can be completed by the codegen
    collection.register::<principal::Principal>();
    collection.register::<principal::PrincipalId>();
    collection.register::<principal::actor::ActorType>();
    collection.register::<principal::actor_group::ActorGroupType>();
    collection.register::<principal::role::RoleType>();
}

fn main() -> ExitCode {
    let args = Arguments::from_args();

    let targets = [CodegenTarget::Typescript];

    let mut collection = TypeCollection::default();
    register_types(&mut collection);
    collection.register_transitive_types();

    let types = collection
        .iter()
        .map(|(type_id, _, def)| (type_id, def.name.clone()))
        .collect::<Vec<_>>();

    let settings = TypeScriptGeneratorSettings::default();
    let generator = TypeScriptGenerator::new(&settings, collection);

    let mut tests = Vec::new();
    for (type_id, name) in types {
        for target in &targets {
            let test_name = format!("{name}::{target:?}");
            let generated = generator.generate(type_id);
            tests.push(Trial::test(test_name.clone(), move || {
                assert_snapshot!(test_name, generated);
                Ok(())
            }));
        }
    }

    libtest_mimic::run(&args, tests).exit_code()
}
