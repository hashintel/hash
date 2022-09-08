/// A memory-mapped shared memory segment.
///
/// Includes tools to work with internal structure.
///
/// # Internal Buffers
///
/// There are 4 main buffers contained in the shared memory which are:
///
///   1) Schema describing the layout of the data (could be an Arrow schema for example)
///   2) Header data
///   3) Meta data
///   4) Data
///
/// At the beginning of the shared memory segment there is another small, fixed-size buffer which
/// contains the markers to the four buffers above. This offset buffer can be read with
/// `Memory::markers`. If one buffer is not needed, it's size can be set to `0`.
// TODO: Do we need header data **and** meta data? The header is currently only used for storing the
//       metaversion. If we rename these buffers it would be clearer:
//         - `Markers` should be called `SegmentHeader` or `Header`
//         - `Metaversion` could be confused with "Meta data version", maybe `SegmentVersion` or
//           just `Version`? It also should live inside of `SegmentHeader`
//         - Remove the old "Header data"
pub struct Buffers<'a> {
    pub(crate) schema: &'a [u8],
    pub(crate) header: &'a [u8],
    pub(crate) meta: &'a [u8],
    pub(crate) data: &'a [u8],
}

impl<'a> Buffers<'a> {
    #[inline]
    pub fn schema(&self) -> &'a [u8] {
        self.schema
    }

    #[inline]
    pub fn header(&self) -> &'a [u8] {
        self.header
    }

    #[inline]
    pub fn meta(&self) -> &'a [u8] {
        self.meta
    }

    #[inline]
    pub fn data(&self) -> &'a [u8] {
        self.data
    }
}
