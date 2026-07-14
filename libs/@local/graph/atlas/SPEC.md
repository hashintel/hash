# SALT Atlas: Semantic-Anchor-Link-Type Atlas, unified specification

> The name enumerates the objective: **S**emantic attraction
> ($\mathcal{L}_S$), **A**nchors, temporal and landmark ($\mathcal{L}_A$),
> and **L**ink-**T**ype relation energies ($\mathcal{L}_R$).

**Status:** canonical working baseline. This document supersedes
`semantic-atlas-implementation-spec.md` on atlas architecture and supersedes the
serving/architecture portions of `canvas-implementation.md`. It is the
canonical architecture document for implementation outputs, but it is not yet a
frozen release contract while the companion pin remains `TBD`.

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

**Relation-policy revision:** v1 is open-world. A shared calibrated classifier
assigns geometry-class probabilities to known and newly minted relation types;
no exhaustive per-type strength table is assumed. A shared calibrated strength
head MAY modulate admitted attraction within fixed bounds under the staged
ablation contract of §3.6.6b.

**Relation-admission revision:** attraction, no-repel protection, generic negative
admission, and any future typed Deconflict force are separate decisions. Failure
to admit attraction MUST NOT be interpreted as evidence for repulsion.

**Protection-applicability revision:** low policy applicability is not itself
evidence that linked endpoints are safe negatives. Protection-only applicability
floors are therefore an `[open]` ablation. They MAY preserve no-repel protection
for unfamiliar or post-cutoff relation types without granting those types any
attractive force.

**Execution ledger:** the only remaining human-blocked inputs are the rubric
v0-to-v1 freeze and the adjudicated anchor/qualification deck. All other
work is delegated, experimentally gated, or specified in this document.

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

| decision                     | resolution                                                                                                                                                                                                                                                                                                                                                                     | basis                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| projector prefix             | **512 components, L2-renormalized after truncation**                                                                                                                                                                                                                                                                                                                           | earlier MRL recall measurements; 512-prefix recall is the principal representation baseline, not a mathematical ceiling. The 128/256/512/1024 audit remains an ongoing guard                                                                       |
| layout engine                | **parametric projector + composite objective** replaces full-corpus non-parametric UMAP, graph fusion, and coordinate distillation                                                                                                                                                                                                                                             | the per-node relation budget is the correct control for attraction imbalance; normalized relation distance makes policies scale-independent; the stability contract is stronger                                                                    |
| relation influence           | **bounded relation energies with per-node gradient clipping** replace graph fusion, walk powers, reset, and hub trimming                                                                                                                                                                                                                                                       | the previous hop-grid findings do not define the new architecture; the evaluation harness remains a release gate                                                                                                                                   |
| relation admission           | **three independent channels:** attractive force, no-repel protection, and `[staged]` typed Deconflict; ordinary and hard-negative admission remain pair-derived rather than the complement of attraction                                                                                                                                                                      | a rejected or disabled attraction is not affirmative evidence that a linked pair should be pushed apart; separate gates prevent wrong-sign force and double counting                                                                               |
| OOD no-repel protection      | **[open ablation]** protection MAY use channel-specific applicability floors $a_{\min,H}$ and $a_{\min,N}$ while attraction continues to use the calibrated applicability $a_r$ unchanged                                                                                                                                                                                      | an unfamiliar linked pair may be unsafe to mine as a targeted negative even when its relation type is too OOD to earn pull; over-protection can still suppress useful hard negatives, so the floor is selected empirically rather than by argument |
| relation-strength control    | **[open]** one canonical variant, a small discrete variant ladder, or a relation-strength-conditioned projector                                                                                                                                                                                                                                                                | all choices use the same variant-aware storage and client interpolation contract                                                                                                                                                                   |
| LOD / far field              | **importance buckets + client-splat field + binary wire** `[measured, tested]`; server density-grid mode is a thin-client fallback only                                                                                                                                                                                                                                        | 0.98 field correlation from 0.9% of points; no per-cohort raster cache; 12–17 B/point versus JSON                                                                                                                                                  |
| versioning / storage         | **immutable generations, base + delta, compaction, revision-bound ETags**                                                                                                                                                                                                                                                                                                      | avoids in-place coordinate mutation and supports rollback                                                                                                                                                                                          |
| permissions                  | **delegated to the existing HASH authorization system**                                                                                                                                                                                                                                                                                                                        | the atlas consumes one atomic visibility-snapshot contract and does not implement scope algebra                                                                                                                                                    |
| relation-policy classifier   | **open-world v1 default:** diversified synthetic soft labels train a calibrated full-embedding multinomial logistic-regression classifier; every relation type without a higher-precedence override is classified at generation time, and low-applicability predictions fall back toward Overlay for attraction while no-repel protection MAY use the separately ablated floor | the relation-type universe is not known or enumerable at release time; one shared classifier and shared class coefficients generalize to newly minted types without per-type tuning                                                                |
| relation strength multiplier | **[staged ablation]** a shared calibrated strength head over relation-card embeddings yields bounded $h_r\in[0.5,2]$, fitted on band votes and frozen before projector training; $h\equiv1$ remains the control and an eligible release winner                                                                                                                                 | a type-specific output from a shared head generalizes open-world; unconstrained per-type parameters do not; freezing outside the geometry loss removes the $h\to0$ shortcut                                                                        |
| landmark fit                 | non-parametric optimization over a configured, bounded landmark budget; Python is acceptable for the reference fit                                                                                                                                                                                                                                                             | the nonlinear optimization problem size is bounded independently of corpus cardinality; corpus-wide selection and projection remain streaming stages                                                                                               |
| release gates                | atlas fidelity and stability gates, merge-tree persistence `[tested]`, representation-baseline reporting, authorization noninterference, and snapshot consistency                                                                                                                                                                                                              | neighborhood metrics alone do not detect loss of visual peaks or security errors                                                                                                                                                                   |

---

## 1. System invariants

1. **Canonical and projector representations.** For entity $i$, let
   $x_i \in \mathbb{R}^{3072}$ be the stored canonical embedding. The projector
   input is

   $$
   \hat{x}_i
   =
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

8. **Relation admission is signed and non-complementary.** A link instance
   first passes the generation's relation-influence security predicate. After
   that, the system treats the following as separate decisions:
   - admission to Coincident or Proximal attraction;
   - admission to no-repel protection for ordinary or hard-negative sampling;
   - admission to a future typed Deconflict energy; and
   - admission of the endpoint pair to generic sampled or mined repulsion.

   Failure to admit attraction MUST NOT imply generic-negative or typed-
   Deconflict admission. Overlay means "this link supplies no geometric
   direction"; it does not mean "repel." Generic negative admission is derived
   independently from semantic-neighbor absence and projected-collision
   criteria. Version 1 has no active typed Deconflict force.

