export interface MessagePayload {
  from: string;
  to: string;
  body: string;
  timestamp: number;
  mediaUrl: string | null;
  mimetype: string | null;
  fromMe?: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface ServerState {
  isReady: boolean;
  isInitializing: boolean;
  reconnectAttempts: number;
  latestQR: string | null;
}
