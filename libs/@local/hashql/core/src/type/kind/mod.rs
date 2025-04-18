// pub mod closure;
// pub mod generic_argument;
// pub mod intersection;
// pub mod intrinsic;
// pub mod opaque;
pub mod primitive;
// pub mod r#struct;
pub mod generic_argument;
#[cfg(test)]
pub(crate) mod test;
pub mod tuple;
pub mod union;
// pub mod union;

use pretty::RcDoc;

use self::{primitive::PrimitiveType, tuple::TupleType, union::UnionType};
use super::{
    Type, TypeId,
    environment::{
        Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        UnificationEnvironment,
    },
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind<'heap> {
    // Closure(ClosureType),
    Primitive(PrimitiveType),
    // Intrinsic(IntrinsicType),
    // Struct(StructType),
    Tuple(TupleType<'heap>),
    // Opaque(OpaqueType),
    Union(UnionType<'heap>),
    // Intersection(IntersectionType),
    // Param(Param),
    Never,
    Unknown,
    Infer,
}

impl TypeKind<'_> {
    // pub fn closure(&self) -> Option<&ClosureType> {
    //     match self {
    //         Self::Closure(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    #[must_use]
    pub const fn primitive(&self) -> Option<&PrimitiveType> {
        match self {
            Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }

    // pub fn intrinsic(&self) -> Option<&IntrinsicType> {
    //     match self {
    //         Self::Intrinsic(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    // pub fn r#struct(&self) -> Option<&StructType> {
    //     match self {
    //         Self::Struct(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    #[must_use]
    pub const fn tuple(&self) -> Option<&TupleType> {
        match self {
            Self::Tuple(r#type) => Some(r#type),
            _ => None,
        }
    }

    // pub fn opaque(&self) -> Option<&OpaqueType> {
    //     match self {
    //         Self::Opaque(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    #[must_use]
    pub const fn union(&self) -> Option<&UnionType> {
        match self {
            Self::Union(r#type) => Some(r#type),
            _ => None,
        }
    }

    // pub fn intersection(&self) -> Option<&IntersectionType> {
    //     match self {
    //         Self::Intersection(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    // pub fn param(&self) -> Option<&Param> {
    //     match self {
    //         Self::Param(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }
}

impl<'heap> Lattice<'heap> for TypeKind<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        todo!()
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        todo!()
    }

    fn is_uninhabited(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn unify(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut UnificationEnvironment<'_, 'heap>,
    ) {
        todo!()
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        todo!()
    }
}

impl PrettyPrint for TypeKind<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        todo!()
    }
}

const _: () = {
    assert!(
        !core::mem::needs_drop::<TypeKind<'static>>(),
        "TypeKind cannot contain a `Drop` constructor, as it would cause a memory leak on heap \
         reset, as `Drop` won't be run."
    );
};
