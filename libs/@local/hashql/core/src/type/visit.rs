use self::filter::{Deep, Filter as _};
use super::{
    Type, TypeId,
    environment::Environment,
    kind::{
        Apply, ClosureType, Generic, GenericArgument, Infer, IntersectionType, IntrinsicType,
        OpaqueType, Param, PrimitiveType, StructType, TupleType, TypeKind, UnionType,
        generic::{GenericArguments, GenericSubstitution, GenericSubstitutions},
        intrinsic::{DictType, ListType},
        r#struct::{StructField, StructFields},
    },
};

pub mod filter {
    /// Controls the traversal behavior when visiting types.
    ///
    /// This trait defines flags that determine how deeply and extensively the visitor
    /// will traverse the type system. Implementations of this trait represent different
    /// traversal strategies.
    pub trait Filter {
        /// When `true`, follows type references to visit referenced types.
        ///
        /// This controls whether to traverse into referenced types, such as those in
        /// union or intersection types. When `false`, the visitor will not follow these
        /// references.
        ///
        /// # Implementation Note
        ///
        /// When set to `true`, implementors must take care to handle recursive type cycles, as the
        /// visitor does not automatically detect cycles. Without proper handling, traversal
        /// could lead to infinite recursion for recursive types, and therefore to stack overflows.
        const DEEP: bool;

        /// When `true`, visits internal members of composite types.
        ///
        /// This controls whether to visit structural components like field definitions in
        /// structs and parameters in closures. When `false`, these internal components
        /// are not visited.
        const MEMBERS: bool;

        /// When `true`, visits generic parameter types.
        ///
        /// This controls whether to traverse into generic parameter types. When `false`,
        /// generic parameters are skipped during traversal.
        const GENERIC_PARAMETERS: bool;

        /// When `true`, visits substitution types.
        ///
        /// This controls whether to traverse into substitution types. When `false`,
        /// substitutions are skipped during traversal.
        const SUBSTITUTIONS: bool;
    }

    /// A filter that traverses all types deeply but skips generic parameters.
    ///
    /// - Follows type references
    /// - Visits internal structure of types
    /// - Skips generic parameter types
    ///
    /// # Note
    ///
    /// The type system allows for recursive types, so be careful when using this filter, you need
    /// to implement your own visitor to handle cycles.
    pub struct NoGenerics(!);

    impl Filter for NoGenerics {
        const DEEP: bool = true;
        const GENERIC_PARAMETERS: bool = false;
        const MEMBERS: bool = true;
        const SUBSTITUTIONS: bool = false;
    }

    /// A filter that only visits the immediate type without traversing.
    ///
    /// - Does not follow type references
    /// - Does not visit internal structure
    /// - Does not visit generic parameters
    pub struct Shallow(!);

    impl Filter for Shallow {
        const DEEP: bool = false;
        const GENERIC_PARAMETERS: bool = false;
        const MEMBERS: bool = false;
        const SUBSTITUTIONS: bool = false;
    }

    /// A filter that performs exhaustive traversal of the type structure.
    ///
    /// - Follows all type references
    /// - Visits internal structure of types
    /// - Visits all generic parameter types
    ///
    /// # Note
    ///
    /// The type system allows for recursive types, so be careful when using this filter, you need
    /// to implement your own visitor to handle cycles.
    pub struct Deep(!);

    impl Filter for Deep {
        const DEEP: bool = true;
        const GENERIC_PARAMETERS: bool = true;
        const MEMBERS: bool = true;
        const SUBSTITUTIONS: bool = true;
    }
}

