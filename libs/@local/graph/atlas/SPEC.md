# Semantic Atlas + Canvas: unified specification

**Status:** revised reconciled baseline. This document supersedes
`semantic-atlas-implementation-spec.md` on atlas architecture and supersedes the
serving/architecture portions of `canvas-implementation.md`.

`canvas-implementation.md` remains the implementation-grade companion for
client shaders, the frontier loop, rendering regimes, the exact binary layout,
and build order. Where the documents overlap, this document is authoritative on
architecture and security; the pinned companion is authoritative on client and
wire implementation details.

**Companion pin — release blocker:** before this specification is declared
normative, the release manifest MUST record the exact
`canvas-implementation.md` document version, SHA-256 content hash, compatible
wire versions, and compatible shader-contract version. Until populated, these
fields are `TBD` and the specification remains a baseline rather than a frozen
release contract.

**Normative language:** the terms **MUST**, **MUST NOT**, **REQUIRED**,
**SHOULD**, **SHOULD NOT**, and **MAY** are normative when capitalized.

**Provenance markers:** `[measured]` ran against the real 986k-point corpus;
`[tested]` has executable tests in delivered artifacts; `[staged]` is deferred
behind an explicit trigger; `[open]` requires an experiment or sign-off.

---

## Terminology

The following terms are intentionally distinct:

- **Atlas generation:** an immutable, atomically published snapshot of models,
  coordinates, indexes, analytic regions, and manifests.
- **Atlas variant:** an alternative coordinate field within one generation,
  such as the canonical map or a published relation-strength sample. Previous
  drafts called this a “level.”
- **Tile zoom** $z$: the spatial resolution of the quadtree request.
- **Importance bucket** $b$: the delivery-priority tier assigned by the
  first-occupant rank pass.
- **Region depth:** the depth of a node in the analytic merge tree.
- **Delta:** mutable, append-oriented state associated with a generation;
  delta ingestion never moves base points.
- **Canonical representation:** the stored 3,072-dimensional embedding.
- **Projector representation:** the normalized first 512 components consumed
  by the default projector.

The endpoint vocabulary and all manifests MUST use these terms. In particular,
`variant`, `tile zoom`, `importance bucket`, and `region depth` MUST NOT be
collapsed into a single field named `level`.

---

## 0. Decision log

| decision                   | resolution                                                                                                                                                                           | basis                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| projector prefix           | **512 components, L2-renormalized after truncation**                                                                                                                                 | earlier MRL recall measurements; 512-prefix recall is the principal representation baseline, not a mathematical ceiling. The 128/256/512/1024 audit remains an ongoing guard    |
| layout engine              | **parametric projector + composite objective** replaces full-corpus non-parametric UMAP, graph fusion, and coordinate distillation                                                   | the per-node relation budget is the correct control for attraction imbalance; normalized relation distance makes policies scale-independent; the stability contract is stronger |
| relation influence         | **bounded relation energies with per-node gradient clipping** replace graph fusion, walk powers, reset, and hub trimming                                                             | the previous hop-grid findings do not define the new architecture; the evaluation harness remains a release gate                                                                |
| relation-strength control  | **[open]** one canonical variant, a small discrete variant ladder, or a relation-strength-conditioned projector                                                                      | all choices use the same variant-aware storage and client interpolation contract                                                                                                |
| LOD / far field            | **importance buckets + client-splat field + binary wire** `[measured, tested]`; server density-grid mode is a thin-client fallback only                                              | 0.98 field correlation from 0.9% of points; no per-cohort raster cache; 12–17 B/point versus JSON                                                                               |
| versioning / storage       | **immutable generations, base + delta, compaction, revision-bound ETags**                                                                                                            | avoids in-place coordinate mutation and supports rollback                                                                                                                       |
| permissions                | **delegated to the existing HASH authorization system**                                                                                                                              | the atlas consumes one atomic visibility-snapshot contract and does not implement scope algebra                                                                                 |
| relation-policy classifier | **[staged]** v1 uses a human policy table, Coincident allow-list, and Overlay default; soft LLM annotation and calibration activate only after the configured ontology-scale trigger | minimizes unsafe geometric automation while preserving the migration path                                                                                                       |
| landmark fit               | non-parametric optimization over a configured, bounded landmark budget; Python is acceptable for the reference fit                                                                   | the nonlinear optimization problem size is bounded independently of corpus cardinality; corpus-wide selection and projection remain streaming stages                            |
| release gates              | atlas fidelity and stability gates, merge-tree persistence `[tested]`, representation-baseline reporting, authorization noninterference, and snapshot consistency                    | neighborhood metrics alone do not detect loss of visual peaks or security errors                                                                                                |

---

## 1. System invariants

1. **Canonical and projector representations.** For entity $i$, let
   $x_i \in \mathbb{R}^{3072}$ be the stored canonical embedding. The projector
   input is

   $$
   \hat{x}_i =
   \frac{x_i[0{:}512]}
        {\max\left(\left\lVert x_i[0{:}512]\right\rVert_2,\varepsilon\right)},
   \qquad \varepsilon = 10^{-12}.
   $$

   The same versioned transform implementation MUST be used in preparation,
   training, inference, and ingestion. Its version, source hash, and golden test
   vectors MUST be persisted.

2. **The point stream is the field.** No density image ships on the normal hot
   path. The client reconstructs the field from permission-filtered points.
   Offline rasters exist for analytic merge trees, regions, labels, and release
   evaluation. Server aggregate mode is a thin-client fallback only.

3. **Relief and highlight share one accumulation pipeline.** The render target
   is RG16F: the R channel contains total visible mass and G contains matched
   visible mass. Filters update match bytes or bitmasks; point geometry MUST NOT
   be resent solely because a filter changed.

4. **Visible-subset rule.** Every count, field contribution, label, sample,
   point, and edge shown to a viewer MUST derive only from entities visible to
   that viewer under one authorization snapshot. Hidden entities contribute
   zero visible mass. The accepted exception is that canonical coordinates may
   reveal coarse evidence that hidden entities influenced the global atlas.

5. **Hidden-link influence is explicit and immutable.** Every generation MUST
   declare exactly one relation-influence security mode. A change in mode
   requires a new generation; it is never a delta-only change.

