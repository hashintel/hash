//! Ontology types of one fitted generation: identities, membership postings and the type closure.
//!
//! [`OntologyRowId`] names a type row. The postings record which base positions each type covers,
//! and the closure derives every type's ancestors and its nearest icon-bearing ancestor from the
//! recorded parent graph.

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    dataset::auxiliary::Icon,
    identity::OntologyRowId,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::{
        fit::prepare::identity::IdentityTableArchive,
        postings::{artifact::PostingsArchive, closure::ClosureMap},
    },
    serve::delta::{
        epoch::Epoch,
        overlay::{NaiveIdentityProvider, VersionedIdentityProvider as _},
    },
};

/// The ontology-type identities, membership postings and type closure of one generation.
#[derive(Debug)]
pub(crate) struct Ontology {
    /// The type key and icon of every ontology row.
    pub identity: IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,

    /// Which base positions each type covers.
    postings: PostingsArchive,
    /// Every type's ancestor set and nearest icon-bearing ancestor.
    closure: ClosureMap,
}

impl Ontology {
    /// Opens the ontology artifacts, checks their counts and derives the type closure.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError::Open`] for an artifact that fails to open, then together
    /// [`WorldError::TooManyPositions`], [`WorldError::TooManyTypes`] and
    /// [`WorldError::OntologyCountMismatch`] for counts outside the address space or a type
    /// count the identity table and the postings disagree on, then [`WorldError::OntologyClosure`]
    /// when the recorded parent graph holds a cycle.
    pub(crate) fn open(
        OpenOptions { generation, .. }: OpenOptions<'_>,
    ) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let identity: Result<IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>, _> =
            files
                .ontology_identities
                .open(generation)
                .change_context(WorldError::Open {
                    file: files.ontology_identities.name(),
                });

        let postings: Result<PostingsArchive, _> =
            files
                .postings
                .open(generation)
                .change_context(WorldError::Open {
                    file: files.postings.name(),
                });

        let (identity, postings) = (identity, postings).try_collect()?;

        let mut sink = ReportSink::new_armed();

        if let Err(error) = usize::try_from(postings.points()) {
            sink.capture(
                Report::new(error).change_context(WorldError::TooManyPositions {
                    positions: postings.points(),
                }),
            );
        }

        if let Err(error) = usize::try_from(identity.len()) {
            sink.capture(Report::new(error).change_context(WorldError::TooManyTypes {
                types: identity.len(),
            }));
        }

        if identity.len() != postings.types() {
            sink.capture(WorldError::OntologyCountMismatch {
                identity: identity.len(),
                postings: postings.types(),
            });
        }

        sink.finish()?;

        let closure = ClosureMap::new(&postings, identity.displayed_rows())
            .change_context(WorldError::OntologyClosure)?;

        Ok(Self {
            identity,
            postings,
            closure,
        })
    }

    /// Returns the number of base positions the postings cover.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "open refuses a point count outside `usize`"
    )]
    pub(crate) fn node_count(&self) -> usize {
        self.postings.points() as usize
    }

    /// Returns the row's type key if its identity is live at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if this ontology does not belong to the epoch's world.
    pub(crate) fn key_of(
        &self,
        epoch: &Epoch,
        row: OntologyRowId,
    ) -> Option<ArchivedOntologyTypeUuid> {
        epoch
            .ontology(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity))
            .provide_key_of_at(row, epoch.revision())
    }

    /// Borrows the icon a type row carries itself.
    ///
    /// Returns [`None`] unless the row's identity is live at the captured revision. The empty icon
    /// is the payload of a row that displays none. [`Self::icon`] resolves such a row through the
    /// type closure instead.
    ///
    /// # Panics
    ///
    /// Panics if this ontology does not belong to the epoch's world.
    pub(crate) fn payload<'scene>(
        &'scene self,
        epoch: &'scene Epoch,
        row: OntologyRowId,
    ) -> Option<&'scene Icon> {
        epoch
            .ontology(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity))
            .into_payload_of_row_at(row, epoch.revision())
    }

    /// Borrows the icon displayed for a type row at the captured revision.
    ///
    /// A row with no icon of its own displays its nearest icon-bearing ancestor's, as the type
    /// closure resolved it at open, and the empty icon when no ancestor carries one. Returns
    /// [`None`] when the resolved row's identity is not live at the revision.
    ///
    /// # Panics
    ///
    /// Panics if this ontology does not belong to the epoch's world.
    pub(crate) fn icon<'scene>(
        &'scene self,
        epoch: &'scene Epoch,
        row: OntologyRowId,
    ) -> Option<&'scene Icon> {
        let source = self
            .closure
            .icon_source(row)
            .map_or(row, |icon| icon.source);
        self.payload(epoch, source)
    }

    /// Returns the fitted type identities, independent of any epoch.
    pub(crate) const fn identity(
        &self,
    ) -> &IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId> {
        &self.identity
    }

    /// Returns the membership postings over base positions.
    pub(crate) const fn postings(&self) -> &PostingsArchive {
        &self.postings
    }

    /// Returns the type closure derived at open.
    pub(crate) const fn closure(&self) -> &ClosureMap {
        &self.closure
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::Ontology;
    use crate::serve::{
        tests::fixture::{TYPES, TamperFixture, secret, shorten_ontology},
        world::{OpenOptions, error::WorldError},
    };

    /// Open refuses an ontology identity table short of the postings' type domain.
    ///
    /// Returns [`WorldError::OntologyCountMismatch`].
    #[test]
    fn ontology_identities_short() {
        let fixture = TamperFixture::publish("ontology-identities-short");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.ontology_identities.name(), |path| {
            shorten_ontology(path, TYPES - 1);
        });
        let report = Ontology::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short ontology identity table");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::OntologyCountMismatch { identity, postings }]
                if *identity == TYPES - 1 && *postings == TYPES,
        );
    }
}
