mod knowledge;
mod ontology;

pub use self::{
    knowledge::{EntityQuery, EntityVersion, LinkQuery},
    ontology::{
        DataTypeQuery, EntityTypeQuery, LinkTypeQuery, OntologyQuery, OntologyVersion,
        PropertyTypeQuery,
    },
};
