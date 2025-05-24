use super::{
    Type, TypeId,
    environment::{AnalysisEnvironment, LatticeEnvironment, SimplifyEnvironment},
};
use crate::{
    collection::{SmallVec, TinyVec},
    symbol::Ident,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Projection {
    Pending,
    Resolved(TypeId),
    Error,
}

/// A trait that implements properties of a mathematical lattice for types.
///
/// In type theory, a lattice structure enables reasoning about the relationships
/// between types in a type system. The operations defined here allow determining
/// common supertypes (join) and common subtypes (meet) of types.
///
/// These operations form the foundation for type inference, subsumption, and
/// subtyping relationships in a type system.
///
/// # Mathematical Background
///
/// In mathematics, a lattice is a partially ordered set in which any two elements
/// have a unique supremum (least upper bound or "join") and a unique infimum
/// (greatest lower bound or "meet").
///
/// In the context of a type system:
/// - The **join** of two types is their least common supertype - the most specific type that both
///   types can be implicitly converted to. This often corresponds to a **Union** type (A | B).
/// - The **meet** of two types is their greatest common subtype - the most general type that can be
///   implicitly converted to both types. This often corresponds to an **Intersection** type (A &
///   B).
///
/// # Lattice Laws
///
/// The join and meet operations in a lattice satisfy several important mathematical properties:
///
/// 1. **Commutativity**:
///    - `join(a, b) = join(b, a)` (order doesn't matter)
///    - `meet(a, b) = meet(b, a)` (order doesn't matter)
///
/// 2. **Associativity**:
///    - `join(a, join(b, c)) = join(join(a, b), c)` (grouping doesn't matter)
///    - `meet(a, meet(b, c)) = meet(meet(a, b), c)` (grouping doesn't matter)
///
/// 3. **Absorption**:
///    - `join(a, meet(a, b)) = a`
///    - `meet(a, join(a, b)) = a`
///
/// 4. **Idempotence**:
///    - `join(a, a) = a` (joining with self gives self)
///    - `meet(a, a) = a` (meeting with self gives self)
///
/// These properties ensure that lattice operations behave consistently and predictably
/// when working with complex type hierarchies.
pub trait Lattice<'heap> {
    /// Computes the join (least upper bound) of two types.
    ///
    /// The join represents the most specific common supertype of both input types. This corresponds
    /// to the union type (A | B).
    ///
    /// This operation is fundamental in type inference for determining the resulting type when
    /// combining expressions of different types (e.g., finding a common type for divergent branches
    /// in an if-expression).
    ///
    /// The join operation forms a mathematical semilattice, satisfying the properties of:
    /// - Commutativity: `join(a, b) = join(b, a)`
    /// - Associativity: `join(a, join(b, c)) = join(join(a, b), c)`
    /// - Idempotence: `join(a, a) = a`
    ///
    /// # Variance
    ///
    /// When dealing with generic type constructors, `join` respects variance as follows:
    /// * **In covariant positions**: `join` is called on the generic arguments directly.
    /// * **In contravariant positions**: `meet` is called on the generic arguments instead (since
    ///   contravariance reverses the subtyping relationship).
    /// * **In invariant positions**: The generic arguments must be semantically equivalent,
    ///   otherwise the result degenerates to `Never` (since invariant parameters require exact type
    ///   matching).
    ///
    /// # Returns
    ///
    /// A vector of type IDs representing the join result. The interpretation is:
    /// * Multiple elements: The supremum is a Union of the returned types
    /// * Empty vector: The supremum is `Never` (no common supertype exists)
    ///
    /// # Examples in Mathematical Notation
    ///
    /// Given `Integer <: Number` (Integer is a subtype of Number):
    ///
    /// - `join(Integer, Number) = Number`
    ///   - Since Number is the least supertype that contains both Integer and Number
    ///
    /// - `join(Integer, String) = Integer | String`
    ///   - When types are on separate branches of the hierarchy, join creates a union type
    ///
    /// - `join(Number, Number | String) = Number | String`
    ///   - Joining with a union type creates the least supertype that contains all components
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> TinyVec<TypeId>;

    /// Computes the meet (greatest lower bound) of two types.
    ///
    /// The meet represents the most general common subtype of both input types. This corresponds to
    /// the intersection type (A & B).
    ///
    /// This operation is essential for type intersection operations and determining valid subtypes
    /// that satisfy multiple constraints simultaneously.
    ///
    /// The meet operation forms a mathematical semilattice, satisfying the properties of:
    /// - Commutativity: `meet(a, b) = meet(b, a)`
    /// - Associativity: `meet(a, meet(b, c)) = meet(meet(a, b), c)`
    /// - Idempotence: `meet(a, a) = a`
    ///
    /// # Variance
    ///
    /// When dealing with generic type constructors, `meet` respects variance as follows:
    /// * **In covariant positions**: `meet` is called on the generic arguments directly.
    /// * **In contravariant positions**: `join` is called on the generic arguments instead (since
    ///   contravariance reverses the subtyping relationship).
    /// * **In invariant positions**: The generic arguments must be semantically equivalent,
    ///   otherwise the result degenerates to `Never` (since invariant parameters require exact type
    ///   matching).
    ///
    /// # Returns
    ///
    /// A vector of type IDs representing the meet result. The interpretation is:
    /// * Multiple elements: The infimum is an Intersection of the returned types
    /// * Empty vector: The infimum is `Never` (no common subtype exists)
    ///
    /// # Examples in Mathematical Notation
    ///
    /// Given `Integer <: Number` (Integer is a subtype of Number):
    ///
    /// - `meet(Integer, Number) = Integer`
    ///   - Since Integer is the greatest subtype that is contained in both Integer and Number
    ///
    /// - `meet(Integer, String) = Never`
    ///   - When types are on separate branches of the hierarchy with no common subtype, meet
    ///     results in Never
    ///
    /// - `meet(Number, Integer | String) = Integer`
    ///   - Meeting Number with a union gives the intersection of meeting Number with each component
    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> TinyVec<TypeId>;

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection;

    /// Determines if a type is uninhabited (has no possible values).
    ///
    /// Uninhabited types (also called "empty types" or "bottom types" in type theory)
    /// cannot have any values constructed for them. They're useful in type systems
    /// to represent computations that don't return normally (e.g., functions that always
    /// panic or never terminate).
    ///
    /// In a type lattice, a bottom type is a subtype of every other type, forming the
    /// least element of the lattice. This corresponds to the `!` (`Never`) type.
    ///
    /// # Examples
    ///
    /// - The `Never` type in Rust is a bottom type
    /// - Empty union types (unions with no variants) are bottom types
    /// - Contradictory intersection types (like `number & string`) are bottom types
    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool;

    /// Determines if a type is a top type (encompasses all possible values).
    ///
    /// Top types (also called "universal types" in type theory) can hold any value in the
    /// type system. They're useful as default types or placeholders when the exact type
    /// is unknown or irrelevant.
    ///
    /// In a type lattice, a top type is a supertype of every other type, forming the
    /// greatest element of the lattice. This corresponds to the `?` (`Unknown`) type.
    ///
    /// # Examples
    ///
    /// - The `any` type in TypeScript is a top type
    /// - Any union type with the `Unknown` type as a variant is a top type
    /// - Empty intersection types (intersections with no variants) are top types
    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool;

    /// Determines if a type is concrete (fully resolved with no type variables or abstractions).
    ///
    /// A concrete type is one that is fully specified and does not contain any type variables,
    /// wildcards, or other abstract components. Concrete types represent exactly one specific
    /// type in the type system.
    ///
    /// This property is important for type checking and code generation, as concrete types
    /// have fully determined memory layouts and behavior, while non-concrete types may require
    /// further resolution or represent a family of possible types.
    ///
    /// # Examples
    ///
    /// Concrete types:
    /// - Primitive types like `Number`, `String`, `Boolean`
    /// - Specific struct/object types with concrete field types
    /// - Union types composed entirely of concrete types
    ///
    /// Non-concrete types:
    /// - Type variables (e.g., `T` in generic functions)
    /// - Types with unresolved type parameters
    /// - Inference types that need further resolution
    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool;

    /// Determines if a type is recursive (self-referential in its definition).
    ///
    /// Recursive types are types that directly or indirectly refer to themselves in their own
    /// definition. These types are essential for representing data structures with cyclical
    /// relationships, such as linked lists, trees, and graphs.
    ///
    /// In type theory, recursive types are formalized using fixed-point operators or μ-types,
    /// written as `μX.T` where `X` may appear in `T`, representing the recursive binding of `X` to
    /// the structure `T`.
    ///
    /// # Implementation Considerations
    ///
    /// Detecting recursion in types is critical for:
    /// - Preventing infinite loops during type checking and inference.
    /// - Proper handling of type simplification and normalization.
    /// - Calculating the memory layout of recursive data structures.
    /// - Appropriate error reporting for circular type definitions.
    /// - Co-inductive discharge of type constraints.
    ///
    /// # Examples
    ///
    /// Recursive types commonly include:
    /// - Self-referential structures: `type LinkedList<T> = (data: T, next: Option<LinkedList<T>>)`
    /// - Mutually recursive types: `type Tree = (newtype Leaf i32) | (newtype Node List<Tree>)`
    /// - Recursive type aliases: `type Json = null | boolean | number | string | Json[] |
    ///   Dict<String, Json>`
    /// - Recursive function types: `type Recursive = fn(x: Recursive) -> void`
    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool;

    /// Applies distribution laws to expressions containing union types in covariant positions.
    ///
    /// This function handles union distribution in type expressions, focusing primarily on
    /// covariant positions where unions can distribute outward. It transforms expressions by
    /// "pushing" union types outward through other type constructors, which is essential for
    /// normalizing and simplifying types.
    ///
    /// For example, when a union appears inside a covariant type constructor like `Array<A | B>`,
    /// this function distributes it to `Array<A> | Array<B>`.
    ///
    /// # Distribution Rules
    ///
    /// Distribution follows these key principles:
    /// * **For covariant positions**:
    ///   - For covariant type constructor `F<T>`, we can prove that `F<A | B> ≡ F<A> | F<B>`
    ///     (complete equivalence)
    ///   - This makes distribution of unions in covariant positions both valid and useful for type
    ///     normalization.
    /// * **For contravariant positions**:
    ///   - For contravariant type constructor `G<T>`, we can prove that `G<A | B> <: G<A> & G<B>`,
    ///     but not necessarily the reverse without additional assumptions
    ///   - This means that it is generally unsafe to distribute unions in contravariant positions
    ///     without further analysis.
    /// * **For invariant positions**: No distribution occurs; invariant parameters must match
    ///   exactly.
    ///
    /// # Closures
    ///
    /// In theory, we could distribute over closures of type `(A | B) -> R` to `(A -> R) & (B ->
    /// R)`, which is logically sound (a function that handles either `A` or `B` must be both a
    /// function that handles `A` and a function that handles `B`). However, as this is
    /// counter-intuitive and can break function selection, we don't implement this distribution
    /// for closures.
    ///
    /// # Return Value
    ///
    /// A `SmallVec` of type IDs representing the distributed form:
    /// * Multiple elements: A union of the distributed types.
    /// * Single element: The identity case - no distribution was necessary.
    /// * Empty vector: The distributed form is `Never` (uninhabited type).
    ///
    /// # Examples in Mathematical Notation
    ///
    /// - Covariant position: `distribute_union(List<A | B>)` → `List<A> | List<B>`
    /// - Contravariant position: `distribute_union((A | B) -> R)` → `(A -> R) & (B -> R)` (not
    ///   implemented)
    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId>;

    /// Applies distribution laws to expressions containing intersection types in contravariant
    /// positions.
    ///
    /// This function handles intersection distribution in type expressions, focusing primarily on
    /// contravariant positions where intersections can distribute outward. It transforms
    /// expressions by "pushing" intersection types outward through contravariant type
    /// constructors, which is essential for normalizing and simplifying types.
    ///
    /// For example, when an intersection appears in a contravariant position like function
    /// parameters, this function distributes it outward appropriately.
    ///
    /// # Distribution Rules
    ///
    /// Distribution follows these key principles:
    /// * **For covariant positions**:
    ///   - For covariant type constructor `F<T>`, we can prove that `F<A & B> ≡ F<A> & F<B>`
    ///     (complete equivalence)
    ///   - This makes distribution of intersections in covariant positions both valid and useful
    ///     for type normalization.
    /// * **For contravariant positions**:
    ///   - For contravariant type constructor `G<T>`, we cannot prove complete equivalence between
    ///     `G<A & B>` and `G<A> | G<B>`. We can only prove that `G<A> | G<B> <: G<A & B>`, but not
    ///     the reverse.
    ///   - This means for function types, `(A & B) -> R` is not necessarily equivalent to `(A -> R)
    ///     | (B -> R)`.
    ///   - Because we can only prove one direction of this relationship, distribution is not valid
    ///     for intersections in contravariant positions.
    /// * **For invariant positions**: No distribution occurs; invariant parameters must match
    ///   exactly.
    ///
    /// # Return Value
    ///
    /// A `SmallVec` of type IDs representing the distributed form:
    /// * Multiple elements: An intersection of the distributed types.
    /// * Single element: The identity case - no distribution was necessary or the result simplified
    ///   to one type.
    /// * Empty vector: The distributed form is `Unknown` (top type).
    ///
    /// # Examples in Mathematical Notation
    ///
    /// - Covariant position: `distribute_intersection(Array<A & B>)` → `Array<A> & Array<B>`
    /// - Contravariant position: For contravariant type constructor `G<T>`, we can prove that `G<A
    ///   & B> <: G<A> | G<B>`, but not the reverse without additional assumptions. This means `(A &
    ///   B) -> R <: (A -> R) | (B -> R)`, but not necessarily vice versa.
    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId>;

    /// Determines if one type is a subtype of another.
    ///
    /// The subtyping relationship is fundamental to type systems, establishing when
    /// a value of one type can be safely used in a context expecting another type.
    /// If type A is a subtype of type B (written as A <: B), then any value of type A
    /// can be safely used where a value of type B is expected.
    ///
    /// # Properties
    ///
    /// The subtyping relation forms a partial order with the following properties:
    /// - Reflexivity: Every type is a subtype of itself (`A <: A`).
    /// - Transitivity: If `A <: B` and `B <: C`, then `A <: C`.
    /// - Antisymmetry: If `A <: B` and `B <: A`, then `A` and `B` are equivalent.
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool;

    /// Determines if two types are equivalent under the subtyping relation.
    ///
    /// Two types are equivalent if they are mutual subtypes of each other - that is,
    /// if type `A` is a subtype of `B` and `B` is also a subtype of `A`. This represents a
    /// bidirectional compatibility relationship, where values of either type can
    /// be used interchangeably in any context expecting the other type.
    ///
    /// # Implementation
    ///
    /// This method is implemented in terms of mutual subtyping checks, determining
    /// if `self <: other` and `other <: self`.
    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        self.is_subtype_of(other, env) && other.is_subtype_of(self, env)
    }

    /// Simplifies a type to its canonical form.
    ///
    /// Type simplification transforms a type into an equivalent but simpler representation.
    /// This process eliminates redundancies, normalizes structure, and applies type-specific
    /// reduction rules to make types more concise and efficient to work with.
    ///
    /// # Common Simplifications
    ///
    /// - Flattening nested union/intersection types (e.g., `A | (B | C)` → `A | B | C`)
    /// - Removing duplicates from union/intersection types (e.g., `A | A | B` → `A | B`)
    /// - Eliminating redundant types based on subtyping (e.g., `Number | Integer` → `Number`)
    /// - Normalizing recursive types to their canonical form
    /// - Removing unreachable branches in union types with uninhabited components
    ///
    /// # Benefits
    ///
    /// Simplification is essential for:
    /// - Generating clearer error messages by showing users simplified type representations
    /// - Improving performance of type checking by working with smaller type representations
    /// - Enabling more precise type inference
    /// - Detecting type equivalence more efficiently
    ///
    /// # Returns
    ///
    /// A new `TypeId` representing the simplified version of the input type.
    /// The simplified type is semantically equivalent to the original but may have
    /// a different structure.
    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId;
}