6. **Generations are immutable.** Base artifacts never mutate. Minor ingestion
   writes to the delta and never moves base coordinates. A major generation MAY
   move retained points only under anchor loss, similarity alignment, and
   published drift gates.

7. **Identifiers.** Public entity IDs are stable and opaque. Atlas ordinals and
   row IDs are generation-scoped. They MUST NOT be treated as durable public
   identifiers.

8. **Negative exclusions.** Semantic neighbors and endpoints connected by an
   active Coincident or Proximal relation MUST NOT be sampled as hard negatives
   for one another.

9. **Relation quantities remain separate.** The following MUST remain distinct
   end to end:
   - policy distribution $p_r$ over geometry classes;
   - policy applicability $a_r$;
   - relation-type strength $\sigma_r$;
   - link-instance confidence $c_{ijr}$;
   - degree normalization $\nu_{ijr}$;
   - global relation coefficient $\lambda_R$;
   - per-node relation-gradient cap $\beta$.

10. **Per-node gradient budget.** Relation gradients are capped relative to
    semantic gradients after policy, confidence, strength, and degree factors
    have been applied. The initial experiment range is $\beta \in
    \{0.05,0.10,0.20\}$; $0.10$ is the default candidate, not a permanent
    constant.

11. **Variant-complete storage, variant-specific fetch.** One logical entity
    row contains coordinates or deltas for every published atlas variant.
    Every variant has its own `(importance_bucket, morton_key)` fetch index
    because cross-variant movement is bulk, not a sparse tail `[measured]`.

12. **Bounded published variants.** Storage and index cost are approximately

    $$
    \mathrm{Cost}_{\mathrm{variants}} = O(NV),
    $$

    where $N$ is entity count and $V$ is published-variant count. The manifest
    MUST declare `published_variant_count` and `max_published_variants`.
    The initial guard is $V \le 8$ unless an explicit capacity review approves
    a higher value.

13. **Wire-scale declaration.** The manifest MUST declare the row-ID encoding.
    Wire v2 supports `u32`, hence at most $2^{32}-1$ rows in one generation.
    A larger generation MUST use a separately versioned `u64` or
    `(shard_id, local_row_id)` encoding. Readers MUST reject unsupported widths;
    they MUST NOT truncate.

14. **Crispness is computed per pixel.** Isolines use derivatives such as
    `fwidth`; hillshade uses the field gradient; sea level is a field threshold.
    Color magnification MUST NOT be used as a substitute for geometry-derived
    relief.

15. **One revision snapshot per response.** Every response is evaluated against
    one tuple

    $$
    S = (g, a, b, d),
    $$

    where $g$ is generation, $a$ authorization revision, $b$ base-data
    revision, and $d$ delta revision. Body rows, counts, labels, edges, headers,
    ETag, and cache key MUST all derive from the same $S$. If the service cannot
    preserve that snapshot, it MUST retry rather than combine revisions.

16. **Reproducibility and idempotency.** Every artifact records input hashes,
    model versions, configuration, seeds, and code revisions sufficient to
    reproduce it. Every delta write is idempotent by operation ID.

---

## 2. Authorization contract

HASH authorization is the source of truth. The preferred integration is one
atomic call:

```text
visibility_snapshot(principal) -> {
  predicate_or_bitmap_handle,
  scope_fingerprint,
  authorization_revision
}
```

The three fields MUST be obtained from the same authorization snapshot. If the
existing subsystem exposes separate calls, the adapter MUST provide equivalent
atomicity or verify that the revision did not change between calls.

For principal $u$, let $V_u(i) \in \{0,1\}$ indicate whether entity $i$ is
visible in the bound snapshot. Every serving query applies $V_u$ before
counting, sampling, labeling, field weighting, or returning edges.

Integration requirements:

- tile and filter queries receive the bound predicate or bitmap handle;
- restricted-view backfill fills capacity from deeper importance buckets
  `[measured: 10.1 ms]`;
- `visible_subtree_count` is computed under the same snapshot as returned
  points;
- revocation propagates through an authorization-revision bump and does not
  require coordinate recomputation;
- the identity endpoint makes hidden and nonexistent entities
  indistinguishable;
- logs MUST NOT reveal whether an authorization miss referred to an existing
  entity unless the caller is an authorized operator.

---

## 3. Generation pipeline

### 3.1 Freeze the generation input snapshot

A generation begins by freezing:

- ontology transaction time;
- knowledge transaction time;
- knowledge decision time or decision-time policy;
- embedding model and serialization template;
- relation-policy table and classifier version;
- relation-influence security mode;
- ANN configuration;
- landmark-selection configuration;
- projector configuration;
- client/wire companion pin.

The manifest stores content hashes for each input. A later change to any item
creates a new candidate generation.

For SemType records, entity type conditioning and relation cards MUST use
resolved type closure. If entity $i$ declares direct types $D_i$, its closed
set is

$$
\mathcal{T}_i
=
\bigcup_{\tau \in D_i}\operatorname{closure}(\tau).
$$

Unresolvable or cyclic closure is a generation-input error, not a permissive
fallback.

### 3.2 Prepare representations

The system persists the full $x_i \in \mathbb{R}^{3072}$ and derives
$\hat{x}_i \in \mathbb{R}^{512}$ using Invariant 1.

The representation audit compares candidate prefix lengths
$d \in \{128,256,512,1024\}$ against the canonical 3,072-dimensional graph.
For two neighbor systems $A$ and $B$, define

$$
R(A,B;k)
=
\frac{1}{N}
\sum_{i=1}^{N}
\frac{\left|\mathcal{N}^{A}_{k}(i)
\cap
\mathcal{N}^{B}_{k}(i)\right|}{k}.
$$

The audit MUST report $R(d,3072;k)$ for $k \in \{15,30,50\}$ overall and by
protected subgroup, source, language, entity role, and density decile.

The 512-prefix is the default projector representation. It is not the canonical
semantic representation and is not asserted to be an absolute information-
theoretic ceiling once type or relation inputs are supplied.

### 3.3 Resolve relation geometry policies

#### 3.3.1 Geometry classes

