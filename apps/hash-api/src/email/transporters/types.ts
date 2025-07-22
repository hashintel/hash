export interface EmailTransporterSendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailTransporter {
  sendMail(options: EmailTransporterSendMailOptions): Promise<void>;
}