9. **Relation quantities and admission channels remain separate.** The following
   MUST remain distinct end to end:
   - raw classifier logits $\ell_r$;
   - calibrated policy distribution $p_r$ over geometry classes;
   - policy applicability $a_r$;
   - attraction-side applicability-adjusted distribution $\widetilde{p}_r$;
   - channel-specific protection applicability values
     $a_r^H=\max(a_r,a_{\min,H})$ and
     $a_r^N=\max(a_r,a_{\min,N})$ when the floor ablation is enabled;
   - protection-side distributions $\widetilde p_r^H$ and
     $\widetilde p_r^N$;
   - effective attraction distribution $p_r^{\star}$ after the global
     Coincident attraction gate;
   - globally shared attraction coefficients
     $\kappa=(\kappa_C,\kappa_P,\kappa_O)$ with $\kappa_O=0$;
   - derived active attraction strength

     $$
     s_r^{+}
     =
     \kappa_C p^{\star}_{r,C}
     +
     \kappa_P p^{\star}_{r,P},
     $$

     which is diagnostic and MUST NOT be an independently fitted type
     parameter;

   - globally shared no-repel coefficients
     $\chi=(\chi_C,\chi_P,\chi_O)$, with v1 values
     $\chi_C=\chi_P=1$ and $\chi_O=0$;
   - channel-specific instance no-repel masses
     $m^{0,H}_{ijr}$ and $m^{0,N}_{ijr}$ and their pair-level aggregates
     $m^{0,H}_{ij}$ and $m^{0,N}_{ij}$;
   - protection-only applicability floors $a_{\min,H}$ and $a_{\min,N}$;
   - hard-negative and ordinary-negative protection thresholds
     $\eta_H$ and $\eta_N$;
   - optional attraction-force pruning threshold $\eta_F$;
   - link-instance confidence $c_{ijr}$;
   - degree normalization $\nu_{ijr}$;
   - global attraction coefficient $\lambda_R$;
   - per-node attraction-gradient cap $\beta_{+}$; and
   - if typed Deconflict is ever enabled, its class probability, admission
     threshold, signed-margin threshold, energy coefficient, and gradient cap
     $\beta_{-}$.

   Protection coefficients, applicability floors, and thresholds MUST remain
   independent of $\kappa$, $\lambda_R$, $\nu_{ijr}$, and the gradient caps.
   Protection-only floors MUST NOT modify classifier calibration, attraction
   probabilities, or typed-force admission. The system MUST
   NOT store or optimize an unconstrained free strength parameter per relation
   type. A human override MAY replace a predicted distribution, disable a
   class, or force Overlay, but ordinary operation MUST NOT require an
   exhaustive relation-type table.

10. **Per-node signed gradient budgets.** Attractive and any staged
    Deconflict relation gradients are capped relative to semantic gradients
    after policy, applicability, globally shared class coefficients, instance
    confidence, and degree normalization have been applied. They are clipped
    separately before summation so opposite signs cannot cancel and evade the
    budget. Version 1 uses $\beta_+=\beta_R\in\{0.05,0.10,0.20\}$ and
    $\beta_-=0$; $0.10$ is the default candidate, not a permanent constant.

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
- relation-policy annotation corpus, classifier model and calibration,
  attraction applicability configuration, protection-applicability floor
  configuration, shared class coefficients, and optional override records;
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

#### 3.3.1 Geometry classes and admission semantics

Version 1 has three active policy classes:

| class      | meaning                                                          | geometric behavior                                 |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Coincident | same or nearly equivalent referent                               | penalize distance above a small normalized radius  |
| Proximal   | relation should make endpoints discoverably nearby               | penalize distance above a larger normalized radius |
| Overlay    | relation should be rendered but should not determine coordinates | zero layout energy                                 |

General semantic opposition, contradiction, citation, or causation MUST NOT be
interpreted as typed repulsion in v1. A future **Deconflict** class MAY impose a
bounded minimum local separation, but it requires a separately versioned
four-class policy model and the release gates in §6.4. It MUST NOT be inferred
from Overlay, from $1-p_C-p_P$, from a failed attraction gate, or from absence
of an attractive policy.

The relation pipeline has three signed admission channels:

1. **Attraction admission** uses the post-gate distribution $p_r^{\star}$ and
   shared attraction coefficients $\kappa_C,\kappa_P$.
2. **No-repel protection** uses a pre-attraction-gate, protection-specific
   distribution $\widetilde p_r^X$ and shared protection coefficients
   $\chi_C,\chi_P$, where $X\in\{H,N\}$ distinguishes hard-negative and
   ordinary-negative protection. The protection distribution MAY apply a
   channel-specific applicability floor; attraction never does.
3. **Typed Deconflict admission** is staged. If enabled, it uses an explicit
   Deconflict probability and a stricter gate; it is never the complement of
   attraction.

Generic sampled and hard-negative repulsion is not a fourth policy class. It is
pair-derived evidence that two projected points are false neighbors. A linked
pair may be eligible for generic repulsion when the link is Overlay-dominant
and supplies insufficient no-repel evidence, but the link itself does not
positively admit that pair. In particular:

> **No attractive force** does not imply **admit repulsion**.

**Why v1 does not infer typed repulsion from ordinary links (rationale,
recorded):**

1. _Recorded evidence usually indicates co-relevance._ Even "different from"
   or "opposite of" says that the endpoints are worth relating. Unrelatedness
   remains the unrecorded default.
2. _Unbounded repulsion misstates the relation._ Map distance already encodes
   unrelatedness. Pushing semantic opposites far apart can display "opposite
   of" as "nothing to do with each other."
3. _It can fight the strongest semantic edges._ Opposites and contradictions
   are often distributionally close, so a typed repulsive force can create the
   shatter failure mode and double-count the generic negative objective.
4. _Open-world safety is asymmetric._ A mistaken attraction can be bounded and
   capped; a mistaken repulsion can destroy local structure. Therefore typed
   Deconflict, if introduced, must require stronger evidence than no-repel
   protection or attraction. Low classifier applicability is uncertainty about
   the relation policy, not affirmative evidence that its endpoints are valid
   negatives; the protection-floor ablation in §3.6.6a tests how much of that
   uncertainty should conservatively veto targeted repulsion.

Visibility of contradictions remains primarily a rendering concern: edge
styling on the Overlay layer and, if warranted, a contradiction-density value
plane can display the relation without moving a point. Placement encodes
belonging; disputes are annotations on the terrain.

#### 3.3.1a Staged typed Deconflict contract

Typed Deconflict is disabled in v1:

$$
\kappa_D=0,
\qquad
G^D_{ij}=0.
$$

Activating it requires a new policy-class schema
$\{C,P,O,D\}$, a new annotation corpus, classifier and calibration artifacts,
and a new atlas generation. Let $\widetilde p_{r,D}$ be the calibrated,
applicability-adjusted Deconflict probability. Define instance admission mass

$$
m^D_{ijr}=c_{ijr}\widetilde p_{r,D}.
$$

A link instance is eligible for typed Deconflict only when

$$
G^D_{ijr}
=
\mathbf 1\left[
S_{ijr}=1
\land
m^D_{ijr}\ge\eta_D
\land
\widetilde p_{r,D}
-
\left(\widetilde p_{r,C}+\widetilde p_{r,P}\right)
\ge\Delta_D
\right],
$$

where $S_{ijr}$ is the generation security-admission predicate, $\eta_D$ is a
high-confidence admission threshold, and $\Delta_D>0$ is a signed-class margin.
The pair-level candidate uses maximum aggregation rather than a sum:

$$
m^D_{ij}
=
\max_{r\in\mathcal E_{ij}:S_{ijr}=1}m^D_{ijr},
$$

$$
G^{D,\mathrm{raw}}_{ij}
=
\mathbf 1\left[\exists r\in\mathcal E_{ij}:G^D_{ijr}=1\right].
$$

Duplicate links therefore cannot accumulate enough mass to manufacture
admission. Let $m^{0,H}_{ij}$ be the hard-negative no-repel mass from §3.6.4.
If both typed Deconflict candidacy and no-repel protection fire for the same
pair, including through different relation types, the pair enters
**signed-policy conflict**:

$$
C^{\pm}_{ij}
=
\mathbf 1\left[G^{D,\mathrm{raw}}_{ij}=1\land m^{0,H}_{ij}\ge\eta_H\right].
$$

The final typed-Deconflict admission is

$$
G^D_{ij}
=
G^{D,\mathrm{raw}}_{ij}\left(1-C^{\pm}_{ij}\right).
$$