#[cfg(test)]
pub(crate) mod test {
    #![expect(clippy::min_ident_chars)]
    use crate::{
        pretty::{PrettyOptions, PrettyPrint as _},
        r#type::{
            TypeId,
            environment::{AnalysisEnvironment, Environment, LatticeEnvironment},
        },
    };

    fn assert_idempotence(env: &Environment<'_>, a: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = AnalysisEnvironment::new(env);

        let join1 = lattice.join(a, a);

        assert!(
            analysis.is_equivalent(join1, a),
            "{} != {}",
            env.r#type(join1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(a).pretty_print(env, PrettyOptions::default())
        );

        let meet1 = lattice.meet(a, a);

        assert!(
            analysis.is_equivalent(meet1, a),
            "{} != {}",
            env.r#type(meet1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(a).pretty_print(env, PrettyOptions::default())
        );
    }

    fn assert_commutativity(env: &Environment<'_>, a: TypeId, b: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = AnalysisEnvironment::new(env);

        let join1 = lattice.join(a, b);
        let join2 = lattice.join(b, a);

        assert!(
            analysis.is_equivalent(join1, join2),
            "{} != {}",
            env.r#type(join1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(join2)
                .pretty_print(env, PrettyOptions::default())
        );

        let meet1 = lattice.meet(a, b);
        let meet2 = lattice.meet(b, a);

        assert!(
            analysis.is_equivalent(meet1, meet2),
            "{} != {}",
            env.r#type(meet1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(meet2)
                .pretty_print(env, PrettyOptions::default())
        );
    }

    fn assert_associativity(env: &Environment<'_>, a: TypeId, b: TypeId, c: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = AnalysisEnvironment::new(env);

        let join1_bc = lattice.join(b, c);
        let join1 = lattice.join(a, join1_bc);

        let join2_ab = lattice.join(a, b);
        let join2 = lattice.join(join2_ab, c);

        assert!(
            analysis.is_equivalent(join1, join2),
            "{} != {}",
            env.r#type(join1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(join2)
                .pretty_print(env, PrettyOptions::default())
        );

        let meet1_bc = lattice.meet(b, c);
        let meet1 = lattice.meet(a, meet1_bc);

        let meet2_ab = lattice.meet(a, b);
        let meet2 = lattice.meet(meet2_ab, c);

        assert!(
            analysis.is_equivalent(meet1, meet2),
            "{} != {}",
            env.r#type(meet1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(meet2)
                .pretty_print(env, PrettyOptions::default())
        );
    }

    fn assert_absorption(env: &Environment<'_>, a: TypeId, b: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = AnalysisEnvironment::new(env);

        let meet1 = lattice.meet(a, b); // String and Integer => Never
        let join1 = lattice.join(a, meet1); // Number or Never => Number

        assert!(
            analysis.is_equivalent(join1, a),
            "{} != {}",
            env.r#type(join1)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(a).pretty_print(env, PrettyOptions::default())
        );

        let join2 = lattice.join(a, b); // Number or String => Number or String
        let meet2 = lattice.meet(a, join2); // Number and (Number or String) => Number

        assert!(
            analysis.is_equivalent(meet2, a),
            "{} != {}",
            env.r#type(meet2)
                .pretty_print(env, PrettyOptions::default()),
            env.r#type(a).pretty_print(env, PrettyOptions::default())
        );
    }

    /// Assert that the lattice laws are uphold. `a`, `b` and `c` must all be semantically
    /// different.
    #[track_caller]
    pub(crate) fn assert_lattice_laws(env: &Environment<'_>, a: TypeId, b: TypeId, c: TypeId) {
        let mut equiv = AnalysisEnvironment::new(env);

        assert!(!equiv.is_equivalent(a, b));
        assert!(!equiv.is_equivalent(b, c));
        assert!(!equiv.is_equivalent(a, c));

        assert_commutativity(env, a, b);
        assert_associativity(env, a, b, c);
        assert_absorption(env, a, b);
        assert_idempotence(env, a);
    }
}
