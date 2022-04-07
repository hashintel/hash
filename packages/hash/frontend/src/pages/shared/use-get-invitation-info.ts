import { useLazyQuery } from "@apollo/client";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
  GetOrgEmailInvitationQuery,
  GetOrgEmailInvitationQueryVariables,
  GetOrgInvitationLinkQuery,
  GetOrgInvitationLinkQueryVariables,
} from "../../graphql/apiTypes.gen";
import {
  getOrgEmailInvitation as getOrgEmailInvitationQuery,
  getOrgInvitationLink as getOrgInvitationLinkQuery,
} from "../../graphql/queries/org.queries";
import {
  isParsedInvitationEmailQuery,
  isParsedInvitationLinkQuery,
  InvitationInfo,
} from "./auth-utils";

export const useGetInvitationInfo = () => {
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const router = useRouter();

  const [
    getOrgEmailInvitation,
    {
      loading: getOrgEmailInvitationLoading,
      called: getOrgEmailInvitationCalled,
      variables: getOrgEmailInvitationVariables,
    },
  ] = useLazyQuery<
    GetOrgEmailInvitationQuery,
    GetOrgEmailInvitationQueryVariables
  >(getOrgEmailInvitationQuery, {
    onCompleted: (res) => {
      const { org, inviter } = res.getOrgEmailInvitation;
      if (!getOrgEmailInvitationVariables) return;
      const { orgEntityId, invitationEmailToken } =
        getOrgEmailInvitationVariables;
      setInvitationInfo({
        orgEntityId,
        invitationEmailToken,
        orgName: org.properties.name || "",
        inviterPreferredName: inviter.properties.preferredName || "",
      });
    },
    onError: ({ graphQLErrors }) => {
      const message = graphQLErrors?.[0]!.message;
      setErrorMessage(message);
    },
  });

  const [
    getOrgInvitationLink,
    {
      loading: getOrgInvitationLinkLoading,
      called: getOrgInvitationLinkCalled,
      variables: getOrgInvitationLinkVariables,
    },
  ] = useLazyQuery<
    GetOrgInvitationLinkQuery,
    GetOrgInvitationLinkQueryVariables
  >(getOrgInvitationLinkQuery, {
    onCompleted: (res) => {
      const { org } = res.getOrgInvitationLink;
      if (!getOrgInvitationLinkVariables) return;
      const { orgEntityId, invitationLinkToken } =
        getOrgInvitationLinkVariables;
      setInvitationInfo({
        orgEntityId,
        invitationLinkToken,
        orgName: org.properties.name,
      });
    },
  });

  useEffect(() => {
    const { query } = router;
    if (!router.isReady) return;

    if (isParsedInvitationEmailQuery(query) && !getOrgEmailInvitationCalled) {
      getOrgEmailInvitation({
        variables: {
          orgEntityId: query.orgEntityId,
          invitationEmailToken: query.invitationEmailToken,
        },
      });
    } else if (
      isParsedInvitationLinkQuery(query) &&
      !getOrgInvitationLinkCalled
    ) {
      getOrgInvitationLink({
        variables: {
          orgEntityId: query.orgEntityId,
          invitationLinkToken: query.invitationLinkToken,
        },
      });
    }
  }, [
    router,
    getOrgEmailInvitation,
    getOrgInvitationLink,
    getOrgInvitationLinkCalled,
    getOrgEmailInvitationCalled,
  ]);

  return {
    invitationInfo,
    invitationInfoLoading:
      getOrgEmailInvitationLoading || getOrgInvitationLinkLoading,
    invitationInfoError: errorMessage,
  };
};