/// A visitor for traversing and analyzing the type system.
///
/// To implement a custom type visitor, create a type that implements this trait
/// and override the methods for the specific type kinds you want to process.
///
/// The default implementations call corresponding `walk_*` functions
/// that recursively traverse the type structure, allowing you to focus only on the
/// specific type nodes you want to analyze.
///
/// The associated [`Filter`](self::filter::Filter) type determines the traversal behavior and can
/// be used to control the depth of traversal.
///
/// # Implementation Strategy
///
/// When implementing a [`Visitor`], follow these patterns:
///
/// - To process a type node, implement the corresponding `visit_*` method
/// - To recursively process child types, call the corresponding `walk_*` function
/// - To skip processing child types, don't call the `walk_*` function
///
/// # Implementation Note
///
/// When using [`Deep`] or [`NoGenerics`](self::filter::NoGenerics) filters, or
/// any filter that sets `DEEP` to true, be careful with recursive types. The visitor does not
/// automatically detect cycles, so you must implement cycle detection to prevent infinite
/// recursion.
pub trait Visitor<'heap> {
    type Filter: filter::Filter = Deep;

    fn env(&self) -> &Environment<'heap>;

    fn visit_generic_arguments(&mut self, arguments: GenericArguments<'heap>) {
        walk_generic_arguments(self, arguments);
    }

    fn visit_generic_argument(&mut self, argument: GenericArgument<'heap>) {
        walk_generic_argument(self, argument);
    }

    fn visit_generic_substitutions(&mut self, substitutions: GenericSubstitutions<'heap>) {
        walk_generic_substitutions(self, substitutions);
    }

    fn visit_generic_substitution(&mut self, substitution: GenericSubstitution) {
        walk_generic_substitution(self, substitution);
    }

    fn visit_id(&mut self, id: TypeId) {
        walk_id(self, id);
    }

    fn visit_type(&mut self, r#type: Type<'heap>) {
        walk_type(self, r#type);
    }

    fn visit_opaque(&mut self, opaque: Type<'heap, OpaqueType>) {
        walk_opaque(self, opaque);
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_primitive(&mut self, primitive: Type<'heap, PrimitiveType>) {
        // Do nothing, there's nothing to walk
    }

    fn visit_intrinsic_list(&mut self, list: Type<'heap, ListType>) {
        walk_intrinsic_list(self, list);
    }

    fn visit_intrinsic_dict(&mut self, dict: Type<'heap, DictType>) {
        walk_intrinsic_dict(self, dict);
    }

    fn visit_intrinsic(&mut self, intrinsic: Type<'heap, IntrinsicType>) {
        walk_intrinsic(self, intrinsic);
    }

    fn visit_struct(&mut self, r#struct: Type<'heap, StructType>) {
        walk_struct(self, r#struct);
    }

    fn visit_struct_fields(&mut self, fields: StructFields<'heap>) {
        walk_struct_fields(self, fields);
    }

    fn visit_struct_field(&mut self, field: StructField<'heap>) {
        walk_struct_field(self, field);
    }

    fn visit_tuple(&mut self, tuple: Type<'heap, TupleType>) {
        walk_tuple(self, tuple);
    }

    fn visit_union(&mut self, union: Type<'heap, UnionType>) {
        walk_union(self, union);
    }

    fn visit_intersection(&mut self, intersection: Type<'heap, IntersectionType>) {
        walk_intersection(self, intersection);
    }

    fn visit_closure(&mut self, closure: Type<'heap, ClosureType>) {
        walk_closure(self, closure);
    }

    fn visit_apply(&mut self, apply: Type<'heap, Apply>) {
        walk_apply(self, apply);
    }

    fn visit_generic(&mut self, generic: Type<'heap, Generic<'heap>>) {
        walk_generic(self, generic);
    }

    fn visit_param(&mut self, param: Type<'heap, Param>) {
        walk_param(self, param);
    }

    fn visit_infer(&mut self, infer: Type<'heap, Infer>) {
        walk_infer(self, infer);
    }
}

pub fn walk_generic_arguments<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    generic_arguments: GenericArguments<'heap>,
) {
    for &generic_argument in generic_arguments.iter() {
        visitor.visit_generic_argument(generic_argument);
    }
}

pub fn walk_generic_argument<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    generic_argument: GenericArgument<'heap>,
) {
    if let Some(constraint) = generic_argument.constraint {
        visitor.visit_id(constraint);
    }
}

pub fn walk_generic_substitutions<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    substitutions: GenericSubstitutions<'heap>,
) {
    for &substitution in substitutions.iter() {
        visitor.visit_generic_substitution(substitution);
    }
}

pub fn walk_generic_substitution<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    GenericSubstitution { argument: _, value }: GenericSubstitution,
) {
    visitor.visit_id(value);
}

