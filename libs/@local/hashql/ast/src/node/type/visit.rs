use hashql_core::symbol::Ident;

use super::{
    IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
};
use crate::node::{
    generic::{GenericArgument, GenericConstraint},
    path::{Path, PathSegmentArgument},
};

/// A visitor for traversing and operating on HashQL type AST nodes.
///
/// This trait provides methods for visiting all type-related nodes in the HashQL AST.
/// Each method corresponds to a specific type of node and can be overridden to implement
/// custom behavior when that node type is encountered during traversal.
///
/// By default, each method simply delegates to the corresponding `walk_*` function,
/// which handles recursively visiting child nodes. To create a custom visitor,
/// override only the methods for the node types you're interested in.
///
/// For more information see the expression [`Visitor`](crate::visit::Visitor).
pub trait TypeVisitor<'heap> {
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_name(&mut self, ident: Ident<'heap>) {
        // do nothing
    }
    fn visit_path(&mut self, path: &Path<'heap>) {
        walk_path(self, path);
    }
    fn visit_generic_argument(&mut self, generic_argument: &GenericArgument<'heap>) {
        walk_generic_argument(self, generic_argument);
    }
    fn visit_generic_constraint(&mut self, generic_constraint: &GenericConstraint<'heap>) {
        walk_generic_constraint(self, generic_constraint);
    }

    fn visit_type(&mut self, r#type: &Type<'heap>) {
        walk_type(self, r#type);
    }

    fn visit_tuple(&mut self, tuple: &TupleType<'heap>) {
        walk_tuple(self, tuple);
    }

    fn visit_tuple_field(&mut self, field: &TupleField<'heap>) {
        walk_tuple_field(self, field);
    }

    fn visit_struct(&mut self, r#struct: &StructType<'heap>) {
        walk_struct(self, r#struct);
    }

    fn visit_struct_field(&mut self, field: &StructField<'heap>) {
        walk_struct_field(self, field);
    }

    fn visit_union(&mut self, union: &UnionType<'heap>) {
        walk_union(self, union);
    }

    fn visit_intersection(&mut self, intersection: &IntersectionType<'heap>) {
        walk_intersection(self, intersection);
    }
}

pub fn walk_path<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    Path {
        id: _,
        span: _,
        rooted: _,
        segments,
    }: &Path<'heap>,
) {
    for segment in segments {
        for argument in &segment.arguments {
            match argument {
                PathSegmentArgument::Argument(generic_argument) => {
                    visitor.visit_generic_argument(generic_argument);
                }
                PathSegmentArgument::Constraint(generic_constraint) => {
                    visitor.visit_generic_constraint(generic_constraint);
                }
            }
        }
    }
}

pub fn walk_generic_argument<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    GenericArgument {
        id: _,
        span: _,
        r#type,
    }: &GenericArgument<'heap>,
) {
    visitor.visit_type(r#type);
}

pub fn walk_generic_constraint<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    GenericConstraint {
        id: _,
        span: _,
        name,
        bound,
    }: &GenericConstraint<'heap>,
) {
    visitor.visit_name(*name);

    if let Some(bound) = bound {
        visitor.visit_type(bound);
    }
}

pub fn walk_type<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind,
    }: &Type<'heap>,
) {
    match kind {
        TypeKind::Infer | TypeKind::Dummy => {}
        TypeKind::Path(path) => visitor.visit_path(path),
        TypeKind::Tuple(tuple_type) => visitor.visit_tuple(tuple_type),
        TypeKind::Struct(struct_type) => visitor.visit_struct(struct_type),
        TypeKind::Union(union_type) => visitor.visit_union(union_type),
        TypeKind::Intersection(intersection_type) => visitor.visit_intersection(intersection_type),
    }
}

pub fn walk_tuple<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    TupleType {
        id: _,
        span: _,
        fields,
    }: &TupleType<'heap>,
) {
    for field in fields {
        visitor.visit_tuple_field(field);
    }
}

pub fn walk_tuple_field<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    TupleField {
        id: _,
        span: _,
        r#type,
    }: &TupleField<'heap>,
) {
    visitor.visit_type(r#type);
}

pub fn walk_struct<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    StructType {
        id: _,
        span: _,
        fields,
    }: &StructType<'heap>,
) {
    for field in fields {
        visitor.visit_struct_field(field);
    }
}

pub fn walk_struct_field<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    StructField {
        id: _,
        span: _,
        name,
        r#type,
    }: &StructField<'heap>,
) {
    visitor.visit_name(*name);

    visitor.visit_type(r#type);
}

pub fn walk_union<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    UnionType {
        id: _,
        span: _,
        types,
    }: &UnionType<'heap>,
) {
    for r#type in types {
        visitor.visit_type(r#type);
    }
}

pub fn walk_intersection<'heap, V: TypeVisitor<'heap> + ?Sized>(
    visitor: &mut V,
    IntersectionType {
        id: _,
        span: _,
        types,
    }: &IntersectionType<'heap>,
) {
    for r#type in types {
        visitor.visit_type(r#type);
    }
}
