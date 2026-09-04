use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};

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

        if identity.len() != postings.types() {
            return Err(Report::new(WorldError::OntologyCountMismatch {
                identities: identity.len(),
                postings: postings.types(),
            })
            .expand());
        }

        let closure = ClosureMap::new(&postings, identity.displayed_rows())
            .change_context(WorldError::OntologyClosure)?;

        Ok(Self {
            identity,
            postings,
            closure,
        })
    }
}
