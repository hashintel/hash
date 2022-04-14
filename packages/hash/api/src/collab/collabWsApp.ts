import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import { entityStorePluginState } from "@hashintel/hash-shared/entityStorePlugin";
import { getBasicWhoAmI } from "@hashintel/hash-shared/queries/auth.queries";
import { ApolloError } from "apollo-server-core/node_modules/apollo-server-errors";

import { ApolloClient, NormalizedCacheObject } from "@apollo/client";
import { QueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/adapter";
import {
  checkInitialConnectionDataValues,
  CollabPosition,
  DocumentChange,
  DOCUMENT_UPDATED,
  FetchVersionAction,
  FETCH_VERSION,
  InitialConnectionData,
  INITIAL_STATE,
  parseVersion,
  POSITION_UPDATED,
  ReportPositionAction,
  REPORT_POSITION,
  ServerEvent,
  SERVER_ERROR,
  UpdateAction,
  UpdateDocumentCallback,
  UPDATE_DOCUMENT,
} from "@hashintel/hash-shared/collab";
import { Server as HttpServer } from "http";
import { Server as SocketIoServer, Socket } from "socket.io";
import LRU from "lru-cache";

import { CORS_CONFIG } from "../lib/config";

import { AuthenticationError } from "./errors";
import { getInstance, Instance } from "./Instance";
import { EntityWatcher } from "./EntityWatcher";

const emitServerEvent = (socket: Socket, action: ServerEvent) => {
  socket.emit(action.type, action);
};

const emitServerError = (socket: Socket, error: unknown): void => {
  let errorMessage = "An error has occurred";
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  }
  emitServerEvent(socket, { type: SERVER_ERROR, error: errorMessage });
  socket.disconnect();
};

const sessionSupportCache = new LRU<string, SessionSupport>({
  max: 1000,
  maxAge: 1000 * 60 * 5,
  dispose: (_, { apolloClient }) => {
    apolloClient.stop();
  },
});

const requestUserInfo = async (
  apolloClient: ApolloClient<NormalizedCacheObject>,
): Promise<UserInfo> => {
  try {
    const {
      data: { me },
    } = await apolloClient.query({
      query: getBasicWhoAmI,
      errorPolicy: "none",
    });

    return {
      entityId: me.entityId,
      shortname: me.properties.shortname,
      preferredName: me.properties.preferredName,
    };
  } catch (error) {
    if (error instanceof ApolloError && error.extensions.code === "FORBIDDEN") {
      throw new AuthenticationError(error.message);
    }
    throw error;
  }
};

const prepareSessionSupport = async (
  cookie: string | undefined,
): Promise<SessionSupport> => {
  if (!cookie) {
    throw new AuthenticationError("Expected authentication cookie");
  }

  const cacheRecord = sessionSupportCache.get(cookie);
  if (cacheRecord) {
    return cacheRecord;
  }

  const apolloClient = createApolloClient({
    name: "collab",
    additionalHeaders: { Cookie: cookie },
  });

  const userInfo = await requestUserInfo(apolloClient);

  const newCacheRecord: SessionSupport = {
    apolloClient,
    userInfo,
  };

  sessionSupportCache.set(cookie, newCacheRecord);

  return newCacheRecord;
};

interface UserInfo {
  entityId: string;
  shortname: string;
  preferredName: string;
}

interface SessionSupport {
  apolloClient: ApolloClient<NormalizedCacheObject>;
  userInfo: UserInfo;
}

type Connection = {
  entityWatcher: EntityWatcher;
  socket: Socket;
  initialConnectionData: InitialConnectionData;
};

const prepareSessionSupportWithInstance = async (
  {
    entityWatcher,
    socket,
    initialConnectionData: { accountId, pageEntityId },
  }: Connection,
  forceNewInstance = false,
): Promise<SessionSupport & { instance: Instance }> => {
  const { apolloClient, userInfo } = await prepareSessionSupport(
    socket.handshake.headers.cookie,
  );

  const instance = await getInstance(apolloClient, entityWatcher)(
    accountId,
    pageEntityId,
    forceNewInstance,
  );

  return {
    apolloClient,
    userInfo,
    instance,
  };
};

/**
 * Connect to GraphQL through user's provided credentials.
 * Fetch the initial version of the document and send to user.
 */
const initializeCollabSession = async (
  connection: Connection,
): Promise<{ instance: Instance; userInfo: UserInfo } | null> => {
  const { socket } = connection;

  try {
    // A session is a user's information along with an Apollo client.
    // This Apollo client will be used for various API calls on behalf of the user.
    const { instance, userInfo } = await prepareSessionSupportWithInstance(
      connection,
      socket.handshake.query?.forceNewInstance === "true",
    );

    if (instance.errored) {
      emitServerError(socket, "Collab instance is erroring.");
    }
    return { instance, userInfo };
  } catch (error) {
    emitServerError(socket, error);
    return null;
  }
};

