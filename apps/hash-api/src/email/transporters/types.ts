export interface EmailTransporterSendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailTransporter {
  /** Send an email */
  sendMail(options: EmailTransporterSendMailOptions): Promise<void>;
}