pub fn walk_id<'heap, V: Visitor<'heap> + ?Sized>(visitor: &mut V, id: TypeId) {
    if !V::Filter::DEEP {
        return;
    }

    let r#type = visitor.env().r#type(id);

    visitor.visit_type(r#type);
}

pub fn walk_type<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    r#type @ Type {
        id: _,
        span: _,
        kind,
    }: Type<'heap>,
) {
    match kind {
        TypeKind::Opaque(opaque) => visitor.visit_opaque(r#type.with(opaque)),
        TypeKind::Primitive(primitive) => visitor.visit_primitive(r#type.with(primitive)),
        TypeKind::Intrinsic(intrinsic) => visitor.visit_intrinsic(r#type.with(intrinsic)),
        TypeKind::Struct(r#struct) => visitor.visit_struct(r#type.with(r#struct)),
        TypeKind::Tuple(tuple) => visitor.visit_tuple(r#type.with(tuple)),
        TypeKind::Union(union) => visitor.visit_union(r#type.with(union)),
        TypeKind::Intersection(intersection) => {
            visitor.visit_intersection(r#type.with(intersection));
        }
        TypeKind::Closure(closure) => visitor.visit_closure(r#type.with(closure)),
        TypeKind::Apply(apply) => visitor.visit_apply(r#type.with(apply)),
        TypeKind::Generic(generic) => visitor.visit_generic(r#type.with(generic)),
        TypeKind::Param(param) => visitor.visit_param(r#type.with(param)),
        TypeKind::Infer(infer) => visitor.visit_infer(r#type.with(infer)),
        TypeKind::Never | TypeKind::Unknown => {}
    }
}

pub fn walk_opaque<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &OpaqueType { name: _, repr },
    }: Type<'heap, OpaqueType>,
) {
    if V::Filter::GENERIC_PARAMETERS {
        visitor.visit_id(repr);
    }
}

pub fn walk_intrinsic_list<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &ListType { element },
    }: Type<'heap, ListType>,
) {
    if V::Filter::GENERIC_PARAMETERS {
        visitor.visit_id(element);
    }
}

pub fn walk_intrinsic_dict<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &DictType { key, value },
    }: Type<'heap, DictType>,
) {
    if V::Filter::GENERIC_PARAMETERS {
        visitor.visit_id(key);
        visitor.visit_id(value);
    }
}

pub fn walk_intrinsic<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    intrinsic @ Type {
        id: _,
        span: _,
        kind,
    }: Type<'heap, IntrinsicType>,
) {
    match kind {
        IntrinsicType::List(list) => visitor.visit_intrinsic_list(intrinsic.with(list)),
        IntrinsicType::Dict(dict) => visitor.visit_intrinsic_dict(intrinsic.with(dict)),
    }
}

pub fn walk_struct<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &StructType { fields },
    }: Type<'heap, StructType>,
) {
    visitor.visit_struct_fields(fields);
}

pub fn walk_struct_fields<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    fields: StructFields<'heap>,
) {
    if !V::Filter::MEMBERS {
        return;
    }

    for &field in fields.iter() {
        visitor.visit_struct_field(field);
    }
}

pub fn walk_struct_field<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    StructField { name: _, value }: StructField<'heap>,
) {
    visitor.visit_id(value);
}

pub fn walk_tuple<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &TupleType { fields },
    }: Type<'heap, TupleType>,
) {
    if !V::Filter::MEMBERS {
        return;
    }

    for &field in fields {
        visitor.visit_id(field);
    }
}

pub fn walk_union<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &UnionType { variants },
    }: Type<'heap, UnionType>,
) {
    for &variant in variants {
        visitor.visit_id(variant);
    }
}

pub fn walk_intersection<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &IntersectionType { variants },
    }: Type<'heap, IntersectionType>,
) {
    for &variant in variants {
        visitor.visit_id(variant);
    }
}

pub fn walk_closure<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &ClosureType { params, returns },
    }: Type<'heap, ClosureType>,
) {
    if !V::Filter::MEMBERS {
        return;
    }

    for &param in params {
        visitor.visit_id(param);
    }

    visitor.visit_id(returns);
}

pub fn walk_apply<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &Apply {
            base,
            substitutions,
        },
    }: Type<'heap, Apply>,
) {
    visitor.visit_generic_substitutions(substitutions);
    visitor.visit_id(base);
}

pub fn walk_generic<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &Generic { base, arguments },
    }: Type<'heap, Generic>,
) {
    visitor.visit_generic_arguments(arguments);
    visitor.visit_id(base);
}

pub fn walk_param<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &Param { argument },
    }: Type<'heap, Param>,
) {
    if !V::Filter::SUBSTITUTIONS {
        return;
    }

    let Some(substitution) = visitor.env().substitution.argument(argument) else {
        return;
    };

    visitor.visit_id(substitution);
}

pub fn walk_infer<'heap, V: Visitor<'heap> + ?Sized>(
    visitor: &mut V,
    Type {
        id: _,
        span: _,
        kind: &Infer { hole },
    }: Type<'heap, Infer>,
) {
    if !V::Filter::SUBSTITUTIONS {
        return;
    }

    let Some(substitution) = visitor.env().substitution.infer(hole) else {
        return;
    };

    visitor.visit_id(substitution);
}
