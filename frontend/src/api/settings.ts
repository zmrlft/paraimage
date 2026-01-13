export type ProviderConfigPayload = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelIds: string[];
};

export type SaveConfigResponse = {
  ok: boolean;
  config?: {
    provider_name: string;
    api_key: string;
    base_url: string;
    model_ids?: string[];
    updated_at: string;
  };
  error?: string;
};

type PyWebviewSettingsApi = {
  get_configs?: () => Promise<
    Array<{
      provider_name: string;
      api_key: string;
      base_url: string;
      model_ids?: string[];
      updated_at: string;
    }>
  >;
  save_config?: (
    provider: string,
    key: string,
    url: string,
    model_ids: string[]
  ) => Promise<SaveConfigResponse>;
};

const getPywebviewApi = (): PyWebviewSettingsApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewSettingsApi } })
    .pywebview?.api;
  return api ?? null;
};

export const getProviderConfigs = async (): Promise<ProviderConfigPayload[]> => {
  const api = getPywebviewApi();
  if (!api) {
    return [];
  }
  if (api.get_configs) {
    const configs = await api.get_configs();
    return configs.map((config) => ({
      providerName: config.provider_name,
      baseUrl: config.base_url,
      apiKey: config.api_key,
      modelIds: config.model_ids ?? [],
    }));
  }
  return [];
};

export const saveProviderConfig = async (
  payload: ProviderConfigPayload
): Promise<SaveConfigResponse> => {
  const api = getPywebviewApi();
  if (!api) {
    return { ok: false, error: "pywebview not available" };
  }
  if (api.save_config) {
    return api.save_config(
      payload.providerName,
      payload.apiKey,
      payload.baseUrl,
      payload.modelIds
    );
  }
  return { ok: false, error: "pywebview not available" };
};