Version 1 has three active classes:

| class      | meaning                                                          | geometric behavior                                 |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Coincident | same or nearly equivalent referent                               | penalize distance above a small normalized radius  |
| Proximal   | relation should make endpoints discoverably nearby               | penalize distance above a larger normalized radius |
| Overlay    | relation should be rendered but should not determine coordinates | zero layout energy                                 |

General semantic opposition, contradiction, citation, or causation MUST NOT be
interpreted as global repulsion. A future **Deconflict** class MAY impose a
minimum local separation, but it is not active in v1.

#### 3.3.2 Policy precedence

The source of truth follows this strict precedence:

```text
human override
> human-reviewed soft label
> direct synthetic soft label
> calibrated classifier prediction
> Overlay fallback
```

Coincident is initially restricted to a human-reviewed allow-list.

#### 3.3.3 Relation cards

A relation card is deterministic text constructed from, in descending priority:

1. title, description, and aliases;
2. inverse title and inverse description;
3. closed ancestor titles and descriptions;
4. permitted source type titles and descriptions;
5. permitted destination type titles and descriptions;
6. relation constraints and directionality;
7. a bounded, diverse set of examples;
8. normalized URL slug as a fallback lexical feature.

The card MUST NOT be raw JSON. The card format is versioned. Its default target
budget is 6,000 tokens and its hard budget is 7,500 tokens, leaving headroom
below the embedding model’s 8k-token limit. Deterministic truncation removes
examples first, then low-priority ancestor material; it MUST NOT remove the title, description, inverse, or
endpoint-type summary.

Relation cards are embedded with the full 3,072-dimensional embedding.

#### 3.3.4 Synthetic soft labels and classifier `[staged]`

For relation $r$, repeated diversified LLM annotations produce counts $n_{rk}$
for class $k$. With $K=3$ and Dirichlet smoothing $\alpha=0.5$, the soft target
is

$$
q_{rk}
=
\frac{n_{rk}+\alpha}
     {m_r+K\alpha},
\qquad
m_r=\sum_{k=1}^{K}n_{rk}.
$$

Repeated calls to one prompt/model are not treated as independent humans.
Annotation batches SHOULD vary model or model snapshot, prompt wording,
label order, and examples. The default adaptive schedule is 6 initial votes,
12 for ambiguous items, and up to 24 for high-impact ambiguity, followed by
human review.

The baseline classifier is L2-regularized multinomial logistic regression over
the full relation embedding $e_r \in \mathbb{R}^{3072}$:

$$
p_{\phi}(k\mid e_r)
=
\operatorname{softmax}(We_r+b)_k,
$$

$$
\mathcal{L}_{\mathrm{policy}}(W,b)
=
-\sum_r \omega_r \sum_{k=1}^{K}
q_{rk}\log p_{\phi}(k\mid e_r)
+
\frac{\lambda}{2}\lVert W\rVert_F^2.
$$

Splits MUST be grouped by relation family, inverse pair, base URL, publisher,
and near-duplicate card family.

The model returns both a class distribution $p_r$ and an applicability score
$a_r \in [0,1]$. Out-of-distribution predictions are mixed toward Overlay:

$$
\widetilde{p}_r
=
a_r p_r
+
(1-a_r)
\begin{bmatrix}0\\0\\1\end{bmatrix}.
$$

Classifier activation becomes eligible when any configured trigger fires. The
initial staged defaults are:

- at least 500 unresolved relation types;
- human-reviewed policy coverage below 95% of relation-edge volume;
- an imported ontology contributes at least 100 new relation families; or
- manual policy maintenance exceeds the approved operational budget.

These thresholds are configuration, not training features, and are recorded in
the manifest.

#### 3.3.5 Relation-influence security mode

Every generation chooses exactly one:

- `public-links-only`: only links and endpoints satisfying the generation-wide
  public-visibility predicate may affect coordinates;
- `atlas-safe-links`: only link types on a security-reviewed allow-list and
  link instances satisfying the generation-wide safety predicate may affect
  coordinates;
- `all-snapshot-links`: all relation instances in the frozen generation input
  may affect coordinates.

The default candidate is `atlas-safe-links`. The selected mode, allow-list hash,
relation-policy hash, and relation-edge snapshot hash are immutable generation
metadata.

### 3.4 Build and audit the semantic graph

The default graph is approximate $k$-nearest neighbors with $k=30$ over
$\hat{x}_i \in \mathbb{R}^{512}$. The ANN backend is replaceable. An exact
stratified audit sample MUST achieve at least 0.95 recall@50 before projector
training begins.

A sampled or full 3,072-dimensional teacher graph MAY be used. Define:

$$
E_{\cap}=E_{512}\cap E_{3072},
\qquad
E_{512\setminus3072}=E_{512}\setminus E_{3072},
\qquad
E_{3072\setminus512}=E_{3072}\setminus E_{512}.
$$

The default policy is:

- consensus edges $E_{\cap}$ receive the strongest positive weight;
- prefix-only edges remain valid prefix-geometry positives but are audited for
  compression-induced false proximity;
- full-only edges MAY receive a capped teacher weight only when the projector’s
  available inputs can distinguish the endpoints;
- no graph-disagreement class is automatically converted to a hard negative;
  active semantic or relation exclusions always win.

The same persisted semantic graph artifact is consumed by training and by
release evaluation so that ANN variation does not confound model comparisons.

### 3.5 Fit the bounded landmark skeleton

A representative landmark set $L$ is selected with

$$
|L| = M \le M_{\max},
$$

where $M_{\max}$ is an explicit capacity parameter independent of $N$.
Selection is stratified over density, language, source, entity role, type
family, rare communities, and temporal cohort. A configured retained fraction
of prior landmarks stabilizes generation-to-generation orientation.

The nonlinear non-parametric fit operates only on $L$. Landmark selection,
entity-to-landmark assignment, projector inference, and materialization remain
streaming $O(N)$ or indexed $O(N\log N)$ stages; the specification does not
claim that the complete generation pipeline is independent of corpus size.

The manifest records:

- $M_{\max}$ and actual $M$;
- selection algorithm and seed;
- subgroup minimums;
- retained-landmark target and achieved fraction;
- landmark input and output hashes.

