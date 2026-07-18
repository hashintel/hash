use rand::{Rng, SeedableRng};

use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
};

mod hannoy;

struct Embedding<'embedding> {
    id: NodeRowId,
    embedding: &'embedding AlignedVecN<PROJECTOR_DIMENSIONS>,
}

struct Neighbour {
    id: NodeRowId,
    distance: f32,
}

trait NearestNeighboursIndex {
    type Error;

    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
    ) -> Result<(), Self::Error>;

    fn build(&mut self, rng: impl Rng + SeedableRng) -> Result<(), Self::Error>;

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error>;

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error>;
}

struct KnnView<'view>(sprs::CsMatView<'view, f32>);

struct Knn(sprs::CsMat<f32>);
