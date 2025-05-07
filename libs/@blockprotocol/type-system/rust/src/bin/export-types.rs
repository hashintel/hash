use core::error::Error;
use std::{
    fs,
    io::{BufWriter, Write as _},
};

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use type_system::{knowledge, principal};

fn main() -> Result<(), Box<dyn Error>> {
    let mut collection = TypeCollection::default();

    // Principal types
    collection.register::<principal::Principal>();
    collection.register::<principal::PrincipalId>();
    collection.register::<principal::actor::ActorType>();
    collection.register::<principal::actor_group::ActorGroupType>();
    collection.register::<principal::role::RoleType>();

    // Knowledge types
    collection.register::<knowledge::value::PropertyValue>();

    // We currently have to manually specify the branded types
    collection.register_branded::<knowledge::entity::id::EntityUuid>();
    collection.register_branded::<knowledge::entity::id::DraftId>();
    collection.register_branded::<knowledge::entity::id::EntityEditionId>();

    collection.register_branded::<principal::actor::ActorEntityUuid>();
    collection.register_branded::<principal::actor::UserId>();
    collection.register_branded::<principal::actor::MachineId>();
    collection.register_branded::<principal::actor::AiId>();
    collection.register_branded::<principal::actor_group::ActorGroupEntityUuid>();
    collection.register_branded::<principal::actor_group::WebId>();
    collection.register_branded::<principal::actor_group::TeamId>();
    collection.register_branded::<principal::role::WebRoleId>();
    collection.register_branded::<principal::role::TeamRoleId>();

    collection.register_transitive_types();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    generator.add_import_declaration("@rust/hash-codec/types", ["Real"]);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("type_system") {
            generator.add_type_declaration_by_id(type_id);
        }
    }

    fs::create_dir_all("dist")?;
    // We require a `types.js` file as otherwise `tsc` won't find the `types.d.ts` file
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
