extern crate alloc;

mod enums;

use std::process::ExitCode;

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use insta::assert_snapshot;
use libtest_mimic::{Arguments, Trial};

#[derive(Debug)]
pub enum CodegenTarget {
    Typescript,
}

fn main() -> ExitCode {
    let args = Arguments::from_args();

    let targets = [CodegenTarget::Typescript];

    let mut collection = TypeCollection::default();
    collection.register::<enums::ExternallyTaggedEnum>();
    collection.register::<enums::InternallyTaggedEnum>();
    collection.register::<enums::AdjacentlyTaggedEnum>();
    collection.register::<enums::UntaggedEnum>();
    let names = collection
        .iter()
        .map(|(name, _)| name.to_owned())
        .collect::<Vec<_>>();

    let settings = TypeScriptGeneratorSettings::default();
    let generator = TypeScriptGenerator::new(&settings, collection);

    let mut tests = Vec::new();
    for name in &names {
        for target in &targets {
            let test_name = format!("{name}::{target:?}");
            let generated = generator.generate(name);
            tests.push(Trial::test(test_name.clone(), move || {
                assert_snapshot!(test_name, generated);
                Ok(())
            }));
        }
    }

    libtest_mimic::run(&args, tests).exit_code()
}
