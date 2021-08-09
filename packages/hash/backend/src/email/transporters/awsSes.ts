import nodemailer from "nodemailer";
import { SESClient } from "@aws-sdk/client-ses";

export default nodemailer.createTransport({
  SES: new SESClient({}),
  sendingRate: 10,
});
