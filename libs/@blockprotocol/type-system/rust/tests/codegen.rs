use std::{fs, io};

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use type_system::{knowledge, ontology, principal};

#[test]
fn index() -> io::Result<()> {
    let mut collection = TypeCollection::default();

    // Principal types
    collection.make_branded::<principal::actor::ActorEntityUuid>();
    collection.make_branded::<principal::actor::UserId>();
    collection.make_branded::<principal::actor::MachineId>();
    collection.make_branded::<principal::actor::AiId>();
    collection.make_branded::<principal::actor_group::ActorGroupEntityUuid>();
    collection.make_branded::<principal::actor_group::WebId>();
    collection.make_branded::<principal::actor_group::TeamId>();
    collection.make_branded::<principal::role::WebRoleId>();
    collection.make_branded::<principal::role::TeamRoleId>();

    // Ontology types
    collection.make_branded::<ontology::id::BaseUrl>();
    collection.make_branded::<ontology::id::OntologyTypeVersion>();

    // Knowledge types
    collection.make_branded::<knowledge::entity::id::EntityUuid>();
    collection.make_branded::<knowledge::entity::id::DraftId>();
    collection.make_branded::<knowledge::entity::id::EntityEditionId>();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    generator.add_import_declaration("@rust/hash-codec/types", ["Real"]);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("type_system") {
            generator.add_type_declaration_by_id(type_id);
        }
    }

    insta::with_settings!({
        description => "Generated TS types",
        omit_expression => true,
        snapshot_path => "../types",
        prepend_module_to_snapshot => false,
    }, {
        insta::assert_binary_snapshot!(".d.ts", generator.write().into_bytes());
    });

    // We require a `.js` file as otherwise `tsc` won't find the `.d.ts` file
    let _: fs::File = fs::File::options()
        .create(true)
        .write(true)
        .truncate(true)
        .open("types/index.snap.js")?;

    Ok(())
}
