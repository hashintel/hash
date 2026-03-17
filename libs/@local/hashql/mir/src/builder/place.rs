use core::ops::Deref;

use hashql_core::{
    id::Id as _,
    r#type::{TypeId, builder::IntoSymbol},
};

use super::base::BaseBuilder;
use crate::body::{
    local::Local,
    place::{FieldIndex, Place, Projection, ProjectionKind},
};

/// Typestate marker: no local has been set yet.
pub struct NoLocal;

/// Typestate marker: a local has been set.
pub struct HasLocal(Local);

/// Builder for constructing places with projections.
///
/// Uses typestate to ensure a local is set before building:
/// - `PlaceBuilder<'env, 'heap, NoLocal>`: Initial state, must call `.local()` first
/// - `PlaceBuilder<'env, 'heap, HasLocal>`: Local set, can add projections and build
pub struct PlaceBuilder<'env, 'heap, State = NoLocal> {
    base: BaseBuilder<'env, 'heap>,

    state: State,
    projections: Vec<Projection<'heap>>,
}

impl<'env, 'heap> PlaceBuilder<'env, 'heap, NoLocal> {
    pub(super) const fn new(base: BaseBuilder<'env, 'heap>) -> Self {
        Self {
            base,

            state: NoLocal,
            projections: Vec::new(),
        }
    }

    /// Sets the base local for this place.
    #[must_use]
    pub fn local(self, local: Local) -> PlaceBuilder<'env, 'heap, HasLocal> {
        PlaceBuilder {
            base: self.base,

            state: HasLocal(local),
            projections: self.projections,
        }
    }

    #[must_use]
    pub fn from(self, place: Place<'heap>) -> PlaceBuilder<'env, 'heap, HasLocal> {
        PlaceBuilder {
            base: self.base,
            state: HasLocal(place.local),
            projections: place.projections.to_vec(),
        }
    }
}

impl<'heap> PlaceBuilder<'_, 'heap, HasLocal> {
    /// Adds a field projection by index.
    #[must_use]
    pub fn field(mut self, index: usize, ty: TypeId) -> Self {
        self.projections.push(Projection {
            r#type: ty,
            kind: ProjectionKind::Field(FieldIndex::from_usize(index)),
        });

        self
    }

    /// Adds a field projection by name.
    #[must_use]
    pub fn field_by_name(mut self, name: impl IntoSymbol<'heap>, ty: TypeId) -> Self {
        self.projections.push(Projection {
            r#type: ty,
            kind: ProjectionKind::FieldByName(name.intern_into_symbol(self.interner.heap)),
        });

        self
    }

    /// Adds an index projection.
    #[must_use]
    pub fn index(mut self, index_local: Local, ty: TypeId) -> Self {
        self.projections.push(Projection {
            r#type: ty,
            kind: ProjectionKind::Index(index_local),
        });

        self
    }

    /// Builds the final place.
    #[must_use]
    pub fn build(self) -> Place<'heap> {
        Place {
            local: self.state.0,
            projections: self.interner.projections.intern_slice(&self.projections),
        }
    }
}

impl<'env, 'heap, S> Deref for PlaceBuilder<'env, 'heap, S> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}
