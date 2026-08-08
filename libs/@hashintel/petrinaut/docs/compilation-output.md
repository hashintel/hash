# Compilation Output

The **Compilation** tab explains what Petrinaut's compiler made of your net's code: which conditions, kernels and differential equations were understood, and what stops the net running on the [GPU backend](experiments.md#compute-backend-experimental).

It is a diagnostic view about the compiler, not about your model — for errors in your code, use [Diagnostics](petri-net-extensions.md#diagnostics) instead.

## Turning it on

Under **Settings → Simulation**, switch on **Compilation output**. A **Compilation** tab appears in the bottom panel. It is off by default.

## What it shows

### The verdict line

A pill reads **Runs on GPU** or **CPU only**, followed by:

- **B/run** -- bytes of GPU state one simulation run needs. The backend refuses nets above 4096 bytes, so this is the number to watch when raising [token capacities](drawing-a-net.md#token-capacity).
- **lines of WGSL** -- size of the generated shader, when one was generated.
- **compiled items** -- how many pieces of user code the net contains.

### Blocks GPU compilation

Structural reasons the net was refused before any code was generated — a typed place without a capacity, an unsupported attribute type, an arc consuming more than one typed token. Each reason names the item; click it to select that item on the canvas.

### Shader emission failed

The net passed the structural checks, but the generator could not turn some expression into GPU code. The message is the generator's own, so it describes the expression rather than your model. A common cause is an arc that consumes three or more typed tokens at once: conditions reading token attributes are supported at weight 1 and 2, but not beyond.

When a transition kernel reads as **CPU**, the detail names what WGSL cannot express — a `string` attribute, a generated `uuid`. A net with such a kernel is refused rather than run: a produced token whose attributes were never written would report zeros as results.

### Compiled code

One row per piece of user code — transition conditions, transition kernels, and per-place dynamics — with the size of its compiled expression and where it can run:

| Label        | Meaning                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPU**      | Compiled, and the GPU backend can run it.                                                                                                               |
| **CPU**      | Compiled, but only the CPU engine can run it. Select the item to see whether that is because of the backend or because of the code.                     |
| **untested** | Compiled, but the net was refused before generation, so this was never tried either way.                                                                |
| **no HIR**   | Did not compile. Check [Diagnostics](petri-net-extensions.md#diagnostics) for why.                                                                      |
| **unused**   | Neither engine uses this code — the relevant [extension](petri-net-extensions.md) is off, or a transition kernel has no typed output place to write to. |

Select a node on the canvas and the list narrows to that node's code and shows its detail. With nothing selected you get the whole net.

## Node counts

The node count is the size of the compiled expression tree, not of your source text. Comments, formatting and intermediate variables do not affect it. `parameters.infection_rate` is one node; a comparison between two computed distances is a dozen. It is a rough measure of how much work a condition does per firing check.
