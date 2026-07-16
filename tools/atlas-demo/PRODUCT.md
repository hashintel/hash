# Product

## Register

product

## Platform

web

## Users

The primary users are engineers evaluating Atlas tile delivery and client-side
field reconstruction at a desktop workstation. They need to inspect progressive
refinement, tile state, and rendering behavior without product chrome obscuring
the system under test.

## Product Purpose

The demo consumes the active Atlas generation through the current tile API and
reconstructs its total-density field on the GPU. Success means an engineer can
pan and zoom a live generation, see refinement remain mass-preserving, and turn
on tile framing to verify which requests and frontier cells produced the image.

## Positioning

A truthful, inspectable reference client for Atlas tile delivery and field
reconstruction, with no server-generated pixels or synthetic product features.

## Brand Personality

Raw, precise, and legible. The interface should feel like a focused developer
utility: compact without becoming cryptic, visually quiet around the field, and
direct about unsupported capabilities or failures.

## Anti-references

Do not resemble a productized analytics dashboard with repeated cards, fake
metrics, decorative gradients, or ornamental chrome. Avoid presentation-only
effects that make tile state or field behavior harder to inspect.

## Design Principles

1. **The field is the subject.** Controls remain compact and never compete with
   the visualization.
2. **Every readout is evidence.** Counts and statuses derive from live API or
   renderer state; the demo invents no metrics.
3. **Refinement stays inspectable.** Loading, active, cached, and failed tile
   states are visible on demand and have textual labels.
4. **Failures remain actionable.** Network, wire, generation, and GPU errors
   identify the failed contract and offer a concrete retry path.
5. **The current API defines scope.** Missing filters, rungs, labels, and entity
   lookup remain explicit limitations rather than simulated features.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Controls are keyboard operable, focus remains visible,
status is not conveyed by color alone, touch targets reach 44px on coarse
pointers, text respects browser sizing and 200% zoom, and optional motion
honors reduced-motion preferences.
