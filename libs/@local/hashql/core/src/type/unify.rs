use core::{mem, ops::Index};
use std::collections::{HashMap, HashSet};

use super::{
    Type, TypeId, TypeKind, error::TypeCheckDiagnostic, generic_argument::GenericArgumentId,
};
use crate::{arena::Arena, span::SpanId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum Variance {
    #[default]
    Covariant, // Same direction
    Contravariant, // Opposite direction
    Invariant,     // Exact match
}

enum UnificationArenaInner {
    Root(Arena<Type>),
    Transaction(
        Box<UnificationArena>,
        HashMap<TypeId, Type, foldhash::fast::RandomState>,
    ),
}

/// Transactional unification arena.
///
/// Unlike a normal arena this one is transactional, meaning one can use it to perform unification
/// and then rollback or commit the changes. This is significant in the context of union type
/// checking, as we need to traverse every type in the union to determine if it is compatible with
/// another type.
pub(crate) struct UnificationArena(UnificationArenaInner);

impl UnificationArena {
    const fn new(arena: Arena<Type>) -> Self {
        Self(UnificationArenaInner::Root(arena))
    }

    fn update(&mut self, r#type: Type) {
        match &mut self.0 {
            UnificationArenaInner::Root(arena) => arena.update(r#type),
            UnificationArenaInner::Transaction(_, hash_map) => {
                hash_map.insert(r#type.id, r#type);
            }
        }
    }

    fn update_with(&mut self, id: TypeId, closure: impl FnOnce(&mut Type)) {
        match &mut self.0 {
            UnificationArenaInner::Root(arena) => {
                arena.update_with(id, closure);
            }
            UnificationArenaInner::Transaction(arena, hash_map) => {
                // first get the value, if it's in the arena we first need to clone it, if it's in
                // the hash map we can re-use the value
                if let Some(entry) = hash_map.get_mut(&id) {
                    closure(entry);
                    return;
                }

                let mut r#type = arena[id].clone();
                closure(&mut r#type);
                hash_map.insert(id, r#type);
            }
        }
    }

    /// Begin a new transaction.
    fn begin_transaction(&mut self) {
        // Empty arena does not allocate, as it's just a `Vec` in disguise
        let this = mem::replace(self, UnificationArena::new(Arena::new()));

        self.0 = UnificationArenaInner::Transaction(Box::new(this), HashMap::default());
    }

    /// Commit the current transaction
    ///
    /// # Panics
    ///
    /// If there's no transaction to commit.
    fn commit_transaction(&mut self) {
        let this = mem::replace(&mut self.0, UnificationArenaInner::Root(Arena::new()));

        match this {
            UnificationArenaInner::Root(_) => panic!("No transaction to commit"),
            UnificationArenaInner::Transaction(mut arena, overrides) => {
                for (_, r#type) in overrides {
                    arena.update(r#type);
                }

                *self = *arena;
            }
        }
    }

    /// Rollback the current transaction
    ///
    /// # Panics
    ///
    /// If there's no transaction to rollback.
    fn rollback_transaction(&mut self) {
        let this = mem::replace(&mut self.0, UnificationArenaInner::Root(Arena::new()));

        match this {
            UnificationArenaInner::Root(_) => panic!("No transaction to rollback"),
            UnificationArenaInner::Transaction(arena, _) => {
                *self = *arena;
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn arena_mut_test_only(&mut self) -> &mut Arena<Type> {
        match &mut self.0 {
            UnificationArenaInner::Root(arena) => arena,
            UnificationArenaInner::Transaction(arena, _) => arena.arena_mut_test_only(),
        }
    }
}

impl Index<TypeId> for UnificationArena {
    type Output = Type;

    fn index(&self, index: TypeId) -> &Self::Output {
        match &self.0 {
            UnificationArenaInner::Root(arena) => &arena[index],
            UnificationArenaInner::Transaction(arena, overrides) => {
                overrides.get(&index).unwrap_or_else(|| &arena[index])
            }
        }
    }
}

#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct UnificationContext {
    pub source: SpanId,
    pub(super) arena: UnificationArena,

    variance_context: Variance,

    pub(super) diagnostics: Vec<TypeCheckDiagnostic>,
    visited: HashSet<(TypeId, TypeId), foldhash::fast::RandomState>,

    // The arguments currently in scope
    arguments: HashMap<GenericArgumentId, TypeId, foldhash::fast::RandomState>,
}

impl UnificationContext {
    #[must_use]
    pub fn new(source: SpanId, arena: Arena<Type>) -> Self {
        Self {
            source,
            arena: UnificationArena::new(arena),
            variance_context: Variance::default(),
            diagnostics: Vec::new(),
            visited: HashSet::default(),
            arguments: HashMap::default(),
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<TypeCheckDiagnostic> {
        core::mem::take(&mut self.diagnostics)
    }

    pub fn visit(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        !self.visited.insert((lhs, rhs))
    }

    pub fn leave(&mut self, lhs: TypeId, rhs: TypeId) {
        self.visited.remove(&(lhs, rhs));
    }

    pub(crate) fn record_diagnostic(&mut self, diagnostic: TypeCheckDiagnostic) {
        self.diagnostics.push(diagnostic);
    }

    pub(crate) fn mark_error(&mut self, id: TypeId) {
        self.arena
            .update_with(id, |r#type| r#type.kind = TypeKind::Error);
    }

    pub(crate) fn update_kind(&mut self, id: TypeId, kind: TypeKind) {
        assert_ne!(
            kind,
            TypeKind::Error,
            "Use `UnificationError::mark_error` to mark a type as an error"
        );

        self.arena.update_with(id, |r#type| r#type.kind = kind);
    }

    pub(crate) fn enter_generic_argument_scope(&mut self, id: GenericArgumentId, r#type: TypeId) {
        self.arguments.insert(id, r#type);
    }

    pub(crate) fn exit_generic_argument_scope(&mut self, id: GenericArgumentId) {
        self.arguments.remove(&id);
    }

    pub(crate) fn generic_argument(&self, id: GenericArgumentId) -> Option<TypeId> {
        self.arguments.get(&id).copied()
    }

    pub(crate) const fn variance_context(&self) -> Variance {
        self.variance_context
    }

    pub(crate) fn with_variance<T>(
        &mut self,
        variance: Variance,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let old_variance = self.variance_context;

        // Apply variance composition rules
        self.variance_context = match (old_variance, variance) {
            // When going from covariant to contravariant context or vice versa, flip to
            // contravariant
            (Variance::Covariant, Variance::Contravariant)
            | (Variance::Contravariant, Variance::Covariant) => Variance::Contravariant,

            // When either context is invariant, the result is invariant
            (Variance::Invariant, _) | (_, Variance::Invariant) => Variance::Invariant,

            // Otherwise preserve the context
            _ => variance,
        };

        let result = closure(self);
        self.variance_context = old_variance;
        result
    }

    pub(crate) fn in_contravariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Contravariant, closure)
    }

    pub(crate) fn in_covariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Covariant, closure)
    }

    pub(crate) fn in_invariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Invariant, closure)
    }

    pub(crate) fn in_transaction(&mut self, closure: impl FnOnce(&mut Self) -> bool) {
        self.arena.begin_transaction();
        let length = self.diagnostics.len();

        let result = closure(self);

        if result {
            self.arena.commit_transaction();
        } else {
            self.arena.rollback_transaction();
            self.diagnostics.truncate(length);
        }
    }
}

#[cfg(test)]
mod test {
    use core::assert_matches::assert_matches;

    use crate::{
        arena::Arena,
        span::SpanId,
        r#type::{
            Type, TypeId, TypeKind,
            error::type_mismatch,
            generic_argument::GenericArgumentId,
            primitive::PrimitiveType,
            unify::{UnificationArena, UnificationContext, Variance},
        },
    };

    fn create_test_type(arena: &mut Arena<Type>, kind: TypeKind) -> TypeId {
        arena.push_with(|id| Type {
            id,
            kind,
            span: SpanId::SYNTHETIC,
        })
    }

    fn setup_arena() -> (Arena<Type>, TypeId, TypeId) {
        let mut arena = Arena::new();

        // Create a few test types
        let type1 = create_test_type(&mut arena, TypeKind::Primitive(PrimitiveType::Null));
        let type2 = create_test_type(&mut arena, TypeKind::Primitive(PrimitiveType::Boolean));

        (arena, type1, type2)
    }

    #[test]
    fn basic_operations() {
        let (arena, type1, type2) = setup_arena();

        // Create unification arena
        let mut unif_arena = UnificationArena::new(arena);

        // Verify initial state
        assert_matches!(
            unif_arena[type1].kind,
            TypeKind::Primitive(PrimitiveType::Null)
        );
        assert_matches!(
            unif_arena[type2].kind,
            TypeKind::Primitive(PrimitiveType::Boolean)
        );

        // Update a type
        let mut type1 = unif_arena[type1].clone();
        let type1_id = type1.id;
        type1.kind = TypeKind::Primitive(PrimitiveType::Number);
        unif_arena.update(type1);

        // Verify update
        assert_matches!(
            unif_arena[type1_id].kind,
            TypeKind::Primitive(PrimitiveType::Number)
        );
    }

    #[test]
    fn update_with() {
        let (arena, id1, _) = setup_arena();

        let mut unif_arena = UnificationArena::new(arena);

        // Use update_with to change a type
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Verify the change
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );
    }

    #[test]
    fn simple_transaction() {
        let (arena, id1, id2) = setup_arena();

        let mut unif_arena = UnificationArena::new(arena);

        // Start a transaction
        unif_arena.begin_transaction();

        // Make changes in the transaction
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Verify changes are visible within the transaction
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::Boolean)
        );

        // Commit the transaction
        unif_arena.commit_transaction();

        // Verify changes persisted after commit
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::Boolean)
        );
    }

    #[test]
    fn transaction_rollback() {
        let (arena, id1, _) = setup_arena();

        let mut unif_arena = UnificationArena::new(arena);

        // Start a transaction
        unif_arena.begin_transaction();

        // Make changes in the transaction
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Verify changes are visible
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );

        // Rollback the transaction
        unif_arena.rollback_transaction();

        // Verify original state is restored
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::Null)
        );
    }

    #[test]
    fn multiple_updates_in_transaction() {
        let (arena, id1, id2) = setup_arena();

        let mut unif_arena = UnificationArena::new(arena);

        unif_arena.begin_transaction();

        // Update the same type multiple times
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::Number);
        });

        // Update another type
        unif_arena.update_with(id2, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Verify all updates are visible
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::Number)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );

        // Commit and verify persistence
        unif_arena.commit_transaction();
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::Number)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );
    }

    #[test]
    fn nested_transactions() {
        let (arena, id1, id2) = setup_arena();

        let mut unif_arena = UnificationArena::new(arena);

        // Outer transaction
        unif_arena.begin_transaction();
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Inner transaction
        unif_arena.begin_transaction();
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::Number);
        });
        unif_arena.update_with(id2, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Verify inner transaction changes
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::Number)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );

        // Rollback inner transaction
        unif_arena.rollback_transaction();

        // Verify outer transaction state
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::Boolean)
        );

        // Commit outer transaction
        unif_arena.commit_transaction();

        // Verify final state
        assert_matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::String)
        );
        assert_matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::Boolean)
        );
    }

    #[test]
    fn mixed_transaction_operations() {
        let (arena, id1, id2) = setup_arena();

        let mut unif_arena = UnificationArena::new(arena);

        // Start with direct update
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Begin transaction
        unif_arena.begin_transaction();

        // Update both inside transaction
        unif_arena.update_with(id1, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::Number);
        });
        unif_arena.update_with(id2, |r#type| {
            r#type.kind = TypeKind::Primitive(PrimitiveType::String);
        });

        // Verify transaction state
        assert!(matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
        assert!(matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::String)
        ));

        // Commit transaction
        unif_arena.commit_transaction();

        // Verify committed state
        assert!(matches!(
            unif_arena[id1].kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
        assert!(matches!(
            unif_arena[id2].kind,
            TypeKind::Primitive(PrimitiveType::String)
        ));
    }

    #[test]
    fn variance_context() {
        let (arena, _, _) = setup_arena();
        let mut context = UnificationContext::new(SpanId::SYNTHETIC, arena);

        // Default should be covariant
        assert_eq!(context.variance_context(), Variance::Covariant);

        // Test contravariant scope
        context.in_contravariant(|ctx| {
            assert_eq!(ctx.variance_context(), Variance::Contravariant);

            // Test nested covariant in contravariant (should flip to contravariant)
            ctx.in_covariant(|inner_ctx| {
                assert_eq!(inner_ctx.variance_context(), Variance::Contravariant);
            });
        });

        // Test invariant scope
        context.in_invariant(|ctx| {
            assert_eq!(ctx.variance_context(), Variance::Invariant);

            // Test nested covariant in invariant (should remain invariant)
            ctx.in_covariant(|inner_ctx| {
                assert_eq!(inner_ctx.variance_context(), Variance::Invariant);
            });
        });

        // Test variance after all scopes (should restore to default)
        assert_eq!(context.variance_context(), Variance::Covariant);
    }

    #[test]
    fn generic_argument_scope() {
        let (arena, id1, _) = setup_arena();
        let mut context = UnificationContext::new(SpanId::SYNTHETIC, arena);

        let arg_id = GenericArgumentId::new(42);

        // Initially no argument is in scope
        assert_eq!(context.generic_argument(arg_id), None);

        // Enter scope
        context.enter_generic_argument_scope(arg_id, id1);

        // Check argument is now in scope
        assert_eq!(context.generic_argument(arg_id), Some(id1));

        // Exit scope
        context.exit_generic_argument_scope(arg_id);

        // Check argument is no longer in scope
        assert_eq!(context.generic_argument(arg_id), None);
    }

    #[test]
    fn diagnostics() {
        let (arena, id1, id2) = setup_arena();
        let mut context = UnificationContext::new(SpanId::SYNTHETIC, arena);

        // Initially no diagnostics
        assert!(context.take_diagnostics().is_empty());

        // Add a diagnostic
        let diagnostic = type_mismatch(
            SpanId::SYNTHETIC,
            &context.arena,
            &context.arena[id1],
            &context.arena[id2],
            None,
        );
        context.record_diagnostic(diagnostic);

        // Take diagnostics should return the recorded diagnostic and clear
        let diagnostics = context.take_diagnostics();
        assert_eq!(diagnostics.len(), 1);

        // Should be empty after taking
        assert!(context.take_diagnostics().is_empty());

        // Test marking error
        context.mark_error(id1);
        assert!(matches!(context.arena[id1].kind, TypeKind::Error));
    }
}
