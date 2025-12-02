//! Type construction and builder utilities.
//!
//! This module provides a builder pattern for constructing complex type representations
//! in the HashQL type system. The [`TypeBuilder`] struct offers a fluent API for creating
//! primitive types, composite types (structs, tuples, unions), generic types, and other
//! type constructs.
//!
//! # Examples
//!
//! ```rust
//! # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
//! # use hashql_core::span::SpanId;
//! # use hashql_core::heap::Heap;
//! # let heap = Heap::new();
//! # let env = Environment::new(&heap);
//! let builder = TypeBuilder::synthetic(&env);
//!
//! // Build primitive types
//! let string_type = builder.string();
//! let number_type = builder.number();
//!
//! // Build composite types
//! let list_of_strings = builder.list(string_type);
//! let person_struct = builder.r#struct([("name", string_type), ("age", number_type)]);
//! ```
//!
//! # Type Construction Patterns
//!
//! The builder supports several patterns for type construction:
//!
//! - **Immediate types**: Direct construction of types that don't reference the current type ID.
//! - **Self-referential types**: Types that may reference their own ID during construction.
//! - **Generic types**: Types with type parameters and constraints.
//! - **Applied types**: Generic types with concrete type arguments substituted.

use super::{
    PartialType, TypeId,
    environment::Environment,
    kind::{
        Apply, ClosureType, Generic, GenericArgument, GenericArguments, GenericSubstitutions,
        Infer, IntersectionType, IntrinsicType, OpaqueType, Param, PrimitiveType, StructType,
        TupleType, TypeKind, UnionType,
        generic::{GenericArgumentId, GenericArgumentReference, GenericSubstitution},
        infer::HoleId,
        intrinsic::{DictType, ListType},
        r#struct::{StructField, StructFields},
    },
};
use crate::{
    collections::{FastHashMap, SmallVec},
    heap::Heap,
    intern::Provisioned,
    span::SpanId,
    symbol::Symbol,
};

/// A wrapper for deferred computation during type construction.
///
/// `Lazy` allows closures to be used in type builder contexts where the computation
/// needs to be deferred until the actual type construction occurs. This is particularly
/// useful for self-referential types or when the computation depends on the type ID
/// being constructed.
///
/// The wrapped closure receives both the provisioned type ID and a reference to the
/// type builder, enabling complex type construction patterns.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, lazy}};
/// # use hashql_core::span::SpanId;
/// # use hashql_core::heap::Heap;
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let mut builder = TypeBuilder::synthetic(&env);
/// // Defer computation of generic arguments
/// let t_arg = builder.fresh_argument("T");
/// let generic_type = builder.generic(lazy(|_, _| [t_arg]), builder.string());
/// ```
pub struct Lazy<F>(pub F);

/// Creates a lazy computation wrapper for deferred type construction.
///
/// This is a convenience function, which allows for omitting any type arguments in the closure
/// provided.
pub const fn lazy<'builder, 'env: 'builder, 'heap: 'env, F, T>(closure: F) -> Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> T,
{
    Lazy(closure)
}

/// Converts a value into a [`GenericArgument`] during type construction.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, IntoGenericArgument}};
/// # use hashql_core::{span::SpanId, heap::Heap, intern::Provisioned};
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let mut builder = TypeBuilder::synthetic(&env);
/// let arg_id = builder.fresh_argument("T");
///
/// // Various ways to create generic arguments:
/// // From just an ID (no constraint)
/// let arg1 = arg_id;
/// # builder.generic([arg1], builder.never());
///
/// // From ID with optional constraint
/// let arg2 = (arg_id, Some(builder.string()));
/// # builder.generic([arg2], builder.never());
///
/// // From ID with required constraint
/// let arg3 = (arg_id, builder.number());
/// # builder.generic([arg3], builder.never());
/// ```
pub trait IntoGenericArgument<'builder, 'env, 'heap> {
    /// Converts this value into a [`GenericArgument`].
    ///
    /// The conversion receives the current type ID being constructed and a reference
    /// to the type builder, enabling context-dependent argument creation.
    fn into_generic_argument(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArgument<'heap>;
}

impl<'builder, 'env, 'heap> IntoGenericArgument<'builder, 'env, 'heap> for GenericArgument<'heap> {
    fn into_generic_argument(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self {
        self
    }
}

impl<'builder, 'env, 'heap> IntoGenericArgument<'builder, 'env, 'heap>
    for (GenericArgumentId, Option<TypeId>)
{
    fn into_generic_argument(
        self,
        _: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArgument<'heap> {
        let (id, constraint) = self;

        let name = builder.arguments[&id];

        GenericArgument {
            id,
            name,
            constraint,
        }
    }
}