### 3.6 Train the parametric projector

#### 3.6.1 Inputs and architecture

The default projector is a residual MLP. Its primary input is $\hat{x}_i$.
Optional inputs are:

- pooled closed-type context $t_i$;
- a learned role embedding for knowledge entity, ontology type, or other
  supported role;
- relation-strength condition $\lambda_r$ when a conditioned variant model is
  enabled.

For type embedding $e_{\tau}\in\mathbb{R}^{3072}$ and inheritance depth
$d_{i\tau}$, the deterministic baseline pool is

$$
t_i
=
\frac{
\sum_{\tau\in\mathcal{T}_i}
\frac{1}{1+d_{i\tau}}P_t e_{\tau}}
{
\sum_{\tau\in\mathcal{T}_i}
\frac{1}{1+d_{i\tau}}
},
$$

where $P_t$ projects type embeddings to a configured smaller dimension. Type
conditioning is randomly dropped during training so the map remains usable for
untyped or novel entities.

For input $u_i=[\hat{x}_i;t_i;r_i]$, a residual block is

$$
h_0=\operatorname{SiLU}(\operatorname{LN}(W_0u_i+b_0)),
$$

$$
h_{\ell+1}
=
h_{\ell}
+
W_{\ell,2}
\operatorname{SiLU}
\left(
\operatorname{LN}(W_{\ell,1}h_{\ell}+b_{\ell,1})
\right)
+b_{\ell,2},
$$

$$
y_i=f_{\theta}(u_i)=W_oh_L+b_o\in\mathbb{R}^{2}.
$$

The default candidate is width 512 with four residual blocks. Widths
$\{256,512,1024\}$ and depths $\{3,4,6\}$ are benchmark axes. The smallest
model satisfying all quality and throughput gates wins.

When relation-strength conditioning is enabled, feature-wise modulation is

$$
\operatorname{FiLM}_{\ell}(h_i,t_i,\lambda_r)
=
\gamma_{\ell}(t_i,\lambda_r)\odot h_i
+
\beta_{\ell}(t_i,\lambda_r).
$$

#### 3.6.2 Composite objective

The conceptual scalar objective is

$$
\mathcal{L}
=
\lambda_S\mathcal{L}_{S}
+
\lambda_N\mathcal{L}_{N}
+
\lambda_H\mathcal{L}_{H}
+
\lambda_R\mathcal{L}_{R}
+
\lambda_A\mathcal{L}_{A}
+
\lambda_L\mathcal{L}_{L}
+
\lambda_G\mathcal{L}_{G}
+
\lambda_J\mathcal{L}_{J}.
$$

The relation contribution is additionally modified by the per-node gradient
budget in §3.6.6; therefore the actual optimizer update is not equivalent to
merely choosing a smaller global $\lambda_R$.

Terms are:

- $\mathcal{L}_S$: semantic-neighbor attraction;
- $\mathcal{L}_N$: ordinary sampled-negative repulsion;
- $\mathcal{L}_H$: 2D-mined hard-negative repulsion;
- $\mathcal{L}_R$: typed relation energy;
- $\mathcal{L}_A$: temporal anchor loss;
- $\mathcal{L}_L$: landmark-coordinate support;
- $\mathcal{L}_G$: optional global or triplet support;
- $\mathcal{L}_J$: optional local-sensitivity regularization.

#### 3.6.3 Semantic attraction and sampled negatives

Let $d_{ij}=\lVert y_i-y_j\rVert_2$ and define a low-dimensional affinity

$$
q(d)=\frac{1}{1+a d^{2b}},
$$

with versioned $a,b>0$. For positive edge weight $w_{ij}$ and negative weight
$\omega_{ik}$,

$$
\mathcal{L}_{S}
=
-\sum_{(i,j)\in E_S}
w_{ij}\log\left(q(d_{ij})+\varepsilon\right),
$$

$$
\mathcal{L}_{N}
=
-\sum_{(i,k)\in E_N}
\omega_{ik}\log\left(1-q(d_{ik})+\varepsilon\right).
$$

Positive and negative weights are capped by configuration. Sampling rates,
random seeds, and graph versions are persisted.

#### 3.6.4 Hard negatives

For point $i$, query the current 2D spatial index for close projected points.
The eligible hard-negative set is

$$
\mathcal{H}_i
=
\mathcal{N}^{2D}_{h}(i)
\setminus
\left(
\mathcal{N}^{512}_{k}(i)
\cup
\mathcal{R}^{\mathrm{active}}_i
\cup
\{i\}
\right),
$$

where $\mathcal{R}^{\mathrm{active}}_i$ contains Coincident and Proximal
endpoints. Hard-negative weights are rank-based and MUST satisfy
$0\le\omega^H_{ij}\le\omega^H_{\max}$. Their loss uses the same bounded
negative energy as $\mathcal{L}_N$.

The quadtree or a training-time spatial hash MAY serve as the miner. Mining is
refreshed at a configured cadence rather than on every optimizer step.

#### 3.6.5 Relation energies

The relation objective uses normalized distance so one policy has comparable
meaning in dense and sparse regions. Let the detached local scale be

$$
\rho_i
=
\operatorname{median}_{j\in\mathcal{N}^{512}_{15}(i)}
\lVert y_i-y_j\rVert_2,
$$

and

$$
z_{ij}
=
\frac{\lVert y_i-y_j\rVert_2}
{\sqrt{(\rho_i+\varepsilon)(\rho_j+\varepsilon)}}.
$$

The class energies are

$$
E_C(z)
=
\operatorname{Huber}_{\delta_C}
\left([z-u_C]_+\right),
$$

$$
E_P(z)
=
\tau\log\left(1+
\exp\left(\frac{z-u_P}{\tau}\right)\right),
$$

$$
E_O(z)=0,
$$

where $[v]_+=\max(v,0)$, $u_C<u_P$, and all parameters are versioned.
Coincident and Proximal stop pulling once their upper-distance condition is
satisfied; neither minimizes distance to zero without bound.

For link instance $(i,r,j)$, effective confidence is

$$
c_{ijr}
=
c_{\mathrm{link}}
\sqrt{c_{\mathrm{left}}c_{\mathrm{right}}}.
$$

