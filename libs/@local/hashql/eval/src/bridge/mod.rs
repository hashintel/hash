// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

mod postgres_serde;

struct Bridge {}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
