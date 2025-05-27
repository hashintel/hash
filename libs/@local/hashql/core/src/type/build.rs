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

pub trait IntoType {
    fn into_type(self, id: Provisioned<TypeId>) -> TypeId;
}

impl<F> IntoType for F
where
    F: FnOnce(Provisioned<TypeId>) -> TypeId,
{
    fn into_type(self, id: Provisioned<TypeId>) -> TypeId {
        self(id)
    }
}

impl IntoType for TypeId {
    fn into_type(self, _: Provisioned<TypeId>) -> TypeId {
        self
    }
}

pub trait IntoTypeIterator {
    type Item;
    type IntoIter: IntoIterator<Item = Self::Item>;

    fn into_type_iter(self, parent: Provisioned<TypeId>) -> Self::IntoIter;
}

impl<F, I> IntoTypeIterator for F
where
    F: FnOnce(Provisioned<TypeId>) -> I,
    I: IntoIterator,
{
    type IntoIter = I;
    type Item = I::Item;

    fn into_type_iter(self, id: Provisioned<TypeId>) -> Self::IntoIter {
        self(id)
    }
}

impl<T, const N: usize> IntoTypeIterator for [T; N] {
    type IntoIter = array::IntoIter<T, N>;
    type Item = T;

    fn into_type_iter(self, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.into_iter()
    }
}

impl<T> IntoTypeIterator for Vec<T> {
    type IntoIter = vec::IntoIter<T>;
    type Item = T;

    fn into_type_iter(self, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.into_iter()
    }
}

impl<'slice, T> IntoTypeIterator for &'slice [T]
where
    T: Clone,
{
    type IntoIter = iter::Cloned<slice::Iter<'slice, T>>;
    type Item = T;

    fn into_type_iter(self, _: Provisioned<TypeId>) -> Self::IntoIter {
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
    pub fn opaque(&self, name: &str, repr: impl IntoType) -> TypeId {
        self.partial(|id| {
            TypeKind::Opaque(OpaqueType {
                name: self.env.heap.intern_symbol(name),
                repr: repr.into_type(id),
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
    pub fn list(&self, element: impl IntoType) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::List(ListType {
                element: element.into_type(id),
            }))
        })
    }

    #[must_use]
    pub fn dict(&self, key: impl IntoType, value: impl IntoType) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: key.into_type(id),
                value: value.into_type(id),
            }))
        })
    }

    #[must_use]
    pub fn r#struct<N>(&self, fields: impl IntoTypeIterator<Item = (N, TypeId)>) -> TypeId
    where
        N: AsRef<str>,
    {
        self.partial(|id| {
            let mut fields: Vec<_> = fields
                .into_type_iter(id)
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
    pub fn tuple(&self, fields: impl IntoTypeIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let fields: Vec<_> = fields.into_type_iter(id).into_iter().collect();

            TypeKind::Tuple(TupleType {
                fields: self.env.intern_type_ids(&fields),
            })
        })
    }

    #[must_use]
    pub fn union(&self, variants: impl IntoTypeIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let variants: Vec<_> = variants.into_type_iter(id).into_iter().collect();

            TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&variants),
            })
        })
    }

    #[must_use]
    pub fn intersection(&self, variants: impl IntoTypeIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let variants: Vec<_> = variants.into_type_iter(id).into_iter().collect();

            TypeKind::Intersection(IntersectionType {
                variants: self.env.intern_type_ids(&variants),
            })
        })
    }

    #[must_use]
    pub fn closure(
        &self,
        params: impl IntoTypeIterator<Item = TypeId>,
        returns: impl IntoType,
    ) -> TypeId {
        self.partial(|id| {
            let params: Vec<_> = params.into_type_iter(id).into_iter().collect();
            let returns = returns.into_type(id);

            TypeKind::Closure(ClosureType {
                params: self.env.intern_type_ids(&params),
                returns,
            })
        })
    }

    #[must_use]
    pub fn apply(
        &self,
        subscriptions: impl IntoTypeIterator<Item = (GenericArgumentId, TypeId)>,
        base: impl IntoType,
    ) -> TypeId {
        self.partial(|id| {
            let mut substitutions: Vec<_> = subscriptions
                .into_type_iter(id)
                .into_iter()
                .map(|(argument, value)| GenericSubstitution { argument, value })
                .collect();

            let base = base.into_type(id);

            TypeKind::Apply(Apply {
                substitutions: self.env.intern_generic_substitutions(&mut substitutions),
                base,
            })
        })
    }

    #[must_use]
    pub fn generic(
        &self,
        arguments: impl IntoTypeIterator<Item = (GenericArgumentId, Option<TypeId>)>,
        base: impl IntoType,
    ) -> TypeId {
        self.partial(|id| {
            let mut arguments: Vec<_> = arguments
                .into_type_iter(id)
                .into_iter()
                .map(|(id, constraint)| GenericArgument {
                    name: self.arguments[&id],
                    id,
                    constraint,
                })
                .collect();

            let base = base.into_type(id);

            TypeKind::Generic(Generic {
                arguments: self.env.intern_generic_arguments(&mut arguments),
                base,
            })
        })
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

    #[must_use]
    pub fn fresh_argument(&mut self, name: impl AsRef<str>) -> GenericArgumentId {
        let name = self.env.heap.intern_symbol(name.as_ref());
        let id = self.env.counter.generic_argument.next();

        self.arguments.insert(id, name);

        id
    }

    #[must_use]
    pub fn hydrate_argument(&self, id: GenericArgumentId) -> GenericArgumentReference<'heap> {
        let name = self.arguments[&id];

        GenericArgumentReference { id, name }
    }

    #[must_use]
    pub fn fresh_hole(&self) -> HoleId {
        self.env.counter.hole.next()
    }
}
