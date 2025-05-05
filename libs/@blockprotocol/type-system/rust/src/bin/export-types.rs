use core::error::Error;
use std::{
    fs,
    io::{BufWriter, Write as _},
};

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use type_system::principal;

fn main() -> Result<(), Box<dyn Error>> {
    let mut collection = TypeCollection::default();

    collection.register::<principal::Principal>();
    collection.register::<principal::PrincipalId>();
    collection.register::<principal::actor::ActorType>();
    collection.register::<principal::actor_group::ActorGroupType>();
    collection.register::<principal::role::RoleType>();

    collection.register_transitive_types();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("type_system") {
            generator.add_type_declaration_by_id(type_id);
        }
    }

    fs::create_dir_all("dist")?;
    fs::File::options()
        .create(true)
        .write(true)
        .truncate(true)
        .open("dist/types.js")?;
    BufWriter::new(
        fs::File::options()
            .create(true)
            .write(true)
            .truncate(true)
            .open("dist/types.d.ts")?,
    )
    .write_all(generator.write().as_bytes())?;

    Ok(())
}
