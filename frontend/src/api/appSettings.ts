export type AppSettings = {
  defaultSaveDir: string | null;
};

export type SaveAppSettingsPayload = {
  defaultSaveDir: string | null;
};

export type SaveAppSettingsResponse = {
  ok: boolean;
  defaultSaveDir?: string | null;
  error?: string;
};

export type ChooseDirectoryResponse = {
  ok: boolean;
  directory?: string;
  error?: string;
};

type PyWebviewAppSettingsApi = {
  get_app_settings?: () => Promise<AppSettings>;
  save_app_settings?: (
    payload: SaveAppSettingsPayload
  ) => Promise<SaveAppSettingsResponse>;
  choose_save_directory?: () => Promise<ChooseDirectoryResponse>;
};

const getPywebviewApi = (): PyWebviewAppSettingsApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewAppSettingsApi } })
    .pywebview?.api;
  return api ?? null;
};

export const getAppSettings = async (): Promise<AppSettings> => {
  const api = getPywebviewApi();
  if (!api?.get_app_settings) {
    return { defaultSaveDir: null };
  }
  return api.get_app_settings();
};

export const saveAppSettings = async (
  payload: SaveAppSettingsPayload
): Promise<SaveAppSettingsResponse> => {
  const api = getPywebviewApi();
  if (!api?.save_app_settings) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.save_app_settings(payload);
};

export const chooseSaveDirectory = async (): Promise<ChooseDirectoryResponse> => {
  const api = getPywebviewApi();
  if (!api?.choose_save_directory) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.choose_save_directory();
};
