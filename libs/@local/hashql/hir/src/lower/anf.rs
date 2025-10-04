// convert the HIR into HIR(ANF), HIR(ANF) is a reduced form of the HIR, which differentiates
// between values: (places (variables with projections), constants) and everything else. Function
// application can only be done with values as arguments. We extend this, even though at this point
// we have already specialized the HIR nodes, any node that was previously a function is treated as
// such. We define boundaries, where we accumulate `let` bindings, these are:
// - closure definitions
// - branching (control flow)

// We deviate from the original ANF quite a bit here to allow for more flexibility down the line, in
// particular traditional ANF supports closures as values, which for us makes little sense.
// Closures are just pointers to a BB, so it doesn't make sense to treat them as values. It would
// essentially double our implementation complexity, because we would need to handle closures as
// values and as pointers separately.
// We use projections instead of variables to allow for mutable assignments in the MIR down the
// line and to reduce the number of `let` bindings.
// This removes some easy potential for deduplication, but that is deemed to not really be a concern
// here.