A missing confidence value is treated as unscored and contributes a neutral
multiplicative value of 1; a separate `was_scored` bit is retained. Producer-
specific calibration MAY transform raw confidence before this equation.

Degree normalization is

$$
\nu_{ijr}
=
\frac{1}
{\sqrt{(1+\deg_r(i))(1+\deg_r(j))}}.
$$

With relation-type strength $\sigma_r$ and policy distribution
$\widetilde{p}_r$, the relation loss is

$$
\mathcal{L}_{R}
=
\sum_{(i,r,j)\in E_R}
\sigma_r c_{ijr}\nu_{ijr}
\left(
\widetilde{p}_{r,C}E_C(z_{ij})
+
\widetilde{p}_{r,P}E_P(z_{ij})
+
\widetilde{p}_{r,O}E_O(z_{ij})
\right).
$$

Edge minibatches MUST cap per-relation-type representation. Relation types are
sampled approximately uniformly or proportional to the square root of edge
count; raw edge frequency MUST NOT be allowed to make high-volume relations
own the layout.

#### 3.6.6 Per-node relation-gradient budget

After all relation weights in §3.6.5 are applied, compute coordinate-space
gradients

$$
g_i^S
=
\nabla_{y_i}
\left(
\lambda_S\mathcal{L}_S
+
\lambda_N\mathcal{L}_N
+
\lambda_H\mathcal{L}_H
\right),
$$

$$
g_i^R
=
\nabla_{y_i}
\left(\lambda_R\mathcal{L}_R\right).
$$

Let $\gamma>0$ be a configured semantic-gradient floor. The clipped relation
gradient is

$$
\widehat{g}_i^R
=
g_i^R
\min\left(
1,
\frac{
\beta\max(\lVert g_i^S\rVert_2,\gamma)
}
{
\lVert g_i^R\rVert_2+\varepsilon
}
\right).
$$

This clipping occurs per node in coordinate space, before the relation
contribution is propagated through the shared projector parameters. Normal
optimizer-level global gradient clipping, if used, occurs only after all
objective terms are combined.

Training metrics MUST report:

- fraction of nodes whose relation gradient was clipped;
- unclipped and clipped relation/semantic norm ratios;
- the ratios by relation type, degree decile, and subgroup;
- semantic fidelity at each tested $\beta$.

#### 3.6.7 Temporal anchors and landmarks

For retained anchor set $A$, prior coordinate $y_i^{\mathrm{prev}}$, local prior
radius $r_i^{\mathrm{prev}}$, and anchor weight $a_i$,

$$
\mathcal{L}_{A}
=
\sum_{i\in A}
a_i\,
\operatorname{Huber}_{\delta_A}
\left(
\frac{\lVert y_i-y_i^{\mathrm{prev}}\rVert_2}
{r_i^{\mathrm{prev}}+\varepsilon}
\right).
$$

Landmark support uses the corresponding robust normalized coordinate loss
against the bounded skeleton. Anchors and landmarks are sampled across the
whole atlas, not only dense or high-importance regions.

### 3.7 Project and publish atlas variants

Version 1 publishes one canonical variant unless the relation-strength
experiment justifies more. If variants $v\in\mathcal{V}$ are published, every
entity is projected in every $v$.

Each noncanonical variant is similarity-aligned to the canonical variant over a
stable anchor set $A$:

$$
(s_v,R_v,t_v)
=
\arg\min_{s>0,\,R^TR=I,\,\det R=1,\,t}
\sum_{i\in A}w_i
\left\lVert
sR y_{iv}+t-y_{i0}
\right\rVert_2^2.
$$

The displayed coordinate is

$$
\widetilde{y}_{iv}=s_vR_vy_{iv}+t_v.
$$

Coordinates for variant $v>0$ MAY be stored as signed deltas from the
canonical coordinate. With configured signed delta-interval width
$S_{\Delta}$ and

$$
q=\frac{S_{\Delta}}{65536},
$$

an axis delta is

$$
\Delta_{iv}
=
\operatorname{clamp}_{\mathrm{i16}}
\left(
\operatorname{round}
\frac{\widetilde{y}_{iv}-y_{i0}}{q}
\right).
$$

The manifest records $q$, span, transform, clamp count and rate, and error
quantiles. The carried clamp rate is 0.12% `[measured]`; every new generation
must remeasure it.

A new variant is publishable only when it has a measured product or fidelity
benefit, respects the variant-count cap, and is visually distinguishable from
adjacent variants beyond rerun noise.

### 3.8 Deterministic importance ranking

For each variant, define a stable lexicographic priority key

$$
\pi_i
=
\left(
-I_i,
-S_i,
H_{\mathrm{seed}}(\operatorname{entityId}_i)
\right),
$$

where $I_i$ is configured importance, $S_i$ is stable semantic priority, and
$H_{\mathrm{seed}}$ is a versioned deterministic hash. Ascending $\pi_i$ gives
the rank order.

The first-occupant cascade scans points in that order from coarse to fine grid
resolutions. At bucket $b$, every occupied cell that is not already represented
by a point assigned to an earlier bucket receives its first still-unassigned
point, and that point is assigned bucket $b$. Remaining points continue to
deeper buckets. The implementation MUST assert:

> For every occupied cell at every published prefix, at least one point from
> that cell appears in the delivered prefix.

The rank algorithm, grid schedule, hash, seed, and tie-breaks are part of the
generation manifest. The current implementation is `[tested: 2 s/variant]` and
achieved 100% occupied-cell coverage versus 58–84% under random ranking
`[measured]`.

Delta ingestion uses a serializable occupancy claim. Its order is the stable
ingestion-log order `(event_time, operation_id)`. Delta assignments are
provisional; compaction recomputes the canonical deterministic rank over base
plus delta.

Each variant stores a 16-bit-per-axis Morton key at the configured maximum tile
depth and an index over `(importance_bucket, morton_key)`.

### 3.9 Build the analytic raster and merge tree

The offline analytic field for variant $v$ is

$$
D_v(p)
=
\sum_{i=1}^{N}w_iK_h(p-\widetilde{y}_{iv}),
$$