impl<'builder, 'env, 'heap> IntoGenericArgument<'builder, 'env, 'heap>
    for (GenericArgumentId, TypeId)
{
    fn into_generic_argument(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArgument<'heap> {
        let (argument_id, constraint) = self;

        (argument_id, Some(constraint)).into_generic_argument(id, builder)
    }
}

impl<'builder, 'env, 'heap> IntoGenericArgument<'builder, 'env, 'heap> for GenericArgumentId {
    fn into_generic_argument(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArgument<'heap> {
        (self, None).into_generic_argument(id, builder)
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, T> IntoGenericArgument<'builder, 'env, 'heap>
    for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> T,
    T: IntoGenericArgument<'builder, 'env, 'heap>,
{
    fn into_generic_argument(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArgument<'heap> {
        (self.0)(id, builder).into_generic_argument(id, builder)
    }
}

pub trait IntoSymbol<'heap> {
    fn intern_into_symbol(self, heap: &'heap Heap) -> Symbol<'heap>;
}

impl<'heap, T> IntoSymbol<'heap> for T
where
    T: AsRef<str>,
{
    fn intern_into_symbol(self, heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol(self.as_ref())
    }
}

impl<'heap> IntoSymbol<'heap> for Symbol<'heap> {
    fn intern_into_symbol(self, _: &'heap Heap) -> Self {
        self
    }
}

/// Converts a collection of values into [`GenericArguments`] during type construction.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, IntoGenericArguments, lazy}};
/// # use hashql_core::{span::SpanId, heap::Heap, intern::Provisioned};
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let mut builder = TypeBuilder::synthetic(&env);
/// let t_arg = builder.fresh_argument("T");
/// let u_arg = builder.fresh_argument("U");
///
/// // From an array of argument specifications
/// let args1 = [(t_arg, None), (u_arg, Some(builder.string()))];
/// # builder.generic(args1, builder.never());
///
/// // From a lazy computation
/// let dynamic = builder.fresh_argument("Dynamic");
/// let args2 = lazy(|_, _| [dynamic]);
/// # builder.generic(args2, builder.never());
/// ```
pub trait IntoGenericArguments<'builder, 'env, 'heap> {
    /// Converts this collection into [`GenericArguments`].
    ///
    /// The conversion receives the current type ID being constructed and a reference
    /// to the type builder, enabling context-dependent argument collection creation.
    fn into_generic_arguments(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArguments<'heap>;
}

impl<'builder, 'env, 'heap> IntoGenericArguments<'builder, 'env, 'heap>
    for GenericArguments<'heap>
{
    fn into_generic_arguments(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self {
        self
    }
}

impl<'builder, 'env, 'heap, I> IntoGenericArguments<'builder, 'env, 'heap> for I
where
    I: IntoIterator<Item: IntoGenericArgument<'builder, 'env, 'heap>>,
{
    fn into_generic_arguments(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArguments<'heap> {
        let mut arguments: SmallVec<_> = self
            .into_iter()
            .map(|argument| argument.into_generic_argument(id, builder))
            .collect();

        builder.env.intern_generic_arguments(&mut arguments)
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, I> IntoGenericArguments<'builder, 'env, 'heap>
    for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> I,
    I: IntoGenericArguments<'builder, 'env, 'heap>,
{
    fn into_generic_arguments(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericArguments<'heap> {
        self.0(id, builder).into_generic_arguments(id, builder)
    }
}

/// Converts a value into a [`GenericSubstitution`] during type construction.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, IntoGenericSubstitution}};
/// # use hashql_core::{span::SpanId, heap::Heap, intern::Provisioned};
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let mut builder = TypeBuilder::synthetic(&env);
/// let arg_id = builder.fresh_argument("T");
///
/// // From a tuple of argument ID and type
/// let substitution = (arg_id, builder.string());
/// # builder.apply([substitution], builder.never());
/// ```
pub trait IntoGenericSubstitution<'builder, 'env, 'heap> {
    /// Converts this value into a [`GenericSubstitution`].
    ///
    /// The conversion receives the current type ID being constructed and a reference
    /// to the type builder, enabling context-dependent substitution creation.
    fn into_generic_substitution(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitution;
}

impl<'builder, 'env, 'heap> IntoGenericSubstitution<'builder, 'env, 'heap> for GenericSubstitution {
    fn into_generic_substitution(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitution {
        self
    }
}

impl<'builder, 'env, 'heap> IntoGenericSubstitution<'builder, 'env, 'heap>
    for (GenericArgumentId, TypeId)
{
    fn into_generic_substitution(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitution {
        let (argument, value) = self;

        GenericSubstitution { argument, value }
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, T> IntoGenericSubstitution<'builder, 'env, 'heap>
    for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> T,
    T: IntoGenericSubstitution<'builder, 'env, 'heap>,
{
    fn into_generic_substitution(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitution {
        (self.0)(id, builder).into_generic_substitution(id, builder)
    }
}

/// Converts a collection of values into [`GenericSubstitutions`] during type construction.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, IntoGenericSubstitutions, lazy}};
/// # use hashql_core::{span::SpanId, heap::Heap, intern::Provisioned};
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let mut builder = TypeBuilder::synthetic(&env);
/// let t_arg = builder.fresh_argument("T");
/// let u_arg = builder.fresh_argument("U");
///
/// // From an array of substitution tuples
/// let substitutions1 = [(t_arg, builder.string()), (u_arg, builder.number())];
/// # builder.apply(substitutions1, builder.never());
///
/// // From a lazy computation
/// let substitutions2 = lazy(|_, builder| {
///     vec![(t_arg, builder.boolean())]
/// });
/// # builder.apply(substitutions1, builder.never());
/// ```
pub trait IntoGenericSubstitutions<'builder, 'env, 'heap> {
    /// Converts this collection into [`GenericSubstitutions`].
    ///
    /// The conversion receives the current type ID being constructed and a reference
    /// to the type builder, enabling context-dependent substitution collection creation.
    fn into_generic_substitutions(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitutions<'heap>;
}

impl<'builder, 'env, 'heap> IntoGenericSubstitutions<'builder, 'env, 'heap>
    for GenericSubstitutions<'heap>
{
    fn into_generic_substitutions(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self {
        self
    }
}

impl<'builder, 'env, 'heap, I> IntoGenericSubstitutions<'builder, 'env, 'heap> for I
where
    I: IntoIterator<Item: IntoGenericSubstitution<'builder, 'env, 'heap>>,
{
    fn into_generic_substitutions(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitutions<'heap> {
        let mut substitutions: SmallVec<_> = self
            .into_iter()
            .map(|substitution| substitution.into_generic_substitution(id, builder))
            .collect();

        builder.env.intern_generic_substitutions(&mut substitutions)
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, I> IntoGenericSubstitutions<'builder, 'env, 'heap>
    for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> I,
    I: IntoGenericSubstitutions<'builder, 'env, 'heap>,
{
    fn into_generic_substitutions(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> GenericSubstitutions<'heap> {
        self.0(id, builder).into_generic_substitutions(id, builder)
    }
}

/// Converts a value into a [`StructField`] during type construction.
///
/// This trait enables flexible construction of struct fields by allowing
/// various input formats to be converted into the standard [`StructField`] representation.
/// Implementations exist for tuples with names and types, symbols with types, and lazy
/// computations.
///
/// # Lifetime Parameters
///
/// - `'builder`: The lifetime of the type builder reference
/// - `'env`: The lifetime of the environment reference
/// - `'heap`: The lifetime of the heap-allocated data
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, IntoStructField}};
/// # use hashql_core::{span::SpanId, heap::Heap, intern::Provisioned};
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let builder = TypeBuilder::synthetic(&env);
///
/// // From a string name and type
/// let field1 = ("name", builder.string());
/// # builder.r#struct([field1]);
///
/// // From a symbol and type
/// let name_symbol = builder.env.heap.intern_symbol("age");
/// let field2 = (name_symbol, builder.integer());
/// # builder.r#struct([field2]);
/// ```
pub trait IntoStructField<'builder, 'env, 'heap> {
    /// Converts this value into a [`StructField`].
    ///
    /// The conversion receives the current type ID being constructed and a reference
    /// to the type builder, enabling context-dependent field creation.
    fn into_struct_field(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> StructField<'heap>;
}

impl<'builder, 'env, 'heap> IntoStructField<'builder, 'env, 'heap> for StructField<'heap> {
    fn into_struct_field(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self {
        self
    }
}

impl<'builder, 'env, 'heap, N> IntoStructField<'builder, 'env, 'heap> for (N, TypeId)
where
    N: IntoSymbol<'heap>,
{
    fn into_struct_field(
        self,
        _: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> StructField<'heap> {
        let (name, value) = self;

        StructField {
            name: name.intern_into_symbol(builder.env.heap),
            value,
        }
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, I> IntoStructField<'builder, 'env, 'heap> for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> I,
    I: IntoStructField<'builder, 'env, 'heap>,
{
    fn into_struct_field(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> StructField<'heap> {
        (self.0)(id, builder).into_struct_field(id, builder)
    }
}

/// Converts a collection of values into [`StructFields`] during type construction.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, IntoStructFields, lazy}};
/// # use hashql_core::{span::SpanId, heap::Heap, intern::Provisioned};
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// # let builder = TypeBuilder::synthetic(&env);
///
/// // From an array of field tuples
/// let fields1 = [("name", builder.string()), ("age", builder.integer())];
/// # builder.r#struct(fields1);
///
/// // From a lazy computation
/// let fields2 = lazy(|_id, builder| {
///     vec![("dynamic_field", builder.boolean())]
/// });
/// # builder.r#struct(fields2);
/// ```
pub trait IntoStructFields<'builder, 'env, 'heap> {
    /// Converts this collection into [`StructFields`].
    ///
    /// The conversion receives the current type ID being constructed and a reference
    /// to the type builder, enabling context-dependent field collection creation.
    fn into_struct_fields(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> StructFields<'heap>;
}

impl<'builder, 'env, 'heap> IntoStructFields<'builder, 'env, 'heap> for StructFields<'heap> {
    fn into_struct_fields(
        self,
        _: Provisioned<TypeId>,
        _: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self {
        self
    }
}

impl<'builder, 'env, 'heap, I> IntoStructFields<'builder, 'env, 'heap> for I
where
    I: IntoIterator<Item: IntoStructField<'builder, 'env, 'heap>>,
{
    fn into_struct_fields(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> StructFields<'heap> {
        let mut fields: SmallVec<_> = self
            .into_iter()
            .map(|field| field.into_struct_field(id, builder))
            .collect();

        builder
            .env
            .intern_struct_fields(&mut fields)
            .expect("struct fields should be unique")
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, I> IntoStructFields<'builder, 'env, 'heap>
    for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> I,
    I: IntoStructFields<'builder, 'env, 'heap>,
{
    fn into_struct_fields(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> StructFields<'heap> {
        (self.0)(id, builder).into_struct_fields(id, builder)
    }
}

/// Converts a value into a [`TypeId`] during type construction.
pub trait IntoType<'builder, 'env, 'heap> {
    /// Converts this value into a [`TypeId`].
    ///
    /// The `id` parameter provides the [`TypeId`] of the type currently being constructed,
    /// which can be used to create self-referential types.
    fn into_type(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> TypeId;
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, T> IntoType<'builder, 'env, 'heap> for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> T,
    T: IntoType<'builder, 'env, 'heap>,
{
    fn into_type(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> TypeId {
        (self.0)(id, builder).into_type(id, builder)
    }
}

impl<'builder, 'env, 'heap> IntoType<'builder, 'env, 'heap> for TypeId {
    fn into_type(self, _: Provisioned<TypeId>, _: &'builder TypeBuilder<'env, 'heap>) -> TypeId {
        self
    }
}

/// Converts a value into an iterator during type construction.
pub trait IntoTypes<'builder, 'env, 'heap> {
    /// The iterator type that will be returned.
    type IntoIter: IntoIterator<Item = TypeId>;

    /// Converts this value into an iterator.
    ///
    /// The `id` parameter provides the [`TypeId`] of the type currently being constructed,
    /// which can be used if the iterator elements need to reference the parent type.
    fn into_type_iter(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self::IntoIter;
}

impl<'builder, 'env: 'builder, 'heap: 'env, F, I> IntoTypes<'builder, 'env, 'heap> for Lazy<F>
where
    F: FnOnce(Provisioned<TypeId>, &'builder TypeBuilder<'env, 'heap>) -> I,
    I: IntoTypes<'builder, 'env, 'heap>,
{
    type IntoIter = I::IntoIter;

    fn into_type_iter(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self::IntoIter {
        self.0(id, builder).into_type_iter(id, builder)
    }
}

/// Iterator for the types produced by the [`IntoTypes`] trait for iterators.
pub struct IntoTypesIter<'builder, 'env, 'heap, I> {
    id: Provisioned<TypeId>,
    builder: &'builder TypeBuilder<'env, 'heap>,
    iter: I,
}

impl<'builder, 'env, 'heap, I> Iterator for IntoTypesIter<'builder, 'env, 'heap, I>
where
    I: Iterator<Item: IntoType<'builder, 'env, 'heap>>,
{
    type Item = TypeId;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter
            .next()
            .map(|item| item.into_type(self.id, self.builder))
    }
}

impl<'builder, 'env: 'builder, 'heap: 'env, I> IntoTypes<'builder, 'env, 'heap> for I
where
    I: IntoIterator<Item: IntoType<'builder, 'env, 'heap>>,
{
    type IntoIter = IntoTypesIter<'builder, 'env, 'heap, I::IntoIter>;

    fn into_type_iter(
        self,
        id: Provisioned<TypeId>,
        builder: &'builder TypeBuilder<'env, 'heap>,
    ) -> Self::IntoIter {
        IntoTypesIter {
            id,
            builder,
            iter: self.into_iter(),
        }
    }
}

/// A builder for constructing type representations in the HashQL type system.
///
/// [`TypeBuilder`] provides a fluent API for creating various kinds of types, from simple
/// primitives to complex generic and composite types. It maintains context about the construction
/// environment and tracks generic type arguments.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::{TypeBuilder, lazy}};
/// # use hashql_core::heap::Heap;
/// # use hashql_core::span::SpanId;
/// # use hashql_core::intern::Provisioned;
/// # let heap = Heap::new();
/// # let env = Environment::new(&heap);
/// let builder = TypeBuilder::synthetic(&env);
///
/// // Primitive types
/// let string_type = builder.string();
/// let number_type = builder.number();
/// let bool_type = builder.boolean();
///
/// // Composite types
/// let string_list = builder.list(string_type);
/// let name_to_age = builder.dict(string_type, number_type);
///
/// // Struct type
/// let person = builder.r#struct([
///     ("name", string_type),
///     ("age", number_type),
///     ("active", bool_type),
/// ]);
///
/// // Function type
/// let string_to_number = builder.closure([string_type], number_type);
///
/// // Recursive types
/// let list_of_list = builder.list(lazy(|id, _| id.value()));
/// ```
pub struct TypeBuilder<'env, 'heap> {
    span: SpanId,
    pub env: &'env Environment<'heap>,

    arguments: FastHashMap<GenericArgumentId, Symbol<'heap>>,
}

impl<'env, 'heap> TypeBuilder<'env, 'heap> {
    /// Creates a new [`TypeBuilder`] for synthetic (generated) types.
    ///
    /// Synthetic types are not associated with any specific source location and are
    /// typically used for internally generated types or during type inference.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// let builder = TypeBuilder::synthetic(&env);
    /// let string_type = builder.string();
    /// ```
    pub fn synthetic(env: &'env Environment<'heap>) -> Self {
        Self::spanned(SpanId::SYNTHETIC, env)
    }

    /// Creates a new [`TypeBuilder`] with a specific span.
    ///
    /// This method is useful when you want to associate a type with a specific source location.
    pub fn spanned(span: SpanId, env: &'env Environment<'heap>) -> Self {
        Self {
            span,
            env,
            arguments: FastHashMap::default(),
        }
    }

    /// Creates a type by providing a closure that constructs the type's kind.
    ///
    /// This is the foundational method used by all other type construction methods. The closure
    /// receives a provisioned [`TypeId`] that represents the type being constructed, enabling
    /// self-referential type definitions.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder, kind::TypeKind, kind::PrimitiveType};
    /// # use hashql_core::span::SpanId;
    /// # use hashql_core::heap::Heap;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let string_type = builder.partial(|_| TypeKind::Primitive(PrimitiveType::String));
    /// ```
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

    /// Creates an opaque type with the given name and underlying representation.
    ///
    /// Opaque types hide their internal structure while maintaining type safety. They're useful for
    /// creating abstract data types or wrapping existing types with additional semantic
    /// meaning.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let user_id = builder.opaque("UserId", builder.string());
    /// let product_id = builder.opaque("ProductId", builder.integer());
    /// ```
    #[must_use]
    pub fn opaque<'this>(
        &'this self,
        name: impl IntoSymbol<'heap>,
        repr: impl IntoType<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            TypeKind::Opaque(OpaqueType {
                name: name.intern_into_symbol(self.env.heap),
                repr: repr.into_type(id, self),
            })
        })
    }

    /// Creates a number type that can represent floating-point values.
    ///
    /// This type encompasses all numeric values including integers and decimals.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let price_type = builder.number();
    /// ```
    #[must_use]
    pub fn number(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Number))
    }

    /// Creates an integer type that represents whole numbers.
    ///
    /// This type is more restrictive than [`number`](Self::number) and only accepts
    /// integer values without fractional parts.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let count_type = builder.integer();
    /// ```
    #[must_use]
    pub fn integer(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Integer))
    }

    /// Creates a string type for text values.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let name_type = builder.string();
    /// ```
    #[must_use]
    pub fn string(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::String))
    }

    /// Creates a null type representing the absence of a value.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let null_type = builder.null();
    /// let optional_string = builder.union([builder.string(), null_type]);
    /// ```
    #[must_use]
    pub fn null(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Null))
    }

    /// Creates a boolean type for true/false values.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let is_active_type = builder.boolean();
    /// ```
    #[must_use]
    pub fn boolean(&self) -> TypeId {
        self.partial(|_| TypeKind::Primitive(PrimitiveType::Boolean))
    }

    /// Creates a list type containing elements of the specified type.
    ///
    /// Lists are ordered collections that can contain zero or more elements
    /// of the same type.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let string_list = builder.list(builder.string());
    /// let number_list = builder.list(builder.number());
    ///
    /// // Nested lists
    /// let matrix = builder.list(builder.list(builder.number()));
    /// ```
    #[must_use]
    pub fn list<'this>(&'this self, element: impl IntoType<'this, 'env, 'heap>) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::List(ListType {
                element: element.into_type(id, self),
            }))
        })
    }

    /// Creates a dictionary type that maps keys to values.
    ///
    /// Dictionaries are associative collections where each key maps to exactly
    /// one value. Both keys and values must be of consistent types.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let name_to_age = builder.dict(builder.string(), builder.integer());
    /// let id_to_user = builder.dict(
    ///     builder.integer(),
    ///     builder.r#struct([("name", builder.string())]),
    /// );
    /// ```
    #[must_use]
    pub fn dict<'this>(
        &'this self,
        key: impl IntoType<'this, 'env, 'heap>,
        value: impl IntoType<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: key.into_type(id, self),
                value: value.into_type(id, self),
            }))
        })
    }

    /// Creates a struct type with named fields.
    ///
    /// Structs are product types that contain a fixed set of named fields,
    /// each with its own type. Field names must be unique within a struct.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder, kind::r#struct::StructField};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let person = builder.r#struct([
    ///     ("name", builder.string()),
    ///     ("age", builder.integer()),
    ///     ("email", builder.string()),
    /// ]);
    ///
    /// // Empty struct
    /// let empty = builder.r#struct([] as [StructField; 0]);
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if duplicate field names are provided, as struct fields must be unique.
    #[must_use]
    pub fn r#struct<'this>(
        &'this self,
        fields: impl IntoStructFields<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            let fields = fields.into_struct_fields(id, self);

            TypeKind::Struct(StructType { fields })
        })
    }

    /// Creates a tuple type with positional fields.
    ///
    /// Tuples are product types that contain a fixed number of fields accessed
    /// by position rather than name. Unlike structs, the order of fields matters
    /// and they are accessed by index.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder, TypeId};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let coordinate = builder.tuple([builder.number(), builder.number()]);
    /// let rgb_color = builder.tuple([builder.integer(), builder.integer(), builder.integer()]);
    ///
    /// // Unit tuple (empty)
    /// let unit = builder.tuple([] as [TypeId; 0]);
    /// ```
    #[must_use]
    pub fn tuple<'this>(&'this self, fields: impl IntoTypes<'this, 'env, 'heap>) -> TypeId {
        self.partial(|id| {
            let fields: SmallVec<_> = fields.into_type_iter(id, self).into_iter().collect();

            TypeKind::Tuple(TupleType {
                fields: self.env.intern_type_ids(&fields),
            })
        })
    }

    /// Creates a union type representing a choice between multiple alternatives.
    ///
    /// Union types (sum types) represent values that can be one of several
    /// possible types. A value of a union type must be exactly one of the
    /// variant types.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// // Optional string (string or null)
    /// let optional_string = builder.union([builder.string(), builder.null()]);
    ///
    /// // Number or string
    /// let number_or_string = builder.union([builder.number(), builder.string()]);
    /// ```
    #[must_use]
    pub fn union<'this>(&'this self, variants: impl IntoTypes<'this, 'env, 'heap>) -> TypeId {
        self.partial(|id| {
            let variants: SmallVec<_> = variants.into_type_iter(id, self).into_iter().collect();

            TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&variants),
            })
        })
    }

    /// Creates an intersection type that must satisfy all constituent types.
    ///
    /// Intersection types represent values that must simultaneously be of all
    /// the specified types. This is useful for combining multiple type constraints
    /// or representing types with multiple capabilities.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder, TypeId};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let serializable = builder.r#struct([(
    ///     "serialize",
    ///     builder.closure([] as [TypeId; 0], builder.string()),
    /// )]);
    /// let comparable = builder.r#struct([(
    ///     "compare",
    ///     builder.closure([builder.unknown()], builder.integer()),
    /// )]);
    ///
    /// // Type that is both serializable and comparable
    /// let serializable_and_comparable = builder.intersection([serializable, comparable]);
    /// ```
    #[must_use]
    pub fn intersection<'this>(
        &'this self,
        variants: impl IntoTypes<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            let variants: SmallVec<_> = variants.into_type_iter(id, self).into_iter().collect();

            TypeKind::Intersection(IntersectionType {
                variants: self.env.intern_type_ids(&variants),
            })
        })
    }

    /// Creates a function type that accepts parameters and returns a value.
    ///
    /// Closure types represent callable functions with a specific signature,
    /// defining both the parameter types and the return type.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder, TypeId};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// // String length function: (string) -> number
    /// let string_length = builder.closure([builder.string()], builder.number());
    ///
    /// // Addition function: (number, number) -> number
    /// let add = builder.closure([builder.number(), builder.number()], builder.number());
    ///
    /// // No-argument function: () -> string
    /// let get_greeting = builder.closure([] as [TypeId; 0], builder.string());
    /// ```
    #[must_use]
    pub fn closure<'this>(
        &'this self,
        params: impl IntoTypes<'this, 'env, 'heap>,
        returns: impl IntoType<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            let params: SmallVec<_> = params.into_type_iter(id, self).into_iter().collect();
            let returns = returns.into_type(id, self);

            TypeKind::Closure(ClosureType {
                params: self.env.intern_type_ids(&params),
                returns,
            })
        })
    }

    /// Creates a type application by substituting concrete types for generic parameters.
    ///
    /// Type application takes a generic type and provides concrete types for its
    /// type parameters, producing a specialized version of the generic type.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let mut builder = TypeBuilder::synthetic(&env);
    /// // Create a generic List<T> type
    /// let t_param = builder.fresh_argument("T");
    /// let generic_list = builder.generic([(t_param, None)], builder.list(builder.param(t_param)));
    ///
    /// // Apply it to create List<string>
    /// let string_list = builder.apply([(t_param, builder.string())], generic_list);
    /// ```
    #[must_use]
    pub fn apply<'this>(
        &'this self,
        substitutions: impl IntoGenericSubstitutions<'this, 'env, 'heap>,
        base: impl IntoType<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            let substitutions = substitutions.into_generic_substitutions(id, self);
            let base = base.into_type(id, self);

            TypeKind::Apply(Apply {
                base,
                substitutions,
            })
        })
    }

    /// Creates a generic type with type parameters and constraints.
    ///
    /// Generic types introduce type parameters that can be instantiated with concrete
    /// types later through type application. Each parameter can optionally have a
    /// constraint that limits what types can be substituted for it.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let mut builder = TypeBuilder::synthetic(&env);
    /// // Create List<T> where T can be any type
    /// let t_param = builder.fresh_argument("T");
    /// let generic_list = builder.generic([(t_param, None)], builder.list(builder.param(t_param)));
    ///
    /// // Create Comparable<T> where T must be a number
    /// let t_param = builder.fresh_argument("T");
    /// let comparable = builder.generic(
    ///     [(t_param, Some(builder.number()))],
    ///     builder.closure(
    ///         [builder.param(t_param), builder.param(t_param)],
    ///         builder.boolean(),
    ///     ),
    /// );
    /// ```
    #[must_use]
    pub fn generic<'this>(
        &'this self,
        arguments: impl IntoGenericArguments<'this, 'env, 'heap>,
        base: impl IntoType<'this, 'env, 'heap>,
    ) -> TypeId {
        self.partial(|id| {
            let arguments = arguments.into_generic_arguments(id, self);
            let base = base.into_type(id, self);

            TypeKind::Generic(Generic { base, arguments })
        })
    }

    /// Creates a type parameter reference.
    ///
    /// Type parameters are placeholders within generic types that get replaced
    /// with concrete types when the generic type is applied. The parameter
    /// must be defined within the current generic type's argument list.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let mut builder = TypeBuilder::synthetic(&env);
    /// let t_param = builder.fresh_argument("T");
    /// let u_param = builder.fresh_argument("U");
    ///
    /// // Create a function type: (T, U) -> T
    /// let generic_fn = builder.generic(
    ///     [(t_param, None), (u_param, None)],
    ///     builder.closure(
    ///         [builder.param(t_param), builder.param(u_param)],
    ///         builder.param(t_param),
    ///     ),
    /// );
    /// ```
    #[must_use]
    pub fn param(&self, id: GenericArgumentId) -> TypeId {
        self.partial(|_| TypeKind::Param(Param { argument: id }))
    }

    /// Creates an inference variable (type hole) for type inference.
    ///
    /// Inference variables represent unknown types that the type checker will
    /// attempt to determine through unification and constraint solving. They
    /// are typically used during type inference to represent types that haven't
    /// been explicitly specified.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let hole = builder.fresh_hole();
    /// let infer_type = builder.infer(hole);
    ///
    /// // This type will be inferred based on usage context
    /// let list_of_inferred = builder.list(infer_type);
    /// ```
    #[must_use]
    pub fn infer(&self, id: HoleId) -> TypeId {
        self.partial(|_| TypeKind::Infer(Infer { hole: id }))
    }

    /// Creates the never type, representing computations that never return.
    ///
    /// The never type is the bottom type in the type system, indicating that
    /// a computation will not produce a value (e.g., because it throws an error,
    /// loops forever, or exits the program). It can be converted to any other type.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let never_type = builder.never();
    ///
    /// // Function that throws an error
    /// let error_fn = builder.closure([builder.string()], never_type);
    /// ```
    #[must_use]
    pub fn never(&self) -> TypeId {
        self.partial(|_| TypeKind::Never)
    }

    /// Creates the unknown type, representing the top type that all types conform to.
    ///
    /// The unknown type is the universal supertype that can represent any value.
    /// It's useful for dynamic typing scenarios or when the specific type
    /// information is not available or relevant.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let unknown_type = builder.unknown();
    ///
    /// // Function that accepts any type
    /// let identity = builder.closure([unknown_type], unknown_type);
    /// ```
    #[must_use]
    pub fn unknown(&self) -> TypeId {
        self.partial(|_| TypeKind::Unknown)
    }

    /// Creates a fresh generic type argument with the given name.
    ///
    /// This generates a new unique identifier for a generic type parameter
    /// and registers it with the builder. The argument can then be used in
    /// generic type definitions and referenced through [`param`](Self::param).
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let mut builder = TypeBuilder::synthetic(&env);
    /// let t_arg = builder.fresh_argument("T");
    /// let u_arg = builder.fresh_argument("U");
    ///
    /// // Use the arguments in a generic type
    /// let pair_type = builder.generic(
    ///     [(t_arg, None), (u_arg, None)],
    ///     builder.tuple([builder.param(t_arg), builder.param(u_arg)]),
    /// );
    /// ```
    #[must_use]
    pub fn fresh_argument(&mut self, name: impl IntoSymbol<'heap>) -> GenericArgumentId {
        let name = name.intern_into_symbol(self.env.heap);
        let id = self.env.counter.generic_argument.next();

        self.arguments.insert(id, name);

        id
    }

    /// Converts a generic argument ID into a full reference with name information.
    ///
    /// This retrieves the name associated with a generic argument ID, creating
    /// a complete reference that includes both the unique identifier and the
    /// human-readable name.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let mut builder = TypeBuilder::synthetic(&env);
    /// let t_arg = builder.fresh_argument("T");
    /// let reference = builder.hydrate_argument(t_arg);
    ///
    /// // reference.name contains the symbol for "T"
    /// // reference.id contains the unique identifier
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the provided argument ID was not created by this builder instance.
    #[must_use]
    pub fn hydrate_argument(&self, id: GenericArgumentId) -> GenericArgumentReference<'heap> {
        let name = self.arguments[&id];

        GenericArgumentReference { id, name }
    }

    /// Creates a fresh type inference hole.
    ///
    /// Type holes are unique identifiers used during type inference to represent
    /// unknown types that need to be solved. Each hole gets a unique ID that
    /// can be used to track and resolve the type through the inference process.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(&heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let hole1 = builder.fresh_hole();
    /// let hole2 = builder.fresh_hole();
    ///
    /// // Create inference variables for unknown types
    /// let unknown_type1 = builder.infer(hole1);
    /// let unknown_type2 = builder.infer(hole2);
    /// ```
    #[must_use]
    pub fn fresh_hole(&self) -> HoleId {
        self.env.counter.hole.next()
    }
}
