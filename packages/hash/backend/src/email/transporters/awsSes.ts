import nodemailer from "nodemailer";
import SES from "aws-sdk/clients/ses";

export default nodemailer.createTransport({
  SES: new SES(),
  sendingRate: 10,
});
