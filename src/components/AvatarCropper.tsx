import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AVATAR_CROP_FRAME_SIZE,
  buildCroppedAvatarFile,
  clampAvatarOffsets,
  computeAvatarBaseScale,
} from "../utils/avatarUpload";

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.6;
const FRAME_SIZE = AVATAR_CROP_FRAME_SIZE;

export function AvatarCropper({
  imageUrl,
  onApply,
  onCancel,
}: {
  imageUrl: string;
  onApply: (file: File) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation("profile");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const scale = useMemo(() => {
    if (!imageSize) return 1;
    return computeAvatarBaseScale(imageSize.width, imageSize.height, FRAME_SIZE) * zoom;
  }, [imageSize, zoom]);

  const renderedSize = useMemo(() => {
    if (!imageSize) return { width: FRAME_SIZE, height: FRAME_SIZE };
    return {
      width: imageSize.width * scale,
      height: imageSize.height * scale,
    };
  }, [imageSize, scale]);

  useEffect(() => {
    if (!imageSize) return;
    setOffset((current) =>
      clampAvatarOffsets({
        frameSize: FRAME_SIZE,
        imageHeight: imageSize.height,
        imageWidth: imageSize.width,
        offsetX: current.x,
        offsetY: current.y,
        scale,
      }),
    );
  }, [imageSize, scale]);

  async function handleApply() {
    if (!imageRef.current) return;

    setIsApplying(true);
    try {
      const file = await buildCroppedAvatarFile({
        image: imageRef.current,
        offsetX: offset.x,
        offsetY: offset.y,
        zoom,
      });
      await onApply(file);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line/10 bg-panel-strong/40 p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-sm font-bold text-accent-strong">{t("avatarCropTitle")}</p>
        <p className="mt-1 text-sm text-fg-muted">{t("avatarCropHint")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <div
            className="relative mx-auto h-64 w-64 touch-none overflow-hidden rounded-[32px] border border-line/10 bg-canvas-elevated/70 shadow-panel"
            onPointerDown={(event) => {
              if (!imageSize) return;
              dragStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                x: offset.x,
                y: offset.y,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current;
              if (!dragState || dragState.pointerId !== event.pointerId || !imageSize) return;

              const nextOffset = clampAvatarOffsets({
                frameSize: FRAME_SIZE,
                imageHeight: imageSize.height,
                imageWidth: imageSize.width,
                offsetX: dragState.x + (event.clientX - dragState.startX),
                offsetY: dragState.y + (event.clientY - dragState.startY),
                scale,
              });

              setOffset(nextOffset);
            }}
            onPointerUp={(event) => {
              if (dragStateRef.current?.pointerId === event.pointerId) {
                dragStateRef.current = null;
              }
            }}
            onPointerCancel={(event) => {
              if (dragStateRef.current?.pointerId === event.pointerId) {
                dragStateRef.current = null;
              }
            }}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              className="pointer-events-none absolute select-none object-cover"
              draggable={false}
              onLoad={(event) => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              style={{
                height: renderedSize.height,
                left: FRAME_SIZE / 2 - renderedSize.width / 2 + offset.x,
                top: FRAME_SIZE / 2 - renderedSize.height / 2 + offset.y,
                width: renderedSize.width,
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_92px,rgba(15,23,42,0.6)_93px)]" />
            <div className="pointer-events-none absolute inset-[18px] rounded-full border-2 border-white/80" />
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("avatarCropZoom")}</span>
            <input
              className="w-full accent-accent"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-bold text-fg-soft">{t("avatarCropPreview")}</p>
            <div className="relative h-36 w-36 overflow-hidden rounded-full border border-line/10 bg-canvas-elevated/70">
              <img
                src={imageUrl}
                alt=""
                className="pointer-events-none absolute select-none object-cover"
                draggable={false}
                style={{
                  height: renderedSize.height,
                  left: FRAME_SIZE / 2 - renderedSize.width / 2 + offset.x - (FRAME_SIZE - 144) / 2,
                  top: FRAME_SIZE / 2 - renderedSize.height / 2 + offset.y - (FRAME_SIZE - 144) / 2,
                  width: renderedSize.width,
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!imageSize || isApplying}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-black text-accent-fg transition hover:bg-accent-strong disabled:opacity-60"
            >
              {isApplying ? <Loader2 size={16} className="animate-spin" /> : null}
              {t("avatarCropConfirm")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isApplying}
              className="rounded-2xl border border-line/10 bg-panel px-4 py-3 text-sm font-black text-fg transition hover:bg-panel-strong disabled:opacity-60"
            >
              {t("avatarCropCancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
