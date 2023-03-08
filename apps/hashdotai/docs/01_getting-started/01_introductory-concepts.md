---
title: Introduction to HASH
slug: hash
objectId: ???
description: Getting started with HASH
---

# Introduction to HASH {#introduction-to-hash}

HASH helps you integrate, understand, and apply data to any business problem. It does this by combining powerful data management tools with a composable, block-based user interface.

We’re working towards making HASH a platform for complete end-to-end decision making, enabling high-quality no-code application-building, and ______.

## Examples {#examples}

HASH already supports a range of simple yet novel use cases, replacing other SaaS apps you may be paying for. Examples include:

* **Team Page** — employee data can be structured in HASH and then rendered with blocks which present profile information.

## Introductory concepts {#introductory-concepts}

### Workspaces {#workspaces}

A workspace in HASH is a space in which you and other collaborators work on a set of data. Data belong to single workspaces and cannot be moved between them.

#### Personal workspaces {#personal-workspaces}

When you create your HASH account, you’ll start out in your personal workspace. Only you can access your personal workspace.

#### Organization workspaces {#organization-workspaces}

In addition to your personal workspace, you can be a member of one or more organization workspaces. Organization workspaces have the same functionality as personal workspaces but allow collaborators to work on data together.

### Data {#data}

The HASH datalayer is a graph database composed of Entities and Links. Schemas for these fundamental objects are defined as Entity Types, Property Types, Data Types, and Link Types. This strongly typed architecture enables any data to be modeled, rendered, and manipulated.

Let’s explore these concepts in more detail with reference to the example of how we might model our business’ projects.

#### Entities {#entities}

Entities are basic records of data in HASH. An Entity for a project might encode details like its name, description, goals, owner, due date, and sub-tasks. Capable of modeling data of any shape, entities follow schemas defined via Entity Types.

#### Entity Types {#entity-types}

Entity Types are schemas describing particular _kinds_ of Entities. Our project Entities would be structured in accordance with a project Entity Type. Entity Types themselves have titles and descriptions and consist of sets of Property Types and Link Types.

#### Property Types {#property-types}

Property Types describe specific attributes of Entity Types. Our project Entity Type would have Property Types for each of the attributes we want to record on our project Entities—“Name”, “Description”, “Goals”, etc. Property Types themselves have names and descriptions and contain Data Types.

#### Data Types {#data-types}

Data Types define the accepted values of Property Types. Our project’s “Goal” Property Type may have the Data Type “Text”, meaning that its value could be some text.

#### Links {#links}

Links record directional relationships between Entities which have a label and can have Properties, defined by Property Types. These additional attributes enable Links to record information about the relationship between two entities. Our project would have a Link to a user entitiy, for example, and that Limk might be labeled “Owned by”, to model the ownership relationship between the individual and the project.

#### Link Types {#link-types}

Links Types define the shape of Links. Our “Owned by” Link would be defined by a Link Type which all ownership links would conform to.

### Pages {#pages}

Pages are where you can apply data defined by these objects and types to solve business problems. Pages are like documents but are made up of composable interface units called blocks. By composing different blocks together, you can solve different problems.

### Blocks {#blocks}

Blocks are third-party developed components which can render and manipulate the data defined by your types. Blocks can be simple and static, like an image or a text block, or they can be more complex, like a checklist or chart block. Blocks in HASH come from the Block Protocol.

#### What is the Block Protocol? {#what-is-the-block-protocol}

The Block Protocol enables third-party-developed front-end components, called blocks, to work inside any application. Application developers can avoid reinventing the wheel when implementing common features by leveraging a growing range of interoperable components. They can even enable UI composability by giving end-users the ability to pick and choose which UI components they use. HASH is the company behind the Block Protocol but the Block Protocol is maintained as an independent service. Learn more about the [Block Protocol](https://blockprotocol.org).
