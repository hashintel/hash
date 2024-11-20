extern crate alloc;

use alloc::collections::{BTreeMap, btree_map::Entry};
use core::{error::Error, num::ParseIntError};
use std::{
    fs, io,
    os::unix::ffi::OsStrExt,
    path::{Path, PathBuf},
    sync::LazyLock,
};

use convert_case::{Case, Casing as _};
use proc_macro2::TokenStream;
use quote::{format_ident, quote};
use regex::Regex;
use sha2::{Digest, Sha256};
use syn::{LitStr, parse_macro_input};
use walkdir::{DirEntry, WalkDir};

pub(crate) fn crate_root() -> PathBuf {
    PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("Could not read crate root"))
}

#[derive(Debug, Clone)]
struct MigrationFile {
    module_path: PathBuf,
    name: String,
    number: u32,
    size: usize,
    digest: [u8; 32],
}

fn hash_file(path: impl AsRef<Path>, digest: &mut impl Digest) -> io::Result<usize> {
    let path = path.as_ref();
    let content = fs::read(path)?;
    digest.update(path.as_os_str().as_bytes());
    digest.update(&content);
    Ok(content.len())
}

fn hash_directory(path: impl AsRef<Path>, digest: &mut impl Digest) -> io::Result<usize> {
    WalkDir::new(path)
        .sort_by_file_name()
        .into_iter()
        .try_fold(0, |mut length, entry| {
            let entry = entry?;
            if !entry.file_type().is_dir() {
                length += hash_file(entry.path(), digest)?;
            }
            Ok(length)
        })
}

const BASE_REGEX: &str = r"^v(\d+)__(\w+)";
static DIRECTORY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new([BASE_REGEX, "$"].concat().as_str()).expect("regex should be valid")
});
static FILE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new([BASE_REGEX, ".rs$"].concat().as_str()).expect("regex should be valid")
});

