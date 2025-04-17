use scc::HashSet;

use super::{
    Type, TypeId,
    kind::{TypeKind, primitive::PrimitiveType},
};
use crate::{arena::concurrent::ConcurrentArena, heap::Heap};

pub struct Interner<'heap> {
    kinds: HashSet<&'heap TypeKind, foldhash::fast::RandomState>,
    types: ConcurrentArena<Type<'heap>>,
}

impl<'heap> Interner<'heap> {
    fn prefill(&self, heap: &'heap Heap) {
        self.kinds
            .insert(heap.alloc(TypeKind::Primitive(PrimitiveType::Number)))
            .expect("number should be unique");
        self.kinds
            .insert(heap.alloc(TypeKind::Primitive(PrimitiveType::Integer)))
            .expect("integer should be unique");
        self.kinds
            .insert(heap.alloc(TypeKind::Primitive(PrimitiveType::String)))
            .expect("string should be unique");
        self.kinds
            .insert(heap.alloc(TypeKind::Primitive(PrimitiveType::Boolean)))
            .expect("boolean should be unique");
        self.kinds
            .insert(heap.alloc(TypeKind::Primitive(PrimitiveType::Null)))
            .expect("null should be unique");

        self.kinds
            .insert(heap.alloc(TypeKind::Never))
            .expect("never should be unique");
        self.kinds
            .insert(heap.alloc(TypeKind::Unknown))
            .expect("unknown should be unique");
        self.kinds
            .insert(heap.alloc(TypeKind::Infer))
            .expect("infer should be unique");
    }

    pub fn intern(
        &self,
        kind: TypeKind,
        with: impl FnOnce(TypeKind) -> &'heap TypeKind,
    ) -> &'heap TypeKind {
        if let Some(kind) = self.kinds.read(&kind, |kind| *kind) {
            kind
        } else {
            let kind = with(kind);
            self.kinds.insert(kind);
            kind
        }
    }

    pub fn alloc(&self, with: impl FnOnce(TypeId) -> Type<'heap>) -> TypeId {
        self.types.push_with(with)
    }
}
