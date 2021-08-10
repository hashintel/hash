import nodemailer from "nodemailer";
import * as aws from "@aws-sdk/client-ses";

const ses = new aws.SES({
  apiVersion: '2010-12-01',
  region: 'us-east-1'
});

export default nodemailer.createTransport({
  SES: { ses, aws },
  sendingRate: 10,
});