where $K_h$ is the versioned analytic kernel and $w_i$ is the analytic mass
policy. This raster is not served on the normal point-stream path.

The merge tree is built over superlevel sets of $D_v$. For leaf $\ell$ born at
field value $B_\ell$ and merged at $D_\ell$, persistence is

$$
P_\ell=B_\ell-D_\ell.
$$

Labels are ranked by persistence plus configured semantic importance. The
region artifact contains parentage, persistence, representative IDs, and an
`assign(point)` mapping. Region depth is distinct from tile zoom and atlas
variant.

### 3.10 Materialize and atomically publish

A generation contains at least:

- canonical 3,072-dimensional vector references;
- normalized 512-dimensional projector representation or reproducible
  derivation metadata;
- canonical coordinates and variant deltas;
- per-variant importance buckets and Morton keys;
- point class/role columns;
- semantic graph and audit reports;
- relation policy sidecar and security-mode metadata;
- relation edge index;
- analytic raster, merge tree, regions, and labels per variant;
- base-data revision and initial delta revision;
- row-ID encoding declaration;
- authorization integration version;
- pinned client/wire companion metadata;
- complete hashes, model versions, seeds, and release-gate report.

Publishing is atomic. A generation becomes discoverable only after every
required artifact is present and verified. Rollback switches the active
manifest pointer; it does not rewrite artifacts.

---

## 4. Minor ingestion, delta state, and compaction

### 4.1 Minor ingestion

For a new or changed entity:

1. obtain and validate the full 3,072-dimensional embedding;
2. derive the normalized 512-prefix through the canonical transform;
3. resolve closed type context;
4. query base and delta ANN indexes;
5. compute the projector coordinate in every published variant;
6. resolve incident relation policies under the generation’s frozen policy and
   security mode;
7. optionally refine only the new coordinate while all existing coordinates
   remain fixed;
8. compute placement confidence;
9. append point, vector reference, Morton key, provisional bucket, authorization
   indexing metadata, and permitted edges to the delta;
10. commit idempotently by operation ID and advance the delta revision.

The optional fixed-atlas refinement is

$$
y_*^{\star}
=
\arg\min_y
\left[
\lambda_S\mathcal{L}_S(y;\mathcal{N}_*)
+
\lambda_H\mathcal{L}_H(y)
+
\lambda_R\mathcal{L}_R(y;E_*)
+
\lambda_P\lVert y-f_\theta(u_*)\rVert_2^2
\right],
$$

where all existing $y_i$ are constants. Refinement MUST have a step limit,
movement limit, and timeout. Failure returns the forward coordinate with lower
placement confidence; it MUST NOT partially move old points.

Placement confidence SHOULD include:

- nearest and $k$th-neighbor distance percentiles;
- local density percentile;
- projector/barycentric disagreement;
- forward/refined displacement;
- type/source/language coverage in the training corpus;
- distance from landmark support;
- graph-disagreement score between 512 and 3,072 dimensions where available.

Low-confidence points MAY be searchable immediately while being suppressed
from prominent low-zoom labels.

### 4.2 Base + delta reads

Reads use the immutable base plus the delta visible at snapshot $S$. Tombstones
mask superseded or deleted records. Base and delta ANN, point, edge, and Morton
indexes are queried separately and merged deterministically.

### 4.3 Compaction

Compaction:

1. freezes one base/delta input snapshot;
2. applies tombstones and supersessions;
3. recomputes deterministic importance buckets over the combined data;
4. rebuilds compact base indexes and artifacts;
5. verifies counts, hashes, permissions, tile equivalence, and release gates;
6. atomically publishes a new base revision or a new generation according to
   the movement policy;
7. retains the prior state for rollback.

A compaction that does not retrain or move coordinates may remain within the
same generation and advance base revision $b$. Any coordinate or model change
creates a new generation $g$.

---

## 5. Serving and client field reconstruction

### 5.1 Snapshot-bound request execution

At request start, the service binds:

- generation $g$;
- atlas variant $v$;
- authorization snapshot $(V_u,a,\mathrm{fingerprint})$;
- base revision $b$;
- delta revision $d$;
- predicate/filter hash;
- style and wire versions.

All SQL, bitmap, point, edge, count, and label operations use this bound state.
Responses include the revision tuple or an opaque snapshot token that resolves
to it.

### 5.2 Endpoints

- `GET /manifest`
  - returns transform metadata, generation, variants, bucket schedule,
    Procrustes parameters, row-ID encoding, region trees and labels, supported
    wire/shader versions, and an inlined root tile where configured;
  - when pregenerated per authorization cohort, it is keyed by scope
    fingerprint and revision.

- `GET /tile/{generation}/{variant}/{z}/{x}/{y}`
  - performs a skip scan over that variant’s
    `(importance_bucket, morton_key)` index under the visibility predicate;
  - backfills from deeper buckets until the visible-point budget is met or the
    visible subtree is exhausted;
  - returns wire-v2 binary when `row_id_encoding=u32` and the companion pin
    declares compatibility;
  - includes `visible_subtree_count`, delivered count, snapshot token, and
    ETag.

- `POST /filter`
  - for a small result, returns exact visible coordinates as a virtual tile;
  - otherwise returns bitmasks for visible delivered points and per-region
    visible counts;
  - uses `LIMIT N+1` or an equivalent bounded cardinality test.

- `GET /entity/{row_id}`
  - resolves hover/identity for the bound generation;
  - hidden and nonexistent IDs produce indistinguishable public responses.

- `GET /edges/...`
  - returns an exact edge only if the link entity, left endpoint, and right
    endpoint are all visible in the same authorization snapshot;
  - low-zoom edges are permission-filtered aggregates;
  - link entities are rendered as edges only in v1 and are not independently
    targetable point glyphs.

- aggregate fallback
  - returns permission-filtered counts, density grids, and sketches only to
    clients that cannot execute the point-field pipeline.

### 5.3 Frontier and mass-preserving field reconstruction

The client maintains a quadtree frontier $\mathcal{F}$. Except at leaves or
while loading, a frontier cell $c$ should satisfy

$$
p_{\min}
\le
\operatorname{screenWidth}(c)
<
2p_{\min},
$$

