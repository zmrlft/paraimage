import type { ModelValue } from "../data/models";
import type { ChatSession } from "../types/chat";

type ChatSessionResponse = {
  id: string;
  modelId: ModelValue;
  title: string;
  messages: ChatSession["messages"];
  createdAt: string;
  updatedAt: string;
};

type SaveChatSessionResponse = {
  ok: boolean;
  session?: ChatSessionResponse;
  error?: string;
};

type DeleteChatSessionResponse = {
  ok: boolean;
  deleted?: boolean;
  id?: string;
  error?: string;
};

type PyWebviewHistoryApi = {
  get_chat_sessions?: (modelId: string) => Promise<ChatSessionResponse[]>;
  save_chat_session?: (
    payload: ChatSessionResponse
  ) => Promise<SaveChatSessionResponse>;
  delete_chat_session?: (
    sessionId: string
  ) => Promise<DeleteChatSessionResponse>;
};

const getPywebviewApi = (): PyWebviewHistoryApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewHistoryApi } })
    .pywebview?.api;
  return api ?? null;
};

export const getChatSessions = async (
  modelId: ModelValue
): Promise<ChatSession[]> => {
  const api = getPywebviewApi();
  if (!api?.get_chat_sessions) {
    return [];
  }
  const sessions = await api.get_chat_sessions(modelId);
  return sessions.map((session) => ({
    id: session.id,
    modelId: session.modelId,
    title: session.title,
    messages: session.messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }));
};

export const saveChatSession = async (
  session: ChatSession
): Promise<SaveChatSessionResponse> => {
  const api = getPywebviewApi();
  if (!api?.save_chat_session) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.save_chat_session({
    id: session.id,
    modelId: session.modelId,
    title: session.title,
    messages: session.messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
};

export const deleteChatSession = async (
  sessionId: string
): Promise<DeleteChatSessionResponse> => {
  const api = getPywebviewApi();
  if (!api?.delete_chat_session) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.delete_chat_session(sessionId);
};
