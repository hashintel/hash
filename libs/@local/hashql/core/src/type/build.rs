use core::{array, cell::RefCell, iter, slice};
use std::vec;

use super::{
    PartialType, TypeId,
    environment::Environment,
    kind::{
        Apply, ClosureType, Generic, GenericArgument, Infer, IntersectionType, IntrinsicType,
        OpaqueType, Param, PrimitiveType, StructType, TupleType, TypeKind, UnionType,
        generic::{GenericArgumentId, GenericSubstitution},
        infer::HoleId,
        intrinsic::{DictType, ListType},
        r#struct::StructField,
    },
};
use crate::{collection::FastHashMap, intern::Provisioned, span::SpanId, symbol::Symbol};

pub trait BuildType<'env, 'heap> {
    fn build(self, builder: &TypeBuilder<'env, 'heap>, parent: Provisioned<TypeId>) -> TypeId;
}

impl<'env, 'heap, F> BuildType<'env, 'heap> for F
where
    F: FnOnce(&TypeBuilder<'env, 'heap>, Provisioned<TypeId>) -> TypeId,
{
    fn build(self, builder: &TypeBuilder<'env, 'heap>, parent: Provisioned<TypeId>) -> TypeId {
        self(builder, parent)
    }
}

impl<'env, 'heap> BuildType<'env, 'heap> for TypeId {
    fn build(self, _: &TypeBuilder<'env, 'heap>, _: Provisioned<TypeId>) -> TypeId {
        self
    }
}

pub trait BuildIterator<'env, 'heap> {
    type Item;
    type IntoIter: IntoIterator<Item = Self::Item>;

    fn build(
        self,
        builder: &TypeBuilder<'env, 'heap>,
        parent: Provisioned<TypeId>,
    ) -> Self::IntoIter;
}

impl<'env, 'heap, F, I> BuildIterator<'env, 'heap> for F
where
    F: FnOnce(Provisioned<TypeId>) -> I,
    I: IntoIterator,
{
    type IntoIter = I;
    type Item = I::Item;

    fn build(self, _: &TypeBuilder<'env, 'heap>, parent: Provisioned<TypeId>) -> Self::IntoIter {
        self(parent)
    }
}

impl<'env, 'heap, T, const N: usize> BuildIterator<'env, 'heap> for [T; N] {
    type IntoIter = array::IntoIter<T, N>;
    type Item = T;

    fn build(self, _: &TypeBuilder<'env, 'heap>, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.into_iter()
    }
}

impl<'env, 'heap, T> BuildIterator<'env, 'heap> for Vec<T> {
    type IntoIter = vec::IntoIter<T>;
    type Item = T;

    fn build(self, _: &TypeBuilder<'env, 'heap>, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.into_iter()
    }
}

impl<'slice, 'env, 'heap, T> BuildIterator<'env, 'heap> for &'slice [T]
where
    T: Clone,
{
    type IntoIter = iter::Cloned<slice::Iter<'slice, T>>;
    type Item = T;

    fn build(self, _: &TypeBuilder<'env, 'heap>, _: Provisioned<TypeId>) -> Self::IntoIter {
        self.iter().cloned()
    }
}

pub struct TypeBuilder<'env, 'heap> {
    span: SpanId,
    env: &'env Environment<'heap>,

    // RefCell is acceptable here, because TypeBuilder is not shareable and we never use it across
    // any boundaries
    arguments: RefCell<FastHashMap<GenericArgumentId, Symbol<'heap>>>,
}

impl<'env, 'heap> TypeBuilder<'env, 'heap> {
    pub fn synthetic(env: &'env Environment<'heap>) -> Self {
        Self {
            span: SpanId::SYNTHETIC,
            env,
            arguments: RefCell::default(),
        }
    }

    pub fn partial(
        &self,
        kind: impl FnOnce(&Self, Provisioned<TypeId>) -> TypeKind<'heap>,
    ) -> TypeId {
        self.env
            .types
            .intern(|id| PartialType {
                span: self.span,
                kind: self.env.intern_kind(kind(self, id)),
            })
            .id
    }

    pub fn opaque(&self, name: &str, repr: impl BuildType<'env, 'heap>) -> TypeId {
        self.partial(|this, id| {
            TypeKind::Opaque(OpaqueType {
                name: this.env.heap.intern_symbol(name),
                repr: repr.build(this, id),
            })
        })
    }

