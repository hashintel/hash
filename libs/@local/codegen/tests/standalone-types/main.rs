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
    // We currently have to manually specify the branded types
    collection.make_branded::<principal::actor::UserId>();
    collection.make_branded::<principal::actor::MachineId>();
    collection.make_branded::<principal::actor::AiId>();
    collection.make_branded::<principal::actor_group::WebId>();
    collection.make_branded::<principal::actor_group::TeamId>();
    collection.make_branded::<principal::role::WebRoleId>();
    collection.make_branded::<principal::role::TeamRoleId>();
}

fn find_available_types() -> Vec<(TypeId, Cow<'static, str>)> {
    TypeCollection::default()
        .iter()
        .map(|(type_id, _, def)| (type_id, def.name.clone()))
        .collect::<Vec<_>>()
}
fn test_single_type(test_name: &str, type_id: TypeId) {
    let mut collection = TypeCollection::default();
    register_types(&mut collection);

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    generator.add_type_declaration_by_id(type_id);

    let generated = generator.write();
    assert_snapshot!(test_name, generated);
}

fn main() -> ExitCode {
    let targets = [CodegenTarget::Typescript];

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
