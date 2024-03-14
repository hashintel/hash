import { isUserHashInstanceAdmin } from "@local/hash-backend-utils/hash-instance";
import type { RequestHandler } from "express";

import { hydraAdmin } from "../../auth/ory-hydra";

type UpsertOAuthClientRequestBody = {
  redirectUri: string;
};

type UpsertOAuthClientResponseBody =
  | { error: string }
  | {
      clientId: string;
      /** Returned if the client was created – cannot be retrieved again */
      clientSecret?: string;
    };

const clientName = "HashGPT";

/**
 * An endpoint to allow admins to update the redirect_uri parameter of the ChatGPT OAuth client.
 * If the client does not exist, it will be created.
 */
export const upsertGptOauthClient: RequestHandler<
  Record<string, never>,
  UpsertOAuthClientResponseBody,
  UpsertOAuthClientRequestBody
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
> = async (req, res) => {
  const { user } = req;
  const { redirectUri } = req.body;

  if (!user) {
    res.status(401).send({ error: "No authenticated user" });
    return;
  }

  if (!user.shortname) {
    res.status(401).send({ error: "User has not completed signup." });
    return;
  }

  const isInstanceAdmin = await isUserHashInstanceAdmin(
    req.context,
    { actorId: user.accountId },
    { userAccountId: user.accountId },
  );

  if (!isInstanceAdmin) {
    res.status(403).send({ error: "User is not an admin of this instance" });
    return;
  }

  if (!redirectUri) {
    res
      .status(400)
      .send({ error: "redirectUri is required in the request body" });
    return;
  }

  const parsedUrl = new URL(redirectUri);

  if (parsedUrl.hostname !== "chat.openai.com") {
    res
      .status(400)
      .send({ error: "redirectUri must be a valid ChatGPT redirect URI" });
    return;
  }

  const { data: existingClients } = await hydraAdmin.listOAuth2Clients({
    clientName,
  });

  if (existingClients.length > 1) {
    res
      .status(500)
      .send({ error: `Multiple clients with the name ${clientName} exist` });
  } else if (existingClients.length === 0) {
    const { data: newClient } = await hydraAdmin.createOAuth2Client({
      oAuth2Client: {
        redirect_uris: [req.body.redirectUri],
        client_name: clientName,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "read",
      },
    });

    if (!newClient.client_id) {
      res.status(500).send({ error: "Failed to create OAuth client" });
      return;
    }

    res.status(200).json({
      clientId: newClient.client_id,
      clientSecret: newClient.client_secret,
    });
  } else {
    const existingClient = existingClients[0]!;

    const { data: updatedClient } = await hydraAdmin.patchOAuth2Client({
      id: existingClient.client_id!,
      jsonPatch: [
        {
          op: "replace",
          path: "/redirect_uris",
          value: [req.body.redirectUri],
        },
      ],
    });

    if (!updatedClient.client_id) {
      res.status(500).send({ error: "Failed to update OAuth client" });
      return;
    }

    res.status(200).json({ clientId: updatedClient.client_id });
  }
};
