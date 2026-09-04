use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    identity::OntologyRowId,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::{
        fit::prepare::identity::IdentityTableArchive,
        postings::{artifact::PostingsArchive, closure::ClosureMap},
    },
};

pub(crate) struct Ontology {
    identity: IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,

    postings: PostingsArchive,
    closure: ClosureMap,
}

impl Ontology {
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

    #[expect(
        clippy::cast_possible_truncation,
        reason = "open refuses a point count outside `usize`"
    )]
    pub(crate) fn node_count(&self) -> usize {
        self.postings.points() as usize
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "open refuses a type count outside `usize`"
    )]
    pub(crate) fn ontology_count(&self) -> usize {
        self.identity.len() as usize
    }
}
