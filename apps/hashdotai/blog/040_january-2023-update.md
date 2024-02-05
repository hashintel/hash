---
title: "January 2023 Update"
date: "2023-01-27"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/03764ed2-9694-4f73-8d14-7f8725c9c000/public
categories: 
  - "Company"
---

## Bitemporal Versioning

**HASH now _bitemporally_ versions your data.** Specifically, HASH captures the time a user recorded an action, and the time it was reconciled with your graph.

This paves the way to making a high-quality offline mode available, supporting future plans for mobile applications and the deployment of HASH clients in environments with unreliable or intermittent internet connections. It also promises to improve the auditability of decisions made using HASH, and supports more robust two-way sync between HASH and external datastores.

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/084566d5-e8e1-4c8d-36b4-20b26303f000/public)

## Commenting

**You can leave comments on blocks in HASH.** You can also reply to existing comments (threading conversations), and mark comments as resolved.

This allows for inline discussion around the contents of pages in HASH, facilitating in-app collaboration.

## Improvements to the type and entity editors

- Introduced a 'slideover' that allows for entities to be viewed and edited without leaving a page

- Introduced read-only views for types and entities that allow users without edit permissions to view them

- Introduced local drafts of entities and types while editing

- Improved design toggling boolean property value

- Support for minimum/maximum numbers of values in a property array

- Support for multiple different data types within a single property array

- Support for displaying property type objects in the type editor

- Additional data types have been added to the type editor, including `Null`, `EmptyList`, and `Object`. These "unusual" data types won't be useful when creating most new types from scratch, but they play an important role in allowing data to be ingested from a variety of external sources which require them. Support for creating your own custom data types is also on our roadmap.

- Various usability improvements and bug fixes

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/257959f4-99ce-4d2a-0660-6462c3c0e300/public)

## Block Protocol refresh

We've updated the [Block Protocol](https://blockprotocol.org/) (**Þ**) website making it easier for _users of blocks_ to learn what the protocol is all about.

We've also updated HASH in preparation for the forthcoming release of the **Þ 0.3** specification, and are in the process of updating blocks to work with this.
