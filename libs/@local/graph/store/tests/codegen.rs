extern crate hash_graph_store;

use std::{fs, io, path::Path};

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};

#[test]
fn index() -> io::Result<()> {
    let collection = TypeCollection::default();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    generator.add_import_declaration(
        "@rust/hash-graph-authorization/types",
        ["ActionName", "Effect", "PrincipalConstraint"],
    );
    generator.add_import_declaration("@blockprotocol/type-system-rs/types", ["EntityEditionId"]);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("hash_graph_store") {
            generator.add_type_declaration_by_id(type_id);
        }
    }

    insta::with_settings!({
        description => "Generated TS types",
        omit_expression => true,
        snapshot_path => "../types",
        prepend_module_to_snapshot => false,
    }, {
        insta::assert_binary_snapshot!(
            ".d.ts",
            format!("// This file was generated from `{}`\n\n{}", file!(), generator.write()).into_bytes()
        );
    });

    // We require a `.js` file as otherwise `tsc` won't find the `.d.ts` file
    let _: fs::File = fs::File::options()
        .create(true)
        .write(true)
        .truncate(true)
        .open(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("types")
                .join("index.snap.js"),
        )?;

    Ok(())
}
