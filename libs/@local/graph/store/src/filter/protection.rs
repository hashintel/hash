//! Filter protection for sensitive properties.
//!
//! This module provides protection against information leakage through filter queries
//! on protected properties (e.g., email on User entities). It detects and transforms
//! filters to prevent enumeration attacks.
//!
//! # Security Goal
//!
//! Prevent attackers from discovering whether a User with a specific email address
//! exists by observing query results. Even when the API strips email from User
//! responses, returning a result reveals that the user exists.
//!
//! # Threat Model
//!
//! An attacker can construct filters that reference the email property:
//! - Direct lookup: `email = "target@example.com"`
//! - Existence check: `EXISTS(email)`
//! - Prefix probing: `email STARTS WITH "target@"`
//! - Count analysis: comparing result counts for different email values
//!
//! # Derivation of the Protection Algorithm
//!
//! We build up the solution step by step, discovering edge cases as we go.
//!
//! ## Step 1: The Basic Case
//!
//! For a simple email filter, we add a condition to exclude Users:
//!
//! ```text
//! email = X  →  email = X AND NOT(type = User)
//! ```
//!
//! This is straightforward: Users are never returned when filtering by email.
//!
//! ## Step 2: What About AND?
//!
//! Consider: `email = X AND name = "Alice"`
//!
//! Option A - Apply protection at top level:
//! ```text
//! (email = X AND name = "Alice") AND NOT(type = User)
//! ```
//!
//! Option B - Apply protection at the email leaf:
//! ```text
//! (email = X AND NOT(type = User)) AND name = "Alice"
//! ```
//!
//! Both are equivalent! With AND, it doesn't matter where we add the protection.
//! The filter requires ALL conditions to match, so adding `NOT(type = User)`
//! anywhere excludes Users from the entire result.
//!
//! ## Step 3: What About OR?
//!
//! Consider: `email = X OR name = "Alice"`
//!
//! Option A - Apply protection at top level:
//! ```text
//! (email = X OR name = "Alice") AND NOT(type = User)
//! ```
//!
//! Let's verify with a User named "Alice" (email: "other@example.com"):
//! - `email = X` → false (email doesn't match)
//! - `name = "Alice"` → true
//! - `NOT(type = User)` → false (is a User)
//! - Result: `(false OR true) AND false` = false
//!
//! **Problem!** Alice should be returned - she matched via the name branch,
//! which has nothing to do with email. Our blanket protection killed a
//! legitimate result.
//!
//! Option B - Apply protection at the email leaf only:
//! ```text
//! (email = X AND NOT(type = User)) OR name = "Alice"
//! ```
//!
//! Same User "Alice":
//! - `email = X AND NOT(type = User)` → `false AND false` = false
//! - `name = "Alice"` → true
//! - Result: `false OR true` = true ✓
//!
//! **Insight:** We must apply protection directly at the email condition,
//! not at the top level. This preserves other branches in OR expressions.
//!
//! ## Step 4: Handling NOT
//!
//! Consider: `NOT(email = X)`
//!
//! This returns all entities whose email is NOT equal to X. An attacker can use
//! this for enumeration: if a User with email X exists, they won't appear in
//! results. If no User has email X, all Users appear. The count difference
//! reveals whether a User with that email exists.
//!
//! We need to exclude Users here too. First attempt - apply protection inside:
//! ```text
//! NOT(email = X AND NOT(type = User))
//! ```
//!
//! Test with User (email: X):
//! - `email = X` → true
//! - `NOT(type = User)` → false
//! - `email = X AND NOT(type = User)` → false
//! - `NOT(false)` → true
//!
//! **Wrong!** The User IS returned. Protection inside NOT doesn't work.
//!
//! What we actually want is:
//! ```text
//! NOT(email = X) AND NOT(type = User)
//! ```
//!
//! Test with User (email: X):
//! - `NOT(email = X)` → false
//! - `NOT(type = User)` → false
//! - Result: false ✓
//!
//! Test with User (email: Y, different from X):
//! - `NOT(email = X)` → true (email Y ≠ X)
//! - `NOT(type = User)` → false
//! - Result: false ✓
//!
//! Users are always excluded regardless of their email.
//!
//! ## Step 5: NOT with OR Inside
//!
//! Consider: `NOT(email = X OR name = "Alice")`
//!
//! We established we need `AND NOT(type = User)` outside the NOT. Let's verify:
//! ```text
//! NOT(email = X OR name = "Alice") AND NOT(type = User)
//! ```
//!
//! Test with User named "Bob" (email: Y):
//! - `NOT(false OR false)` → true
//! - `NOT(type = User)` → false
//! - Result: false ✓ (User excluded)
//!
//! Test with Invitation named "Bob" (email: Y):
//! - `NOT(false OR false)` → true
//! - `NOT(type = User)` → true
//! - Result: true ✓
//!
//! This works! But recall from Step 3: we should apply protection at the leaf.
//! For NOT, applying at the leaf means inside the NOT. But Step 4 showed that
//! doesn't work. So for NOT, we need a different approach.
//!
//! ## Step 6: De Morgan to the Rescue
//!
//! We want: `NOT(email = X) AND NOT(type = User)`
//!
//! Using De Morgan's law in reverse:
//! ```text
//! NOT(A) AND NOT(B) = NOT(A OR B)
//! ```
//!
//! Therefore:
//! ```text
//! NOT(email = X) AND NOT(type = User) = NOT(email = X OR type = User)
//! ```
//!
//! **Key insight:** Instead of adding `AND NOT(type = User)` outside the NOT,
//! we can add `OR type = User` INSIDE the NOT!
//!
//! Original: `NOT(email = X)`
//! Transform to: `NOT(email = X OR type = User)`
//!
//! This IS a leaf-level transformation (we modify the email condition),
//! and De Morgan ensures it produces the protection we need.
//!
//! ## Step 7: NOT with OR - Applying at Leaf
//!
//! Now consider: `NOT(email = X OR name = "Alice")`
//!
//! Apply `OR type = User` at the email leaf:
//! ```text
//! NOT((email = X OR type = User) OR name = "Alice")
//! = NOT(email = X OR type = User OR name = "Alice")
//! ```
//!
//! Using De Morgan:
//! ```text
//! = NOT(email = X) AND NOT(type = User) AND NOT(name = "Alice")
//! ```
//!
//! Test with User named "Bob" (email: Y):
//! - `NOT(email = X)` → true
//! - `NOT(type = User)` → false
//! - Result: false ✓ (User excluded)
//!
//! Test with Invitation named "Charlie" (email: Z):
//! - All three NOTs are true
//! - Result: true ✓
//!
//! Leaf-level transformation with `OR type = User` works inside NOT!
//!
//! ## Step 8: NOT with AND Inside
//!
//! Now consider: `NOT(email = X AND name = "Alice")`
//!
//! By De Morgan, original = `NOT(email=X) OR NOT(name="Alice")`.
//! Returns entities where email≠X OR name≠Alice (at least one fails).
//!
//! Apply `OR type = User` at the email leaf (depth 1):
//! ```text
//! NOT((email = X OR type = User) AND name = "Alice")
//! ```
//!
//! Expanding via De Morgan:
//! ```text
//! = NOT(email = X OR type = User) OR NOT(name = "Alice")
//! = (NOT(email = X) AND NOT(type = User)) OR NOT(name = "Alice")
//! ```
//!
//! Test with User named "Alice" (email: Y, not X):
//! - Original: `NOT(email=X) OR NOT(name=Alice)` = `true OR false` = true (returned!)
//! - Protected: `(true AND false) OR false` = false ✓ (excluded)
//!
//! The User would have been returned via the `email≠X` branch - that's email-based
//! filtering, so we correctly block it.
//!
//! Test with User named "Bob" (email: Y):
//! - Original: `true OR true` = true
//! - Protected: `(true AND false) OR true` = true ✓ (returned via name≠Alice)
//!
//! The User is returned via the `name≠Alice` branch - that's legitimate, not
//! email-based.
//!
//! Test with Invitation named "Alice" (email: Y):
//! - Protected: `(true AND true) OR false` = true ✓
//!
//! Invitations work normally. ✓
//!
//! ## Step 9: Nested NOT
//!
//! Consider: `NOT(NOT(email = X))`
//!
//! We count NOT-depth from root to the email condition:
//! ```text
//! NOT(           ← depth 0 → 1
//!   NOT(         ← depth 1 → 2
//!     email = X  ← email is at depth 2
//!   )
//! )
//! ```
//!
//! The email condition is at depth 2 (even), so we use `AND NOT(type = User)`:
//! ```text
//! NOT(NOT(email = X AND NOT(type = User)))
//! ```
//!
//! Let's verify with De Morgan applied twice (inside-out):
//!
//! **Step 1:** Apply De Morgan to inner NOT:
//! ```text
//! Inner:  email = X AND NOT(type = User)
//! NOT(inner) = NOT(email = X) OR NOT(NOT(type = User))
//!            = NOT(email = X) OR type = User
//! ```
//!
//! **Step 2:** Apply De Morgan to outer NOT:
//! ```text
//! NOT(NOT(email = X) OR type = User)
//! = NOT(NOT(email = X)) AND NOT(type = User)
//! = email = X AND NOT(type = User)
//! ```
//!
//! The double De Morgan preserves `AND NOT(type = User)`. ✓
//!
//! **What if we mistakenly used `OR type = User` (depth 1 rule)?**
//!
//! ```text
//! NOT(NOT(email = X OR type = User))
//! ```
//!
//! **Step 1:** De Morgan on inner:
//! ```text
//! NOT(email = X OR type = User) = NOT(email = X) AND NOT(type = User)
//! ```
//!
//! **Step 2:** De Morgan on outer:
//! ```text
//! NOT(NOT(email = X) AND NOT(type = User))
//! = email = X OR type = User
//! ```
//!
//! This returns ALL Users via `type = User` - wrong!
//!
//! **Key insight:** Each NOT "flips" AND↔OR via De Morgan. After 2 NOTs,
//! we're back to the original operator. So at even depth, use `AND` to get `AND`.
//! At odd depth, use `OR` which flips once to become `AND`.
//!
//! ## Step 10: The General Rule
//!
//! The pattern emerges: NOT depth determines which transformation to apply.
//!
//! | NOT depth | At email leaf, add:      | Why                                    |
//! |-----------|--------------------------|----------------------------------------|
//! | 0 (even)  | `AND NOT(type = User)`   | Direct exclusion                       |
//! | 1 (odd)   | `OR type = User`         | De Morgan produces AND NOT after NOT   |
//! | 2 (even)  | `AND NOT(type = User)`   | Double NOT cancels, back to depth 0    |
//! | 3 (odd)   | `OR type = User`         | Triple NOT = single NOT behavior       |
//!
//! **Rule:** At even depth, use `AND NOT(type = User)`.
//!           At odd depth, use `OR type = User`.
//!
//! # Final Algorithm
//!
//! ```text
//! transform(filter, not_depth):
//!     match filter:
//!         NOT(inner) →
//!             NOT(transform(inner, not_depth + 1))
//!
//!         AND(filters) →
//!             AND(filters.map(f → transform(f, not_depth)))
//!
//!         OR(filters) →
//!             OR(filters.map(f → transform(f, not_depth)))
//!
//!         condition_with_email →
//!             if not_depth is even:
//!                 condition AND NOT(type = User)
//!             else:
//!                 condition OR type = User
//!
//!         other → other  // no email reference, unchanged
//! ```
//!
//! # Verification: Complete Truth Tables
//!
//! We verify each transformation with all combinations of:
//! - Entity type: User (U) vs Invitation (I)
//! - Email match: email = X (✓) vs email ≠ X (✗)
//! - Name match: name = A (✓) vs name ≠ A (✗)
//!
//! Legend: `ret` = returned, `excl` = excluded, `(!)` = WRONG behavior
//!
//! ## Case 1: `email = X`
//!
//! Original query returns entities where email equals X.
//!
//! Protected: `email = X AND NOT(type = User)`
//!
//! ```text
//! | Type | email=X | Original | Protected | Correct? |
//! |------|---------|----------|-----------|----------|
//! | U    | ✓       | ret      | excl      | ✓        |
//! | U    | ✗       | excl     | excl      | ✓        |
//! | I    | ✓       | ret      | ret       | ✓        |
//! | I    | ✗       | excl     | excl      | ✓        |
//! ```
//!
//! Users never returned via email filter. Invitations work normally. ✓
//!
//! ## Case 2: `email = X AND name = A`
//!
//! Original returns entities matching BOTH conditions.
//!
//! Protected: `(email = X AND NOT(type = User)) AND name = A`
//!
//! ```text
//! | Type | email=X | name=A | Original | Protected | Correct? |
//! |------|---------|--------|----------|-----------|----------|
//! | U    | ✓       | ✓      | ret      | excl      | ✓        |
//! | U    | ✓       | ✗      | excl     | excl      | ✓        |
//! | U    | ✗       | ✓      | excl     | excl      | ✓        |
//! | U    | ✗       | ✗      | excl     | excl      | ✓        |
//! | I    | ✓       | ✓      | ret      | ret       | ✓        |
//! | I    | ✓       | ✗      | excl     | excl      | ✓        |
//! | I    | ✗       | ✓      | excl     | excl      | ✓        |
//! | I    | ✗       | ✗      | excl     | excl      | ✓        |
//! ```
//!
//! Users excluded. Invitations with both matches still returned. ✓
//!
//! ## Case 3: `email = X OR name = A`
//!
//! Original returns entities matching EITHER condition.
//!
//! Protected: `(email = X AND NOT(type = User)) OR name = A`
//!
//! ```text
//! | Type | email=X | name=A | Original | Protected | Correct? |
//! |------|---------|--------|----------|-----------|----------|
//! | U    | ✓       | ✓      | ret      | ret       | ✓ (via name)  |
//! | U    | ✓       | ✗      | ret      | excl      | ✓ (email protected) |
//! | U    | ✗       | ✓      | ret      | ret       | ✓ (via name)  |
//! | U    | ✗       | ✗      | excl     | excl      | ✓        |
//! | I    | ✓       | ✓      | ret      | ret       | ✓        |
//! | I    | ✓       | ✗      | ret      | ret       | ✓        |
//! | I    | ✗       | ✓      | ret      | ret       | ✓        |
//! | I    | ✗       | ✗      | excl     | excl      | ✓        |
//! ```
//!
//! Key insight: User with name=A is still returned (legitimate query).
//! User with ONLY email match is excluded (email enumeration blocked). ✓
//!
//! ## Case 4: `NOT(email = X)`
//!
//! Original returns entities where email is NOT X.
//!
//! Protected: `NOT(email = X OR type = User)` = `NOT(email=X) AND NOT(type=User)`
//!
//! ```text
//! | Type | email=X | Original | Protected | Correct? |
//! |------|---------|----------|-----------|----------|
//! | U    | ✓       | excl     | excl      | ✓        |
//! | U    | ✗       | ret      | excl      | ✓ (no enumeration) |
//! | I    | ✓       | excl     | excl      | ✓        |
//! | I    | ✗       | ret      | ret       | ✓        |
//! ```
//!
//! Without protection, attacker could count Users with email≠X to detect existence.
//! With protection, Users are always excluded. ✓
//!
//! ## Case 5: `NOT(email = X OR name = A)`
//!
//! Original returns entities matching NEITHER condition.
//!
//! Protected: `NOT((email = X OR type = User) OR name = A)`
//!          = `NOT(email=X) AND NOT(type=User) AND NOT(name=A)`
//!
//! ```text
//! | Type | email=X | name=A | Original | Protected | Correct? |
//! |------|---------|--------|----------|-----------|----------|
//! | U    | ✓       | ✓      | excl     | excl      | ✓        |
//! | U    | ✓       | ✗      | excl     | excl      | ✓        |
//! | U    | ✗       | ✓      | excl     | excl      | ✓        |
//! | U    | ✗       | ✗      | ret      | excl      | ✓ (no enumeration) |
//! | I    | ✓       | ✓      | excl     | excl      | ✓        |
//! | I    | ✓       | ✗      | excl     | excl      | ✓        |
//! | I    | ✗       | ✓      | excl     | excl      | ✓        |
//! | I    | ✗       | ✗      | ret      | ret       | ✓        |
//! ```
//!
//! Users always excluded. Invitations matching neither condition still returned. ✓
//!
//! ## Case 6: `NOT(email = X AND name = A)`
//!
//! Original returns entities where NOT(email=X AND name=A).
//! By De Morgan: `NOT(email=X) OR NOT(name=A)` - returns if EITHER condition fails.
//!
//! The `email = X` is at depth 1 (odd) → add `OR type = User`:
//! Protected: `NOT((email = X OR type = User) AND name = A)`
//!
//! Expanding via De Morgan:
//! ```text
//! NOT((email = X OR type = User) AND name = A)
//! = NOT(email = X OR type = User) OR NOT(name = A)
//! = (NOT(email = X) AND NOT(type = User)) OR NOT(name = A)
//! ```
//!
//! So protected query returns: `(email≠X AND not User) OR name≠A`
//!
//! ```text
//! | Type | email=X | name=A | Original | Protected | Correct? |
//! |------|---------|--------|----------|-----------|----------|
//! | U    | ✓       | ✓      | excl     | excl      | ✓        |
//! | U    | ✓       | ✗      | ret      | ret       | ✓ (via name≠A) |
//! | U    | ✗       | ✓      | ret      | excl      | ✓ (was via email≠X) |
//! | U    | ✗       | ✗      | ret      | ret       | ✓ (via name≠A) |
//! | I    | ✓       | ✓      | excl     | excl      | ✓        |
//! | I    | ✓       | ✗      | ret      | ret       | ✓        |
//! | I    | ✗       | ✓      | ret      | ret       | ✓        |
//! | I    | ✗       | ✗      | ret      | ret       | ✓        |
//! ```
//!
//! Key insight: In the original, User with email≠X, name=A would be returned
//! via the `NOT(email=X)` branch - this is email-based and must be blocked.
//! User with name≠A is still returned (legitimate, not email-based). ✓
//!
//! ## Case 7: `NOT(NOT(email = X))`
//!
//! Double negation = `email = X`. Original returns entities where email = X.
//!
//! Protected (depth 2, even): `NOT(NOT(email = X AND NOT(type = User)))`
//!                          = `email = X AND NOT(type = User)`
//!
//! ```text
//! | Type | email=X | Original | Protected | Correct? |
//! |------|---------|----------|-----------|----------|
//! | U    | ✓       | ret      | excl      | ✓        |
//! | U    | ✗       | excl     | excl      | ✓        |
//! | I    | ✓       | ret      | ret       | ✓        |
//! | I    | ✗       | excl     | excl      | ✓        |
//! ```
//!
//! Same as Case 1 - double NOT cancels, protection still works. ✓
//!
//! ## Case 8: `NOT(NOT(NOT(email = X)))`
//!
//! Triple negation = `NOT(email = X)`. Returns entities where email ≠ X.
//!
//! Protected (depth 3, odd): `NOT(NOT(NOT(email = X OR type = User)))`
//!                         = `NOT(email = X OR type = User)`
//!                         = `NOT(email=X) AND NOT(type=User)`
//!
//! ```text
//! | Type | email=X | Original | Protected | Correct? |
//! |------|---------|----------|-----------|----------|
//! | U    | ✓       | excl     | excl      | ✓        |
//! | U    | ✗       | ret      | excl      | ✓        |
//! | I    | ✓       | excl     | excl      | ✓        |
//! | I    | ✗       | ret      | ret       | ✓        |
//! ```
//!
//! Same as Case 4 - triple NOT = single NOT, protection works. ✓
//!
//! ## Case 9: `NOT(name = A OR NOT(email = X))`
//!
//! Complex: Returns entities where name≠A AND email=X.
//!
//! Inner `NOT(email = X)` is at depth 2 (even) → use `AND NOT(type=User)`:
//! `NOT(name = A OR NOT(email = X AND NOT(type = User)))`
//!
//! Let's expand: `NOT(email = X AND NOT(type=User))` at depth 1.
//! This equals: `NOT(email=X) OR type=User` (De Morgan).
//!
//! Full: `NOT(name = A OR (NOT(email=X) OR type=User))`
//!     = `NOT(name=A) AND NOT(NOT(email=X) OR type=User)`
//!     = `NOT(name=A) AND (email=X AND NOT(type=User))`
//!     = `name≠A AND email=X AND NOT(type=User)`
//!
//! ```text
//! | Type | email=X | name=A | Original | Protected | Correct? |
//! |------|---------|--------|----------|-----------|----------|
//! | U    | ✓       | ✓      | excl     | excl      | ✓        |
//! | U    | ✓       | ✗      | ret      | excl      | ✓        |
//! | U    | ✗       | ✓      | excl     | excl      | ✓        |
//! | U    | ✗       | ✗      | excl     | excl      | ✓        |
//! | I    | ✓       | ✓      | excl     | excl      | ✓        |
//! | I    | ✓       | ✗      | ret      | ret       | ✓        |
//! | I    | ✗       | ✓      | excl     | excl      | ✓        |
//! | I    | ✗       | ✗      | excl     | excl      | ✓        |
//! ```
//!
//! Users excluded even in complex nested case. ✓
//!
//! # Summary
//!
//! In ALL cases:
//! - Users are NEVER returned based on email conditions
//! - Users CAN be returned via non-email branches (e.g., name match in OR)
//! - Invitations behave exactly as the original query intended
//! - The NOT-depth rule correctly handles arbitrary nesting

