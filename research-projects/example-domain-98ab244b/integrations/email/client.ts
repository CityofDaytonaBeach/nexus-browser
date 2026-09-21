export interface EmailConfig {
  resendApiKey?: string;
  sendgridApiKey?: string;
  postmarkToken?: string;
  mailgunApiKey?: string;
  emailFrom?: string;
}

export function createEmailIntegration(config: EmailConfig = {}) {
  return {
    name: 'email',
    category: 'messaging',
    features: [
    "resend",
    "sendgrid",
    "postmark",
    "mailgun",
    "transactional-email",
    "templates"
],
    config,
  };
}
