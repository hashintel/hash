import "./popup.scss";
import "../shared/common.scss";

import { theme } from "@hashintel/design-system/theme";
import {
  Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, ThemeProvider } from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { Message } from "../../shared/messages";
import { SignIn } from "./popup-contents/sign-in";

const queryApi = (query: string, variables?: Record<string, unknown>) =>
  fetch("https://app-api.hash.ai/graphql", {
    method: "POST",
    body: JSON.stringify({
      query,
      variables,
    }),
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
  }).then((resp) => resp.json());

const meQuery = /* GraphQL */ `
  {
    me {
      roots
      vertices
    }
  }
`;

const getMe = () => {
  return queryApi(meQuery)
    .then(
      ({
        data: { me: subgraph },
      }: {
        data: { me: Subgraph<EntityRootType> };
      }) => {
        const user = getRoots(subgraph)[0] as unknown as User;
        return {
          ...user,
          properties: simplifyProperties(user.properties),
        };
      },
    )
    .catch(() => null);
};

const createEntityQuery = /* GraphQL */ `
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $properties: EntityPropertiesObject!
  ) {
    createEntity(entityTypeId: $entityTypeId, properties: $properties)
  }
`;

const createQuickNote = (text: string) => {
  return queryApi(createEntityQuery, {
    entityTypeId:
      "https://app.hash.ai/@ciaran/types/entity-type/quick-note/v/1",
    properties: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
        text,
    },
  }).then(({ data }: { data: { createEntity: Subgraph } }) => {
    return data.createEntity;
  });
};

const getCurrentTab = async () => {
  const queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`

  const [tab] = await browser.tabs.query(queryOptions);
  return tab;
};

/**
 * The popup that appears when a user clicks on the extension's icon.
 *
 * You must inspect the popup window itself to see any logs, network events etc.
 * In Firefox this can be done via enabling and running the Browser Toolbox.
 */
export const PopupContents = () => {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Simplified<User> | null>(null);
  const [activeTab, setActiveTab] = useState<Tabs.Tab | null>(null);
  const [draftQuickNote, setDraftQuickNote] = useState("");

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        getMe().then((maybeMe) => setMe(maybeMe)),
        getCurrentTab().then(setActiveTab),
      ]);

      setLoading(false);
    };

    if (!activeTab) {
      void init();
    }
  }, [activeTab]);

  const tabHost = activeTab?.url ? new URL(activeTab.url).host : null;

  const isHash = ["app.hash.ai", "hash.ai"].includes(tabHost as string);

  const requestSiteContent = async () => {
    if (!activeTab?.id) {
      throw new Error("No active tab");
    }

    const message: Message = {
      type: "get-site-content",
    };

    const response = (await browser.tabs.sendMessage(
      activeTab.id,
      message,
    )) as Promise<string>;

    console.log({ response });
  };

  const saveQuickNote = async () => {
    void createQuickNote(draftQuickNote).then(() => {
      setDraftQuickNote("");
    });
  };

  const optionsUrl = browser.runtime.getURL("options.html");

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={({ palette }) => ({
          height: "100%",
          fontSize: "15px",
          color: palette.common.black,
          border: `1px solid ${palette.gray[20]}`,

          "@media (prefers-color-scheme: dark)": {
            border: `1px solid ${palette.gray[10]}`,
            color: palette.common.white,
          },
        })}
      >
        {!loading &&
          (!me ? (
            <SignIn />
          ) : (
            <>
              <header className="header section">
                <div />
                <div className="avatar">
                  {me.properties.preferredName?.[0] ?? "?"}
                </div>
              </header>

              <div className="actions">
                <div className="action section">
                  <div className="action-title">
                    <h3>Quick note</h3>
                    <a
                      href="https://app.hash.ai/@ciaran/types/entity-type/quick-note?tab=entities"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View notes
                    </a>
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveQuickNote();
                    }}
                  >
                    <textarea
                      placeholder="Start typing here..."
                      rows={1}
                      value={draftQuickNote}
                      onChange={(event) =>
                        setDraftQuickNote(event.target.value)
                      }
                    />
                    <button type="submit">Create new entity</button>
                  </form>
                </div>
                <div className="action section options-link">
                  <a href={optionsUrl} target="_blank" rel="noreferrer">
                    Settings
                  </a>
                </div>
              </div>
            </>
          ))}
      </Box>
    </ThemeProvider>
  );
};