use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use type_system::{
    knowledge::{PropertyValue, entity::Entity},
    ontology::id::BaseUrl,
};

use crate::{
    entity::EntityQueryPath,
    filter::{Filter, FilterExpression, FilterExpressionList, JsonPath, Parameter, PathToken},
};

// =============================================================================
// Configuration
// =============================================================================

/// Configuration for filter-based protection against information leakage.
///
/// Maps protected properties to the entity types that should be excluded when
/// filtering on that property. Optimized for fast lookup by property.
///
/// # Example
///
/// To protect email filtering on User entities:
///
/// ```
/// use std::collections::HashSet;
///
/// use hash_graph_store::filter::protection::FilterProtectionConfig;
/// use type_system::ontology::id::BaseUrl;
///
/// let email_url =
///     BaseUrl::new("https://hash.ai/@h/types/property-type/email/".to_owned()).unwrap();
/// let user_url = BaseUrl::new("https://hash.ai/@h/types/entity-type/user/".to_owned()).unwrap();
///
/// let config =
///     FilterProtectionConfig::new().protect_property(email_url, HashSet::from([user_url]));
/// ```
#[derive(Debug, Clone, Default)]
pub struct FilterProtectionConfig {
    /// Maps property base URLs to the set of entity types that should be excluded.
    ///
    /// Key: protected property, Value: entity types to exclude when filtering on this property.
    property_to_excluded_types: HashMap<BaseUrl, HashSet<BaseUrl>>,
}

