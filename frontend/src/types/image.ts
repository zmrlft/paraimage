import type { ModelValue } from "../data/models";

export type ImageManagerItem = {
  id: string;
  imageUrl: string;
  origin: "source" | "processed";
  modelId?: ModelValue;
  windowId?: number;
  messageId?: string;
  createdAt?: string;
  action?: "remove_bg" | "split";
  parentId?: string;
  index?: number;
};
