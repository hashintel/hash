use smallvec::SmallVec;

use super::{
    Type, TypeId,
    environment::{LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    kind::TypeKind,
};

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
    // TODO: test join(Number, Number | String)
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4>;

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
    // TODO: test meet(Number, Integer | String) = Integer
    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4>;

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
    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool;

    /// Determines if a type is a top type (encompasses all possible values).
    ///
    /// Top types (also called "universal types" in type theory) can hold any value in the
    /// type system. They're useful as default types or placeholders when the exact type
    /// is unknown or irrelevant.
    ///
    /// In a type lattice, a top type is a supertype of every other type, forming the
    /// greatest element of the lattice. This corresponds to the `?` (`Unknown`) type.
    ///
    /// Examples:
    /// - The `any` type in TypeScript is a top type
    /// - Any union type with the `Unknown` type as a variant is a top type
    /// - Empty intersection types (intersections with no variants) are top types
    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool;

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
    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool;

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16>;
    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16>;

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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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
    use crate::r#type::{
        TypeId,
        environment::{Environment, LatticeEnvironment, TypeAnalysisEnvironment},
        pretty_print::PrettyPrint as _,
    };

    fn assert_idempotence(env: &Environment<'_>, a: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = TypeAnalysisEnvironment::new(env);

        let join1 = lattice.join(a, a);

        assert!(
            analysis.is_equivalent(join1, a),
            "{} != {}",
            env.types[join1].copied().pretty_print(env, 80),
            env.types[a].copied().pretty_print(env, 80)
        );

        let meet1 = lattice.meet(a, a);

        assert!(
            analysis.is_equivalent(meet1, a),
            "{} != {}",
            env.types[meet1].copied().pretty_print(env, 80),
            env.types[a].copied().pretty_print(env, 80)
        );
    }

    fn assert_commutativity(env: &Environment<'_>, a: TypeId, b: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = TypeAnalysisEnvironment::new(env);

        let join1 = lattice.join(a, b);
        let join2 = lattice.join(b, a);

        assert!(
            analysis.is_equivalent(join1, join2),
            "{} != {}",
            env.types[join1].copied().pretty_print(env, 80),
            env.types[join2].copied().pretty_print(env, 80)
        );

        let meet1 = lattice.meet(a, b);
        let meet2 = lattice.meet(b, a);

        assert!(
            analysis.is_equivalent(meet1, meet2),
            "{} != {}",
            env.types[meet1].copied().pretty_print(env, 80),
            env.types[meet2].copied().pretty_print(env, 80)
        );
    }

    fn assert_associativity(env: &Environment<'_>, a: TypeId, b: TypeId, c: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = TypeAnalysisEnvironment::new(env);

        let join1_bc = lattice.join(b, c);
        let join1 = lattice.join(a, join1_bc);

        let join2_ab = lattice.join(a, b);
        let join2 = lattice.join(join2_ab, c);

        assert!(
            analysis.is_equivalent(join1, join2),
            "{} != {}",
            env.types[join1].copied().pretty_print(env, 80),
            env.types[join2].copied().pretty_print(env, 80)
        );

        let meet1_bc = lattice.meet(b, c);
        let meet1 = lattice.meet(a, meet1_bc);

        let meet2_ab = lattice.meet(a, b);
        let meet2 = lattice.meet(meet2_ab, c);

        assert!(
            analysis.is_equivalent(meet1, meet2),
            "{} != {}",
            env.types[meet1].copied().pretty_print(env, 80),
            env.types[meet2].copied().pretty_print(env, 80)
        );
    }

    fn assert_absorption(env: &Environment<'_>, a: TypeId, b: TypeId) {
        let mut lattice = LatticeEnvironment::new(env);

        let mut analysis = TypeAnalysisEnvironment::new(env);

        let meet1 = lattice.meet(a, b); // String and Integer => Never
        let join1 = lattice.join(a, meet1); // Number or Never => Number

        assert!(
            analysis.is_equivalent(join1, a),
            "{} != {}",
            env.types[join1].copied().pretty_print(env, 80),
            env.types[a].copied().pretty_print(env, 80)
        );

        let join2 = lattice.join(a, b); // Number or String => Number or String
        let meet2 = lattice.meet(a, join2); // Number and (Number or String) => Number

        assert!(
            analysis.is_equivalent(meet2, a),
            "{} != {}",
            env.types[meet2].copied().pretty_print(env, 80),
            env.types[a].copied().pretty_print(env, 80)
        );
    }

    /// Assert that the lattice laws are uphold. `a`, `b` and `c` must all be semantically
    /// different.
    #[track_caller]
    pub(crate) fn assert_lattice_laws(env: &Environment<'_>, a: TypeId, b: TypeId, c: TypeId) {
        let mut equiv = TypeAnalysisEnvironment::new(env);

        assert!(!equiv.is_equivalent(a, b));
        assert!(!equiv.is_equivalent(b, c));
        assert!(!equiv.is_equivalent(a, c));

        assert_commutativity(env, a, b);
        assert_associativity(env, a, b, c);
        assert_absorption(env, a, b);
        assert_idempotence(env, a);
    }
}