impl FilterProtectionConfig {
    /// Creates a new empty filter protection configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            property_to_excluded_types: HashMap::new(),
        }
    }

    /// Adds protection for a property, excluding the given entity types.
    #[must_use]
    pub fn protect_property(mut self, property: BaseUrl, excluded_types: HashSet<BaseUrl>) -> Self {
        self.property_to_excluded_types
            .entry(property)
            .or_default()
            .extend(excluded_types);
        self
    }

    /// Returns the default HASH configuration that protects email on User entities.
    #[must_use]
    pub fn hash_default() -> Self {
        let email_url = BaseUrl::new("https://hash.ai/@h/types/property-type/email/".to_owned())
            .expect("valid base URL");
        let user_url = BaseUrl::new("https://hash.ai/@h/types/entity-type/user/".to_owned())
            .expect("valid base URL");

        Self::new().protect_property(email_url, HashSet::from([user_url]))
    }

    /// Returns the entity types to exclude when filtering on the given property.
    ///
    /// O(1) lookup.
    #[must_use]
    pub fn excluded_types_for(&self, property: &BaseUrl) -> Option<&HashSet<BaseUrl>> {
        self.property_to_excluded_types.get(property)
    }

    /// Returns true if the given property is protected.
    #[must_use]
    pub fn is_protected(&self, property: &BaseUrl) -> bool {
        self.property_to_excluded_types.contains_key(property)
    }

    /// Returns all protected properties.
    #[must_use]
    pub fn protected_properties(&self) -> impl Iterator<Item = &BaseUrl> {
        self.property_to_excluded_types.keys()
    }

    /// Returns true if this configuration has any protection rules.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.property_to_excluded_types.is_empty()
    }
}

