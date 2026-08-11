export interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
  demo?: boolean;
}

export interface MessagingChannel {
  name: string;
  isConfigured(): boolean;
  send(to: string, body: string): Promise<SendResult>;
}
