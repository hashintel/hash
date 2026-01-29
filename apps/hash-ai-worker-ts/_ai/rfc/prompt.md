I’d like you to help me develop a detailed vision, SPEC, and multi-phase PLAN, for building an agentic NER (named entity recognition) service using the “Mastra” agent development framework. 

The intention here is to replace the corresponding functionality, from a project called `hash-ai-worker-ts`, which is part of a large monorepo that supports multiple services.

`hash-ai-worker-ts` currently implements NER through an imperative, code-heavy orchestration of Temporal workflows and activities, with inference calls handled through multiple AI providers’ respective SDKs directly. 

The current state of that project is documented and assessed in an architectural overview, as well as 3 architectural deep-dive documents, listed here; 
- ./architecture-overview.md
- ./architecture-deepdive-1.md
- ./architecture-deepdive-2.md
- ./architecture-deepdive-3.md

...while the potential future Mastra integration, which is intended to be created inside a separate (non-public) monorepo, has so far been sketched out through evaluation, draft-spec, and reflections documents, listed here
- ./mastra-evaluation.md
- ./mastra-ner-workflow-spec.md
- ./mastra-reflections.md