/// Collects all entity types that should be excluded based on protected properties in a filter.
///
/// Returns a set of entity type URLs that need `NOT(type = X)` exclusions.
fn collect_excluded_types<'p>(
    filter: &Filter<'p, Entity>,
    config: &FilterProtectionConfig,
) -> HashSet<BaseUrl> {
    let mut excluded = HashSet::new();
    collect_excluded_types_recursive(filter, config, &mut excluded);
    excluded
}

fn collect_excluded_types_recursive<'p>(
    filter: &Filter<'p, Entity>,
    config: &FilterProtectionConfig,
    excluded: &mut HashSet<BaseUrl>,
) {
    match filter {
        Filter::All(filters) | Filter::Any(filters) => {
            for f in filters {
                collect_excluded_types_recursive(f, config, excluded);
            }
        }
        Filter::Not(inner) => collect_excluded_types_recursive(inner, config, excluded),
        Filter::Equal(lhs, rhs)
        | Filter::NotEqual(lhs, rhs)
        | Filter::Greater(lhs, rhs)
        | Filter::GreaterOrEqual(lhs, rhs)
        | Filter::Less(lhs, rhs)
        | Filter::LessOrEqual(lhs, rhs)
        | Filter::StartsWith(lhs, rhs)
        | Filter::EndsWith(lhs, rhs)
        | Filter::ContainsSegment(lhs, rhs) => {
            collect_from_comparison(lhs, rhs, config, excluded);
        }
        Filter::CosineDistance(a, b, c) => {
            collect_from_expr(a, config, excluded);
            collect_from_expr(b, config, excluded);
            collect_from_expr(c, config, excluded);
        }
        Filter::In(expr, _) => collect_from_expr(expr, config, excluded),
        Filter::Exists { path } => collect_from_path(path, config, excluded),
    }
}

