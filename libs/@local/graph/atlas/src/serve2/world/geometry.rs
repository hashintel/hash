use crate::{
    file::{morton::read::MortonFile, quad::read::QuadFile},
    identity::{BasePosition, Column},
    math::{Bounds2, Vec2},
};

pub struct Geometry {
    bounds: Option<Bounds2>,
    positions: Column<BasePosition, Vec2>,

    spatial_index: QuadFile,
    morton_order: MortonFile,
}
