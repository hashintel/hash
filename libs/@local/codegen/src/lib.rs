//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::todo)]

use alloc::collections::BTreeMap;

use specta::datatype::NamedDataType;

use self::definitions::{TypeDefinition, TypeId};

extern crate alloc;

pub mod definitions;

pub mod typescript;

#[derive(Debug, Default)]
pub struct TypeCollection {
    types: BTreeMap<TypeId, TypeDefinition>,
    collection: specta::TypeCollection,
}

impl TypeCollection {
    pub fn register<T: specta::NamedType>(&mut self) {
        self.collection.register_mut::<T>();
        let data_type = self.collection.get(T::ID).unwrap_or_else(|| unreachable!());
        self.types.insert(
            TypeId::from_specta(T::ID),
            TypeDefinition::from_specta(data_type, &self.collection),
        );
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
    pub fn register_transitive_types(&mut self) -> usize {
        let mut num_added = 0;
        for data_type in self.collection.into_unsorted_iter() {
            self.types
                .entry(TypeId::from_specta(data_type.sid()))
                .or_insert_with(|| {
                    num_added += 1;
                    TypeDefinition::from_specta(data_type, &self.collection)
                });
        }
        num_added
    }

    pub fn iter(&self) -> impl Iterator<Item = (TypeId, &NamedDataType, &TypeDefinition)> {
        self.types.iter().map(|(id, def)| {
            (
                *id,
                self.collection
                    .get(id.to_specta())
                    .unwrap_or_else(|| unreachable!()),
                def,
            )
        })
    }

    pub fn get(&self, id: TypeId) -> Option<&TypeDefinition> {
        self.types.get(&id)
    }
}
