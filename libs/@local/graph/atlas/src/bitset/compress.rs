use roaring::RoaringBitmap;

pub struct CompressedBitVec<I, A: Allocator = Global> {
    inner: RoaringBitmap,
}
