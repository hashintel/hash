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
//! # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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

/// Converts a value into a [`TypeId`] during type construction.
///
/// This trait enables flexible type construction by allowing both direct [`TypeId`] values and
/// closures that compute a [`TypeId`] based on the current type being constructed. The closure
/// variant is useful for self-referential types or types that need to reference the ID of the type
/// currently being built.
pub trait IntoType {
    /// Converts this value into a [`TypeId`].
    ///
    /// The `id` parameter provides the [`TypeId`] of the type currently being constructed,
    /// which can be used to create self-referential types.
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

/// Converts a value into an iterator during type construction.
///
/// This trait enables flexible collection-based type construction by allowing various
/// collection types (arrays, vectors, slices) and closures that produce iterators. It's used
/// primarily for constructing composite types like structs, tuples, and unions that contain
/// multiple type elements.
pub trait IntoTypeIterator {
    /// The type of items yielded by the iterator.
    type Item;

    /// The iterator type that will be returned.
    type IntoIter: IntoIterator<Item = Self::Item>;

    /// Converts this value into an iterator.
    ///
    /// The `id` parameter provides the [`TypeId`] of the type currently being constructed,
    /// which can be used if the iterator elements need to reference the parent type.
    fn into_type_iter(self, id: Provisioned<TypeId>) -> Self::IntoIter;
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

/// A builder for constructing type representations in the HashQL type system.
///
/// [`TypeBuilder`] provides a fluent API for creating various kinds of types, from simple
/// primitives to complex generic and composite types. It maintains context about the construction
/// environment and tracks generic type arguments.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
/// # use hashql_core::heap::Heap;
/// # use hashql_core::span::SpanId;
/// # let heap = Heap::new();
/// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
/// ```
pub struct TypeBuilder<'env, 'heap> {
    span: SpanId,
    env: &'env Environment<'heap>,

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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let user_id = builder.opaque("UserId", builder.string());
    /// let product_id = builder.opaque("ProductId", builder.integer());
    /// ```
    #[must_use]
    pub fn opaque(&self, name: &str, repr: impl IntoType) -> TypeId {
        self.partial(|id| {
            TypeKind::Opaque(OpaqueType {
                name: self.env.heap.intern_symbol(name),
                repr: repr.into_type(id),
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let string_list = builder.list(builder.string());
    /// let number_list = builder.list(builder.number());
    ///
    /// // Nested lists
    /// let matrix = builder.list(builder.list(builder.number()));
    /// ```
    #[must_use]
    pub fn list(&self, element: impl IntoType) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::List(ListType {
                element: element.into_type(id),
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let name_to_age = builder.dict(builder.string(), builder.integer());
    /// let id_to_user = builder.dict(
    ///     builder.integer(),
    ///     builder.r#struct([("name", builder.string())]),
    /// );
    /// ```
    #[must_use]
    pub fn dict(&self, key: impl IntoType, value: impl IntoType) -> TypeId {
        self.partial(|id| {
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: key.into_type(id),
                value: value.into_type(id),
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
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let person = builder.r#struct([
    ///     ("name", builder.string()),
    ///     ("age", builder.integer()),
    ///     ("email", builder.string()),
    /// ]);
    ///
    /// // Empty struct
    /// let empty = builder.r#struct::<&str>([]);
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if duplicate field names are provided, as struct fields must be unique.
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

    /// Creates a tuple type with positional fields.
    ///
    /// Tuples are product types that contain a fixed number of fields accessed
    /// by position rather than name. Unlike structs, the order of fields matters
    /// and they are accessed by index.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let coordinate = builder.tuple([builder.number(), builder.number()]);
    /// let rgb_color = builder.tuple([builder.integer(), builder.integer(), builder.integer()]);
    ///
    /// // Unit tuple (empty)
    /// let unit = builder.tuple([]);
    /// ```
    #[must_use]
    pub fn tuple(&self, fields: impl IntoTypeIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let fields: Vec<_> = fields.into_type_iter(id).into_iter().collect();

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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// // Optional string (string or null)
    /// let optional_string = builder.union([builder.string(), builder.null()]);
    ///
    /// // Number or string
    /// let number_or_string = builder.union([builder.number(), builder.string()]);
    /// ```
    #[must_use]
    pub fn union(&self, variants: impl IntoTypeIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let variants: Vec<_> = variants.into_type_iter(id).into_iter().collect();

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
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// let serializable = builder.r#struct([("serialize", builder.closure([], builder.string()))]);
    /// let comparable = builder.r#struct([(
    ///     "compare",
    ///     builder.closure([builder.unknown()], builder.integer()),
    /// )]);
    ///
    /// // Type that is both serializable and comparable
    /// let serializable_and_comparable = builder.intersection([serializable, comparable]);
    /// ```
    #[must_use]
    pub fn intersection(&self, variants: impl IntoTypeIterator<Item = TypeId>) -> TypeId {
        self.partial(|id| {
            let variants: Vec<_> = variants.into_type_iter(id).into_iter().collect();

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
    /// # use hashql_core::r#type::{environment::Environment, builder::TypeBuilder};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::span::SpanId;
    /// # let heap = Heap::new();
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let builder = TypeBuilder::synthetic(&env);
    /// // String length function: (string) -> number
    /// let string_length = builder.closure([builder.string()], builder.number());
    ///
    /// // Addition function: (number, number) -> number
    /// let add = builder.closure([builder.number(), builder.number()], builder.number());
    ///
    /// // No-argument function: () -> string
    /// let get_greeting = builder.closure([], builder.string());
    /// ```
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
    /// # let mut builder = TypeBuilder::synthetic(&env);
    /// // Create a generic List<T> type
    /// let t_param = builder.fresh_argument("T");
    /// let generic_list = builder.generic([(t_param, None)], builder.list(builder.param(t_param)));
    ///
    /// // Apply it to create List<string>
    /// let string_list = builder.apply([(t_param, builder.string())], generic_list);
    /// ```
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    pub fn fresh_argument(&mut self, name: impl AsRef<str>) -> GenericArgumentId {
        let name = self.env.heap.intern_symbol(name.as_ref());
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
    /// # let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
