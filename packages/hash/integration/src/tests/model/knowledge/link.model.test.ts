import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  LinkModel,
  LinkTypeModel,
} from "@hashintel/hash-api/src/model";
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
  let accountId: string;
  let testEntityType: EntityTypeModel;
  let linkTypeFriend: LinkTypeModel;
  let linkTypeAcquaintance: LinkTypeModel;
  let sourceEntityModel: EntityModel;
  let targetEntityFriend: EntityModel;
  let targetEntityAcquaintance: EntityModel;

  const createEntityType = (params: { title: string; pluralTitle?: string }) =>
    EntityTypeModel.create(graphApi, {
      accountId,
      schema: {
        pluralTitle: params.pluralTitle ?? `${params.title}s`,
        kind: "entityType",
        type: "object",
        properties: {},
        ...params,
      },
    });

  const createEntity = (params: { entityTypeModel: EntityTypeModel }) =>
    EntityModel.create(graphApi, {
      accountId,
      properties: {},
      ...params,
    });

  beforeAll(async () => {
    const testUser = await createTestUser(graphApi, "linktest", logger);

    accountId = testUser.entityId;

    testEntityType = await createEntityType({
      title: "Person",
      pluralTitle: "People",
    });

    await Promise.all([
      LinkTypeModel.create(graphApi, {
        accountId,
        schema: {
          kind: "linkType",
          title: "Friends",
          pluralTitle: "Friends",
          description: "Friend of",
        },
      }).then((val) => {
        linkTypeFriend = val;
      }),

      LinkTypeModel.create(graphApi, {
        accountId,
        schema: {
          kind: "linkType",
          title: "Acquaintance",
          pluralTitle: "Acquaintances",
          description: "Acquainted with",
        },
      }).then((val) => {
        linkTypeAcquaintance = val;
      }),

      EntityModel.create(graphApi, {
        accountId,
        entityTypeModel: testEntityType,
        properties: {},
      }).then((val) => {
        sourceEntityModel = val;
      }),

      EntityModel.create(graphApi, {
        accountId,
        entityTypeModel: testEntityType,
        properties: {},
      }).then((val) => {
        targetEntityFriend = val;
      }),

      EntityModel.create(graphApi, {
        accountId,
        entityTypeModel: testEntityType,
        properties: {},
      }).then((val) => {
        targetEntityAcquaintance = val;
      }),
    ]);
  });

  let friendLink: LinkModel;
  let acquaintanceLink: LinkModel;

  it("can link entities", async () => {
    friendLink = await LinkModel.create(graphApi, {
      createdById: accountId,
      sourceEntityModel,
      linkTypeModel: linkTypeFriend,
      targetEntityModel: targetEntityFriend,
    });

    acquaintanceLink = await LinkModel.create(graphApi, {
      createdById: accountId,
      sourceEntityModel,
      linkTypeModel: linkTypeAcquaintance,
      targetEntityModel: targetEntityAcquaintance,
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
    await acquaintanceLink.remove(graphApi, { removedById: accountId });

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
    playlistEntityType = await createEntityType({ title: "Playlist" });

    playlistEntity = await createEntity({
      entityTypeModel: playlistEntityType,
    });

    songEntityType = await createEntityType({ title: "Song" });

    [songEntity1, songEntity2, songEntity3] = await Promise.all([
      createEntity({ entityTypeModel: songEntityType }),
      createEntity({ entityTypeModel: songEntityType }),
      createEntity({ entityTypeModel: songEntityType }),
    ]);

    hasSongLinkType = await LinkTypeModel.create(graphApi, {
      accountId,
      schema: {
        kind: "linkType",
        title: "Has song",
        pluralTitle: "Has songs",
        description: "Has song",
      },
    });

    // create link at specified index which is currently unoccupied
    hasSongLink2 = await LinkModel.create(graphApi, {
      createdById: accountId,
      index: 0,
      linkTypeModel: hasSongLinkType,
      sourceEntityModel: playlistEntity,
      targetEntityModel: songEntity2,
    });

    expect(hasSongLink2.index).toBe(0);

    // create link at un-specified index
    hasSongLink3 = await LinkModel.create(graphApi, {
      createdById: accountId,
      linkTypeModel: hasSongLinkType,
      sourceEntityModel: playlistEntity,
      targetEntityModel: songEntity3,
    });

    expect(hasSongLink3.index).toBe(1);

    // create link at specified index which is currently occupied
    hasSongLink1 = await LinkModel.create(graphApi, {
      createdById: accountId,
      index: 0,
      linkTypeModel: hasSongLinkType,
      sourceEntityModel: playlistEntity,
      targetEntityModel: songEntity1,
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
      updatedById: accountId,
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
      updatedById: accountId,
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
    await hasSongLink2.remove(graphApi, { removedById: accountId });

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
