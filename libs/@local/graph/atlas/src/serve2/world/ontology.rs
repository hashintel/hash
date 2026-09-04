use crate::{
    identity::OntologyRowId,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::{
        fit::prepare::identity::IdentityTableArchive,
        postings::{artifact::PostingsArchive, closure::ClosureMap},
    },
};

pub struct Ontology {
    identity: IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,

    postings: PostingsArchive,
    closure: ClosureMap,
}
