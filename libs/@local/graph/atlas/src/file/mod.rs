//! File format specification and implementation. We support two different file formats:
//! `.salt`, which is used for storing any binary information required, and `.quad`, which is used
//! for salt quadtree pointmaps.

// The primary file format that we use is `.salt`, it is a very simple format, it works in the
// following way:
// The salt file format is content-addressed storage over many small files. The manifest is located
// at `.salt`. A `.salt` file can be specified as being inline, in which case the complete data is
// stored alongside it, or outline, in which case parts of the file are stored outside.
// The manifest header operates in segments of 4KiB.
// All data is in little-endian format.
// The first segment is the manifest header, and is `SALT [u32 version]` Each segment ends with a
// crc64 over it's own data.

// Depending on version, the manifest header may be followed by different types of data.
// Each header segment is: `[content id u128] [section type u16][reserved u24][section id
// u32][section index u32][start offset u64][end offset u64]...` Each section is bound to a single
// content id. The header is immediately followed by: `[crc 64]`
//
// We define the following sections:
