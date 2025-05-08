//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::todo)]

use alloc::{borrow::Cow, collections::BTreeSet};
use core::any::type_name;
use std::collections::HashMap;

use specta::{SpectaID, datatype::NamedDataType};

use self::definitions::{TypeDefinition, TypeId};

extern crate alloc;

pub mod definitions;

pub mod typescript;

#[derive(Debug)]
pub struct TypeCollection {
    ordered_keys: BTreeSet<OrderedTypeId>,
    types: HashMap<TypeId, TypeDefinition>,
    collection: specta::TypeCollection,
}

impl Default for TypeCollection {
    fn default() -> Self {
        let collection = specta::export();

        let (ordered_keys, types) = collection
            .into_unsorted_iter()
            .map(|data_type| {
                (
                    OrderedTypeId::from(data_type),
                    (
                        TypeId::from_specta(data_type.sid()),
                        TypeDefinition::from_specta(data_type, &collection),
                    ),
                )
            })
            .collect();

        Self {
            ordered_keys,
            types,
            collection,
        }
    }
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct OrderedTypeId {
    module_path: Cow<'static, str>,
    name: Cow<'static, str>,
    id: SpectaID,
}

impl From<&NamedDataType> for OrderedTypeId {
    fn from(data_type: &NamedDataType) -> Self {
        Self {
            module_path: data_type.module_path().clone(),
            name: data_type.name().clone(),
            id: data_type.sid(),
        }
    }
}

impl TypeCollection {
    /// Registers a "branded" type `T` with the collection.
    ///
    /// Type branding allows creating a new, distinct type identity for an existing underlying type.
    /// This is useful for conveying specific semantic meaning or for instructing the code generator
    /// to handle this type differently, even if its structure is identical to another.
    ///
    /// For example, you might have a generic `String` type, but you want to treat `EmailString`
    /// (which is also a `String`) as a special type in your generated code (e.g., for client-side
    /// validation or specific UI rendering). `register_branded` facilitates this by marking the
    /// type such that `TypeDefinition::from_specta_branded` is used, allowing for custom logic
    /// based on this "brand".
    ///
    /// # Panics
    ///
    /// Panics if the type `T` is not registered in the collection. This can happen if the type is
    /// not linked to the binary or if the `specta::export` function did not include it in the
    /// collection.
    ///
    /// To avoid this panic, ensure that the type `T` is registered in the collection before calling
    /// this method. This can be done by using `extern crate` to include the crate that defines the
    /// type, or by ensuring that the type is used in the codebase in a way that it gets linked to
    /// the binary.
    // TODO: We want to allow specifying branding in the Rust code itself, rather than relying on
    //       the code generator to specify it.
    //   see https://linear.app/hash/issue/H-4514/allow-specifying-type-branding-in-rust-itself
    pub fn make_branded<T: specta::NamedType>(&mut self) {
        self.types
            .get_mut(&TypeId::from_specta(T::ID))
            .unwrap_or_else(|| {
                panic!(
                    "Type `{}` is not registered in the collection. Make sure, that the crate the \
                     type comes from is linked to the binary",
                    type_name::<T>()
                )
            })
            .branded = true;
    }

    pub fn iter(&self) -> impl Iterator<Item = (TypeId, &NamedDataType, &TypeDefinition)> {
        debug_assert_eq!(
            self.ordered_keys.len(),
            self.types.len(),
            "Bug: ordered keys and types should be the same length. The implementation forgot to \
             update one of them."
        );
        self.ordered_keys.iter().map(|key| {
            (
                TypeId::from_specta(key.id),
                self.collection
                    .get(key.id)
                    .unwrap_or_else(|| unreachable!()),
                &self.types[&TypeId::from_specta(key.id)],
            )
        })
    }

    pub fn get(&self, id: TypeId) -> Option<&TypeDefinition> {
        self.types.get(&id)
    }
}
