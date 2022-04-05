import axios from "axios";
import md5 from "md5";
import type { NextApiRequest, NextApiResponse } from "next";

const username = process.env.MAILCHIMP_API_USER;
const password = process.env.MAILCHIMP_API_KEY;

const mailchimpListID = process.env.MAILCHIMP_LIST_ID;

const headers = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
    "base64",
  )}`,
  "Content-Type": "application/json",
};

const baseURL = "https://us15.api.mailchimp.com/3.0/lists/";

const getIpAddress = (req: NextApiRequest): string | undefined => {
  const ip = req.headers["x-forwarded-for"] ?? req.connection.remoteAddress;

  if (typeof ip === "string") {
    return ip.includes("?") ? ip.split("?")[0] : ip;
  } else if (Array.isArray(ip)) {
    return ip[0];
  }
};

const tagUser = async (email: string) => {
  const memberHash = md5(email.toLowerCase());

  await axios
    .post(
      `${baseURL}${mailchimpListID}/members/${memberHash}/tags`,
      {
        tags: [
          {
            // @todo is this correct
            name: "HASH Dev",
            // @todo do we need this?
            status: "active",
          },
        ],
      },
      {
        headers,
      },
    )
    .catch((err) =>
      // eslint-disable-next-line no-console
      console.log("Error tagging mailchimp user: ", err.response?.data?.errors),
    );
};

// eslint-disable-next-line import/no-default-export
export default (req: NextApiRequest, res: NextApiResponse) => {
  const email: string = req.body.email;

  const merge_fields = {
    IPADDRESS: getIpAddress(req),
  };

  axios
    .post(
      `${baseURL}${mailchimpListID}/members/`,
      {
        email_address: email,
        merge_fields,
        status: "subscribed",
      },
      {
        headers,
      },
    )
    .catch((error) => {
      if (
        typeof error === "object" &&
        error?.response?.data?.title?.includes?.("Exists")
      ) {
        return { data: { status: "subscribed", title: "Already subscribed" } };
      }

      throw error;
    })
    .then(async ({ data }) => {
      if (data.status === "subscribed") {
        await tagUser(email);

        res.status(200).json({
          message: "Success",
          response: {
            status: data.status,
            title: data.title,
          },
        });
      } else {
        throw data;
      }
    })
    .catch(async (error) => {
      // eslint-disable-next-line no-console
      console.log(error);
      res.status(400).json({
        message: `Error subscribing`,
        response: {
          title: error?.response?.data?.title,
        },
      });
    });
};