fn collect_from_expr(
    expr: &FilterExpression<'_, Entity>,
    config: &FilterProtectionConfig,
    excluded: &mut HashSet<BaseUrl>,
) {
    if let FilterExpression::Path { path } = expr {
        collect_from_path(path, config, excluded);
    }
}

/// Checks a binary comparison for protected property references.
fn collect_from_comparison(
    lhs: &FilterExpression<'_, Entity>,
    rhs: &FilterExpression<'_, Entity>,
    config: &FilterProtectionConfig,
    excluded: &mut HashSet<BaseUrl>,
) {
    // Check direct property paths
    collect_from_expr(lhs, config, excluded);
    collect_from_expr(rhs, config, excluded);

    // Check Properties(None) case - inspect the parameter for protected keys
    match (lhs, rhs) {
        (
            FilterExpression::Path {
                path: EntityQueryPath::Properties(None),
            },
            FilterExpression::Parameter { parameter, .. },
        )
        | (
            FilterExpression::Parameter { parameter, .. },
            FilterExpression::Path {
                path: EntityQueryPath::Properties(None),
            },
        ) => collect_from_parameter(parameter, config, excluded),
        _ => {}
    }
}

/// Checks if a parameter (typically a JSON object) contains any protected property keys.
fn collect_from_parameter(
    parameter: &Parameter<'_>,
    config: &FilterProtectionConfig,
    excluded: &mut HashSet<BaseUrl>,
) {
    if let Parameter::Any(PropertyValue::Object(obj)) = parameter {
        for key in obj.keys() {
            // Try to parse the key as a BaseUrl and check if it's protected
            if let Ok(url) = BaseUrl::new(key.clone()) {
                if let Some(types) = config.excluded_types_for(&url) {
                    excluded.extend(types.iter().cloned());
                }
            }
        }
    }
}

/// Collects excluded types from a JSON path (property path).
fn collect_from_json_path(
    json_path: &Option<JsonPath<'_>>,
    config: &FilterProtectionConfig,
    excluded: &mut HashSet<BaseUrl>,
) {
    if let Some(jp) = json_path {
        if let Some(PathToken::Field(field)) = jp.path_tokens().first() {
            // Try to parse the field as a BaseUrl
            if let Ok(url) = BaseUrl::new(field.to_string()) {
                if let Some(types) = config.excluded_types_for(&url) {
                    excluded.extend(types.iter().cloned());
                }
            }
        }
    }
}

fn collect_from_path(
    path: &crate::entity::EntityQueryPath<'_>,
    config: &FilterProtectionConfig,
    excluded: &mut HashSet<BaseUrl>,
) {
    use crate::entity::EntityQueryPath;

    match path {
        EntityQueryPath::Properties(json_path) | EntityQueryPath::PropertyMetadata(json_path) => {
            collect_from_json_path(json_path, config, excluded);
        }
        EntityQueryPath::EntityEdge { path, .. } => collect_from_path(path, config, excluded),
        EntityQueryPath::Label { .. }
        | EntityQueryPath::FirstLabel
        | EntityQueryPath::LastLabel => {
            // TODO(BE-313): check if label_property is protected
        }
        EntityQueryPath::Embedding => {
            // TODO(BE-313): protect embedding queries
        }
        EntityQueryPath::Uuid
        | EntityQueryPath::WebId
        | EntityQueryPath::DraftId
        | EntityQueryPath::EditionId
        | EntityQueryPath::DecisionTime
        | EntityQueryPath::TransactionTime
        | EntityQueryPath::TypeBaseUrls
        | EntityQueryPath::TypeVersions
        | EntityQueryPath::EntityConfidence
        | EntityQueryPath::LeftEntityConfidence
        | EntityQueryPath::LeftEntityProvenance
        | EntityQueryPath::RightEntityConfidence
        | EntityQueryPath::RightEntityProvenance
        | EntityQueryPath::Archived
        | EntityQueryPath::EntityTypeEdge {
            edge_kind: _,
            path: _,
            inheritance_depth: _,
        }
        | EntityQueryPath::Provenance(_)
        | EntityQueryPath::EditionProvenance(_)
        | EntityQueryPath::FirstTypeTitle
        | EntityQueryPath::LastTypeTitle => {}
    }
}

// =============================================================================
// Filter Transformation
// =============================================================================

/// Transforms a filter to protect against information leakage via protected properties.
///
/// Uses the provided configuration to determine which properties are protected and
/// which entity types should be excluded when filtering on them.
///
/// At leaf nodes containing protected properties:
/// - Even NOT depth: wraps with `AND NOT(type = excluded_type)` for each excluded type
/// - Odd NOT depth: wraps with `OR type = excluded_type` for each excluded type
///
/// This ensures that entities of excluded types are never returned via
/// protected property filters, while preserving other filter branches.
pub fn transform_filter<'p>(
    filter: Filter<'p, Entity>,
    config: &FilterProtectionConfig,
    not_depth: usize,
) -> Filter<'p, Entity> {
    if config.is_empty() {
        return filter;
    }

    match filter {
        Filter::Not(inner) => {
            Filter::Not(Box::new(transform_filter(*inner, config, not_depth + 1)))
        }
        Filter::All(filters) => Filter::All(
            filters
                .into_iter()
                .map(|f| transform_filter(f, config, not_depth))
                .collect(),
        ),
        Filter::Any(filters) => Filter::Any(
            filters
                .into_iter()
                .map(|f| transform_filter(f, config, not_depth))
                .collect(),
        ),
        // Leaf nodes - check if protection is needed
        leaf => {
            let excluded_types = collect_excluded_types(&leaf, config);
            if excluded_types.is_empty() {
                leaf
            } else {
                wrap_with_protection(leaf, &excluded_types, not_depth)
            }
        }
    }
}

