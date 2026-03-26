export const RESOLUTIONS: Record<string, { scale: number; width: number; height: number }> = {
  hd: { scale: 1, width: 1280, height: 720 },
  fhd: { scale: 2, width: 1920, height: 1080 },
  "2k": { scale: 3, width: 2560, height: 1440 },
  "4k": { scale: 4, width: 3840, height: 2160 },
  "5k": { scale: 5, width: 5120, height: 2880 },
};

export const DEFAULT_RESOLUTION = "2k";
export const RESOLUTION_KEYS = Object.keys(RESOLUTIONS);
