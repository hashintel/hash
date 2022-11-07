import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  LinkModel,
  LinkTypeModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import {
  EntityTypeCreatorParams,
  generateWorkspaceEntityTypeSchema,
} from "@hashintel/hash-api/src/model/util";
import { generateTypeId } from "@hashintel/hash-shared/types";
import { createTestUser } from "../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

const graphApi = createGraphClient(logger, {
  host: graphApiHost,
  port: graphApiPort,
});

describe("Link model class", () => {
  let namespace: string;

  let testUser: UserModel;
  let testEntityType: EntityTypeModel;
  let linkTypeFriend: LinkTypeModel;
  let linkTypeAcquaintance: LinkTypeModel;
  let sourceEntityModel: EntityModel;
  let targetEntityFriend: EntityModel;
  let targetEntityAcquaintance: EntityModel;

  const createEntityType = (
    params: Omit<EntityTypeCreatorParams, "entityTypeId" | "actorId">,
  ) => {
    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.title,
    });
    return EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: generateWorkspaceEntityTypeSchema({
        entityTypeId,
        actorId: testUser.entityId,
        ...params,
      }),
      actorId: testUser.entityId,
    });
  };

  const createEntity = (params: { entityTypeModel: EntityTypeModel }) =>
    EntityModel.create(graphApi, {
      ownedById: testUser.entityId,
      properties: {},
      actorId: testUser.entityId,
      ...params,
    });

  beforeAll(async () => {
    testUser = await createTestUser(graphApi, "linktest", logger);

    namespace = testUser.getShortname()!;

    await Promise.all([
      LinkTypeModel.create(graphApi, {
        ownedById: testUser.entityId,
        schema: {
          kind: "linkType",
          title: "Friends",
          description: "Friend of",
        },
        actorId: testUser.entityId,
      }).then((linkType) => {
        linkTypeFriend = linkType;
      }),
      LinkTypeModel.create(graphApi, {
        ownedById: testUser.entityId,
        schema: {
          kind: "linkType",
          title: "Acquaintance",
          description: "Acquainted with",
        },
        actorId: testUser.entityId,
      }).then((linkType) => {
        linkTypeAcquaintance = linkType;
      }),
    ]);

    testEntityType = await createEntityType({
      title: "Person",
      properties: [],
      outgoingLinks: [
        {
          linkTypeModel: linkTypeFriend,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          array: true,
          ordered: false,
        },
        {
          linkTypeModel: linkTypeAcquaintance,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          array: true,
          ordered: false,
        },
      ],
    });

    await Promise.all([
      EntityModel.create(graphApi, {
        ownedById: testUser.entityId,
        entityTypeModel: testEntityType,
        properties: {},
        actorId: testUser.entityId,
      }).then((entity) => {
        sourceEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUser.entityId,
        entityTypeModel: testEntityType,
        properties: {},
        actorId: testUser.entityId,
      }).then((entity) => {
        targetEntityFriend = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUser.entityId,
        entityTypeModel: testEntityType,
        properties: {},
        actorId: testUser.entityId,
      }).then((entity) => {
        targetEntityAcquaintance = entity;
      }),
    ]);
  });

  let friendLink: LinkModel;
  let acquaintanceLink: LinkModel;

  it("can link entities", async () => {
    friendLink = await LinkModel.create(graphApi, {
      ownedById: testUser.entityId,
      sourceEntityModel,
      linkTypeModel: linkTypeFriend,
      targetEntityModel: targetEntityFriend,
      actorId: testUser.entityId,
    });

    acquaintanceLink = await LinkModel.create(graphApi, {
      ownedById: testUser.entityId,
      sourceEntityModel,
      linkTypeModel: linkTypeAcquaintance,
      targetEntityModel: targetEntityAcquaintance,
      actorId: testUser.entityId,
    });
  });

  it("can get all entity links", async () => {
    const allLinks = await sourceEntityModel.getOutgoingLinks(graphApi);
    expect(allLinks).toHaveLength(2);
    expect(allLinks).toContainEqual(friendLink);
    expect(allLinks).toContainEqual(acquaintanceLink);
  });

  it("can get a single entity link", async () => {
    const links = await sourceEntityModel.getOutgoingLinks(graphApi, {
      linkTypeModel: linkTypeFriend,
    });

    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link?.sourceEntityModel).toEqual(sourceEntityModel);
    expect(link?.linkTypeModel).toEqual(linkTypeFriend);
    expect(link?.targetEntityModel).toEqual(targetEntityFriend);
  });

  it("can remove a link", async () => {
    await acquaintanceLink.remove(graphApi, { actorId: testUser.entityId });

    const links = await sourceEntityModel.getOutgoingLinks(graphApi, {
      linkTypeModel: linkTypeAcquaintance,
    });

    expect(links).toHaveLength(0);
  });

  let playlistEntityType: EntityTypeModel;

  let playlistEntity: EntityModel;

  let songEntityType: EntityTypeModel;

  let songEntity1: EntityModel;

  let songEntity2: EntityModel;

  let songEntity3: EntityModel;

  let hasSongLinkType: LinkTypeModel;

  let hasSongLink1: LinkModel;

  let hasSongLink2: LinkModel;

  let hasSongLink3: LinkModel;

  it("can create an ordered link", async () => {
    songEntityType = await createEntityType({
      title: "Song",
      properties: [],
      outgoingLinks: [],
    });

    hasSongLinkType = await LinkTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "linkType",
        title: "Has song",
        description: "Has song",
      },
      actorId: testUser.entityId,
    });

    playlistEntityType = await createEntityType({
      title: "Playlist",
      properties: [],
      outgoingLinks: [
        {
          linkTypeModel: hasSongLinkType,
          destinationEntityTypeModels: [songEntityType],
          array: true,
          ordered: true,
        },
      ],
    });

    playlistEntity = await createEntity({
      entityTypeModel: playlistEntityType,
    });

    [songEntity1, songEntity2, songEntity3] = await Promise.all([
      createEntity({ entityTypeModel: songEntityType }),
      createEntity({ entityTypeModel: songEntityType }),
      createEntity({ entityTypeModel: songEntityType }),
    ]);

    // create link at specified index which is currently unoccupied
    hasSongLink2 = await LinkModel.create(graphApi, {
      ownedById: testUser.entityId,
      index: 0,
      linkTypeModel: hasSongLinkType,
      sourceEntityModel: playlistEntity,
      targetEntityModel: songEntity2,
      actorId: testUser.entityId,
    });

    expect(hasSongLink2.index).toBe(0);

    // create link at un-specified index
    hasSongLink3 = await LinkModel.create(graphApi, {
      ownedById: testUser.entityId,
      linkTypeModel: hasSongLinkType,
      sourceEntityModel: playlistEntity,
      targetEntityModel: songEntity3,
      actorId: testUser.entityId,
    });

    expect(hasSongLink3.index).toBe(1);

    // create link at specified index which is currently occupied
    hasSongLink1 = await LinkModel.create(graphApi, {
      ownedById: testUser.entityId,
      index: 0,
      linkTypeModel: hasSongLinkType,
      sourceEntityModel: playlistEntity,
      targetEntityModel: songEntity1,
      actorId: testUser.entityId,
    });

    expect(hasSongLink1.index).toBe(0);

    const fetchedPlaylistHasSongLinks = (await playlistEntity.getOutgoingLinks(
      graphApi,
      {
        linkTypeModel: hasSongLinkType,
      },
    )) as [LinkModel, LinkModel, LinkModel];

    expect(fetchedPlaylistHasSongLinks).toHaveLength(3);

    const fetchedPlaylistSongs = fetchedPlaylistHasSongLinks.map(
      ({ targetEntityModel }) => targetEntityModel,
    );

    expect(fetchedPlaylistSongs).toEqual([
      songEntity1,
      songEntity2,
      songEntity3,
    ]);

    // Refresh the indexes of the link models
    [hasSongLink1, hasSongLink2, hasSongLink3] = fetchedPlaylistHasSongLinks;
  });

  it("can increase the index of a link", async () => {
    expect(
      (
        await playlistEntity.getOutgoingLinks(graphApi, {
          linkTypeModel: hasSongLinkType,
        })
      ).map(({ targetEntityModel }) => targetEntityModel),
    ).toEqual([songEntity1, songEntity2, songEntity3]);

    await hasSongLink1.update(graphApi, {
      updatedIndex: 1,
      actorId: testUser.entityId,
    });

    const playlistHasSongLinks = (await playlistEntity.getOutgoingLinks(
      graphApi,
      {
        linkTypeModel: hasSongLinkType,
      },
    )) as [LinkModel, LinkModel, LinkModel];

    expect(playlistHasSongLinks.map(({ index }) => index)).toEqual([0, 1, 2]);

    expect(
      playlistHasSongLinks.map(({ targetEntityModel }) => targetEntityModel),
    ).toEqual([songEntity2, songEntity1, songEntity3]);

    [hasSongLink2, hasSongLink1, hasSongLink3] = playlistHasSongLinks;
  });

  it("can decrement the index of a link", async () => {
    expect(
      (
        await playlistEntity.getOutgoingLinks(graphApi, {
          linkTypeModel: hasSongLinkType,
        })
      ).map(({ targetEntityModel }) => targetEntityModel),
    ).toEqual([songEntity2, songEntity1, songEntity3]);

    await hasSongLink1.update(graphApi, {
      updatedIndex: 0,
      actorId: testUser.entityId,
    });

    const playlistHasSongLinks = (await playlistEntity.getOutgoingLinks(
      graphApi,
      {
        linkTypeModel: hasSongLinkType,
      },
    )) as [LinkModel, LinkModel, LinkModel];

    expect(playlistHasSongLinks.map(({ index }) => index)).toEqual([0, 1, 2]);

    expect(
      playlistHasSongLinks.map(({ targetEntityModel }) => targetEntityModel),
    ).toEqual([songEntity1, songEntity2, songEntity3]);

    [hasSongLink1, hasSongLink2, hasSongLink3] = playlistHasSongLinks;
  });

  it("can remove an ordered link", async () => {
    await hasSongLink2.remove(graphApi, { actorId: testUser.entityId });

    const playlistHasSongLinks = (await playlistEntity.getOutgoingLinks(
      graphApi,
      {
        linkTypeModel: hasSongLinkType,
      },
    )) as [LinkModel, LinkModel];

    expect(playlistHasSongLinks.map(({ index }) => index)).toEqual([0, 1]);

    expect(
      playlistHasSongLinks.map(({ targetEntityModel }) => targetEntityModel),
    ).toEqual([songEntity1, songEntity3]);

    [hasSongLink1, hasSongLink3] = playlistHasSongLinks;
  });
});
