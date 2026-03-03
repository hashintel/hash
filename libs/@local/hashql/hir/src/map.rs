//! Auxiliary data about HIR nodes.
//!
//! This module provides data structures for tracking type information and generic
//! arguments associated with HIR (High-level Intermediate Representation) nodes.

use hashql_core::{
    id::Id as _,
    intern::Interned,
    module::locals::TypeDef,
    r#type::{TypeId, kind::generic::GenericArgumentReference},
};

use crate::node::{HirId, HirIdMap, HirIdVec};

/// All auxiliary data about a HIR node.
#[derive(Debug)]
pub struct HirInfo<'heap> {
    /// The resolved type identifier for this HIR node.
    pub type_id: TypeId,

    /// The resolved type identifier for this HIR node after monomorphization.
    pub monomorphized_type_id: Option<TypeId>,

    /// Generic type arguments applied to this node, if any.
    ///
    /// This is [`None`] when no type arguments are specified.
    pub type_arguments: Option<Interned<'heap, [GenericArgumentReference<'heap>]>>,
}

/// Efficient storage and retrieval of auxiliary data for HIR nodes.
///
/// This structure maintains mappings between [`HirId`] identifiers and their
/// associated auxiliary data.
#[derive(Debug)]
pub struct HirMap<'heap> {
    /// Dense storage for type IDs, indexed by HIR node ID.
    types: HirIdVec<TypeId>,
    /// Sparse storage for monomorphized type IDs, indexed by HIR node ID.
    monomorphized_types: HirIdMap<TypeId>,
    /// Sparse storage for generic type arguments, only populated for nodes that have them.
    types_arguments: HirIdMap<Interned<'heap, [GenericArgumentReference<'heap>]>>,
}

impl<'heap> HirMap<'heap> {
    /// Creates a new empty auxiliary data map.
    #[must_use]
    pub fn new() -> Self {
        HirMap {
            types: HirIdVec::new(),
            monomorphized_types: HirIdMap::default(),
            types_arguments: HirIdMap::default(),
        }
    }

    /// Retrieves the type ID associated with the given HIR node.
    ///
    /// Returns the [`TypeId`] that was previously stored for this node, or
    /// [`TypeId::PLACEHOLDER`] if no data has been assigned yet.
    #[inline]
    #[must_use]
    pub fn type_id(&self, id: HirId) -> TypeId {
        self.types[id]
    }

    #[inline]
    #[must_use]
    pub fn monomorphized_type_id(&self, id: HirId) -> TypeId {
        self.monomorphized_types
            .get(&id)
            .copied()
            .unwrap_or_else(|| self.type_id(id))
    }

    /// Associates a type ID with the specified HIR node.
    ///
    /// If the internal storage is not large enough to accommodate the given ID,
    /// it will be expanded and filled with placeholder values up to that point.
    pub fn insert_type_id(&mut self, id: HirId, type_id: TypeId) {
        *self.types.fill_until(id, || TypeId::PLACEHOLDER) = type_id;
    }

    /// Associates a monomorphized type ID with the specified HIR node.
    ///
    /// If the internal storage is not large enough to accommodate the given ID,
    /// it will be expanded and filled with placeholder values up to that point.
    pub fn insert_monomorphized_type_id(&mut self, id: HirId, monomorphized_type_id: TypeId) {
        self.monomorphized_types.insert(id, monomorphized_type_id);
    }

    /// Pre-populates the storage up to the specified bound.
    ///
    /// This method ensures that all HIR IDs up to (but not including) the bound
    /// have entries in the storage, filled with placeholder values if necessary.
    pub fn populate(&mut self, bound: HirId) {
        let Some(prev) = bound.prev() else {
            // length of `0`, nothing to fill
            return;
        };

        self.types.fill_until(prev, || TypeId::PLACEHOLDER);
    }

    /// Retrieves the complete type definition for the given HIR node.
    ///
    /// Returns a [`TypeDef`] containing both the type ID and generic arguments
    /// associated with the specified node.
    ///
    /// # Panics
    ///
    /// Panics if the HIR node does not have associated generic arguments in the map.
    /// Use [`get_type_arguments`](Self::get_type_arguments) first to check if arguments exist.
    #[inline]
    #[must_use]
    pub fn type_def(&self, id: HirId) -> TypeDef<'heap> {
        TypeDef {
            id: self.type_id(id),
            arguments: self.types_arguments[&id],
        }
    }

    /// Stores a complete definition for the specified HIR node.
    pub fn insert_type_def(&mut self, id: HirId, def: TypeDef<'heap>) {
        self.insert_type_id(id, def.id);
        self.types_arguments.insert(id, def.arguments);
    }

    /// Stores auxiliary data for the specified node.
    pub fn insert(
        &mut self,
        id: HirId,
        HirInfo {
            type_id,
            monomorphized_type_id,
            type_arguments,
        }: HirInfo<'heap>,
    ) {
        self.insert_type_id(id, type_id);

        if let Some(monomorphized_type_id) = monomorphized_type_id {
            self.insert_monomorphized_type_id(id, monomorphized_type_id);
        }

        if let Some(type_arguments) = type_arguments {
            self.types_arguments.insert(id, type_arguments);
        }
    }

    /// Retrieves the generic type arguments for the specified HIR node, if any.
    ///
    /// Returns [`Some`] with the interned generic arguments if the node has them,
    /// or [`None`] if the node has no generic arguments or hasn't been populated yet.
    #[must_use]
    pub fn get_type_arguments(
        &self,
        id: HirId,
    ) -> Option<Interned<'heap, [GenericArgumentReference<'heap>]>> {
        self.types_arguments.get(&id).copied()
    }

    /// Copies auxiliary data from one HIR node to another.
    pub fn copy_to(&mut self, from: HirId, to: HirId) {
        if let Some(types_arguments) = self.types_arguments.get(&from).copied() {
            self.types_arguments.insert(to, types_arguments);
        }

        let source = self.types[from];
        *self.types.fill_until(to, || TypeId::PLACEHOLDER) = source;
    }
}

impl Default for HirMap<'_> {
    fn default() -> Self {
        Self::new()
    }
}
