extern crate alloc;

mod enums;
mod lists;
mod maps;
mod structs;
mod tuples;

use alloc::borrow::Cow;
use std::process::ExitCode;

use hash_codegen::{
    TypeCollection,
    definitions::TypeId,
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
    collection.register::<structs::StructSingleSkipped>();
    collection.register::<structs::StructDoubleSkipped>();
    collection.register::<structs::StructMultipleSkipped>();
    collection.register::<structs::StructUnnamedSingleSkipped>();
    collection.register::<structs::StructUnnamedDoubleSkipped>();
    collection.register::<structs::StructUnnamedMultipleSkipped>();

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

    // We currently have to manually specify the branded types
    collection.register_branded::<principal::actor::UserId>();
    collection.register_branded::<principal::actor::MachineId>();
    collection.register_branded::<principal::actor::AiId>();
    collection.register_branded::<principal::actor_group::WebId>();
    collection.register_branded::<principal::actor_group::TeamId>();
    collection.register_branded::<principal::role::WebRoleId>();
    collection.register_branded::<principal::role::TeamRoleId>();
}

fn find_available_types() -> Vec<(TypeId, Cow<'static, str>)> {
    let mut all_types = TypeCollection::default();
    register_types(&mut all_types);
    all_types.register_transitive_types();

    all_types
        .iter()
        .map(|(type_id, _, def)| (type_id, def.name.clone()))
        .collect::<Vec<_>>()
}
fn test_single_type(test_name: &str, type_id: TypeId) {
    let mut collection = TypeCollection::default();
    register_types(&mut collection);
    collection.register_transitive_types();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    generator.add_type_declaration_by_id(type_id);

    let generated = generator.write();
    assert_snapshot!(test_name, generated);
}

fn main() -> ExitCode {
    let targets = [CodegenTarget::Typescript];

    let mut all_types = TypeCollection::default();
    register_types(&mut all_types);
    all_types.register_transitive_types();

    let mut tests = Vec::new();
    for (type_id, name) in find_available_types() {
        for target in &targets {
            let test_name = format!("{name}::{target:?}");
            tests.push(Trial::test(test_name.clone(), move || {
                test_single_type(&test_name, type_id);
                Ok(())
            }));
        }
    }

    libtest_mimic::run(&Arguments::from_args(), tests).exit_code()
}
