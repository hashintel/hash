import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import { extractEntityUuidFromEntityId, OwnedById } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { FunctionComponent, useMemo } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useEntityById } from "../../../components/hooks/use-entity-by-id";
import { useUserOrOrgShortnameByOwnedById } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { useUsers } from "../../../components/hooks/use-users";
import { PageIcon } from "../../../components/page-icon";
import { generateEntityLabel } from "../../../lib/entities";
import { constructPageRelativeUrl } from "../../../lib/routes";
import { Link } from "../../../shared/ui";
import { Mention } from "../create-suggester/mention-suggester";

interface MentionDisplayProps {
  mention: Mention;
  ownedById: OwnedById;
}

export const MentionDisplay: FunctionComponent<MentionDisplayProps> = ({
  mention,
  ownedById,
}) => {
  const { entityId } = mention;
  const { users, loading: usersLoading } = useUsers();
  const { data: pages, loading: pagesLoading } = useAccountPages(ownedById);
  const { loading: entityLoading, entitySubgraph } = useEntityById(entityId);

  const { shortname: workspaceShortname, loading: workspaceShortnameLoading } =
    useUserOrOrgShortnameByOwnedById({ ownedById });

  const { title, href, icon } = useMemo(() => {
    switch (mention.kind) {
      case "user": {
        // User entities are stored on the system account
        const userHref = `/@${systemUserShortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`;

        // Only set the title to "User" if the query hasn't returned yet
        if (!users || (usersLoading && !users.length)) {
          /** @todo - What should the href be here? */
          return {
            title: "User",
            href: userHref,
            icon: "@",
          };
        }

        // Once the query loads, either display the found name, or display "Unknown User" if the user doesn't exist in the users array
        const matchingUser = users.find(
          (user) => user.entityRecordId.entityId === entityId,
        );

        if (matchingUser) {
          return {
            title: matchingUser.preferredName,
            href: userHref,
            icon: "@",
          };
        }

        /** @todo - What should the href be here? */
        return {
          title: "Unknown User",
          href: `#`,
          icon: "@",
        };
      }

      case "page": {
        const page = pages.find(
          (potentialPage) =>
            potentialPage.metadata.recordId.entityId === entityId,
        );

        let pageTitle = "";

        // Only set the title to "Page" if the query hasn't returned yet
        if (pagesLoading && !pages.length) {
          pageTitle = "Page";
        } else {
          // Once the query loads, either display the found title, or display "Unknown Page" if the page doesn't exist in the page array
          pageTitle = page?.title ?? "Unknown Page";
        }

        const pageEntityUuid = extractEntityUuidFromEntityId(entityId);

        return {
          title: pageTitle || "Untitled",
          href:
            page && workspaceShortname
              ? constructPageRelativeUrl({
                  workspaceShortname,
                  pageEntityUuid,
                })
              : "",
          icon: (
            <PageIcon
              icon={page?.icon}
              size="small"
              sx={{ display: "inline-flex", mr: 0.25 }}
            />
          ),
        };
      }
      case "entity": {
        if (!entitySubgraph || entityLoading || workspaceShortnameLoading) {
          /** @todo consider showing a loading state instead of saying "entity", same for the pages & users above */
          return {
            title: "Entity",
            href: "",
            icon: "@",
          };
        }

        const entityHref = `/@${workspaceShortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`;

        const entityLabel = generateEntityLabel(entitySubgraph);

        return {
          title: entityLabel,
          href: entityHref,
          icon: "@",
        };
      }
      case "property-value": {
        if (!entitySubgraph || entityLoading || workspaceShortnameLoading) {
          /** @todo consider showing a loading state instead of saying "entity", same for the pages & users above */
          return {
            title: "Property",
            href: "",
            icon: "@",
          };
        }

        const entityHref = `/@${workspaceShortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`;

        const entity = getRoots(entitySubgraph)[0];

        const propertyValue = entity?.properties[mention.propertyBaseUrl];

        return {
          title: propertyValue?.toString(),
          href: entityHref,
        };
      }
      default:
        return { title: "", href: "", icon: "@" };
    }
  }, [
    entityId,
    mention,
    users,
    pages,
    pagesLoading,
    usersLoading,
    entitySubgraph,
    entityLoading,
    workspaceShortname,
    workspaceShortnameLoading,
  ]);

  return (
    <Link noLinkStyle href={href} sx={{ fontWeight: 500, color: "#9ca3af" }}>
      {icon}
      {title}
    </Link>
  );
};
