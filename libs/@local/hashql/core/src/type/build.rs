use alloc::vec;
use core::{array, iter, slice};

use super::{
    PartialType, TypeId,
    environment::Environment,
    kind::{
        Apply, ClosureType, Generic, GenericArgument, Infer, IntersectionType, IntrinsicType,
        OpaqueType, Param, PrimitiveType, StructType, TupleType, TypeKind, UnionType,
        generic::{GenericArgumentId, GenericArgumentReference, GenericSubstitution},
        infer::HoleId,
        intrinsic::{DictType, ListType},
        r#struct::StructField,
    },
};
use crate::{collection::FastHashMap, intern::Provisioned, span::SpanId, symbol::Symbol};

pub trait BuildType {
    fn build(self, parent: Provisioned<TypeId>) -> TypeId;
}

impl<F> BuildType for F
where
    F: FnOnce(Provisioned<TypeId>) -> TypeId,
{
    fn build(self, parent: Provisioned<TypeId>) -> TypeId {
        self(parent)
    }
}

impl BuildType for TypeId {
    fn build(self, _: Provisioned<TypeId>) -> TypeId {
        self
    }
}

pub trait BuildIterator {
    type Item;
    type IntoIter: IntoIterator<Item = Self::Item>;

    fn build(self, parent: Provisioned<TypeId>) -> Self::IntoIter;
}

impl<F, I> BuildIterator for F
where
    F: FnOnce(Provisioned<TypeId>) -> I,
    I: IntoIterator,
{
    type IntoIter = I;
    type Item = I::Item;

    fn build(self, parent: Provisioned<TypeId>) -> Self::IntoIter {
        self(parent)
    }
}

impl<T, const N: usize> BuildIterator for [T; N] {
    type IntoIter = array::IntoIter<T, N>;
    type Item = T;

    fn build(self, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.into_iter()
    }
}

impl<T> BuildIterator for Vec<T> {
    type IntoIter = vec::IntoIter<T>;
    type Item = T;

    fn build(self, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.into_iter()
    }
}

impl<'slice, T> BuildIterator for &'slice [T]
where
    T: Clone,
{
    type IntoIter = iter::Cloned<slice::Iter<'slice, T>>;
    type Item = T;

    fn build(self, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.iter().cloned()
    }
}

pub struct TypeBuilder<'env, 'heap> {
    span: SpanId,
    env: &'env Environment<'heap>,

    arguments: FastHashMap<GenericArgumentId, Symbol<'heap>>,
}

impl<'env, 'heap> TypeBuilder<'env, 'heap> {
    pub fn synthetic(env: &'env Environment<'heap>) -> Self {
        Self {
            span: SpanId::SYNTHETIC,
            env,
            arguments: FastHashMap::default(),
        }
    }

