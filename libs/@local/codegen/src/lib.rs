//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::todo)]

use alloc::{borrow::Cow, collections::BTreeSet};
use std::collections::HashMap;

use specta::{SpectaID, datatype::NamedDataType};

use self::definitions::{TypeDefinition, TypeId};

extern crate alloc;

pub mod definitions;

pub mod typescript;

#[derive(Debug, Default)]
pub struct TypeCollection {
    ordered_keys: BTreeSet<OrderedTypeId>,
    types: HashMap<TypeId, TypeDefinition>,
    collection: specta::TypeCollection,
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
    pub fn register<T: specta::NamedType>(&mut self) {
        self.collection.register_mut::<T>();
        let data_type = self.collection.get(T::ID).unwrap_or_else(|| unreachable!());
        self.ordered_keys.insert(OrderedTypeId::from(data_type));
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
