---
title: Introduction to HASH
description: Getting started with HASH
---

# Introduction to HASH {#introduction-to-hash}

HASH helps you integrate, understand, and apply data to any business problem. It does this by combining powerful data management tools with a composable, block-based user interface.

We’re working towards making HASH a platform for complete end-to-end decision making, enabling high-quality no-code application-building, and FINISH

# Account concepts

We use the term 'account' to refer to both _users_ and _orgs_ in HASH. Every account has a _handle_ and a _web_.

## Users

Every user in HASH should correspond to one human being in the "real world". Nobody should have more than one user account, and user accounts shouldn't be created to represent "machines", "agents", "organizations" or any other kind of non-human.

## Orgs

Orgs are essentially 'groups' created by users in HASH, which have one or more administrators who control them (as well as who can be a member).

## Handles

Every account (meaning every user and every org) has a public handle such as `@example`. This handle will be visible to everybody with the ability to view HASH.

## Webs

Every user and every org has a [web](https://hash.ai/guide/webs).

# Web concepts

## Types

There are four kinds of [types](https://hash.ai/guide/types):

- [Entity types](https://hash.ai/guide/types/entity-types) define what an entity is, by specifying what types of attributes (links and properties) can be associated with it
- [Link types](https://hash.ai/guide/types/link-types) describe relationship between entities (e.g. a person and a date)
- [Property types](https://hash.ai/guide/types/property-types) describe information that is stored directly on an entity (e.g. a description) without reference to any other entity
- [Data types](https://hash.ai/guide/types/data-types)

These types, known collectively as our "type system", enable any kind of data to be represented in HASH.

## Entities

All data in [webs](https://hash.ai/guide/webs) exists as **entities**. An individual entity may have one or more [entity types](https://hash.ai/guide/types/entity-types), which in turn enable [properties] and [links] to be stored on it. An entity cannot contain any information if it has no types associated with it.

### Example entity

Imagine you are a supplier of medical devices. You want to store information in your graph regarding one of your customers, the British National Health Service (NHS). The NHS entity you create might therefore have at least a couple of different entity types associated with it, such as `Organization`, and `Customer`.

- The entity type `Organization` might specify properties like `Legal name`, and links such as `Led by` (pointing to a `Person` entity representing the organization's Managing Director or CEO), and `Subsidiaries` (pointing to one or more other `Organization` entities).
- Meanwhile, the `Customer` entity type may also specify properties such as `Name` (which will not appear duplicated) and `Contract value` alongside links such as `Point of contact` and `Key stakeholders` which may link to other `Person` entities.

Entity preview: NHS England
**Attrbute type**   **Attribute name**  **Value**
Property type       Legal name          NHS England
Property type       Contract value      £18,650,000
Link type           Led by              Amanda Pritchard
Link type           Key stakeholders    Ming Tang, Vin Diwakar, Louise Greenrod
Link type           Point of contact    Amanda Pritchard

[//]: # (We don't need to mention it to end-users here, but we may wish to explain in the dev docs that every link between two entities is itself an entity (of a special type, called a 'link entity'). In this case, a link called `NHS England - Led by - Amanda Pritchard` is created.)

## Pages

Pages are a special kind of entity in HASH. Pages created inside of each web you belong to (i.e. your own, and those of any organizations you're a member of) will appear in your left-hand sidebar inside of HASH.

There are two types of pages in HASH:

- Documents: linear pages where blocks are arranged in columns; typically used for text-heavy pages
- Canvases: free-form pages where blocks can be arranged spatially on an infinite canvas; useful for mindmaps, flowcharts, dashboards, and app-building

# Page Concepts

## Blocks {#blocks}

Blocks are rectangles that can be inserted into pages which offer differing sets of functionality.

For example, a block might be simple and static, used to display text or an image. Or a block might be interactive, and offer complex functionality such as access to an AI chatbot, or a game of Minesweeper.

If you're a web developer comfortable writing code, you can build and publish your own blocks, and use them inside of HASH, by following the guide in the [HASH developer docs](https://hash.dev/docs/blocks).