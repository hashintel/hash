//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::todo)]

use alloc::borrow::Cow;
use std::collections::HashMap;

use specta::{SpectaID, datatype::NamedDataType};

use self::definitions::TypeDefinition;

extern crate alloc;

pub mod definitions;

pub mod typescript;

#[derive(Debug, Default)]
pub struct TypeCollection {
    types: HashMap<Cow<'static, str>, (SpectaID, TypeDefinition)>,
    collection: specta::TypeCollection,
    // collection: HashMap<Cow<'static, str>, Definition>,
}

impl TypeCollection {
    pub fn register<T: specta::NamedType>(&mut self) {
        self.collection.register_mut::<T>();
        let data_type = self.collection.get(T::ID).unwrap_or_else(|| unreachable!());
        self.types.insert(
            data_type.name().clone(),
            (
                data_type.sid(),
                TypeDefinition::from_specta(data_type, &self.collection),
            ),
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
    /// assert!(collection.iter().any(|(name, _)| name == "Inner"));
    /// ```
    pub fn register_transitive_types(&mut self) -> usize {
        let mut num_added = 0;
        for data_type in self.collection.into_unsorted_iter() {
            self.types
                .entry(data_type.name().clone())
                .or_insert_with(|| {
                    num_added += 1;
                    (
                        data_type.sid(),
                        TypeDefinition::from_specta(data_type, &self.collection),
                    )
                });
        }
        num_added
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, (&NamedDataType, &TypeDefinition))> {
        self.types.iter().map(|(name, (id, def))| {
            (
                name.as_ref(),
                (
                    self.collection.get(*id).unwrap_or_else(|| unreachable!()),
                    def,
                ),
            )
        })
    }
}