A signed-policy conflict MUST be quarantined: no relation-derived attraction or
Deconflict force is applied, the pair remains protected from generic hard
negatives, and an audit record is emitted. The implementation MUST NOT resolve
such a conflict by subtracting opposing forces.

An admitted, nonconflicting Deconflict pair is controlled by its typed energy
and MUST be excluded from ordinary and hard-negative sampling to prevent double
counting. It also suppresses Coincident and Proximal relation force for that
pair.

#### 3.3.2 Policy precedence

The source of truth follows this strict precedence:

```text
explicit human override, when present
> human-reviewed soft label, when present
> direct synthetic soft label, when present
> calibrated classifier prediction
> Overlay fallback for unsupported or inapplicable inputs
```

The calibrated classifier is the default operational source for every relation
that lacks a higher-precedence record. No exhaustive policy table is required,
and a relation type minted after release receives a policy as soon as its
relation card is embedded and classified.

Coincident is conservative but is not controlled by a per-type allow-list. The
initial production candidate disables Coincident geometry globally by setting
$\kappa_C=0$. A later generation MAY enable it only after satisfying the
Coincident precision release gate in §6.4. When enabled, one global gate is
applied to every relation type:

$$
g_r^C
=
\mathbf{1}
\left[
\widetilde{p}_{r,C}\ge\tau_C
\;\land\;
a_r\ge\tau_A
\right].
$$

The effective policy distribution is

$$
p^{\star}_{r,C}=g_r^C\widetilde{p}_{r,C},
$$

$$
p^{\star}_{r,P}=\widetilde{p}_{r,P},
$$

$$
p^{\star}_{r,O}
=
\widetilde{p}_{r,O}
+
(1-g_r^C)\widetilde{p}_{r,C}.
$$

Thus a Coincident prediction that does not pass the global confidence and
applicability thresholds becomes Overlay rather than Proximal. The gate,
thresholds, and enablement state are generation-level configuration, not
per-type parameters.

#### 3.3.3 Relation cards

A relation card is deterministic text constructed from, in descending priority:

1. title, description, and aliases;
2. inverse title and inverse description when the ontology names an
   inverse; otherwise the literal line "Inverse Name: none recorded" (a claim
   about the ontology record, not about invertibility). Card fields are
   never synthesized: the card reports the ontology as-is, with nothing
   added, so a missing record renders as explicit absence rather than
   generated content;
3. closed ancestor titles and descriptions;
4. permitted source type titles and descriptions;
5. permitted destination type titles and descriptions;
6. relation constraints and directionality;
7. a bounded, diverse set of examples;
8. normalized URL slug as a fallback lexical feature.

