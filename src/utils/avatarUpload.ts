const MB = 1024 * 1024;

export const AVATAR_MAX_FILE_SIZE = MB;
export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_CROP_FRAME_SIZE = 256;
export const AVATAR_OUTPUT_SIZE = 512;

export type AvatarFileValidationError = "invalid_type" | "too_large";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export avatar."));
        return;
      }

      resolve(blob);
    }, "image/jpeg", quality);
  });
}

export function validateAvatarFile(file: File): AvatarFileValidationError | null {
  if (!AVATAR_ACCEPTED_TYPES.includes(file.type as (typeof AVATAR_ACCEPTED_TYPES)[number])) {
    return "invalid_type";
  }

  if (file.size > AVATAR_MAX_FILE_SIZE) {
    return "too_large";
  }

  return null;
}

export function computeAvatarBaseScale(imageWidth: number, imageHeight: number, frameSize: number) {
  return Math.max(frameSize / imageWidth, frameSize / imageHeight);
}

export function clampAvatarOffsets({
  frameSize,
  imageHeight,
  imageWidth,
  offsetX,
  offsetY,
  scale,
}: {
  frameSize: number;
  imageHeight: number;
  imageWidth: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}) {
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const maxOffsetX = Math.max(0, (renderedWidth - frameSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - frameSize) / 2);

  return {
    x: clamp(offsetX, -maxOffsetX, maxOffsetX),
    y: clamp(offsetY, -maxOffsetY, maxOffsetY),
  };
}

export async function buildCroppedAvatarFile({
  frameSize = AVATAR_CROP_FRAME_SIZE,
  image,
  offsetX,
  offsetY,
  outputSize = AVATAR_OUTPUT_SIZE,
  zoom,
}: {
  frameSize?: number;
  image: HTMLImageElement;
  offsetX: number;
  offsetY: number;
  outputSize?: number;
  zoom: number;
}) {
  const imageWidth = image.naturalWidth;
  const imageHeight = image.naturalHeight;
  const baseScale = computeAvatarBaseScale(imageWidth, imageHeight, frameSize);
  const scale = baseScale * zoom;
  const cropSize = frameSize / scale;
  const sourceX = clamp(imageWidth / 2 - cropSize / 2 - offsetX / scale, 0, imageWidth - cropSize);
  const sourceY = clamp(imageHeight / 2 - cropSize / 2 - offsetY / scale, 0, imageHeight - cropSize);
  const canvas = document.createElement("canvas");

  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);

  const qualities = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52];

  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= AVATAR_MAX_FILE_SIZE) {
      return new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
    }
  }

  throw new Error("Avatar image exceeds max size after processing.");
}