#[derive(Debug, derive_more::Display, derive_more::Error, derive_more::From)]
enum ReadMigrationFileError {
    #[from]
    IoError(io::Error),
    #[display("missing file name, expected format: `v{{number}}__{{name}}.rs`")]
    MissingFileName,
    #[display("invalid file name `{_0}`. expected format: `v{{number}}__{{name}}.rs`")]
    InvalidFileName(#[error(ignore)] String),
    #[from]
    ParseIntError(ParseIntError),
    #[display("missing migration: {_0}")]
    MissingMigration(#[error(ignore)] u32),
    #[display("duplicate migration number {}: `{}` and `{}` have the same migration number", _0.number, _0.name, _1.name)]
    DuplicateMigration(#[error(ignore)] Box<MigrationFile>, Box<MigrationFile>),
}

/// Determines if an entry is a module path.
///
/// A module path is either a file or a directory which contains a `mod.rs` file.
///
/// This makes sure, that files with an invalid names are reported and directories with an adjacent
/// module entry file are ignored (the module file itself will be used as the entry point for the
/// module).
fn is_module_path(entry: &DirEntry) -> bool {
    if entry.file_type().is_dir() {
        entry.path().join("mod.rs").exists()
    } else {
        true
    }
}

/// Reads the migration file at the given path.
///
/// There are two ways how a migration file can be structured:
/// - A file with the format `v{{number}}__{{name}}.rs` and optional additional files in the
///   `v{{number}}__{{name}}` directory
/// - A directory with the format `v{{number}}__{{name}}` containing a `mod.rs` file
///
/// The migration file is read and the content of the module is hashed using SHA-256.
///
/// # Errors
///
/// This function will return an error if the file name is not in the expected format or if the file
/// could not be read.
fn read_migration_file(path: impl AsRef<Path>) -> Result<MigrationFile, ReadMigrationFileError> {
    let path = path.as_ref();
    let file_name = path
        .file_name()
        .ok_or(ReadMigrationFileError::MissingFileName)?
        .to_string_lossy();

    if !path.is_dir() {
        if let Some(captures) = FILE_REGEX.captures(&file_name) {
            let mut digest = Sha256::new();
            let mut size = hash_file(path, &mut digest)?;
            if let Some((parent, file_stem)) = path.parent().zip(path.file_stem()) {
                let module_path = parent.join(file_stem);
                if module_path.exists() {
                    size += hash_directory(module_path, &mut digest)?;
                }
            }

            Ok(MigrationFile {
                module_path: path.to_path_buf(),
                number: captures
                    .get(1)
                    .ok_or_else(|| {
                        ReadMigrationFileError::InvalidFileName(file_name.clone().into_owned())
                    })?
                    .as_str()
                    .parse()?,
                name: captures
                    .get(2)
                    .ok_or_else(|| {
                        ReadMigrationFileError::InvalidFileName(file_name.clone().into_owned())
                    })?
                    .as_str()
                    .to_owned(),
                size,
                digest: digest.finalize().into(),
            })
        } else {
            Err(ReadMigrationFileError::InvalidFileName(
                file_name.into_owned(),
            ))
        }
    } else if let Some(captures) = DIRECTORY_REGEX.captures(&file_name) {
        let module_path = path.join("mod.rs");
        let mut digest = Sha256::new();
        let size = hash_directory(path, &mut digest)?;

        Ok(MigrationFile {
            module_path,
            number: captures
                .get(1)
                .ok_or_else(|| {
                    ReadMigrationFileError::InvalidFileName(file_name.clone().into_owned())
                })?
                .as_str()
                .parse()?,
            name: captures
                .get(2)
                .expect("capture should contain migration name")
                .as_str()
                .to_owned(),
            size,
            digest: digest.finalize().into(),
        })
    } else {
        Err(ReadMigrationFileError::InvalidFileName(
            file_name.into_owned(),
        ))
    }
}

fn find_migration_files(
    folder: impl AsRef<Path>,
) -> impl Iterator<Item = Result<MigrationFile, ReadMigrationFileError>> {
    WalkDir::new(folder)
        .min_depth(1)
        .max_depth(1)
        .sort_by_file_name()
        .into_iter()
        .filter_map(Result::ok)
        .filter(is_module_path)
        .map(DirEntry::into_path)
        .map(read_migration_file)
}

struct EmbedMigrationsInput {
    location: PathBuf,
}

fn migration_list() -> TokenStream {
    quote! {
        struct Cons<H, T>(H, T);
        struct Nil;

        macro_rules! tuples {
            () => { Nil };
            ($head:expr) => { Cons($head, Nil) };
            ($head:expr, $($tail:tt)*) => {
                Cons($head, tuples![$($tail)*])
            };
        }

        #[derive(Debug)]
        pub struct MigrationDefinition<M> {
            pub migration: M,
            pub info: MigrationInfo,
        }

        impl<Head, Tail, C> MigrationList<C> for Cons<MigrationDefinition<Head>, Tail>
        where
            Head: Migration,
            Tail: MigrationList<C>,
            C: ContextProvider<Head::Context>,
        {
            async fn traverse(
                self,
                runner: &impl MigrationRunner,
                context: &mut C,
                direction: MigrationDirection,
            ) -> Result<(), Report<MigrationError>> {
                if direction == MigrationDirection::Down {
                    self.1.traverse(runner, context, direction).await?;
                    runner
                        .run_migration(self.0.migration, &self.0.info, context.provide())
                        .await
                } else {
                    runner
                        .run_migration(self.0.migration, &self.0.info, context.provide())
                        .await?;
                    self.1.traverse(runner, context, direction).await
                }
            }
        }

        // Empty-list implementation.
        impl<C> MigrationList<C> for Nil {
            async fn traverse(
                self,
                _: &impl MigrationRunner,
                _: &mut C,
                _: MigrationDirection,
            ) -> Result<(), Report<MigrationError>> {
                Ok(())
            }
        }
    }
}

fn embed_migrations_impl(input: &EmbedMigrationsInput) -> Result<TokenStream, Box<dyn Error>> {
    let included_dir = input.location.to_string_lossy();
    let mut migration_files = BTreeMap::new();
    for migration_file in find_migration_files(&input.location) {
        let migration_file = migration_file?;
        match migration_files.entry(migration_file.number) {
            Entry::Vacant(entry) => {
                entry.insert(migration_file);
            }
            Entry::Occupied(entry) => {
                return Err(ReadMigrationFileError::DuplicateMigration(
                    Box::new(migration_file),
                    Box::new(entry.get().clone()),
                )
                .into());
            }
        }
    }

    let mut mod_definitions = Vec::with_capacity(migration_files.len());
    let mut context_bounds = Vec::with_capacity(migration_files.len());
    let mut migration_definitions = Vec::with_capacity(migration_files.len());

    for (n, (number, migration_file)) in migration_files.into_iter().enumerate() {
        let expected_migration_number = u32::try_from(n + 1)?;
        if number != expected_migration_number {
            return Err(ReadMigrationFileError::MissingMigration(expected_migration_number).into());
        }

        let module_path = migration_file.module_path.to_string_lossy();
        let module_name = format_ident!("v{}_{}", number, migration_file.name);
        let struct_name = format_ident!("{}", migration_file.name.as_str().to_case(Case::Pascal));
        let name = migration_file.name;
        let size = migration_file.size;
        let digest = migration_file.digest;

        mod_definitions.push(quote!(
            #[path = #module_path]
            #[allow(unreachable_pub)]
            pub mod #module_name;
        ));

        if n == 0 {
            context_bounds.push(quote! {
                C: ::hash_graph_migrations::ContextProvider<<self::migrations::#module_name::#struct_name as ::hash_graph_migrations::Migration>::Context>
            });
        } else {
            context_bounds.push(quote! {
                + ::hash_graph_migrations::ContextProvider<<self::migrations::#module_name::#struct_name as ::hash_graph_migrations::Migration>::Context>
            });
        }

        migration_definitions.push(quote! {
            MigrationDefinition {
                migration: self::migrations::#module_name::#struct_name,
                info: ::hash_graph_migrations::MigrationInfo {
                    number: #number,
                    name: #name.into(),
                    size: #size,
                    digest: [#(#digest,)*].into(),
                }
            }
        });
    }

    let migration_list_impl = migration_list();

    Ok(quote! {
        mod migrations {
            use ::hash_graph_migrations::__export::{include_dir, Dir};

            // This enforces rebuilding the crate when the migrations change.
            const _: Dir = include_dir!(#included_dir);

            #(#mod_definitions)*
        }

        #[must_use]
        pub fn migrations<C>() -> impl ::hash_graph_migrations::MigrationList<C>
        where #(#context_bounds)*
        {
            use ::hash_graph_migrations::{
                __export::Report, ContextProvider, Migration, MigrationDirection,
                MigrationError, MigrationInfo, MigrationList, MigrationRunner,
            };

            #migration_list_impl
            tuples![#(#migration_definitions,)*]
        }
    })
}

/// Creates a function `migrations` that returns a list of all migrations.
///
/// The function returns a `MigrationList` of all migrations in the specified directory.
/// The directory is relative to the crate root.
///
/// There are two ways how a migration modules can be structured:
/// - A file with the format `v{{number}}__{{name}}.rs` and optional additional files in the
///   `v{{number}}__{{name}}` directory
/// - A directory with the format `v{{number}}__{{name}}` containing a `mod.rs` file
///
/// The number must start with `1` and be incremented by `1` for each migration (leading zeros are
/// allowed).
#[proc_macro]
pub fn embed_migrations(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let location = crate_root().join(parse_macro_input!(input as LitStr).value());

    match embed_migrations_impl(&EmbedMigrationsInput { location }) {
        Ok(output) => output.into(),
        Err(error) => {
            let error = error.to_string();
            quote! {
                compile_error!(#error);
            }
            .into()
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn embed_migrations() {
        println!(
            "{}",
            super::embed_migrations_impl(&super::EmbedMigrationsInput {
                location: std::path::PathBuf::from("../migrations/graph-migrations"),
            })
            .unwrap()
        );
    }
}