The embedded card text MUST be identifier-free: no source-ontology
identifiers (QIDs, PIDs), no URLs, no database keys of any scheme may
appear in the serialized text. Identifiers live in card sidecar metadata
for provenance and joins. Rationale: identifiers are semantically
redundant next to the mandatory titles and descriptions, but they are a
systematic surface watermark distinguishing one ontology source from
another, creating train/serve format skew that the applicability score
would misread as semantic OOD. The card is a canonical rendering target;
each ontology source (Wikidata, native SemType, future imports) supplies
an adapter into it, sharing the constraint vocabulary verbatim. Format
parity is enforced by (a) a linter over embedded text forbidding
identifier patterns, and (b) a skew canary: the same logical relation
rendered through two adapters MUST embed to near-identical vectors.
Example sampling within a card is deterministic per relation (seeded by
the relation's stable id), stratified by source type, deduplicated by
endpoint, and resampled only when the relation's own data materially
changes; a drift canary tracks card-embedding movement of relations whose
titles and descriptions are unchanged between generations, which should
sit near zero. The annotation corpus MUST mix ontology sources (native
SemType cards alongside Wikidata bootstrap volume) so no single source's
prose style defines the training distribution.

The card MUST NOT be raw JSON. The card format is versioned. Its default target
budget is 6,000 tokens and its hard budget is 7,500 tokens, leaving headroom
below the embedding model’s 8k-token limit. Deterministic truncation removes
examples first, then low-priority ancestor material; it MUST NOT remove the title, description, inverse, or
endpoint-type summary.

Relation cards are embedded with the full 3,072-dimensional embedding.

#### 3.3.4 Synthetic soft labels and open-world classifier

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
the full relation embedding $e_r \in \mathbb{R}^{3072}$. With

$$
W\in\mathbb{R}^{3\times3072},
\qquad
b\in\mathbb{R}^{3},
$$

the rows of $W$ are the learned Coincident, Proximal, and Overlay linear
classifiers. They produce raw class logits

$$
\ell_r=We_r+b.
$$

Training minimizes soft-label cross-entropy:

$$
\mathcal{L}_{\mathrm{policy}}(W,b)
=
-\sum_r \omega_r \sum_{k=1}^{K}
q_{rk}\log
\left(
\operatorname{softmax}(\ell_r)_k
\right)
+
\frac{\lambda}{2}\lVert W\rVert_F^2.
$$

Splits MUST be grouped by relation family, inverse pair, base URL, publisher,
and near-duplicate card family. A disjoint calibration split fits a scalar
temperature $T>0$, giving the operational distribution

$$
p_r
=
\operatorname{softmax}
\left(
\frac{\ell_r}{T}
\right).
$$

The classifier softmax and the geometry coefficients serve different purposes.
The globally shared geometry coefficients $\kappa$ in §3.6.5 MUST NOT multiply
or rescale classifier logits. If a global class-prior correction is ever
required, it MUST be represented separately as

$$
p_r
=
\operatorname{softmax}
\left(
\frac{\ell_r}{T}+\log \pi
\right),
$$

where $\pi$ is a versioned class prior. Such a prior changes the classifier;
it is not a force coefficient and requires independent calibration.

The policy system also returns an applicability score $a_r\in[0,1]$ derived
from held-out calibration and out-of-distribution diagnostics. For attraction,
unsupported or out-of-distribution predictions are mixed toward Overlay:

$$
\widetilde{p}_r
=
a_rp_r
+
(1-a_r)
\begin{bmatrix}0\\0\\1\end{bmatrix}.
$$

The classifier is active in version 1. The annotation corpus bootstraps the
shared model; it is not an enumeration of the production type universe. At
generation time every relation card without a higher-precedence policy record
is classified. A candidate generation MUST fail if the required classifier or
calibration artifact is unavailable. During ingestion, a card that cannot be
constructed falls back to Overlay for every relation channel and emits a
structured audit event. A card that is successfully classified but whose
applicability is effectively zero falls back to Overlay for attraction; its
no-repel behavior remains governed by the protection-floor ablation in
§3.6.4.

The generation manifest records at least the annotation-corpus hash, prompt
family and vote schedule, grouped split hashes, model hash, calibration
temperature, applicability method and thresholds, human-reviewed holdout hash,
and class-prior configuration when present.

**Gold sizing (v1): 400 production cards + ~20 anchor cards.** Sizing
is measurement-driven: 400 puts overall accuracy at ~+-2% SE and the
smallest interesting class stratum near +-4% per-class recall, matches
recruited capacity (6 annotators x 150-card slices = >=2 coverage), and
600 buys ~1.2x tighter intervals for 1.5x cost. Composition: stratified
by relation family and source (native SemType cards included), with the
equivalence-flavored stratum EXHAUSTIVE rather than sampled, since the
Coincident-gate arithmetic (LCB95 >= 0.98 needs ~150+ zero-error
C-predicted cases) likely exceeds the population of equivalence types;
the expected v1 verdict is UNPASSABLE BY SAMPLE SIZE with $\kappa_C=0$
and global Coincident disablement, and the honest lever if $\kappa_C>0$ is wanted
early is population expansion from additional real ontologies (SKOS
exactMatch, OWL equivalence, schema.org sameAs) through adapters, never
synthetic cards. Anchor cards are excluded from evaluation (their
answers are revealed to annotators). Gold grows by nomination:
classifier-vs-panel disagreements queue gold v2 candidates.

**Gold multi-annotator protocol.** Gold labels are produced by several
independent human annotators, one blind pass each over the full deck,
plus two passes by the adjudicating ontologist (preserving the
self-consistency signal). Production is preceded by an ASYNC calibration round: all annotators
label a shared ~20-card qualification deck under rubric v0 and receive
an in-tool answer reveal (adjudicated labels + rationales for their
misses); qualification disagreements are resolved by AMENDING THE
RUBRIC (v0 -> v1), and production labeling runs only under the frozen
rubric. Production is dealt as balanced slices (>= 2 independent
annotators per card, ~20-25 minutes per annotator all-in) rather than
full passes; the adjudicating ontologist still completes two full
passes. The rubric document leads with worked examples from the
edge-case table, not definitions. Gold labeling is never outsourced to
generalist annotation platforms: geometry classes are product policy,
and gold's function is to be the expert anchor that grades the
scalable (LLM) annotator pool; a non-expert human pool is a second,
weaker such pool, not an anchor. Reliability is
reported as Krippendorff's alpha overall and per class. Low-entropy
consensus cards become gold directly; high-entropy cards escalate to
the adjudicator, whose binding label and rationale feed the rubric
edge-case table. Consensus never silently overrides adjudication:
contested cards escalate rather than average. Geometry classes are
policy, so agreement measures shared understanding of the rubric, not
truth; the adjudicator's rulings define the policy.

**Vote-ladder protocol (adaptive panel).** Votes are gathered in rungs
with early exit. Constraints: (1) every rung spans the diversity axes,
at least two model families and two genuinely distinct prompt framings
(definition-first, geometric-consequence, adversarial); rungs escalate
in model strength, so the most capable judges concentrate on cards that
resisted cheap consensus. (2) Early exit on unanimity applies only to
cards whose leading class is Proximal or Overlay; Coincident-leading
cards after any rung always run the full panel and enter the human
review queue. (3) Soft labels are Dirichlet-smoothed posterior means,
never empirical proportions: a truncated unanimous panel must not emit
a degenerate distribution; n_votes is recorded per card. (4) Downstream
calibration and applicability fitting use all cards weighted by n_votes;
fitting restricted to full-panel cards inherits the ambiguity selection
bias and is forbidden. (5) Rung composition, stopping decisions,
sampling parameters, and per-vote provenance are recorded per card.
Provenance per vote MUST include the dated model identifier as pinned
AND as returned by the gateway, the serving provider, and quantization
where reported: gateway slugs float and open-weight models are served
at differing precisions by different hosts, so an unpinned judge or a
silent provider flip is a panel-composition change. Judges are
qualified at pilot (per-judge gold agreement and output-schema
compliance), pruned once against a documented floor, and frozen; the
panel is never re-tuned against gold thereafter.

#### 3.3.5 Relation-influence security mode

Every generation chooses exactly one:

- `public-links-only`: only links and endpoints satisfying the generation-wide
  public-visibility predicate may affect coordinates;
- `atlas-safe-links`: only link types on a security-reviewed allow-list and
  link instances satisfying the generation-wide safety predicate may affect
  coordinates;
- `all-snapshot-links`: all relation instances in the frozen generation input
  may affect coordinates.

The default candidate is `atlas-safe-links`. The selected mode, security
allow-list hash, relation-policy hash, and relation-edge snapshot hash are
immutable generation metadata. This security allow-list controls which link
instances may influence coordinates; it is distinct from geometry coefficients
and does not assign a force strength to a relation type.

#### 3.3.5a Type-safety admission ladder

"Security-reviewed" MUST NOT be implemented as universal central human review
of link types; in an open type system that queue would gate geometric
influence on reviewer throughput. Admission under `atlas-safe-links` is
resolved per generation by the following ladder, first match wins:

1. **Deny override.** A central deny-list entry excludes the type from
   coordinate influence unconditionally. The deny-list is the human override
   pen; it is small, versioned, and hash-pinned.
2. **Audience-visibility derivation (mechanical).** A type is admitted for
   this generation if every snapshot instance of the type is readable by the
   generation's entire audience under the authorization model, and the type
   carries no aggregate-inference flag. This is a query against the
   permission-aware graph, not a judgment.
3. **Authored declaration.** Type schemas MAY carry a sensitivity class
   declared at mint time by the type author (safe / aggregate-sensitive /
   restricted). Declared-safe types are admitted; declared-sensitive types
   route to the review queue; declared-restricted types are denied.
   Declarations are subject to sampled central audit.
4. **Triage queue with default-deny.** Undeclared types in mixed-audience
   generations are denied by default and enter a review queue ordered by
   influence mass (instance count x attraction mass). Review effort tracks
   the Zipf head of edge mass, not the type universe.

Failure semantics make the ladder non-blocking: a denied or unreviewed type
still renders subject to instance-level visibility and its entities are still
placed by the semantic encoder; denial withholds geometric pull only. The
allow-list is stock rather than flow: admissions persist across generations
and only newly minted or newly flagged types re-enter the ladder. The
irreducible human judgment is the aggregate-inference case (instances
individually readable, co-location pattern collectively disclosive), which is
rare, declarable, and cushioned by the default while queued.

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
- global atlas-variant relation condition $\eta_v$ when a conditioned variant
  model is enabled; $\eta_v$ is not indexed by relation type.

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

When relation-strength conditioning is enabled, feature-wise modulation uses
the global atlas-variant condition $\eta_v$:

$$
\operatorname{FiLM}_{\ell}(h_i,t_i,\eta_v)
=
\gamma_{\ell}(t_i,\eta_v)\odot h_i
+
\beta_{\ell}(t_i,\eta_v).
$$

The condition $\eta_v$ scales the generation-level relation lens. It MUST NOT
encode or look up a per-relation-type force parameter.

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
\lambda_D\mathcal{L}_{D}
+
\lambda_A\mathcal{L}_{A}
+
\lambda_L\mathcal{L}_{L}
+
\lambda_G\mathcal{L}_{G}
+
\lambda_J\mathcal{L}_{J}.
$$

$\mathcal L_D=0$ and $\lambda_D=0$ in v1. Signed relation contributions are
additionally modified by the per-node budgets in §3.6.6; therefore the actual
optimizer update is not equivalent to merely choosing smaller global relation
coefficients.

Terms are:

- $\mathcal{L}_S$: semantic-neighbor attraction;
- $\mathcal{L}_N$: ordinary sampled-negative repulsion;
- $\mathcal{L}_H$: 2D-mined hard-negative repulsion;
- $\mathcal{L}_R$: Coincident and Proximal typed attraction;
- $\mathcal{L}_D$: staged, bounded typed Deconflict separation;
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

Ordinary-negative admission is pair-derived. A relation's Overlay probability,
a failed Coincident gate, or absence of attraction MUST NOT positively admit a
pair to $E_N$. A sampled pair may enter $E_N$ only when it is absent from the
semantic-positive set, is not protected under the ordinary-negative threshold
$\eta_N$, is not controlled by an admitted typed Deconflict edge, and is not in
signed-policy conflict. The ordinary-negative protection threshold SHOULD
satisfy

$$
\eta_N\ge\eta_H,
$$

so aggressive mined hard negatives receive at least as broad a protection set
as ordinary random negatives. The ordinary-negative sampler MUST respect $P^N_{ij}$. A generation MAY set
$\eta_N$ strictly above $\eta_H$ to preserve more of the broad random-negative
pool, but it MUST NOT bypass the configured predicate.

#### 3.6.4 Hard-negative admission and no-repel protection

Attraction and no-repel protection use different applicability semantics.
Attraction continues to use the calibrated value $a_r$ through
$\widetilde p_r$ in §3.3.4. For protection channel $X\in\{H,N\}$, define the
protection-specific applicability

$$
a_r^X
=
\max\left(a_r,a_{\min,X}\right),
$$

where $H$ denotes mined hard negatives and $N$ denotes ordinary sampled
negatives. The corresponding protection-only distribution is

$$
\widetilde p_r^X
=
a_r^X p_r
+
\left(1-a_r^X\right)e_O,
\qquad
e_O=
\begin{bmatrix}0\\0\\1\end{bmatrix}.
$$

For a security-permitted link instance $(i,r,j)$, define channel-specific
pre-attraction-gate no-repel mass

$$
m^{0,X}_{ijr}
=
c_{ijr}
\left(
\chi_C\widetilde p^X_{r,C}
+
\chi_P\widetilde p^X_{r,P}
\right).
$$

Version 1 uses

$$
\chi_C=\chi_P=1,
\qquad
\chi_O=0,
$$

so equivalently

$$
m^{0,X}_{ijr}
=
c_{ijr}a_r^X
\left(p_{r,C}+p_{r,P}\right).
$$

The baseline cell is

$$
a_{\min,H}=a_{\min,N}=0,
$$

which recovers the earlier applicability-discounted rule. Positive floors are
an `[open]` protection-only ablation. They do not modify $\widetilde p_r$,
$p_r^{\star}$, $\kappa$, classifier calibration, or any attractive force. Thus
an unfamiliar relation type MAY retain enough evidence to veto targeted
repulsion even when it remains too OOD to earn pull.

Because mined hard negatives are more targeted than ordinary random negatives,
the configured floors SHOULD satisfy

$$
0\le a_{\min,N}\le a_{\min,H}\le1.
$$

A floor on applicability still multiplies the classifier's raw
$p_{r,C}+p_{r,P}$ mass; it does not guarantee protection for an OOD relation
whose raw prediction is overwhelmingly Overlay. A stronger link-existence
prior would be a separate policy and is outside the v1 amendment.

For parallel links between one endpoint pair, use maximum aggregation
independently per channel:

$$
m^{0,X}_{ij}
=
\max_{r\in\mathcal E_{ij}:S_{ijr}=1}m^{0,X}_{ijr}.
$$

The hard-negative and ordinary-negative protection predicates are

$$
P^H_{ij}
=
\mathbf 1\left[m^{0,H}_{ij}\ge\eta_H\right],
$$

$$
P^N_{ij}
=
\mathbf 1\left[m^{0,N}_{ij}\ge\eta_N\right].
$$

Neither predicate includes $\kappa$, $\lambda_R$, degree normalization, force
pruning, or a gradient budget. Those quantities answer how strongly an
admitted force acts; they do not answer whether active repulsion is safe.

For point $i$, query the current 2D spatial index for close projected points.
Let $\mathcal R_i^{0,H}$ be endpoints with $P^H_{ij}=1$, let
$\mathcal R_i^D$ be nonconflicting, typed-Deconflict-controlled endpoints, and
let $\mathcal R_i^{\pm}$ be signed-policy conflicts. The eligible hard-negative
set is

$$
\boxed{
\mathcal{H}_i
=
\mathcal{N}^{2D}_{h}(i)
\setminus
\left(
\mathcal{N}^{512}_{k}(i)
\cup
\mathcal{R}^{0,H}_i
\cup
\mathcal{R}^{D}_i
\cup
\mathcal{R}^{\pm}_i
\cup
\{i\}
\right)
}.
$$

Thus hard-negative admission is independent evidence that a projected pair is
a false neighbor. A link can veto this admission through no-repel protection or
can move the pair into a separately controlled Deconflict path, but Overlay or
gate failure never serves as affirmative evidence for repulsion.

Hard-negative weights are rank-based and MUST satisfy
$0\le\omega^H_{ij}\le\omega^H_{\max}$. Their loss uses the same bounded
negative energy as $\mathcal{L}_N$. The quadtree or a training-time spatial hash
MAY serve as the miner. Mining is refreshed at a configured cadence rather than
on every optimizer step.

#### 3.6.5 Relation attraction, force pruning, and staged Deconflict

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

The v1 class energies are

$$
E_C(z)
=
\operatorname{Huber}_{\delta_C}
\left([z-u_C]_+\right),
$$

$$
E_P(z)
=
\tau_P\log\left(1+
\exp\left(\frac{z-u_P}{\tau_P}\right)\right),
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

Let $p_r^{\star}$ be the effective attraction distribution after applicability
fallback and the global Coincident gate in §3.3.2. Let

$$
\kappa
=
(\kappa_C,\kappa_P,\kappa_O),
\qquad
\kappa_C\ge0,
\quad
\kappa_P\ge0,
\quad
\kappa_O=0,
$$

be globally shared, generation-level attraction coefficients. They are not
relation-type parameters. Let $E_R^{+}$ contain only security-permitted link
instances whose endpoint pair is neither in signed-policy conflict nor admitted
to typed Deconflict. The relation-attraction objective is

$$
\boxed{
\mathcal{L}_{R}
=
\sum_{(i,r,j)\in E_R^{+}}
c_{ijr}\nu_{ijr}\,
\operatorname{stopgrad}(h_r)
\left[
\kappa_C p^{\star}_{r,C}E_C(z_{ij})
+
\kappa_P p^{\star}_{r,P}E_P(z_{ij})
\right]
}.
$$

The class probability is applied exactly once to its corresponding class
energy. The only permitted outer scalar on this mixture is the frozen strength
multiplier $\operatorname{stopgrad}(h_r)$ of §3.6.6b, with $h_r\equiv1$ in
the shared-only arm and whenever the strength head is disabled.

For diagnostics and optional attraction-edge pruning, define

$$
s_r^{+}
=
\kappa_C p^{\star}_{r,C}
+
\kappa_P p^{\star}_{r,P},
$$

$$
m^F_{ijr}=c_{ijr}s_r^{+}.
$$

The optional attraction-force pruning predicate is

$$
F_{ijr}
=
\mathbf 1\left[S_{ijr}=1\land m^F_{ijr}\ge\eta_F\right].
$$

$\eta_F$ controls only numerically negligible attractive-force edges or
sampling shortcuts. It MUST NOT control no-repel protection or generic-negative
admission. It MUST NOT be multiplied into the continuous objective unless the
generation explicitly declares hard pruning and validates the discontinuity.

When $s_r^{+}>0$, the normalized active attraction mixture is

$$
q_{r,C}
=
\frac{\kappa_Cp^{\star}_{r,C}}{s_r^{+}},
\qquad
q_{r,P}
=
\frac{\kappa_Pp^{\star}_{r,P}}{s_r^{+}}.
$$

This factorization is descriptive only. $s_r^{+}$ and $q_r$ MUST NOT be
independently fitted, manually tuned, or persisted as authoritative per-type
parameters.

If typed Deconflict is activated under §3.3.1a, use a bounded minimum-separation
energy

$$
E_D(z)
=
\operatorname{Huber}_{\delta_D}
\left([u_D-z]_+\right).
$$

It stops contributing once $z\ge u_D$ and therefore does not create unbounded
or map-wide repulsion. For each admitted, nonconflicting endpoint pair, choose
one controlling relation instance

$$
r^-_{ij}
=
\arg\max_{r\in\mathcal E_{ij}:G^D_{ijr}=1}m^D_{ijr},
$$

using deterministic tie-breaking. The staged typed-Deconflict objective is

$$
\boxed{
\mathcal L_D
=
\sum_{(i,j):G^D_{ij}=1}
c_{ijr^-_{ij}}\nu_{ijr^-_{ij}}
\kappa_D\widetilde p_{r^-_{ij},D}
E_D(z_{ij})
}.
$$

$\kappa_D=0$ and $\mathcal L_D=0$ in v1. An admitted Deconflict pair MUST NOT
also receive Coincident or Proximal relation force and MUST NOT enter ordinary
or hard-negative sampling. This avoids wrong-sign competition and duplicate
repulsion.

Edge minibatches MUST cap per-relation-type representation. Relation types are
sampled approximately uniformly or proportional to the square root of edge
count; raw edge frequency MUST NOT be allowed to make high-volume relations
own the layout.

#### 3.6.6 Per-node signed relation-gradient budgets

Compute the semantic coordinate-space gradient

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
\right).
$$

