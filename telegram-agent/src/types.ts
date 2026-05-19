// === Telegram API Types ===

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  voice?: {
    file_id: string;
    duration: number;
    file_size?: number;
  };
  date: number;
}

// === Database Types ===

export interface TelegramAgent {
  telegram_user_id: number;
  company_id: string;
  role: string;
  actif: boolean;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivationCode {
  code: string;
  company_id: string;
  used: boolean;
  used_by: number | null;
  expires_at: string;
  created_at: string;
}

export interface SaCompany {
  id: string;
  name: string;
  plan: string;
  status: string;
  addon_agent: boolean;
}

// === Tool System Types ===

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  content: string;
  is_error?: boolean;
}

export type ToolHandler = (
  companyId: string,
  input: Record<string, unknown>
) => Promise<ToolResult>;

export interface ToolModule {
  definitions: ToolDefinition[];
  handleTool: (
    companyId: string,
    toolName: string,
    input: Record<string, unknown>
  ) => Promise<ToolResult>;
}

// === Logging ===

export type LogLevel = 'info' | 'warn' | 'error';

export function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