    pub fn partial<'this>(
        &'this self,
        kind: impl FnOnce(Provisioned<TypeId>) -> TypeKind<'heap>,
    ) -> TypeId {
        self.env
            .types
            .intern(|id| PartialType {
                span: self.span,
                kind: self.env.intern_kind(kind(id)),
            })
            .id
    }

    #[must_use]
    pub fn opaque(&self, name: &str, repr: impl BuildType) -> TypeId {
        self.partial(|id| {
            TypeKind::Opaque(OpaqueType {
                name: self.env.heap.intern_symbol(name),
                repr: repr.build(id),
            })
        })
    }

    #[must_use]
    pub fn number(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Number))
    }

    #[must_use]
    pub fn integer(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Integer))
    }

    #[must_use]
    pub fn string(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::String))
    }

    #[must_use]
    pub fn null(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Null))
    }

    #[must_use]
    pub fn boolean(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Boolean))
    }

    #[must_use]
    pub fn list(&self, element: impl BuildType) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::List(ListType {
                element: element.build(id),
            }))
        })
    }

    #[must_use]
    pub fn dict(&self, key: impl BuildType, value: impl BuildType) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: key.build(id),
                value: value.build(id),
            }))
        })
    }

    #[must_use]
    pub fn r#struct<N>(&self, fields: impl BuildIterator<Item = (N, TypeId)>) -> TypeId
    where
        N: AsRef<str>,
    {
        self.partial(|id| {
            let mut fields: Vec<_> = fields
                .build(id)
                .into_iter()
                .map(|(name, value)| StructField {
                    name: self.env.heap.intern_symbol(name.as_ref()),
                    value,
                })
                .collect();

            TypeKind::Struct(StructType {
                fields: self
                    .env
                    .intern_struct_fields(&mut fields)
                    .expect("no duplicate struct fields should be present"),
            })
        })
    }

    #[must_use]
    pub fn tuple(&self, fields: impl BuildIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let fields: Vec<_> = fields.build(id).into_iter().collect();

            TypeKind::Tuple(TupleType {
                fields: self.env.intern_type_ids(&fields),
            })
        })
    }

    #[must_use]
    pub fn union(&self, variants: impl BuildIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let variants: Vec<_> = variants.build(id).into_iter().collect();

            TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&variants),
            })
        })
    }

    #[must_use]
    pub fn intersection(&self, variants: impl BuildIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let variants: Vec<_> = variants.build(id).into_iter().collect();

            TypeKind::Intersection(IntersectionType {
                variants: self.env.intern_type_ids(&variants),
            })
        })
    }

    #[must_use]
    pub fn closure(
        &self,
        params: impl BuildIterator<Item = TypeId>,
        returns: impl BuildType,
    ) -> TypeId {
        self.partial(|id| {
            let params: Vec<_> = params.build(id).into_iter().collect();
            let returns = returns.build(id);

            TypeKind::Closure(ClosureType {
                params: self.env.intern_type_ids(&params),
                returns,
            })
        })
    }

    #[must_use]
    pub fn apply(
        &self,
        subscriptions: impl BuildIterator<Item = (GenericArgumentId, TypeId)>,
        base: impl BuildType,
    ) -> TypeId {
        self.partial(|id| {
            let mut substitutions: Vec<_> = subscriptions
                .build(id)
                .into_iter()
                .map(|(argument, value)| GenericSubstitution { argument, value })
                .collect();

            let base = base.build(id);

            TypeKind::Apply(Apply {
                substitutions: self.env.intern_generic_substitutions(&mut substitutions),
                base,
            })
        })
    }

    #[must_use]
    pub fn generic(
        &self,
        arguments: impl BuildIterator<Item = (GenericArgumentId, Option<TypeId>)>,
        base: impl BuildType,
    ) -> TypeId {
        self.partial(|id| {
            let mut arguments: Vec<_> = arguments
                .build(id)
                .into_iter()
                .map(|(id, constraint)| GenericArgument {
                    name: self.arguments[&id],
                    id,
                    constraint,
                })
                .collect();

            let base = base.build(id);

            TypeKind::Generic(Generic {
                arguments: self.env.intern_generic_arguments(&mut arguments),
                base,
            })
        })
    }

    #[must_use]
    pub fn argument(&mut self, name: impl AsRef<str>) -> GenericArgumentId {
        let name = self.env.heap.intern_symbol(name.as_ref());
        let id = self.env.counter.generic_argument.next();

        self.arguments.insert(id, name);

        id
    }

    #[must_use]
    pub fn arg_ref(&self, id: GenericArgumentId) -> GenericArgumentReference<'heap> {
        let name = self.arguments[&id];

        GenericArgumentReference { id, name }
    }

    #[must_use]
    pub fn hole(&self) -> HoleId {
        self.env.counter.hole.next()
    }

    #[must_use]
    pub fn param(&self, id: GenericArgumentId) -> TypeId {
        self.partial(|_| TypeKind::Param(Param { argument: id }))
    }

    #[must_use]
    pub fn infer(&self, id: HoleId) -> TypeId {
        self.partial(|_| TypeKind::Infer(Infer { hole: id }))
    }

    #[must_use]
    pub fn never(&self) -> TypeId {
        self.partial(|_| TypeKind::Never)
    }

    #[must_use]
    pub fn unknown(&self) -> TypeId {
        self.partial(|_| TypeKind::Unknown)
    }
}