    pub fn number(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Primitive(PrimitiveType::Number))
    }

    pub fn integer(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Primitive(PrimitiveType::Integer))
    }

    pub fn string(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Primitive(PrimitiveType::String))
    }

    pub fn null(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Primitive(PrimitiveType::Null))
    }

    pub fn boolean(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Primitive(PrimitiveType::Boolean))
    }

    pub fn list(&self, element: impl BuildType<'env, 'heap>) -> TypeId {
        self.partial(|this, id| {
            TypeKind::Intrinsic(IntrinsicType::List(ListType {
                element: element.build(this, id),
            }))
        })
    }

    pub fn dict(
        &self,
        key: impl BuildType<'env, 'heap>,
        value: impl BuildType<'env, 'heap>,
    ) -> TypeId {
        self.partial(|this, id| {
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: key.build(this, id),
                value: value.build(this, id),
            }))
        })
    }

    pub fn r#struct<N>(&self, fields: impl BuildIterator<'env, 'heap, Item = (N, TypeId)>) -> TypeId
    where
        N: AsRef<str>,
    {
        self.partial(|this, id| {
            let mut fields: Vec<_> = fields
                .build(this, id)
                .into_iter()
                .map(|(name, value)| StructField {
                    name: this.env.heap.intern_symbol(name.as_ref()),
                    value,
                })
                .collect();

            TypeKind::Struct(StructType {
                fields: this
                    .env
                    .intern_struct_fields(&mut fields)
                    .expect("no duplicate struct fields should be present"),
            })
        })
    }

    pub fn tuple(&self, fields: impl BuildIterator<'env, 'heap, Item = TypeId>) -> TypeId {
        self.partial(|this, id| {
            let fields: Vec<_> = fields.build(this, id).into_iter().collect();

            TypeKind::Tuple(TupleType {
                fields: this.env.intern_type_ids(&fields),
            })
        })
    }

    pub fn union(&self, variants: impl BuildIterator<'env, 'heap, Item = TypeId>) -> TypeId {
        self.partial(|this, id| {
            let variants: Vec<_> = variants.build(this, id).into_iter().collect();

            TypeKind::Union(UnionType {
                variants: this.env.intern_type_ids(&variants),
            })
        })
    }

    pub fn intersection(&self, variants: impl BuildIterator<'env, 'heap, Item = TypeId>) -> TypeId {
        self.partial(|this, id| {
            let variants: Vec<_> = variants.build(this, id).into_iter().collect();

            TypeKind::Intersection(IntersectionType {
                variants: this.env.intern_type_ids(&variants),
            })
        })
    }

    pub fn closure(
        &self,
        params: impl BuildIterator<'env, 'heap, Item = TypeId>,
        returns: impl BuildType<'env, 'heap>,
    ) -> TypeId {
        self.partial(|this, id| {
            let params: Vec<_> = params.build(this, id).into_iter().collect();
            let returns = returns.build(this, id);

            TypeKind::Closure(ClosureType {
                params: this.env.intern_type_ids(&params),
                returns,
            })
        })
    }

    pub fn apply(
        &self,
        subscriptions: impl BuildIterator<'env, 'heap, Item = (GenericArgumentId, TypeId)>,
        base: impl BuildType<'env, 'heap>,
    ) -> TypeId {
        self.partial(|this, id| {
            let mut substitutions: Vec<_> = subscriptions
                .build(this, id)
                .into_iter()
                .map(|(argument, value)| GenericSubstitution { argument, value })
                .collect();

            let base = base.build(this, id);

            TypeKind::Apply(Apply {
                substitutions: this.env.intern_generic_substitutions(&mut substitutions),
                base,
            })
        })
    }

    pub fn generic<N>(
        &self,
        arguments: impl BuildIterator<'env, 'heap, Item = (GenericArgumentId, Option<TypeId>)>,
        base: impl BuildType<'env, 'heap>,
    ) -> TypeId
    where
        N: AsRef<str>,
    {
        self.partial(|this, id| {
            let mut arguments: Vec<_> = arguments
                .build(this, id)
                .into_iter()
                .map(|(id, constraint)| GenericArgument {
                    name: this.arguments.borrow()[&id],
                    id,
                    constraint,
                })
                .collect();

            let base = base.build(this, id);

            TypeKind::Generic(Generic {
                arguments: this.env.intern_generic_arguments(&mut arguments),
                base,
            })
        })
    }

    pub fn argument(&self, name: impl AsRef<str>) -> GenericArgumentId {
        let name = self.env.heap.intern_symbol(name.as_ref());
        let id = self.env.counter.generic_argument.next();

        self.arguments.borrow_mut().insert(id, name);

        id
    }

    pub fn hole(&self) -> HoleId {
        let id = self.env.counter.hole.next();

        id
    }

    pub fn param(&self, id: GenericArgumentId) -> TypeId {
        self.partial(|_, _| TypeKind::Param(Param { argument: id }))
    }

    pub fn infer(&self, id: HoleId) -> TypeId {
        self.partial(|_, _| TypeKind::Infer(Infer { hole: id }))
    }

    pub fn never(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Never)
    }

    pub fn unknown(&self) -> TypeId {
        self.partial(|_, _| TypeKind::Unknown)
    }
}
