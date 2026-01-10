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