where the initial $p_{\min}$ range is 1–2 physical pixels.

For visible frontier cell $c$, let:

- $C_c$ be `visible_subtree_count`;
- $m_c$ be the number of delivered visible points from that cell;
- $D_c$ be those delivered points.

Every delivered point $i\in D_c$ receives mass

$$
w_i
=
\frac{C_c}{\max(m_c,1)}.
$$

Thus the delivered representatives preserve the total visible mass of the cell:

$$
\sum_{i\in D_c}w_i=C_c
\qquad\text{when }m_c>0.
$$

Let $K_i(p)$ be the normalized screen-space splat kernel for point $i$ and let
$m_i\in\{0,1\}$ be the current filter-match bit. The two accumulated fields are

$$
F(p)
=
\sum_{c\in\mathcal{F}}
\sum_{i\in D_c}
w_iK_i(p),
$$

$$
M(p)
=
\sum_{c\in\mathcal{F}}
\sum_{i\in D_c}
w_i m_i K_i(p).
$$

RG16F stores $R=F$ and $G=M$. The matched ratio is

$$
Q(p)=\frac{M(p)}{F(p)+\varepsilon}.
$$

Changing a filter updates $m_i$ or a bitmask and therefore $M$ and $Q$ without
resending coordinates. Sea level, hillshade, isolines, ratio tint, and marks
blend are computed from these fields according to the pinned client companion.

No hidden entity may contribute to $C_c$, $D_c$, $F$, or $M$.

### 5.4 Row-ID scale and wire evolution

The manifest field is one of:

```text
row_id_encoding = u32
row_id_encoding = u64
row_id_encoding = sharded_u32   # (shard_id, local_row_id)
```

Wire v2 supports only `u32`. A generation with more than $2^{32}-1$ rows MUST
publish a new compatible wire version and client pin before activation. The
preferred beyond-u32 candidate is `sharded_u32`, because shard-local compressed
bitmaps and indexes remain efficient; the final choice is `[open]`.

### 5.5 Cache keys and ETags

The canonical cache/ETag input is

$$
\begin{aligned}
K=H(&g,v,z,x,y,\mathrm{mode},
\mathrm{scopeFingerprint},a,b,d,\\
&\mathrm{predicateHash},
\mathrm{styleVersion},
\mathrm{wireVersion},
\mathrm{companionHash}).
\end{aligned}
$$

The ETag is derived from $K$ and the response payload hash. A revision change
invalidates the corresponding cache namespace. Cache entries MUST NOT be reused
across authorization fingerprints unless the authorization subsystem declares
them equivalent.

---

## 6. Validation and release gates

### 6.1 Representation, ANN, and map-neighbor reporting

The ANN exact-audit gate is recall@50 $\ge 0.95$ on the stratified audit sample.

For every projector candidate, report all three quantities:

$$
R_{\mathrm{map}\rightarrow512}(k)
=
R(G_{\mathrm{map}},G_{512};k),
$$

$$
R_{\mathrm{map}\rightarrow3072}(k)
=
R(G_{\mathrm{map}},G_{3072};k),
$$

$$
R_{512\rightarrow3072}(k)
=
R(G_{512},G_{3072};k).
$$

$R_{512\rightarrow3072}$ is the representation baseline. It is not written as
a universal hard ceiling. A projector may exceed it against the 3,072 graph by
learning corpus structure or using type/relation inputs; such a result MUST be
validated on held-out temporal, community, source, and subgroup splits to rule
out leakage.

Also report trustworthiness, continuity, false-neighbor intrusions and
extrusions, density distortion, landmark rank correlation, and sampled global
triplets.

### 6.2 Merge-tree persistence gate

For every published variant, compare the parametric candidate with the tuned
non-parametric landmark/reference baseline using:

- leaf count above fixed persistence thresholds;
- total leaf persistence

  $$
  P_{\mathrm{total}}=\sum_{\ell}P_{\ell};
  $$

- persistence distribution by region size and subgroup;
- planted-shape suites: bipartite graphs, cliques, chains, lattices,
  noise-edge perturbations, and isolates;
- the no-structure-from-noise differential assertion.

The candidate must remain within the approved two-sided persistence envelope
of the reference, or improve an explicitly selected persistence target, while
satisfying semantic-neighbor gates. More leaves or greater total persistence is
not automatically better: an improvement is rejected if it increases
unsupported low-persistence structure or fails the noise differential.
Persistence does not replace neighbor metrics; both are required.

### 6.3 Temporal drift

After similarity alignment, define normalized retained-point displacement

$$
\delta_i
=
\frac{
\lVert \widetilde{y}^{\mathrm{new}}_i-y^{\mathrm{old}}_i\rVert_2
}
{r^{\mathrm{old}}_{i,15}+\varepsilon},
$$

where $r^{\mathrm{old}}_{i,15}$ is the old local 15-neighbor radius.

Initial gates are:

$$
\operatorname{median}(\delta_i)<0.10,
\qquad
P_{95}(\delta_i)<0.50.
$$

Report unchanged-neighborhood points separately from points whose canonical
3,072-dimensional neighborhood materially changed. Also report neighbor churn,
region-centroid drift, label movement, and tile churn.

### 6.4 Relation-policy and relation-force gates

The relation classifier is evaluated on a human-reviewed grouped holdout using:

- per-class precision and recall;
- log loss and Brier score;
- calibration curves;
- abstention/applicability coverage;
- performance by ontology, relation family, and domain shift.

False Coincident predictions are assigned the highest cost. Coincident remains
allow-listed until its configured precision gate is met.

Map-level relation diagnostics include:

$$
\mathrm{Violation}_C
=
\Pr(z_{ij}>u_C\mid r\text{ is Coincident}),
$$

$$
\mathrm{Violation}_P
=
\Pr(z_{ij}>u_P\mid r\text{ is Proximal}),
$$

plus semantic-fidelity change, relation-gradient clipping rate, and results by
degree decile. A classifier score alone is never sufficient to enable relation
forces.

### 6.5 Incremental-placement gates

Compare:

1. forward-only placement;
2. fixed-atlas local refinement;
3. full-generation oracle placement.

