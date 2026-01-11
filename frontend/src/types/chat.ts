import type { ModelValue } from "../data/models";

export type ImageReference = {
  name: string;
  dataUrl: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  references?: ImageReference[];
  imageUrl?: string;
  modelId?: ModelValue;
  error?: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  modelId: ModelValue;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};
