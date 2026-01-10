import { getLobeIconsCDNUrlFn, type Theme } from "../utils/lobeIcons";

export type ModelValue =
  | "seedream-4.5"
  | "doubao-seedream-4-0-250828"
  | "gpt-image-1"
  | "nano-banana"
  | "nano-banana-pro"
  | "qwen-image";

export type ModelDefinition = {
  value: ModelValue;
  label: string;
  iconSlug: string;
  provider: string;
  defaultBaseUrl?: string;
};

export const models: ModelDefinition[] = [
  {
    value: "seedream-4.5",
    label: "Seedream 4.5",
    iconSlug: "doubao-color",
    provider: "Volcengine Ark",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },
  {
    value: "doubao-seedream-4-0-250828",
    label: "Seedream 4.0",
    iconSlug: "doubao-color",
    provider: "Volcengine Ark",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },
  {
    value: "gpt-image-1",
    label: "GPT-Image-1",
    iconSlug: "openai",
    provider: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    value: "nano-banana",
    label: "nano-banana",
    iconSlug: "gemini-color",
    provider: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  {
    value: "nano-banana-pro",
    label: "nano-banana-pro",
    iconSlug: "gemini-color",
    provider: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  {
    value: "qwen-image",
    label: "Qwen-Image",
    iconSlug: "qwen-color",
    provider: "Alibaba DashScope",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
];

export const modelMap = new Map(models.map((model) => [model.value, model]));

export const getModelIconUrl = (iconSlug: string, theme: Theme = "light") =>
  getLobeIconsCDNUrlFn(iconSlug)(theme);
