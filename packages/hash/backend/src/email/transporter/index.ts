import { SendMailOptions } from "nodemailer";

interface EmailTransporter {
  /** Send an email */
  sendMail(options: SendMailOptions): Promise<void>;
}

export default EmailTransporter;
