import { getLobeIconsCDNUrlFn, type Theme } from "../utils/lobeIcons";
import type { ProviderConfig } from "../types/provider";

export type ModelValue = string;

export type ModelDefinition = {
  value: ModelValue;
  modelId: string;
  label: string;
  providerName: string;
  iconSlug?: string;
};

export type ProviderPreset = {
  providerName: string;
  iconSlug?: string;
  defaultBaseUrl?: string;
};

export const providerPresets: ProviderPreset[] = [
  {
    providerName: "Volcengine Ark",
    iconSlug: "doubao-color",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },
  {
    providerName: "OpenAI",
    iconSlug: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    providerName: "Google Gemini",
    iconSlug: "gemini-color",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  {
    providerName: "Alibaba DashScope",
    iconSlug: "qwen-color",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
  },
  {
    providerName: "AIHubMix",
    iconSlug: "/logo.png",
    defaultBaseUrl: "https://aihubmix.com/v1",
  },
];

const providerPresetMap = new Map(
  providerPresets.map((preset) => [preset.providerName, preset])
);

export const getProviderPreset = (providerName: string) =>
  providerPresetMap.get(providerName);

export const buildModelKey = (providerName: string, modelId: string) =>
  `${providerName}::${modelId}`;

export const buildModelLabel = (modelId: string, providerName: string) =>
  `${modelId} (${providerName})`;

export const getProviderInitial = (providerName: string) =>
  providerName.trim().slice(0, 1).toUpperCase() || "?";

const normalizeModelId = (modelId: string) => modelId.trim();

export const buildModelList = (
  providers: ProviderConfig[]
): ModelDefinition[] => {
  const results: ModelDefinition[] = [];
  const seen = new Set<string>();

  providers.forEach((provider) => {
    const providerName = provider.providerName.trim();
    if (!providerName) {
      return;
    }
    const preset = getProviderPreset(providerName);
    const providerIconSlug = provider.iconSlug ?? preset?.iconSlug;
    const modelIds = provider.modelIds ?? [];
    modelIds.forEach((modelId) => {
      const trimmed = normalizeModelId(modelId);
      if (!trimmed) {
        return;
      }
      const normalizedModelId = trimmed
        .toLowerCase()
        .replace(/[\s_]+/g, "-");
      const isNanoBanana =
        providerName === "AIHubMix" &&
        normalizedModelId.startsWith("nano-banana");
      const iconSlug = isNanoBanana ? "/banana.png" : providerIconSlug;
      const key = buildModelKey(providerName, trimmed);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      results.push({
        value: key,
        modelId: trimmed,
        label: buildModelLabel(trimmed, providerName),
        providerName,
        iconSlug,
      });
    });
  });

  return results;
};

export const buildModelMap = (models: ModelDefinition[]) =>
  new Map(models.map((model) => [model.value, model]));

export const getModelIconUrl = (iconSlug: string, theme: Theme = "light") => {
  if (iconSlug.startsWith("/") || iconSlug.startsWith("http")) {
    return iconSlug;
  }
  return getLobeIconsCDNUrlFn(iconSlug)(theme);
};
