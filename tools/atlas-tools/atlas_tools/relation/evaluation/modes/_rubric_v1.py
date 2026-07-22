"""Pin the exact rubric-v1 conditioning text and adjudication anchors."""

from atlas_tools.relation.evaluation.domain.api import RelationId, Verdict

CORE_AB = """Each card describes a link type from a source entity A to a target
entity B: the card's direction field is source -> target, and every
example line reads A -> B in that order. If the direction is
symmetric, A and B are interchangeable and the placement claim is
mutual."""

CORE_VERDICTS = """Verdicts are defined by conditions on the typical instance (A, B) of
the link type. Evaluate coincident first, then proximal; overlay is
the verdict for genuine links that earn neither; unclear is reserved
for links the procedure cannot settle.

- coincident. Assign only if ALL of:
  (C1) A and B have one referent — one thing under two records — or,
       narrowly, are distinct entities whose subject matter is
       provably identical and exhaustive (identity of extent);
  (C2) the identity is asserted as settled: no dispute, no hedge —
       "said to be", "possibly", "partially", "nearly" fail C2;
  (C3) no remainder: neither side has parts, instances, or content
       the other lacks;
  (C4) the records are separate for administrative or technical
       reasons only, not semantic ones.
  Map consequence: one dot.

- proximal. Assign only if coincident fails and ALL of:
  (P1) A and B are distinct things;
  (P2) the typical instance creates an expectation of co-location:
       exploring one, a user would be surprised not to find the other
       nearby (containment, membership in a territorial organizer,
       kinship, spatial adjacency, taxonomy, formal correspondence);
  (P3) that expectation holds for the majority of instances of the
       type.
  Map consequence: near, never merged.

- overlay. Assign when the link is genuine but the conditions for
  coincident and proximal are not met. Characteristic signatures:
  (O1) shared attribute, name, symbol, or trait — a string, not a
       place;
  (O2) aboutness across roles — a thing and its subject matter
       (authorship, depiction, measurement, modeling);
  (O3) functional, metadata, or qualifier relations;
  (O4) a heterogeneous population whose majority fails P2.
  Map consequence: the edge renders and is traversable; nothing
  moves.

- unclear. Assign only if:
  (U1) the population splits into large sub-uses with conflicting
       verdicts and no safe majority; or
  (U2) the card does not contain enough to evaluate the conditions.
  A real verdict; prefer it over guessing.

Demotion law:
  (D1) Unresolved doubt about any C-condition demotes the verdict to
       proximal. Doubt never promotes: there is no analogous move
       from overlay toward proximal or from proximal toward
       coincident."""

CORE_DISCIPLINE = """1. Judge the TYPICAL case of the link type on a general-purpose map:
   no specific task, no specific user. Answer as if this link is the
   only thing known about the pair; the system combines links later.
2. Surprised-not-nearby test: would a user exploring one end be
   surprised not to find the other? Surprise argues proximal.
3. Membership in an organizing entity: ask whether the organizer has a
   geography or territory. Diocese and metro line: yes, proximal.
   Publisher and employer: generally no, overlay.
4. Shared endpoints pull only when co-membership means something.
   Sharing an attribute, name, symbol, or trait is sharing a string,
   not a place: overlay. This covers the whole attribute family
   (color, surname, handedness, notation, typeface) and the aboutness
   family (authorship, depiction, measurement, modeling): a thing and
   its subject matter link across roles without a placement claim.
5. Hedge words demote coincident to proximal. "Said to be", "partially",
   "possibly", "nearly": the hedge records doubt or remainder, and
   stacking would render the dispute as settled. Wrongly merging two
   distinct things is the worst error the map can make; wrongly
   placing two copies side by side is cosmetic.
6. When one class must cover a heterogeneous population, pick the one
   whose error is cheapest for the majority of instances.
7. Direction and constraints on the card matter: read them before
   deciding. Symmetric relations hint at mutual nearness; qualifiers
   and metadata relations make no placement claim."""

CORE_OUTPUT = """Output exactly one JSON object and nothing else, no code fences:
{"reason": "<at most 60 words; cite the decisive condition ids, e.g.
'fails C2' or 'P1-P3 hold'>", "verdict": "coincident" | "proximal" |
"overlay" | "unclear"}"""

SYSTEM_PROMPT_1 = f"""You are labeling link TYPES for a map of everything: every entity is a
dot, similar things sit near each other, and links between entities
may or may not influence where dots go. For each link type you decide
what placement claim it makes, not how strong it is.

{CORE_AB}

The four verdicts:

{CORE_VERDICTS}

Decision discipline:

{CORE_DISCIPLINE}

{CORE_OUTPUT}"""

SYSTEM_PROMPT_2 = f"""You are the placement editor for an atlas of every entity. Layout
systems downstream will follow the type-level policy you set; your
ruling applies to every instance of a link type, so you rule on the
type, not on any single pair.

Apply this procedure to each card:

{CORE_DISCIPLINE}

{CORE_AB}

Your ruling is one of four:

{CORE_VERDICTS}

{CORE_OUTPUT}"""

SYSTEM_PROMPT_3 = f"""Task: classify the placement claim of a link type for an entity map.
Definitions and procedure follow. Apply them exactly.

Input format.
{CORE_AB}

Verdicts.
{CORE_VERDICTS}

Procedure.
{CORE_DISCIPLINE}

{CORE_OUTPUT}"""

