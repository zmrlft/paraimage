export type ProviderConfigPayload = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
};

export type SaveConfigResponse = {
  ok: boolean;
  config?: {
    provider_name: string;
    api_key: string;
    base_url: string;
    updated_at: string;
  };
  error?: string;
};

type PyWebviewSettingsApi = {
  get_configs: () => Promise<
    Array<{
      provider_name: string;
      api_key: string;
      base_url: string;
      updated_at: string;
    }>
  >;
  save_config: (provider: string, key: string, url: string) => Promise<SaveConfigResponse>;
};

const getPywebviewApi = (): PyWebviewSettingsApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewSettingsApi } })
    .pywebview?.api;
  return api?.get_configs && api?.save_config ? api : null;
};

export const getProviderConfigs = async (): Promise<ProviderConfigPayload[]> => {
  const api = getPywebviewApi();
  if (!api) {
    return [];
  }
  const configs = await api.get_configs();
  return configs.map((config) => ({
    providerName: config.provider_name,
    baseUrl: config.base_url,
    apiKey: config.api_key,
  }));
};

export const saveProviderConfig = async (
  payload: ProviderConfigPayload
): Promise<SaveConfigResponse> => {
  const api = getPywebviewApi();
  if (!api) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.save_config(payload.providerName, payload.apiKey, payload.baseUrl);
};
