import axios from "axios";
import md5 from "md5";
import type { NextApiRequest, NextApiResponse } from "next";

const escape = (string: string) => {
  const str = `${string}`;
  const match = /["&<>]/.exec(str);

  if (!match) {
    return str;
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  let escape;
  let html = "";
  let index = 0;
  let lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = "&quot;";
        break;
      case 38: // &
        escape = "&amp;";
        break;
      case 60: // <
        escape = "&lt;";
        break;
      case 62: // >
        escape = "&gt;";
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
};

export const sanitize = (value?: string | null) => {
  if (!value) {
    return;
  }
  return escape(value);
};

const baseURL = "https://us15.api.mailchimp.com/3.0/lists/";

const cleanFields = (object: any) => {
  return {
    ...object,
    merge_fields: {
      ACTIVATED: object.merge_fields?.ACTIVATED,
      FNAME: object.merge_fields?.FNAME,
      LNAME: object.merge_fields.LNAME,
    },
  };
};

const sanitizeMergeFields = (obj: any) => ({
  ...obj,
  FNAME: sanitize(obj.FNAME),
  LNAME: sanitize(obj.LNAME),
});

// eslint-disable-next-line import/no-default-export
export default (req: NextApiRequest, res: NextApiResponse) => {
  const mailchimpListID = process.env.MAILCHIMP_LIST_ID;
  const email: string = req.body.email;
  const memberHash = md5(email.toLowerCase());
  const merge_fields = sanitizeMergeFields(req.body.merge_fields);
  const username = process.env.MAILCHIMP_API_USER;
  const password = process.env.MAILCHIMP_API_KEY;

  merge_fields.IPADDRESS =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (merge_fields.IPADDRESS.includes(",")) {
    merge_fields.IPADDRESS = merge_fields.IPADDRESS.split(",")[0];
  } else if (merge_fields.IPADDRESS instanceof Array) {
    merge_fields.IPADDRESS = merge_fields.IPADDRESS[0];
  }

  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
      "base64",
    )}`,
    "Content-Type": "application/json",
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
    .then(async ({ data }) => {
      if (data.status === "subscribed") {
        // eslint-disable-next-line no-param-reassign
        data = cleanFields(data);
        axios
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
            console.log(
              "Error tagging mailchimp user: ",
              err.response?.data?.errors,
            ),
          );
        try {
          res.status(200).json({
            message: "Success",
            response: {
              id: data.id,
              status: data.status,
              email: data.email_address,
              merge_fields: {
                ACTIVATED: data.merge_fields.ACTIVATED,
                FNAME: data.merge_fields.FNAME,
                LNAME: data.merge_fields.LNAME,
              },
              title: data.title,
            },
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log(err);
        }
      } else {
        res.status(400).json({
          message: `Error sending email address`,
          response: {
            title: data.title,
          },
        });
      }
    })
    .catch(async (error) => {
      if (error.response.data.status === 400) {
        if (error.response.data.title.includes("Exists")) {
          let member = await fetch(
            `${baseURL}${mailchimpListID}/members/${memberHash}`,
            { headers },
          ).then((resp) => resp.json());
          member = cleanFields(member);
          return res.status(200).json({
            message: "Member Exists",
            response: {
              id: member.id,
              title: "Member Exists",
              email: member.email_address,
              merge_fields: {
                ACTIVATED: member.merge_fields.ACTIVATED,
                FNAME: member.merge_fields.FNAME,
                LNAME: member.merge_fields.LNAME,
              },
            },
          });
        } else {
          res.status(200).json({
            message: `Problem with email address`,
            response: {
              title: error.response.data.title,
            },
          });
        }
      } else {
        res.status(400).json({
          message: `Error sending email address`,
          response: {
            title: error.response.data.title,
          },
        });
      }
    });
};
