use smallvec::SmallVec;

use super::{
    Type, TypeId,
    environment::{
        LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment, UnificationEnvironment,
    },
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
    fn is_uninhabited(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool;

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

    /// Unifies two types according to subtyping rules.
    ///
    /// Determines if one type can be used in a context where another type is expected, according to
    /// the subtyping relationship. Unlike `join` and `meet` which compute new types,
    /// unification checks compatibility between existing types.
    ///
    /// In type theory terms, unification checks if `rhs <: lhs` ("rhs is a subtype of lhs"),
    /// meaning values of type `rhs` can be used where values of type `lhs` are expected.
    ///
    /// # Applications
    ///
    /// Unification is fundamental to:
    /// - Type checking function arguments against parameter types
    /// - Verifying assignment compatibility
    /// - Implementing polymorphic type systems
    /// - Resolving type variables in type inference
    ///
    /// # Variance
    ///
    /// Unification respects variance, which determines how subtyping relationships
    /// between component types affect subtyping relationships between composite types:
    ///
    /// - **Covariant**: Preserves subtyping direction (if A <: B then F<A> <: F<B>)
    /// - **Contravariant**: Reverses subtyping direction (if A <: B then F<B> <: F<A>)
    /// - **Invariant**: Requires exact type equality (F<A> <: F<B> only if A = B)
    ///
    /// # Behavior
    ///
    /// Rather than returning errors directly, this method reports errors through the
    /// `UnificationEnvironment`. This allows for better error reporting and collection of multiple
    /// errors during a single unification process.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// // Succeeds because Integer <: Number (Integer is a subtype of Number)
    /// unify(Number, Integer)
    ///
    /// // Fails because Number is not a subtype of Integer
    /// unify(Integer, Number) // This will report an error through the environment
    /// ```
    fn unify(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut UnificationEnvironment<'_, 'heap>,
    );

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
    use super::Lattice;
    use crate::r#type::{
        Type, TypeId,
        environment::{Environment, LatticeEnvironment, TypeAnalysisEnvironment},
        kind::TypeKind,
    };

    #[track_caller]
    fn assert_commutativity<'heap, T>(
        env: &Environment<'heap>,
        convert: impl Fn(Type<'heap, TypeKind>) -> Type<'heap, T>,
        a: TypeId,
        b: TypeId,
    ) where
        T: Lattice<'heap> + 'heap,
    {
        let mut env = LatticeEnvironment::new(env);

        let a = env.types[a].copied();
        let b = env.types[b].copied();

        let a = convert(a);
        let b = convert(b);

        // TODO: for this to work we need Union/Intersection support first

        // assert_eq!(a.join(b, &mut env), b.join(a, &mut env));
        // assert_eq!(a.meet(b, &mut env), b.meet(a, &mut env));
    }

    #[track_caller]
    fn assert_associativity<'heap, T>(
        env: &Environment<'heap>,
        convert: impl Fn(Type<'heap, TypeKind>) -> Type<'heap, T>,
        a: TypeId,
        b: TypeId,
        c: TypeId,
    ) where
        T: Lattice<'heap> + 'heap,
    {
        let mut env = LatticeEnvironment::new(env);

        let a = env.types[a].copied();
        let b = env.types[b].copied();
        let c = env.types[c].copied();

        let a = convert(a);
        let b = convert(b);
        let c = convert(c);

        // TODO: for this to work we need Union/Intersection support first

        // assert_eq!(
        //     a.join(b.join(c, &mut env), &mut env),
        //     a.join(c.join(b, &mut env), &mut env)
        // );

        // assert_eq!(
        //     a.meet(b.meet(c, &mut env), &mut env),
        //     a.meet(c.meet(b, &mut env), &mut env)
        // );
    }

    #[track_caller]
    fn assert_absorption<'heap, T>(
        env: &Environment<'heap>,
        convert: impl Fn(Type<'heap, TypeKind>) -> Type<'heap, T>,
        a: TypeId,
        b: TypeId,
    ) where
        T: Lattice<'heap> + 'heap,
    {
        let mut env = LatticeEnvironment::new(env);

        let a = env.types[a].copied();
        let b = env.types[b].copied();

        let a = convert(a);
        let b = convert(b);

        // TODO: for this to work we need Union/Intersection support first

        // assert_eq!(a.join(a.meet(b, env), env), a);
        // assert_eq!(a.meet(a.join(b, env), env), a);
    }

    #[track_caller]
    fn assert_idempotence<'heap, T>(
        env: &Environment<'heap>,
        convert: impl Fn(Type<'heap, TypeKind>) -> Type<'heap, T>,
        a: TypeId,
    ) where
        T: Lattice<'heap> + 'heap,
    {
        let mut env = LatticeEnvironment::new(env);

        let a = env.types[a].copied();

        let a = convert(a);

        // TODO: for this to work we need Union/Intersection support first

        // assert_eq!(a.join(a, env), a);
        // assert_eq!(a.meet(a, env), a);
    }

    /// Assert that the lattice laws are uphold. `a`, `b` and `c` must all be semantically
    /// different.
    #[track_caller]
    pub(crate) fn assert_lattice_laws<'heap, T>(
        env: &Environment<'heap>,
        convert: impl Fn(Type<'heap, TypeKind>) -> Type<'heap, T>,
        a: TypeId,
        b: TypeId,
        c: TypeId,
    ) where
        T: Lattice<'heap> + 'heap,
    {
        let mut equiv = TypeAnalysisEnvironment::new(env);

        assert!(!equiv.is_equivalent(a, b));
        assert!(!equiv.is_equivalent(b, c));
        assert!(!equiv.is_equivalent(a, c));

        assert_commutativity(env, &convert, a, b);
        assert_associativity(env, &convert, a, b, c);
        assert_absorption(env, &convert, a, b);
        assert_idempotence(env, &convert, a);
    }
}
