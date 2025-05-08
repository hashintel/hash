//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::todo)]

use alloc::{borrow::Cow, collections::BTreeSet};
use std::collections::{HashMap, hash_map::Entry};

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
        let mut collection = Self {
            ordered_keys: BTreeSet::new(),
            types: HashMap::new(),
            collection: specta::export(),
        };
        collection.register_transitive_types();
        collection
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
    /// Type branding allows creating a new, distinct type identity for an
    /// existing underlying type. This is useful for conveying specific semantic
    /// meaning or for instructing the code generator to handle this type
    /// differently, even if its structure is identical to another.
    ///
    /// For example, you might have a generic `String` type, but you want to
    /// treat `EmailString` (which is also a `String`) as a special type
    /// in your generated code (e.g., for client-side validation or specific UI
    /// rendering). `register_branded` facilitates this by marking the type
    /// such that `TypeDefinition::from_specta_branded` is used, allowing
    /// for custom logic based on this "brand".
    // TODO: We want to allow specifying branding in the Rust code itself, rather than relying on
    //       the code generator to specify it.
    //   see https://linear.app/hash/issue/H-4514/allow-specifying-type-branding-in-rust-itself
    pub fn make_branded<T: specta::NamedType>(&mut self) {
        match self.types.entry(TypeId::from_specta(T::ID)) {
            Entry::Occupied(mut entry) => entry.get_mut().branded = true,
            Entry::Vacant(entry) => {
                self.collection.register_mut::<T>();
                let data_type = self.collection.get(T::ID).unwrap_or_else(|| unreachable!());
                self.ordered_keys.insert(OrderedTypeId::from(data_type));
                entry
                    .insert(TypeDefinition::from_specta(data_type, &self.collection))
                    .branded = true;
            }
        }
    }

    /// Registers transitive types that are not directly registered with the collection.
    ///
    /// # Example
    ///
    /// ```rust
    /// use hash_codegen::TypeCollection;
    ///
    /// #[derive(specta::Type)]
    /// struct Inner {
    ///     value: u32,
    /// }
    ///
    /// #[derive(specta::Type)]
    /// struct Outer {
    ///     inner: Inner,
    /// }
    ///
    /// let mut collection = TypeCollection::default();
    /// collection.register::<Outer>();
    /// let num_added = collection.register_transitive_types();
    ///
    /// assert_eq!(num_added, 1);
    /// assert!(
    ///     collection
    ///         .iter()
    ///         .any(|(_, _, type_def)| type_def.name == "Inner")
    /// );
    /// ```
    fn register_transitive_types(&mut self) -> usize {
        let mut num_added = 0;
        for data_type in self.collection.into_unsorted_iter() {
            self.types
                .entry(TypeId::from_specta(data_type.sid()))
                .or_insert_with(|| {
                    num_added += 1;
                    self.ordered_keys.insert(OrderedTypeId::from(data_type));
                    TypeDefinition::from_specta(data_type, &self.collection)
                });
        }
        num_added
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