For v1 attraction, compute

$$
g_i^{R+}
=
\nabla_{y_i}\left(\lambda_R\mathcal L_R\right).
$$

Let $\gamma>0$ be a configured semantic-gradient floor and

$$
B_i=\max\left(\lVert g_i^S\rVert_2,\gamma\right).
$$

The clipped attractive relation gradient is

$$
\widehat g_i^{R+}
=
g_i^{R+}
\min\left(
1,
\frac{\beta_+B_i}
{\lVert g_i^{R+}\rVert_2+\varepsilon}
\right).
$$

Version 1 uses $\beta_+=\beta$ and has no typed negative relation gradient.

If typed Deconflict is enabled, compute it separately:

$$
g_i^{R-}
=
\nabla_{y_i}\left(\lambda_D\mathcal L_D\right),
$$

$$
\widehat g_i^{R-}
=
g_i^{R-}
\min\left(
1,
\frac{\beta_-B_i}
{\lVert g_i^{R-}\rVert_2+\varepsilon}
\right).
$$

Attractive and Deconflict gradients MUST be clipped before they are summed.
Otherwise opposing vectors can cancel and evade the budget. A final total-
variation cap uses

$$
\alpha_i
=
\min\left(
1,
\frac{\beta_RB_i}
{\lVert\widehat g_i^{R+}\rVert_2
+\lVert\widehat g_i^{R-}\rVert_2
+\varepsilon}
\right),
$$

