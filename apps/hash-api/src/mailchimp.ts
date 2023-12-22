import mailchimp from "@mailchimp/mailchimp_marketing";
import md5 from "md5";

import { logger } from "./logger";

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: "us15",
});

const mailchimpListId = process.env.MAILCHIMP_LIST_ID;

export const createOrUpdateMailchimpUser = async (params: {
  email: string;
  shortname?: string;
  preferredName?: string;
}) => {
  const { email, preferredName, shortname } = params;

  if (!mailchimpListId) {
    return;
  }

  const merge_fields = {
    // Indicates the user registered with HASH
    APPREG: "Yes",
    ...(shortname ? { SHORTNAME: shortname } : {}),
    ...(preferredName ? { FNAME: preferredName } : {}),
  };

  try {
    await mailchimp.lists
      .addListMember(mailchimpListId, {
        email_address: email,
        merge_fields,
        status: "subscribed",
      })
      .catch(async (error) => {
        if (error.response.body.title === "Member Exists") {
          const subscriberHash = md5(email.toLowerCase());

          await mailchimp.lists.updateListMember(
            mailchimpListId,
            subscriberHash,
            {
              merge_fields,
            },
          );
        }
      });
  } catch (error) {
    /**
     * Gracefully handle if there was an error creating the mailchimp user, so that
     * mailchimp errors don't block entity updates.
     */
    logger.error(
      `There was an error creating or updating a mailchimp user with email "${email}"`,
      error,
    );
  }
};