Report neighborhood recall, relation satisfaction, forward/refined movement,
latency, throughput, and confidence calibration. Existing base coordinates
must be byte-identical before and after a minor-ingestion test.

### 6.6 Authorization and snapshot gates

The release suite MUST include:

- hidden-entity noninterference in counts, fields, labels, points, and samples;
- hidden-link and hidden-endpoint edge suppression;
- hidden/nonexistent identity indistinguishability;
- revocation under concurrent tile reads;
- retry rather than mixed-snapshot response;
- ETag changes on every relevant revision;
- cache isolation across authorization fingerprints;
- no forbidden identifiers in logs or telemetry;
- verification that `visible_subtree_count` and delivered points share one
  snapshot.

The coordinate-side-channel acceptance and the selected hidden-link security
mode require explicit security sign-off per generation family.

### 6.7 Scale, reproducibility, and subgroup gates

- Run at least two seeds per decision cell and estimate rerun-noise floors with
  the control-row method.
- No important subgroup may suffer more than twice the overall degradation on
  the primary fidelity metric without an approved exception.
- Verify row-ID overflow rejection and the manifest’s declared encoding.
- Demonstrate restart recovery and idempotent replay of the delta log.
- Demonstrate rollback to the preceding generation.
- Verify input hashes, model hashes, seeds, and output hashes in the published
  manifest.
- Stress-test at 10× and 30× current corpus scale using generated or replayed
  shards; no stage may require all vectors or graph edges in one process’s
  memory.

---

## 7. Open decisions

1. **Relation-strength presentation:** one canonical variant, a discrete
   ladder, or a conditioned projector. Decide in Phase 2 using neighbor,
   persistence, monotonicity, storage, and user-task results.
2. **Generation security mode:** the manifest field is mandatory; choose among
   `public-links-only`, `atlas-safe-links`, and `all-snapshot-links` for each
   generation family. Default candidate: `atlas-safe-links`.
3. **Published variants:** exact count and spacing, subject to $V\le 8$ unless
   capacity review approves more.
4. **Landmark budget:** select $M_{\max}$ and subgroup minimums from the Phase 2
   resource/fidelity curve.
5. **Movement budget:** calibrate drift gates against user spatial-memory
   studies.
6. **Provisional-placement threshold:** choose confidence threshold and label
   suppression policy.
7. **Beyond-u32 row addressing:** choose `u64` or `sharded_u32` before a
   generation approaches the v2 limit.
8. **Companion pin:** populate the exact client/wire document hash and version
   before normative release.

---

## 8. Verified numbers carried forward

The following measurements predate the parametric layout engine and bind to the
serving, LOD, and client layers, which are engine-independent. Engine-side
numbers arrive in Phase 2.

| measurement                       |                                                   carried result | status          |
| --------------------------------- | ---------------------------------------------------------------: | --------------- |
| rank pass                         |                                                  2 s per variant | measured/tested |
| occupied-cell coverage            |                                  100% versus 58% random baseline | measured        |
| representative tile-query timings |                                               33 / 12.6 / 1.0 ms | measured        |
| restricted-cohort backfill        |                                                          10.1 ms | measured        |
| binary wire                       |                           8.0 B/point in v1 golden configuration | measured/tested |
| coordinate quantization           | $3.4\times10^{-4}$ versus $1.6\times10^{-3}$ median-NN reference | measured        |
| splat correlations                |                                               0.90 / 0.98 / 0.95 | measured        |
| sea-level agreement               |                                                    53.0% / 53.0% | measured        |
| bulk cross-variant displacement   |                                      92% of corpus above 2 units | measured        |
| per-tile maximum displacement     |                                   median 11 tile widths at $z=5$ | measured        |
| delta clamps                      |                                                            0.12% | measured        |
| merge tree                        |                            19–32 s per variant, Python reference | measured        |
| region-count `GROUP BY`           |                                                       unmeasured | open            |

Every new generation or wire change MUST repeat the measurements whose inputs
or assumptions changed.

---

## Appendix A. Required generation-manifest fields

At minimum:

```yaml
generation_id: ...
created_at: ...
status: candidate | active | retired

input_snapshot:
  ontology_transaction_time: ...
  knowledge_transaction_time: ...
  knowledge_decision_time_policy: ...
  ontology_hash: ...
  knowledge_hash: ...

embedding:
  model: ...
  canonical_dimensions: 3072
  projector_dimensions: 512
  transform_version: ...
  transform_hash: ...
  golden_vectors_hash: ...

semantic_graph:
  k: 30
  metric: cosine
  backend: ...
  graph_hash: ...
  exact_audit_hash: ...
  recall_at_50: ...

landmarks:
  max_count: ...
  actual_count: ...
  selection_version: ...
  seed: ...
  retained_fraction: ...
  artifact_hash: ...

projector:
  architecture_version: ...
  width: ...
  residual_blocks: ...
  type_conditioning: true | false
  relation_conditioning: true | false
  checkpoint_hash: ...
  loss_config_hash: ...
  relation_gradient_beta: ...

relations:
  security_mode: public-links-only | atlas-safe-links | all-snapshot-links
  policy_hash: ...
  allow_list_hash: ...
  edge_snapshot_hash: ...
  classifier_version: ...
  policy_coverage_by_edge_volume: ...

variants:
  canonical_variant: ...
  published_variant_count: ...
  max_published_variants: 8
  entries:
    - id: ...
      relation_strength: ...
      procrustes_transform: ...
      quantization_step: ...
      clamp_count: ...
      clamp_rate: ...
      bucket_index_hash: ...
      morton_index_hash: ...
      merge_tree_hash: ...

storage:
  row_count: ...
  row_id_encoding: u32 | u64 | sharded_u32
  base_revision: ...
  initial_delta_revision: ...

serving:
  authorization_adapter_version: ...
  wire_versions: [...]
  style_version: ...
  canvas_companion_version: TBD
  canvas_companion_sha256: TBD
  shader_contract_version: TBD

reproducibility:
  code_revision: ...
  config_hash: ...
  seeds: [...]
  release_report_hash: ...
```

A candidate with missing required hashes or an unpinned client companion MUST
NOT be promoted to normative production status.