and the signed relation contribution is

$$
\widehat g_i^R
=
\alpha_i
\left(
\widehat g_i^{R+}+\widehat g_i^{R-}
\right).
$$

The manifest MUST satisfy $\beta_+\le\beta_R$ and
$\beta_-\le\beta_R$. This clipping occurs per node in coordinate space before
the relation contribution is propagated through shared projector parameters.
Normal optimizer-level global gradient clipping, if used, occurs only after all
objective terms are combined.

Training metrics MUST report:

- fraction of nodes whose attractive relation gradient was clipped;
- if enabled, fraction whose Deconflict gradient was clipped;
- unclipped and clipped signed relation/semantic norm ratios;
- total-variation cap activation rate;
- ratios by relation type, degree decile, and subgroup;
- signed-policy conflict count and edge volume; and
- semantic fidelity at each tested budget.

#### 3.6.6a Shared coefficients, admission thresholds, and tuning protocol

The attraction energies use normalized distance, so fix $\kappa_P=1$ as the
unit convention. Set $\kappa_O=0$ by definition. The initial Coincident
candidate is $\kappa_C\in[3,5]$ after Coincident is enabled; before that release
gate is met, $\kappa_C=0$.

The protection-applicability floors and admission thresholds answer different
questions and MUST NOT be collapsed.

**Protection-applicability floor ablation `[open]`.** The required Phase 2
matrix is

$$
a_{\min,H}\in\{0,0.25,0.50,1.00\},
$$

$$
a_{\min,N}\in\{0,0.25\},
\qquad
0\le a_{\min,N}\le a_{\min,H}.
$$

The $a_{\min,H}=a_{\min,N}=0$ cell is the current applicability-discounted
baseline. Every floor cell MUST recalibrate $\eta_H$ and $\eta_N$ on its own
validation stream; comparing floors while holding thresholds fixed is invalid
because floors and thresholds jointly determine the protected set.

Selection uses a Pareto analysis over:

- protection recall for reviewed Coincident and Proximal pairs;
- the same recall restricted to post-training-cutoff and low-applicability
  relation types;
- distance change for reviewed same-referent and near-duplicate pairs;
- Overlay overprotection and protected edge volume;
- the number and quality of mined hard negatives removed;
- semantic kNN fidelity, false-neighbor correction, merge-tree persistence,
  and subgroup behavior; and
- training throughput and protection-index size.

The floor MUST NOT be justified solely by the claim that over-protection is
cheap. A high-volume OOD relation family can immunize a large subgraph and
restore parametric blur. Conversely, under-protection can create wrong-sign
separation exactly where classifier applicability is weakest. The selected
cell is the measured Pareto knee under the §6.4 gates.

| threshold | meaning                                                                       | selection signal                                                                  |
| --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| $\eta_H$  | enough C/P evidence to forbid mined hard repulsion                            | reviewed protection recall, Overlay overprotection, hard-negative pool reduction  |
| $\eta_N$  | enough C/P evidence to forbid ordinary sampled repulsion                      | same metrics, with a stricter threshold and global-negative coverage              |
| $\eta_F$  | attractive force is numerically material enough to sample or retain           | omitted unclipped attraction-gradient mass                                        |
| $\eta_D$  | staged typed Deconflict evidence is strong enough to admit bounded separation | reviewed Deconflict precision, applicability, signed margin, and map damage gates |

The default ordering is

$$
\eta_H\le\eta_N.
$$

$\eta_H$ is selected from a reviewed validation stream for each
$a_{\min,H}$ cell and MUST report:

- protection recall for reviewed Coincident and Proximal pairs;
- false-protection rate for reviewed Overlay pairs;
- fraction of hard-negative candidates removed solely by relation protection;
- results by relation family, applicability decile, confidence decile, degree
  decile, ontology source, and whether the relation type predates or postdates
  the classifier training cutoff; and
- downstream false-neighbor, blur, and merge-tree changes.

The previous "no more than 1% omitted gradient mass" rule applies only to
$\eta_F$. It is invalid for $\eta_H$ because a globally disabled Coincident
class has zero attraction-gradient mass while still requiring no-repel
protection.

Radii are set from data before tuning $\kappa$. Run the semantic-only baseline,
compute the $z$ distribution over reviewed-good Proximal pairs, and set $u_P$
near its 75th percentile so the loss acts primarily on the outlying quarter.
Set $u_C$ analogously from reviewed Coincident pairs. If Deconflict is later
enabled, choose $u_D$ from reviewed minimum-separation requirements before
tuning $\kappa_D$.

**Degeneracy rule (MUST):** shared geometry coefficients MUST NOT be learned by
minimizing the same non-negative geometry loss they weight. Joint descent has
the trivial minimizer $\kappa\to0$. Permitted procedures are:

1. **Outer-loop grid (default).** Before Coincident is enabled, tune $\beta_+$
   with $\kappa_C=0$ and $\kappa_P=1$. Once eligible, grid

   $$
   \beta_+\in\{0.05,0.10,0.20\},
   \qquad
   \frac{\kappa_C}{\kappa_P}\in\{2,4,8\},
   $$

   with at least two seeds per cell. Select the validation Pareto knee between
   relation satisfaction and semantic-fidelity change.

2. **Constraint ascent (documented upgrade).** State reviewed relation-distance
   requirements and treat shared coefficients as global dual variables updated
   by ascent while geometry descends. The per-node budget remains the hard
   ceiling.
3. **True bilevel optimization with hypergradients is excluded in v1.**

