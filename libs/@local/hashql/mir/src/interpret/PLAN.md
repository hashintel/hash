# `runtime.rs` — Documentation, Tests, and Fix Plan

## Phase 1: Bug fix — `run_until_transition` check ordering

**Problem**: The transition check (`continue` callback) fires *after* `self.step()`. When
`continuation.apply()` sets `current_block` to the transition target and `current_statement = 0`
between calls to `run_until_transition`, the first `step()` executes in that block before the
check fires — and by then `current_statement` has been incremented past 0, so the check misses
the transition entirely.

**Fix**: Move the transition check before `self.step()` in the loop body. Remove the
`// TODO: does this work` comment.

```rust
loop {
    if let &mut [ref mut frame] = &mut *callstack.frames {
        if frame.current_statement == 0 && !r#continue(frame.current_block.id) {
            return Ok(ControlFlow::Break(()));
        }
    }

    let result = self.step(callstack);
    // ... error handling, yield check ...
}
```

This catches block transitions from both `step_terminator_goto` (previous iteration set
`current_statement = 0`) and `continuation.apply()` (orchestrator set it before re-entering).
On the first call, `bb0` is checked before any execution — correct, because the orchestrator
wouldn't enter a backend whose entry block doesn't belong to it.

---

## Phase 2: Documentation

### Fix broken docs

- [ ] **`run_until_suspension`**: Remove the duplicated/stale doc block (two `///` blocks stacked).
      Keep only the accurate one about stepping until return or suspension.

### Add missing docs

- [ ] **`CurrentBlock`**: What it represents, why it caches both the ID and the block reference.
- [ ] **`make_frame_in`**: What it does, relationship to `Runtime::make_frame`.
- [ ] **`CallStack::new_in`**: How it differs from `new` — takes a `Body` directly, fallible.
- [ ] **`CallStack::locals_mut`**: Mirror the `locals` doc.
- [ ] **`CallStack::current_block`**: What it returns, error condition.
- [ ] **`CallStack::set_current_block_unchecked`**: What's actually unchecked — the block ID is
      bounds-checked by the `basic_blocks` indexing, but nothing validates that the block is
      meaningful in the current execution context (e.g., reachable from the current position).
      Document what the caller must guarantee.
- [ ] **`Runtime::new_in`**: Mirror the `new` doc, note the custom allocator.
- [ ] **`Runtime::reset`**: What it clears (scratch state) and when to call it.
- [ ] **`Runtime::run_until_transition`**: Full doc covering:
      - Purpose: orchestrator runs a backend until hitting a transition point.
      - `continue` callback: called at block boundaries in the outermost frame, receives the
        `BasicBlockId` just entered. Return `false` to break.
      - `ControlFlow` semantics from the orchestrator's perspective:
        - `Break(())` = transition point reached, switch backends.
        - `Continue(Yield::Return(v))` = interpreter completed.
        - `Continue(Yield::Suspension(s))` = interpreter suspended for external data.
      - Re-entry protocol after suspension: call `continuation.apply()`, then
        `run_until_transition()` again. The transition check fires before the first step.
      - The callback only fires when there's exactly one frame (outermost function). During
        nested calls the interpreter runs freely.

### Improve module-level docs

- [ ] **`runtime.rs` module doc**: Add the suspension/continuation protocol. Mention `Yield`,
      `start`/`resume`, and the `run` convenience method. Currently only describes the basic
      step-through-blocks model without mentioning suspension at all.

---

## Phase 3: Tests

### Suspension/continuation protocol (currently zero coverage)

- [ ] **T1: `start` → suspend → `resume` → return**
      Single `GraphRead` round-trip. Build a MIR body with a `GraphRead` terminator targeting
      a block that returns. Call `start`, assert `Yield::Suspension`, inspect the suspension,
      resolve it with a value, call `resume`, assert `Yield::Return` with the expected value.

- [ ] **T2: `run` with actual suspension handler**
      Same body as T1, but use `run` with a closure that resolves the suspension. Verify the
      final returned value. Exercises the `try_run` loop with a non-`unreachable!()` handler.

- [ ] **T3: Multi-suspension round-trip**
      Body with two sequential `GraphRead` terminators (first GraphRead's target block has a
      second GraphRead). `start` → suspend → `resume` → suspend → `resume` → return. Verify
      both suspension values are inspectable and the final result incorporates both.

### `run_until_transition`

- [ ] **T4: Basic transition**
      Body with linear blocks: `bb0 → bb1 → bb2 → return`. `continue` returns `false` on
      `bb2`. Assert `ControlFlow::Break(())`. Verify callstack is positioned at `bb2` with
      `current_statement == 0`.

- [ ] **T5: Transition after `continuation.apply`** (regression test for Phase 1 fix)
      Body: `bb0` has a `GraphRead` targeting `bb1`, and `bb1` returns. `continue` returns
      `false` on `bb1`. First call to `run_until_transition` returns
      `Continue(Yield::Suspension(...))`. Apply continuation. Second call returns
      `Break(())` — the transition fires on `bb1` before any statement executes.

- [ ] **T6: No transition (runs to completion)**
      `continue` always returns `true`. Body runs to a `Return` terminator. Assert
      `ControlFlow::Continue(Yield::Return(...))`.

### CallStack edge cases

- [ ] **T7: `unwind` produces correct `(DefId, SpanId)` pairs**
      Multi-function call: main calls f1, f1 triggers an error. Verify `unwind()` yields
      frames in innermost-first order with correct DefIds and spans.

- [ ] **T8: Block param aliasing (`step_terminator_goto` swap case)**
      Body with `goto bb1(b, a)` where `bb1` params are `(a, b)`. The scratch-based swap
      logic must produce the correct result — without it, the naive sequential assignment
      would clobber one value.

### Minor gaps

- [ ] **T9: `Unary::Neg` on `Number`**
      Float negation: `-(3.5)` should produce `-3.5`.

- [ ] **T10: `CallStack::new_in` path**
      Construct a `CallStack` via `new_in` (takes `Body` directly) and run to completion.
      Exercises the alternate constructor.