/// Wraps a filter with type-based protection for multiple entity types.
///
/// - Even depth: `filter AND NOT(type = X1) AND NOT(type = X2) ...`
/// - Odd depth: `filter OR type = X1 OR type = X2 ...`
fn wrap_with_protection<'p>(
    filter: Filter<'p, Entity>,
    excluded_types: &HashSet<BaseUrl>,
    not_depth: usize,
) -> Filter<'p, Entity> {
    if not_depth % 2 == 0 {
        // Even depth: AND NOT(type = X) for each excluded type
        let mut filters = vec![filter];
        for excluded_type in excluded_types {
            filters.push(Filter::Not(Box::new(type_contains_filter(excluded_type))));
        }
        Filter::All(filters)
    } else {
        // Odd depth: OR type = X for each excluded type
        let mut filters = vec![filter];
        for excluded_type in excluded_types {
            filters.push(type_contains_filter(excluded_type));
        }
        Filter::Any(filters)
    }
}

/// Creates a filter that checks if an entity has the given type.
///
/// Uses `base_url IN TypeBaseUrls` to correctly handle multi-type entities.
fn type_contains_filter<'p>(base_url: &BaseUrl) -> Filter<'p, Entity> {
    Filter::In(
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Owned(base_url.to_string())),
            convert: None,
        },
        FilterExpressionList::Path {
            path: EntityQueryPath::TypeBaseUrls,
        },
    )
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use type_system::ontology::id::BaseUrl;

    use super::*;
    use crate::{
        entity::EntityQueryPath,
        filter::{FilterExpression, JsonPath, Parameter, PathToken},
    };

    // =========================================================================
    // Shared Test Helpers
    // =========================================================================

    const EMAIL_BASE_URL: &str = "https://hash.ai/@h/types/property-type/email/";
    const NAME_BASE_URL: &str = "https://hash.ai/@h/types/property-type/name/";
    const USER_TYPE_BASE_URL: &str = "https://hash.ai/@h/types/entity-type/user/";

    fn email_base_url() -> BaseUrl {
        BaseUrl::new(EMAIL_BASE_URL.to_owned()).unwrap()
    }

    fn user_type_base_url() -> BaseUrl {
        BaseUrl::new(USER_TYPE_BASE_URL.to_owned()).unwrap()
    }

    /// Config that protects email on User entities
    fn email_protection_config() -> FilterProtectionConfig {
        FilterProtectionConfig::new()
            .protect_property(email_base_url(), HashSet::from([user_type_base_url()]))
    }

    fn property_path(base_url: &str) -> EntityQueryPath<'static> {
        EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
            Cow::Owned(base_url.to_owned()),
        )])))
    }

    fn property_metadata_path(base_url: &str) -> EntityQueryPath<'static> {
        EntityQueryPath::PropertyMetadata(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
            Cow::Owned(base_url.to_owned()),
        )])))
    }

    fn eq_filter(path: EntityQueryPath<'static>, value: &str) -> Filter<'static, Entity> {
        Filter::Equal(
            FilterExpression::Path { path },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Owned(value.to_owned())),
                convert: None,
            },
        )
    }

    fn email_eq(value: &str) -> Filter<'static, Entity> {
        eq_filter(property_path(EMAIL_BASE_URL), value)
    }

    fn name_eq(value: &str) -> Filter<'static, Entity> {
        eq_filter(property_path(NAME_BASE_URL), value)
    }

    fn assert_detected(filter: &Filter<'_, Entity>, config: &FilterProtectionConfig) {
        let excluded = collect_excluded_types(filter, config);
        assert!(
            !excluded.is_empty(),
            "expected protected property to be detected"
        );
    }

    fn assert_not_detected(filter: &Filter<'_, Entity>, config: &FilterProtectionConfig) {
        let excluded = collect_excluded_types(filter, config);
        assert!(
            excluded.is_empty(),
            "expected no protected property, found excluded types: {excluded:?}"
        );
    }

    fn not(filter: Filter<'static, Entity>) -> Filter<'static, Entity> {
        Filter::Not(Box::new(filter))
    }

    fn all(filters: Vec<Filter<'static, Entity>>) -> Filter<'static, Entity> {
        Filter::All(filters)
    }

    fn any(filters: Vec<Filter<'static, Entity>>) -> Filter<'static, Entity> {
        Filter::Any(filters)
    }

    fn exists(path: EntityQueryPath<'static>) -> Filter<'static, Entity> {
        Filter::Exists { path }
    }

    fn starts_with(path: EntityQueryPath<'static>, prefix: &str) -> Filter<'static, Entity> {
        Filter::StartsWith(
            FilterExpression::Path { path },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Owned(prefix.to_owned())),
                convert: None,
            },
        )
    }

    fn less_than(path: EntityQueryPath<'static>, value: &str) -> Filter<'static, Entity> {
        Filter::Less(
            FilterExpression::Path { path },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Owned(value.to_owned())),
                convert: None,
            },
        )
    }

    // =========================================================================
    // Tests: Properties
    // =========================================================================

    mod properties {
        use super::*;

        #[test]
        fn equal_detected() {
            let config = email_protection_config();
            assert_detected(&email_eq("test@example.com"), &config);
        }

        #[test]
        fn equal_non_protected_ignored() {
            let config = email_protection_config();
            assert_not_detected(&name_eq("Alice"), &config);
        }

        #[test]
        fn starts_with_detected() {
            let config = email_protection_config();
            let filter = starts_with(property_path(EMAIL_BASE_URL), "test@");
            assert_detected(&filter, &config);
        }

        #[test]
        fn less_detected() {
            let config = email_protection_config();
            let filter = less_than(property_path(EMAIL_BASE_URL), "b@example.com");
            assert_detected(&filter, &config);
        }

        #[test]
        fn exists_detected() {
            let config = email_protection_config();
            let filter = exists(property_path(EMAIL_BASE_URL));
            assert_detected(&filter, &config);
        }
    }

    // =========================================================================
    // Tests: PropertyMetadata
    // =========================================================================

    mod property_metadata {
        use super::*;

        #[test]
        fn equal_detected() {
            let config = email_protection_config();
            let filter = eq_filter(property_metadata_path(EMAIL_BASE_URL), "high");
            assert_detected(&filter, &config);
        }

        #[test]
        fn equal_non_protected_ignored() {
            let config = email_protection_config();
            let filter = eq_filter(property_metadata_path(NAME_BASE_URL), "high");
            assert_not_detected(&filter, &config);
        }

        #[test]
        fn exists_detected() {
            let config = email_protection_config();
            let filter = exists(property_metadata_path(EMAIL_BASE_URL));
            assert_detected(&filter, &config);
        }
    }

    // =========================================================================
    // Tests: Composite Filters
    // =========================================================================

    mod composite {
        use super::*;

        #[test]
        fn all_detected() {
            let config = email_protection_config();
            let filter = all(vec![email_eq("test@example.com"), name_eq("Alice")]);
            assert_detected(&filter, &config);
        }

        #[test]
        fn any_detected() {
            let config = email_protection_config();
            let filter = any(vec![email_eq("test@example.com"), name_eq("Alice")]);
            assert_detected(&filter, &config);
        }

        #[test]
        fn not_detected() {
            let config = email_protection_config();
            let filter = not(email_eq("test@example.com"));
            assert_detected(&filter, &config);
        }

        #[test]
        fn deeply_nested_detected() {
            let config = email_protection_config();
            let filter = all(vec![
                name_eq("Alice"),
                any(vec![name_eq("Bob"), not(email_eq("test@example.com"))]),
            ]);
            assert_detected(&filter, &config);
        }

        #[test]
        fn no_protected_not_detected() {
            let config = email_protection_config();
            let filter = all(vec![name_eq("Alice"), not(name_eq("Bob"))]);
            assert_not_detected(&filter, &config);
        }
    }

    // =========================================================================
    // Tests: EntityEdge (recursive path detection)
    // =========================================================================

    mod entity_edge {
        use super::*;
        use crate::subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind};

        fn left_entity_property_path(base_url: &str) -> EntityQueryPath<'static> {
            EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(property_path(base_url)),
                direction: EdgeDirection::Outgoing,
            }
        }

        fn right_entity_property_path(base_url: &str) -> EntityQueryPath<'static> {
            EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(property_path(base_url)),
                direction: EdgeDirection::Outgoing,
            }
        }

        fn incoming_links_property_path(base_url: &str) -> EntityQueryPath<'static> {
            EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(property_path(base_url)),
                direction: EdgeDirection::Incoming,
            }
        }

        fn outgoing_links_property_path(base_url: &str) -> EntityQueryPath<'static> {
            EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(property_path(base_url)),
                direction: EdgeDirection::Incoming,
            }
        }

        #[test]
        fn left_entity_email_detected() {
            let config = email_protection_config();
            let filter = eq_filter(
                left_entity_property_path(EMAIL_BASE_URL),
                "test@example.com",
            );
            assert_detected(&filter, &config);
        }

        #[test]
        fn left_entity_non_protected_ignored() {
            let config = email_protection_config();
            let filter = eq_filter(left_entity_property_path(NAME_BASE_URL), "Alice");
            assert_not_detected(&filter, &config);
        }

        #[test]
        fn right_entity_email_detected() {
            let config = email_protection_config();
            let filter = eq_filter(
                right_entity_property_path(EMAIL_BASE_URL),
                "test@example.com",
            );
            assert_detected(&filter, &config);
        }

        #[test]
        fn incoming_links_email_detected() {
            let config = email_protection_config();
            let filter = eq_filter(
                incoming_links_property_path(EMAIL_BASE_URL),
                "test@example.com",
            );
            assert_detected(&filter, &config);
        }

        #[test]
        fn outgoing_links_email_detected() {
            let config = email_protection_config();
            let filter = eq_filter(
                outgoing_links_property_path(EMAIL_BASE_URL),
                "test@example.com",
            );
            assert_detected(&filter, &config);
        }

        #[test]
        fn deeply_nested_left_left_entity_detected() {
            let config = email_protection_config();
            // leftEntity.leftEntity.properties.email
            let nested_path = EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(property_path(EMAIL_BASE_URL)),
                    direction: EdgeDirection::Outgoing,
                }),
                direction: EdgeDirection::Outgoing,
            };
            let filter = eq_filter(nested_path, "test@example.com");
            assert_detected(&filter, &config);
        }
    }

    // =========================================================================
    // Tests: Properties(None) with Parameter inspection
    // =========================================================================

    mod properties_none {
        use std::collections::HashMap;

        use type_system::knowledge::PropertyValue;

        use super::*;

        fn properties_none_path() -> EntityQueryPath<'static> {
            EntityQueryPath::Properties(None)
        }

        fn json_object_param(keys: &[&str]) -> Parameter<'static> {
            let mut map = HashMap::new();
            for key in keys {
                map.insert((*key).to_owned(), PropertyValue::String("value".to_owned()));
            }
            Parameter::Any(PropertyValue::Object(map))
        }

        #[test]
        fn equal_with_protected_key_detected() {
            let config = email_protection_config();
            let filter = Filter::Equal(
                FilterExpression::Path {
                    path: properties_none_path(),
                },
                FilterExpression::Parameter {
                    parameter: json_object_param(&[EMAIL_BASE_URL]),
                    convert: None,
                },
            );
            assert_detected(&filter, &config);
        }

        #[test]
        fn equal_without_protected_key_not_detected() {
            let config = email_protection_config();
            let filter = Filter::Equal(
                FilterExpression::Path {
                    path: properties_none_path(),
                },
                FilterExpression::Parameter {
                    parameter: json_object_param(&[NAME_BASE_URL]),
                    convert: None,
                },
            );
            assert_not_detected(&filter, &config);
        }

        #[test]
        fn equal_with_multiple_keys_one_protected_detected() {
            let config = email_protection_config();
            let filter = Filter::Equal(
                FilterExpression::Path {
                    path: properties_none_path(),
                },
                FilterExpression::Parameter {
                    parameter: json_object_param(&[NAME_BASE_URL, EMAIL_BASE_URL]),
                    convert: None,
                },
            );
            assert_detected(&filter, &config);
        }

        #[test]
        fn not_equal_with_protected_key_detected() {
            let config = email_protection_config();
            let filter = Filter::NotEqual(
                FilterExpression::Path {
                    path: properties_none_path(),
                },
                FilterExpression::Parameter {
                    parameter: json_object_param(&[EMAIL_BASE_URL]),
                    convert: None,
                },
            );
            assert_detected(&filter, &config);
        }
    }

    // =========================================================================
    // TODO(BE-313): Label (edge case)
    // =========================================================================
    // mod label {
    //     - label_property_is_protected_detected
    // }

    // =========================================================================
    // TODO(BE-313): Embedding (property-specific + combined)
    // =========================================================================
    // mod embedding {
    //     - cosine_distance_on_property_embedding_detected
    //     - cosine_distance_on_combined_embedding_detected
    // }

    // =========================================================================
    // Tests: Filter Transformation
    // =========================================================================

    mod transform {
        use super::*;

        /// Creates `User IN TypeBaseUrls` filter (entity has User type)
        fn type_is_user() -> Filter<'static, Entity> {
            Filter::In(
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Owned(USER_TYPE_BASE_URL.to_owned())),
                    convert: None,
                },
                FilterExpressionList::Path {
                    path: EntityQueryPath::TypeBaseUrls,
                },
            )
        }

        /// Creates `NOT(User IN TypeBaseUrls)` filter (entity does not have User type)
        fn type_is_not_user() -> Filter<'static, Entity> {
            not(type_is_user())
        }

        fn do_transform(input: Filter<'static, Entity>) -> Filter<'static, Entity> {
            transform_filter(input, &email_protection_config(), 0)
        }

        // -----------------------------------------------------------------
        // Case 1: email = X
        // Depth 0 (even) → AND NOT(type = User)
        // -----------------------------------------------------------------

        #[test]
        fn case_1_email_eq() {
            let input = email_eq("test@example.com");
            let expected = all(vec![email_eq("test@example.com"), type_is_not_user()]);

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 2: email = X AND name = A
        // Depth 0 (even) → AND NOT(type = User)
        // -----------------------------------------------------------------

        #[test]
        fn case_2_email_and_name() {
            let input = all(vec![email_eq("test@example.com"), name_eq("Alice")]);
            let expected = all(vec![
                all(vec![email_eq("test@example.com"), type_is_not_user()]),
                name_eq("Alice"),
            ]);

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 3: email = X OR name = A
        // Depth 0 (even) → AND NOT(type = User) on email branch only
        // -----------------------------------------------------------------

        #[test]
        fn case_3_email_or_name() {
            let input = any(vec![email_eq("test@example.com"), name_eq("Alice")]);
            let expected = any(vec![
                all(vec![email_eq("test@example.com"), type_is_not_user()]),
                name_eq("Alice"),
            ]);

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 4: NOT(email = X)
        // Depth 1 (odd) → OR type = User
        // -----------------------------------------------------------------

        #[test]
        fn case_4_not_email() {
            let input = not(email_eq("test@example.com"));
            let expected = not(any(vec![email_eq("test@example.com"), type_is_user()]));

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 5: NOT(email = X AND name = A)
        // Depth 1 (odd) → OR type = User
        // -----------------------------------------------------------------

        #[test]
        fn case_5_not_email_and_name() {
            let input = not(all(vec![email_eq("test@example.com"), name_eq("Alice")]));
            let expected = not(all(vec![
                any(vec![email_eq("test@example.com"), type_is_user()]),
                name_eq("Alice"),
            ]));

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 6: NOT(email = X OR name = A)
        // Depth 1 (odd) → OR type = User
        // -----------------------------------------------------------------

        #[test]
        fn case_6_not_email_or_name() {
            let input = not(any(vec![email_eq("test@example.com"), name_eq("Alice")]));
            let expected = not(any(vec![
                any(vec![email_eq("test@example.com"), type_is_user()]),
                name_eq("Alice"),
            ]));

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 7: NOT(NOT(email = X))
        // Depth 2 (even) → AND NOT(type = User)
        // -----------------------------------------------------------------

        #[test]
        fn case_7_not_not_email() {
            let input = not(not(email_eq("test@example.com")));
            let expected = not(not(all(vec![
                email_eq("test@example.com"),
                type_is_not_user(),
            ])));

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 8: NOT(NOT(email = X AND name = A))
        // Depth 2 (even) → AND NOT(type = User)
        // -----------------------------------------------------------------

        #[test]
        fn case_8_not_not_email_and_name() {
            let input = not(not(all(vec![
                email_eq("test@example.com"),
                name_eq("Alice"),
            ])));
            let expected = not(not(all(vec![
                all(vec![email_eq("test@example.com"), type_is_not_user()]),
                name_eq("Alice"),
            ])));

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Case 9: NOT(NOT(email = X OR name = A))
        // Depth 2 (even) → AND NOT(type = User)
        // -----------------------------------------------------------------

        #[test]
        fn case_9_not_not_email_or_name() {
            let input = not(not(any(vec![
                email_eq("test@example.com"),
                name_eq("Alice"),
            ])));
            let expected = not(not(any(vec![
                all(vec![email_eq("test@example.com"), type_is_not_user()]),
                name_eq("Alice"),
            ])));

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Extra: No protected property → unchanged
        // -----------------------------------------------------------------

        #[test]
        fn no_protected_property_unchanged() {
            let input = name_eq("Alice");
            let expected = name_eq("Alice");

            assert_eq!(do_transform(input), expected);
        }

        // -----------------------------------------------------------------
        // Extra: Complex nested case
        // -----------------------------------------------------------------

        #[test]
        fn complex_nested() {
            // name = A AND NOT(email = X OR name = B)
            // email at depth 1 → OR type = User
            let input = all(vec![
                name_eq("Alice"),
                not(any(vec![email_eq("test@example.com"), name_eq("Bob")])),
            ]);
            let expected = all(vec![
                name_eq("Alice"),
                not(any(vec![
                    any(vec![email_eq("test@example.com"), type_is_user()]),
                    name_eq("Bob"),
                ])),
            ]);

            assert_eq!(do_transform(input), expected);
        }
    }
}
