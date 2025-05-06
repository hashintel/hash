use core::error::Error;
use std::{
    fs,
    io::{BufWriter, Write as _},
};

use hash_codegen::{
    TypeCollection,
    typescript::{TypeScriptGenerator, TypeScriptGeneratorSettings},
};

fn main() -> Result<(), Box<dyn Error>> {
    let mut collection = TypeCollection::default();

    // Numeric types
    #[cfg(feature = "numeric")]
    {
        use hash_codec::numeric;
        collection.register::<numeric::Real>();
    }

    collection.register_transitive_types();

    let settings = TypeScriptGeneratorSettings::default();
    let mut generator = TypeScriptGenerator::new(&settings, &collection);

    for (type_id, _, type_definition) in collection.iter() {
        if type_definition.module.starts_with("hash_codec") {
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