SYSTEM_PROMPTS = {
    "S1": SYSTEM_PROMPT_1,
    "S2": SYSTEM_PROMPT_2,
    "S3": SYSTEM_PROMPT_3,
}

FEW_SHOT_ROWS: tuple[tuple[RelationId, str], ...] = (
    (
        "wikidata:P22",
        (
            '{"reason": "P1: father and child are distinct. P2: exploring a person, you '
            "would be surprised not to find their father, core context. P3: holds for "
            'essentially every instance. Near, never stacked.", "verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P462",
        (
            '{"reason": "O1: color is a shared attribute, a string not a place; fails P2, '
            "since pulling everything red gathers fire trucks, apples, and flags into one "
            'meaningless cluster. Render the link, move nothing.", "verdict": "overlay"}'
        ),
    ),
    (
        "wikidata:P658",
        (
            '{"reason": "P1: album and track are distinct. P2 via containment: exploring '
            "an album, you would be surprised not to find its songs. P3 holds across the "
            'type. Tightly co-located, never merged; template for the part-of family.", '
            '"verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P913",
        (
            '{"reason": "O1: one symbol serves many unrelated concepts, so symbol-pull '
            "clusters by typographic accident, share-a-symbol is share-a-string. Where "
            "notation tracks meaning the concepts are already close; elsewhere the pull is "
            'noise. Fails P2.", "verdict": "overlay"}'
        ),
    ),
    (
        "wikidata:P81",
        (
            '{"reason": "P2 via the organizer-geography test: a metro line is a territory, '
            "a linear corridor; stations gather into it and interchanges settle between "
            "their lines. Cross-role on the surface, territorial underneath. P1 and P3 "
            'hold.", "verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P734",
        (
            '{"reason": "O1: a family name is an attribute reified as an entity; name-pull '
            "gathers all Muellers into a namesake cluster, purely incidental. Co-membership "
            'must mean something, and surname bearers share nothing but a string. Fails P2.", '
            '"verdict": "overlay"}'
        ),
    ),
    (
        "wikidata:P279",
        (
            '{"reason": "P1: both ends are kinds and stay distinct however tight the step. '
            "P2: a narrower kind belongs in its broader kind's neighborhood, so the hierarchy "
            'renders as nested regions. P3 holds. Near, never merged.", "verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P2575",
        (
            '{"reason": "O2 aboutness: instrument and phenomenon live in different worlds '
            "on purpose, and measurement-pull would drag hardware into concept-space. The "
            'link is functional, what the tool does, not where it belongs. No placement claim.", '
            '"verdict": "overlay"}'
        ),
    ),
    (
        "wikidata:P460",
        (
            '{"reason": "Fails C2: identity claimed but hedged, the property exists because '
            "someone resisted merging. D1 demotes to proximal: stacking would render the "
            "dispute settled, and a wrong merge is the map's worst error while adjacency is "
            'cosmetic.", "verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P741",
        (
            '{"reason": "O1: a binary trait spanning millions is an attribute, not a '
            "relationship; handedness-pull sorts athletes into two giant meaningless blobs. "
            'Fails P2. Render it, filter by it, move no one.", "verdict": "overlay"}'
        ),
    ),
    (
        "wikidata:P1322",
        (
            '{"reason": "P1: distinct objects. P2 via formal correspondence: duality is a '
            "precise pairing, each object constructible from the other, and studying one puts "
            'the other in hand. Pairwise, not toward a hub. P3 holds.", "verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P1441",
        (
            '{"reason": "U1: the population splits into two large sub-uses with opposite '
            "verdicts. Native fictional characters belong with their work (P2 via containment: "
            "Pettigrew in Goblet of Fire); real and mythical figures appearing in works are "
            "aboutness links (O2: Gandhi in Civilization V). No safe majority is readable from "
            'the card; P3 cannot be established either way.", "verdict": "unclear"}'
        ),
    ),
    (
        "wikidata:P708",
        (
            '{"reason": "Cross-role surface (parish building, diocese organization), but P2 '
            "holds via the organizer-geography test: a diocese is a territorial jurisdiction, "
            "so pull yields regional parish clusters, honest placement. P3 narrowly holds. "
            'Proximal, narrowly.", "verdict": "proximal"}'
        ),
    ),
    (
        "wikidata:P2959",
        (
            '{"reason": "C1: one referent, two records. C2: nobody disputes the identity. C3: '
            "no remainder. C4: the separation is wiki-technical only. Two dots would be a bug, "
            'the map shows things, not records.", "verdict": "coincident"}'
        ),
    ),
)

HOLDOUT_ROWS: tuple[tuple[RelationId, Verdict], ...] = (
    ("wikidata:P6", "overlay"),
    ("wikidata:P47", "proximal"),
    ("wikidata:P2634", "overlay"),
    ("wikidata:P2739", "overlay"),
    ("wikidata:P1382", "proximal"),
    ("wikidata:P3403", "coincident"),
)

HOLDOUT_ALTERNATES: dict[RelationId, frozenset[Verdict]] = {
    "wikidata:P3403": frozenset({"proximal"}),
}

RETRY_INSTRUCTION = "Reply with only the JSON object."
