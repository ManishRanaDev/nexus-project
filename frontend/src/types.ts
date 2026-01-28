export interface MessagePayload {
  from: string;
  to: string;
  body: string;
  timestamp: number;
  mediaUrl: string | null;
  mimetype: string | null;
  fromMe?: boolean;
}

export type AppMode = 'LOCKED' | 'FAKE' | 'REAL';

export interface TerminalMessage {
  command: string;
  response: string;
  timestamp: string;
}

export interface ThemeColors {
  background: string;
  headerBg: string;
  headerText: string;
  messageBg: string;
  messageText: string;
  userBubble: string;
  userBubbleText: string;
  border: string;
  inputBg: string;
  inputBorder: string;
  suggestionBg: string;
  suggestionBorder: string;
  suggestionText: string;
  suggestionHover: string;
  footerText: string;
  shadow: string;
  buttonBg: string;
  buttonDisabled: string;
}
