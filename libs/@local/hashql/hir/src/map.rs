//! Auxiliary data about HIR nodes

use hashql_core::{
    id::Id,
    intern::Interned,
    module::locals::TypeDef,
    r#type::{TypeId, kind::generic::GenericArgumentReference},
};

use crate::node::{HirId, HirIdMap, HirIdVec};

#[derive(Debug)]
pub struct HirMap<'heap> {
    types: HirIdVec<TypeId>,
    types_arguments: HirIdMap<Interned<'heap, [GenericArgumentReference<'heap>]>>,
}

impl<'heap> HirMap<'heap> {
    pub fn new() -> Self {
        HirMap {
            types: HirIdVec::new(),
            types_arguments: HirIdMap::default(),
        }
    }

    #[inline]
    pub fn type_id(&self, id: HirId) -> TypeId {
        self.types[id]
    }

    pub fn insert_type_id(&mut self, id: HirId, type_id: TypeId) {
        *self.types.fill_until(id, || TypeId::PLACEHOLDER) = type_id;
    }

    pub fn populate(&mut self, bound: HirId) {
        self.types
            .fill_until(bound.prev().expect("bound must be larger than `0`"), || {
                TypeId::PLACEHOLDER
            });
    }

    pub fn type_def(&self, id: HirId) -> TypeDef<'heap> {
        TypeDef {
            id: self.type_id(id),
            arguments: self.types_arguments[&id],
        }
    }

    pub fn insert_type_def(&mut self, id: HirId, def: TypeDef<'heap>) {
        self.insert_type_id(id, def.id);
        self.types_arguments.insert(id, def.arguments);
    }

    pub fn get_type_arguments(
        &self,
        id: HirId,
    ) -> Option<Interned<'heap, [GenericArgumentReference<'heap>]>> {
        self.types_arguments.get(&id).copied()
    }

    pub fn transfer(&mut self, from: HirId, to: HirId) {
        if let Some(types_arguments) = self.types_arguments.get(&from).copied() {
            self.types_arguments.insert(to, types_arguments);
        }

        let source = self.types[from];
        *self.types.fill_until(to, || TypeId::PLACEHOLDER) = source;
    }
}