If typed Deconflict is enabled, $\kappa_D$, $\beta_-$, $\beta_R$, $\eta_D$,
and $\Delta_D$ are tuned in an outer loop against a semantic-only and
attraction-only baseline. The release suite MUST reject settings that improve
minimum-separation compliance by introducing unsupported fragmentation,
neighbor loss, or merge-tree noise.

A type-specific output from the shared strength head of §3.6.6b is permitted.
An unconstrained type-specific parameter is prohibited. Per-type lookup
tables, free scalars, and geometry-loss-trained multipliers remain outside v1.

#### 3.6.6b Calibrated shared strength head `[staged ablation]`

The strength multiplier $h_r$ is a shared, calibrated function of the full
relation-card embedding. It modulates how strongly an admitted attractive
relation pulls; it never decides admission.

**Training signal.** Strength is a second, conditional measurement pass over
the judged corpus (operational contract: strength-axis PRD). Eligibility:
admitted-configuration posterior $\widetilde p_{r,P}\ge0.2$ or membership in
the coincident review queue; Overlay-dominant populations are never asked.
Votes return one band per call, $m\in\mathcal B=\{\text{weak},
\text{standard},\text{strong}\}$, under the same routing, decoding, and
effort policy as class votes. Soft targets are Dirichlet-smoothed band
frequencies

$$
q^{S}_{rm}=\frac{n^{S}_{rm}+\alpha_S}{m_r^{+}+M\alpha_S},
\qquad \alpha_S=1 .
$$

**Head.** A shared low-dof head over the relation-card embedding $e_r$
predicts band probabilities $\pi^{S}_{r}$: ordinal (cumulative-link over
weak $<$ standard $<$ strong) preferred; softmax with temperature $T_S$ over
$o_r^{S}=Ue_r+d$ is the fallback. The head has no per-type parameters.

**Multiplier and OOD behavior.** With fixed band multipliers
$\zeta=(\zeta_{\mathrm{weak}},\zeta_{\mathrm{standard}},
\zeta_{\mathrm{strong}})=(0.5,1,2)$,

$$
h_r^{\mathrm{raw}}=\sum_{m\in\mathcal B}\zeta_m\pi^{S}_{rm},
\qquad
h_r=a_r^{S}h_r^{\mathrm{raw}}+\left(1-a_r^{S}\right)\cdot1 ,
$$

where $a_r^{S}$ uses the classifier's applicability machinery. Hence
$0.5\le h_r\le2$ and $a_r^{S}\to0\Rightarrow h_r\to1$: newly minted and
post-cutoff relation types receive the shared-class baseline, never zero and
never an extreme band. $\zeta$ is not retuned in v1.

**Training boundary.** The head is fitted and calibrated on card-level splits
BEFORE any projector training and is frozen thereafter. $\mathcal L_R$
consumes $\operatorname{stopgrad}(h_r)$; no gradient from any atlas objective
may reach $U$, $d$, $T_S$, or $a_r^{S}$. The head MUST NOT be trained through
any loss it multiplies; this removes the $h\to0$ shortcut that motivated the
prior prohibition.

**Independence.** No-repel protection, generic and hard-negative admission,
the security predicate $S_{ijr}$, and typed-Deconflict candidacy are
independent of $h_r$. $h_r$ scales admitted attraction only.

**Instrument admission.** The head enters the experiment matrix only if the
strength pilot passes its instrument gates (non-degenerate band variance,
cross-family weighted kappa, ordinal noise floor, non-redundancy with graph
fan-out statistics; thresholds in the strength-axis PRD). Any gate failure
records $h\equiv1$ as the v1 answer.

**Ablation and release.** Phase 2 compares $h\equiv1$ (control, eligible
release winner) against $h_r=h_\psi(e_r)$ with at least two seeds per arm.
The head is admitted to the release candidate only if relation-family
satisfaction improves beyond rerun noise with no degradation in
semantic-neighbor fidelity, merge-tree leaf persistence, subgroup behavior,
temporal stability, incremental placement, or training throughput. Ties go
to the control.

**Materialization.** Per-type $h_r$ values MAY be materialized in the
generation artifact for performance and reproducibility. Materialized values
are immutable within a generation, reproducible from the relation-card and
strength-model hashes, and MUST NOT be editable as per-type configuration.

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

**Mobility rule (link-responsive placement).** Every entity carries a
mobility state. MOBILE: first placed since the last major generation,
or below a configured degree floor at that generation (its constraints
were unseen by the current model). FROZEN: all others. On ingestion of
an entity or a link: mobile endpoints re-settle by a budgeted local
refinement of their own coordinates only, minimizing a semantic anchor
to their projected position plus relation energies toward the other
endpoint at its current coordinates (policy, derived strength,
confidence, degree normalization, and the per-node budget cap all
apply); frozen endpoints never move; a link between two frozen
entities defers to the next major generation, where the induced
movement would in any case be budget-capped to near zero. Both-mobile
links settle jointly. Order-dependence and drift within the mobile set
are accepted as transient: every major generation re-derives all
provisional placements under the full objective, bounding the lifetime
of any path-dependence to one retrain cycle. Refined placements update
their fetch-index rows (morton, bucket via occupancy upsert) and are
recorded as delta revisions; movement telemetry is emitted per
settle. Restated stability contract: frozen points never move between
generations; mobile points settle until frozen. Rationale: link
influence at ingestion should be proportional to how weakly anchored
an endpoint is; moving established entities for a newcomer's sake
trades placement quality users rely on for responsiveness they do not
need, while newcomers and relation-poor entities are exactly where
immediate link-following is both expected and cheap.

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

**Measured baseline (2026-07-12 audit; 985,932 x 3,072 corpus, 20k
queries, seed 0):** $R_{512\rightarrow3072}$ = 0.838 at k=15, 30, and 50
(k-stable); intrusion rate 7.2% at k=30; marginal return ~4-5 recall
points per dimension doubling with NO elbow (128: 0.745, 256: 0.795,
512: 0.838, 1024: 0.880). Consequences: (a) the 512-kNN training graph
carries ~16% missing true edges and ~7% intruder edges, which is the
measured magnitude the teacher-graph edge classes exist to absorb;
(b) 512 is confirmed as a cost/quality operating point, not a natural
optimum; 1024 is a parked A/B whose trigger is the parametric engine
tying the baseline on recall while losing the persistence gate (the
input-starvation signature); (c) stratified rerun complete: 21 groups, one flagged.
material-location (n=1841/20k, ~9% of corpus) at recall 0.26-0.36 vs
0.84 overall, but DIMENSION-FLAT (128 through 1024 within noise) and
K-RISING, the fingerprint of near-tie reshuffling among near-duplicate
clump siblings, not representation loss. Prediction (to verify once):
clump-granularity recall (neighbor overlap on near-duplicate group ids,
the measured 165k-group / 66%-of-corpus structure) restores this group
to ~overall.

**Flagged-group triage rule (normative):** a subgroup 2x flag is acted
on only after checking dimension-sensitivity and k-trend. Dim-flat +
k-rising means near-tie artifact: re-evaluate at clump granularity and,
if restored, record the group as clump-resolved (its entities are
placed by clump; within-clump order is not a representable quantity).
Only dim-RESPONSIVE degradation justifies representation spend. Audit
tooling MUST collapse strata keys that induce identical partitions
(base_url/title aliasing) and SHOULD ship clump-granularity recall as a
built-in metric, reusing the near-duplicate grouping.

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

### 6.4 Relation-policy, admission, and signed-force gates

The relation classifier is evaluated on a human-reviewed grouped holdout using:

- per-class precision and recall;
- log loss and Brier score;
- calibration curves;
- abstention/applicability coverage;
- performance by ontology, relation family, and domain shift; and
- behavior on relation types created after the classifier training cutoff.

