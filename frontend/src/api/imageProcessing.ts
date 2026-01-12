export type ProcessImagesAction = "remove_bg" | "split";

export type ProcessImageItem = {
  id: string;
  imageUrl: string;
};

export type ProcessImagesRequest = {
  action: ProcessImagesAction;
  images: ProcessImageItem[];
  rows?: number;
  cols?: number;
};

export type ProcessImageResult = {
  id: string;
  images?: string[];
  error?: string;
};

export type ProcessImagesResponse = {
  ok: boolean;
  action: ProcessImagesAction;
  results: ProcessImageResult[];
  error?: string;
};

type PyWebviewApi = {
  process_images: (payload: ProcessImagesRequest) => Promise<ProcessImagesResponse>;
};

const getPywebviewApi = (): PyWebviewApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewApi } })
    .pywebview?.api;
  return api?.process_images ? api : null;
};

export const processImages = async (
  payload: ProcessImagesRequest
): Promise<ProcessImagesResponse> => {
  const api = getPywebviewApi();
  if (!api) {
    return {
      ok: false,
      action: payload.action,
      results: payload.images.map((item) => ({
        id: item.id,
        error: "pywebview not available",
      })),
      error: "pywebview not available",
    };
  }
  return api.process_images(payload);
};
