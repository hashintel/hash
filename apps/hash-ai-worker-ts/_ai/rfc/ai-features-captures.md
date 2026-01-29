# AI Features, Captures & Follow-up

<aside>
<img src="https://www.notion.so/icons/asterisk_lightgray.svg" alt="https://www.notion.so/icons/asterisk_lightgray.svg" width="40px" />

re: [2026-01-21: Entity Inference/AI in HASH](https://www.notion.so/2026-01-21-Entity-Inference-AI-in-HASH-2ef3c81fe02480e89df1eb0d7927ca81?pvs=21) meeting on January 21, 2026 

</aside>

## Current State

We have existing AI workflow features in HASH, implemented using provider SDKs, with inference calls mapped to Temporal *Activities.*

This has some downsides in its current form:

- lack of evals, testing, tracing
- no visibility over performance
- observability limited to logs
- poor visibility in development
- no visibility for the user, about:
    - what is going in/out of each step
    - progress overall, success of steps
    - timings, payloads, usage/costs, etc, of steps
    - what kind of results are accumulating
- everything is in a monolithic temporal activity

## Desired / Potential States

We want to generally be able to work faster on new AI features, and want to gain leverage over the problems cited above. This implies *lowering the complexity overhead where possible*, which makes the prospect of moving to an agentic development framework (e.g. [Mastra](https://mastra.ai/), which would ideally build in many of those concerns) attractive. 

It was noted that we currently store a lot of things in the graph database, but should draw a clearer pragmatic boundary between the kind of data that should be in graph, vs. the kind of stuff that can go in to relational DB or even document stores.

It was also noted that we will likely need some granular authorization management, around users’ ability to access certain kinds of workflows as well as certain kinds or levels of detail of information feedback within running workflows

## Next Steps

Next actions revolve mainly around exploring how we can bring together the features (and known patterns) we have in Temporal, with the advantages of an agent development, orchestration and observability solution. A primary candidate here for the latter is [Mastra](https://mastra.ai/), but the integrability of these two solutions is not quite clear for the moment

### To research, decide

- Prior art on how existing AI products handle rate-limiting complexities
    - [x]  summaries about rate-limiting approaches
        
        [Notes on LLM Inference Rate-Limiting Strategies](https://www.notion.so/Notes-on-LLM-Inference-Rate-Limiting-Strategies-2f43c81fe024807992d3daf0f9b0348c?pvs=21)
        
    - [x]  Services or products which address load-balancing / rate-limiting
        - https://www.litellm.ai/
        - https://vercel.com/ai-gateway
- More about integrations between Tempral and Agent Frameworks, generally
    - [x]  Initial findings
        
        [Integrating Temporal with Agent Frameworks](https://www.notion.so/Integrating-Temporal-with-Agent-Frameworks-2f13c81fe02480e19e40d802c1394f48?pvs=21)
        
- More detail on the current feature-set and integration possibilities of the [1.0 Mastra release](https://www.youtube.com/watch?v=vjx9_KfHimY)
    - new observability and event-hook features
    - comparison of their Inngest integration with their WIP Temporal branch from last year
- What do we want to track from agentic (inference and tools) calls, what do we want to store, what to feed back, etc.? Tokens and cost? Detailed usage patterns?