False Coincident predictions are assigned the highest v1 cost. Coincident
geometry is globally disabled with $\kappa_C=0$ until the grouped holdout
establishes

$$
\operatorname{LCB}_{95\%}
\left(
\operatorname{Precision}_C
\right)
\ge
\tau_{\mathrm{precision},C}.
$$

The initial threshold candidate is $\tau_{\mathrm{precision},C}=0.98$ and the
exact value requires product and security sign-off. An enabled generation MUST
also declare $\tau_C$ and $\tau_A$ and report the type and edge-volume fractions
passing the gate.

No-repel protection is evaluated independently of active attraction. Every
candidate floor cell is evaluated separately, including on relation types
created after the classifier training cutoff. Required metrics include:

$$
\operatorname{Recall}^{H}_{C}
=
\Pr(P^H_{ij}=1\mid r\text{ is reviewed Coincident}),
$$

$$
\operatorname{Recall}^{H}_{P}
=
\Pr(P^H_{ij}=1\mid r\text{ is reviewed Proximal}),
$$

$$
\operatorname{Overprotect}^{H}_{O}
=
\Pr(P^H_{ij}=1\mid r\text{ is reviewed Overlay}).
$$

The release suite MUST demonstrate that:

1. with $\kappa_C=0$, a high-Coincident edge above $\eta_H$ is excluded from
   hard negatives;
2. changing $\kappa_C$, $\kappa_P$, $\lambda_R$, degree normalization, or the
   gradient budgets does not change the no-repel protected set;
3. failing the Coincident attraction gate does not remove Coincident-derived
   protection;
4. $a_{\min,H}=a_{\min,N}=0$ reproduces the prior applicability-discounted
   protected set exactly;
5. increasing a protection floor does not change classifier probabilities,
   attraction admission, typed-force admission, or attractive gradients;
6. with a positive $a_{\min,H}$, a low-applicability but C/P-leaning,
   security-permitted link can remain protected from hard-negative mining;
7. low applicability alone cannot reduce $a_r^X$ below the configured channel
   floor; low $p_{r,C}+p_{r,P}$ mass or low instance confidence can still remove
   protection;
8. Overlay-dominant relations do not create protection above the configured
   false-protection tolerance;
9. parallel duplicate links do not accumulate protection when maximum
   aggregation is configured;
10. security-forbidden links influence neither force nor protection;
11. the hard-negative candidate pool contains no protected or typed-controlled
    pair; and
12. post-training-cutoff relation types satisfy the configured protection-
    recall and overprotection gates by applicability decile.

Map-level attractive relation diagnostics include

$$
\mathrm{Violation}_C
=
\Pr(z_{ij}>u_C\mid p^{\star}_{r,C}>0),
$$

$$
\mathrm{Violation}_P
=
\Pr(z_{ij}>u_P\mid p^{\star}_{r,P}>0),
$$

plus semantic-fidelity change, relation-gradient clipping rate, derived
strength distributions, and results by degree decile and subgroup. The release
suite MUST verify that classifier probabilities are applied exactly once and
that no authoritative free per-type strength scalar exists. Materialized
strength-head outputs $h_r$ are derived artifacts under §3.6.6b, reproducible
from the relation-card and strength-model hashes; the suite MUST fail a
generation whose materialized $h_r$ deviates from recomputation or whose
strength values were edited as configuration.

Typed Deconflict remains disabled unless all of the following are satisfied:

- the policy schema is explicitly upgraded from $\{C,P,O\}$ to
  $\{C,P,O,D\}$;
- a grouped human-reviewed holdout establishes a configured lower confidence
  bound for Deconflict precision;
- $\eta_D$, $\Delta_D$, $\kappa_D$, $u_D$, $\beta_-$, and $\beta_R$ are frozen
  generation-level values;
- admitted Deconflict pairs are excluded from generic negative sampling and
  from attractive relation force;
- signed-policy conflicts quarantine to no force plus no-repel protection;
- separate signed-gradient and total-variation caps are tested; and
- semantic-neighbor recall, merge-tree persistence, subgroup quality,
  fragmentation, and no-structure-from-noise gates all pass against the
  semantic-only and attraction-only baselines.

A classifier score alone is never sufficient to enable Coincident or typed
Deconflict force.

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
9. **Coincident activation:** confirm the precision lower-bound threshold,
   class-probability threshold $\tau_C$, applicability threshold $\tau_A$, and
   initial $\kappa_C/\kappa_P$ ratio before enabling Coincident geometry.
10. **Typed Deconflict activation `[staged]`:** decide whether a fourth policy
    class is justified by real relation families. It remains disabled until the
    admission, conflict-quarantine, signed-gradient, and release-gate contract in
    §§3.3.1a, 3.6.5, 3.6.6, and 6.4 is satisfied.
11. **Protection applicability floor `[open ablation]`:** select
    $(a_{\min,H},a_{\min,N})$ from the Phase 2 matrix in §3.6.6a. This decision
    is experimental, not human-blocked; the rubric and adjudicated anchor deck
    remain the only inputs that require direct human authorship.

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
  relation_gradient_beta_positive: ...
  relation_gradient_beta_negative: 0.0 | ...
  relation_gradient_beta_total: ...

relations:
  security_mode: public-links-only | atlas-safe-links | all-snapshot-links
  security_allow_list_hash: ...
  edge_snapshot_hash: ...
  relation_card_format_version: ...
  relation_card_corpus_hash: ...
  annotation_corpus_hash: ...
  annotation_prompt_family_version: ...
  annotation_vote_schedule: ...
  reviewed_holdout_hash: ...
  policy_precedence_version: ...
  policy_hash: ...
  classifier_version: ...
  classifier_model_hash: ...
  classifier_temperature: ...
  class_prior: null | [...]
  applicability_method_version: ...
  applicability_config_hash: ...
  classifier_ood_edge_volume_fraction: ...
  reviewed_edge_volume_fraction: ...
  strength_head:
    enabled: true | false
    band_vote_corpus_hash: ...
    eligibility_threshold_p_P: 0.2
    model_form: ordinal | softmax
    model_hash: ...
    calibration_hash: ...
    zeta: [0.5, 1.0, 2.0]
    materialized_h_table_hash: null | ...
  attraction_geometry_coefficients:
    coincident: ...
    proximal: 1.0
    overlay: 0.0
  attraction_force_pruning_threshold: ...
  negative_admission:
    policy_distribution_stage: protection_specific_pre_attraction_gate
    protection_coefficients:
      coincident: 1.0
      proximal: 1.0
      overlay: 0.0
    protection_applicability:
      mode: floor
      hard_negative_floor: ...
      ordinary_negative_floor: ...
      ordering_validated: true
      attraction_applicability_unchanged: true
      selection_experiment_hash: ...
    pair_aggregation: max
    hard_negative_protection_threshold: ...
    ordinary_negative_protection_threshold: ...
    protect_ordinary_negatives: true | false
  coincident_gate:
    enabled: true | false
    class_probability_threshold: ...
    applicability_threshold: ...
    precision_lcb_threshold: ...
  typed_deconflict:
    enabled: false | true
    classifier_class_schema: CPO | CPOD
    geometry_coefficient: 0.0 | ...
    admission_threshold: ...
    signed_margin_threshold: ...
    normalized_minimum_radius: ...
    pair_aggregation: max
    conflict_policy: quarantine_no_force_protect
    exclude_from_generic_negatives: true
  derived_strength_persisted_as_authority: false

variants:
  canonical_variant: ...
  published_variant_count: ...
  max_published_variants: 8
  entries:
    - id: ...
      global_relation_condition: ...
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
