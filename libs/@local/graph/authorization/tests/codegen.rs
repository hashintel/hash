use std::{fs, io};

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};
use hash_graph_authorization::policies;

#[test]
fn index() -> io::Result<()> {
    let mut collection = TypeCollection::default();
    collection.make_branded::<policies::PolicyId>();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    generator.add_import_declaration(
        "@blockprotocol/type-system-rs/types",
        [
            "ActorId",
            "ActorType",
            "ActorGroupId",
            "BaseUrl",
            "EntityUuid",
            "OntologyTypeVersion",
            "RoleId",
            "WebId",
        ],
    );
    generator.add_import_declaration("@blockprotocol/type-system-rs", ["VersionedUrl"]);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition
            .module
            .starts_with("hash_graph_authorization")
        {
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