const handleUpdateDocument = async (
  connection: Connection,
  data: UpdateAction,
  callback: (...args: any[]) => void,
): Promise<void> => {
  const { socket } = connection;

  try {
    const { apolloClient, instance } = await prepareSessionSupportWithInstance(
      connection,
    );

    if (instance.errored) {
      emitServerError(socket, "Collab instance is erroring.");
    }

    const version = parseVersion(data.version);

    const result = await instance.addJsonEvents(apolloClient)(
      version,
      data.steps,
      `${data.clientId}`,
      data.blockIds,
      // @todo these need to be validated
      data.actions,
    );

    if (!result) {
      if (instance.errored) {
        emitServerError(socket, "Collab instance is erroring.");
      } else {
        // If the result does not exist, but the instance hasn't errored,
        // it means the updates were given at a wrong version.
        // Tell the client it's behind
        callback?.(<UpdateDocumentCallback>{ status: "versionConflict" });
        // emitServerEvent(socket, {
        //   type: "versionConflict",
        // });
      }
    } else {
      callback?.(<UpdateDocumentCallback>{ status: "success" });
    }
  } catch (error) {
    emitServerError(socket, error);
  }
};

const handleFetchVersion = async (
  connection: Connection,
  data: FetchVersionAction,
) => {
  const { socket } = connection;
  try {
    const { instance } = await prepareSessionSupportWithInstance(connection);

    if (instance.errored) {
      emitServerError(socket, "Collab instance is erroring.");
    }

    const events = instance.getEvents(data.currentVersion);

    if (events) {
      emitServerEvent(socket, {
        type: "documentUpdated",
        version: instance.version,
        ...events,
      });
    }
  } catch (error) {
    emitServerError(socket, error);
  }
};

const handleReportPosition = async (
  connection: Connection,
  data: ReportPositionAction,
): Promise<void> => {
  const { socket } = connection;
  try {
    const { instance, userInfo } = await prepareSessionSupportWithInstance(
      connection,
    );

    if (instance.errored) {
      emitServerError(socket, "Collab instance is erroring.");
    }

    const { entityId } = data;

    if (typeof entityId !== "string" && entityId !== null) {
      emitServerError(socket, "Expected entityId to be a string or null.");
    }

    instance.registerPosition({
      userId: userInfo.entityId,
      userShortname: userInfo.shortname,
      userPreferredName: userInfo.preferredName,
      entityId,
    });
  } catch (error) {
    emitServerError(socket, error);
  }
};

export const createCollabWsApp = async (
  httpServer: HttpServer,
  queue: QueueExclusiveConsumer,
) => {
  const entityWatcher = new EntityWatcher(queue);

  // Initializes socket.io on '/socket.io/' route
  const io = new SocketIoServer(httpServer, {
    cors: CORS_CONFIG,
  });

  io.on("connection", async (socket) => {
    let initialConnectionData;
    try {
      initialConnectionData = checkInitialConnectionDataValues(
        socket.handshake.query,
      );
    } catch (error) {
      emitServerError(socket, error);
      return;
    }

    const connection = { entityWatcher, socket, initialConnectionData };

    const sessionInfo = await initializeCollabSession(connection);
    if (!sessionInfo) {
      return;
    }

    const { instance, userInfo } = sessionInfo;

    // after initializing the session will emit some initial data

    // An initial document is emitted
    emitServerEvent(socket, {
      type: INITIAL_STATE,
      doc: instance.state.doc.toJSON(),
      store: entityStorePluginState(instance.state).store,
      version: instance.version,
    });

    // And the basline positions are emitted
    const bastlinePositions = instance.extractPositions(userInfo.entityId);
    emitServerEvent(socket, {
      type: POSITION_UPDATED,
      positions: bastlinePositions,
    });

    // Websocket subscriptions for the instance are then created
    const docSubId = instance.subscribeDocument({
      notify: (document: DocumentChange) => {
        emitServerEvent(socket, {
          type: DOCUMENT_UPDATED,
          version: instance.version,
          ...document,
        });
      },
      error: (error) => {
        emitServerError(socket, error);
      },
      persistent: true,
    });

    const posSubId = instance.subscribePosition({
      baselinePositions: bastlinePositions,
      userIdToExclude: userInfo.entityId,
      notify: (positions: CollabPosition[]) => {
        emitServerEvent(socket, {
          type: POSITION_UPDATED,
          positions,
        });
      },
      error: (error: string) => {
        emitServerError(socket, error);
      },
      persistent: true,
    });

    // The socket then listens for user actions
    socket.on(
      UPDATE_DOCUMENT,
      async (data: UpdateAction, callback: (...args: any[]) => void) =>
        await handleUpdateDocument(connection, data, callback),
    );

    socket.on(
      FETCH_VERSION,
      async (data: FetchVersionAction) =>
        await handleFetchVersion(connection, data),
    );

    socket.on(
      REPORT_POSITION,
      async (data: ReportPositionAction) =>
        await handleReportPosition(connection, data),
    );

    // Whenever a socket disconnects, clean up instance subscriptions.
    socket.on("disconnect", () => {
      if (docSubId) {
        instance.unsubscribeDocument(docSubId);
      }
      if (posSubId) {
        instance.unsubscribePosition(posSubId);
      }
    });
  });

  return io;
};
