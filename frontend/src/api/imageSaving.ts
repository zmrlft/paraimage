export type SaveImageItem = {
  id: string;
  imageUrl: string;
  filename?: string;
};

export type SaveImagesRequest = {
  images: SaveImageItem[];
  directory?: string;
};

export type SaveImagesResult = {
  id: string;
  path?: string;
  error?: string;
};

export type SaveImagesResponse = {
  ok: boolean;
  directory?: string;
  results: SaveImagesResult[];
  error?: string;
};

type PyWebviewApi = {
  save_images: (payload: SaveImagesRequest) => Promise<SaveImagesResponse>;
};

const getPywebviewApi = (): PyWebviewApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewApi } })
    .pywebview?.api;
  return api?.save_images ? api : null;
};

export const saveImages = async (
  payload: SaveImagesRequest
): Promise<SaveImagesResponse> => {
  const api = getPywebviewApi();
  if (!api) {
    return {
      ok: false,
      results: payload.images.map((item) => ({
        id: item.id,
        error: "pywebview not available",
      })),
      error: "pywebview not available",
    };
  }
  return api.save_images(payload);
};
