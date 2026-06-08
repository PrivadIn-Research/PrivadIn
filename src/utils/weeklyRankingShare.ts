import type { RankedUser } from "../types";
import { formatNumber } from "./format";
import { medalFor } from "./ranking";

const IMAGE_WIDTH = 1080;
const IMAGE_PADDING = 40;
const HEADER_HEIGHT = 220;
const FOOTER_HEIGHT = 74;
const ROW_HEIGHT = 92;
const RANKING_LIMIT = 10;

interface WeeklyRankingShareImageOptions {
  currentUid?: string;
  editionLabel: string;
  emptyLabel: string;
  footerLabel: string;
  fileName: string;
  currentUserLabel: string;
  pointsLabel: string;
  title: string;
  users: RankedUser[];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = "...";
  let truncated = text;

  while (truncated.length > 1 && ctx.measureText(`${truncated}${ellipsis}`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}${ellipsis}`;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to generate ranking image."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

export async function createWeeklyRankingShareFile({
  currentUid,
  editionLabel,
  emptyLabel,
  footerLabel,
  fileName,
  currentUserLabel,
  pointsLabel,
  title,
  users,
}: WeeklyRankingShareImageOptions) {
  const topUsers = [...users].sort((a, b) => a.weeklyRank - b.weeklyRank).slice(0, RANKING_LIMIT);
  const totalRows = Math.max(topUsers.length, 1);
  const imageHeight = HEADER_HEIGHT + IMAGE_PADDING + totalRows * ROW_HEIGHT + FOOTER_HEIGHT;
  const deviceScale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");

  canvas.width = IMAGE_WIDTH * deviceScale;
  canvas.height = imageHeight * deviceScale;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable.");
  }

  ctx.scale(deviceScale, deviceScale);

  const background = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, imageHeight);
  background.addColorStop(0, "#0f172a");
  background.addColorStop(0.55, "#111827");
  background.addColorStop(1, "#1f2937");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, IMAGE_WIDTH, imageHeight);

  const glow = ctx.createRadialGradient(IMAGE_WIDTH - 150, 120, 40, IMAGE_WIDTH - 150, 120, 320);
  glow.addColorStop(0, "rgba(245, 158, 11, 0.35)");
  glow.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, IMAGE_WIDTH, imageHeight);

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.font = "160px sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("🚽", IMAGE_WIDTH - 260, 170);
  ctx.restore();

  ctx.fillStyle = "#facc15";
  ctx.font = "700 28px sans-serif";
  ctx.fillText("PRIVADIN", IMAGE_PADDING, 60);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 64px sans-serif";
  ctx.fillText(title, IMAGE_PADDING, 130);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "500 28px sans-serif";
  ctx.fillText(editionLabel, IMAGE_PADDING, 175);

  const counterText = `${topUsers.length}/${users.length}`;
  ctx.font = "700 28px sans-serif";
  const counterWidth = ctx.measureText(counterText).width + 42;
  const counterX = IMAGE_WIDTH - IMAGE_PADDING - counterWidth;
  drawRoundedRect(ctx, counterX, 46, counterWidth, 50, 25);
  ctx.fillStyle = "rgba(250, 204, 21, 0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(250, 204, 21, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fef3c7";
  ctx.textAlign = "center";
  ctx.fillText(counterText, counterX + counterWidth / 2, 80);
  ctx.textAlign = "start";

  const boardY = HEADER_HEIGHT;
  const boardHeight = imageHeight - HEADER_HEIGHT - 24;
  drawRoundedRect(ctx, IMAGE_PADDING, boardY, IMAGE_WIDTH - IMAGE_PADDING * 2, boardHeight, 36);
  ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (topUsers.length === 0) {
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 36px sans-serif";
    ctx.fillText(emptyLabel, IMAGE_PADDING + 36, boardY + 92);
  }

  topUsers.forEach((user, index) => {
    const rowX = IMAGE_PADDING + 24;
    const rowY = boardY + 24 + index * ROW_HEIGHT;
    const rowWidth = IMAGE_WIDTH - IMAGE_PADDING * 2 - 48;
    const rowHeight = ROW_HEIGHT - 12;
    const isCurrentUser = user.uid === currentUid;

    drawRoundedRect(ctx, rowX, rowY, rowWidth, rowHeight, 28);
    ctx.fillStyle = isCurrentUser ? "rgba(20, 184, 166, 0.18)" : "rgba(255, 255, 255, 0.05)";
    ctx.fill();
    ctx.strokeStyle = isCurrentUser ? "rgba(45, 212, 191, 0.55)" : "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = isCurrentUser ? 3 : 1.5;
    ctx.stroke();

    const medalSize = 52;
    const medalX = rowX + 22;
    const medalY = rowY + (rowHeight - medalSize) / 2;
    drawRoundedRect(ctx, medalX, medalY, medalSize, medalSize, 18);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(medalFor(user.weeklyRank), medalX + medalSize / 2, medalY + 36);

    const rankBadgeX = medalX + medalSize + 18;
    const rankLabel = `#${user.weeklyRank}`;
    ctx.font = "700 22px sans-serif";
    const rankBadgeWidth = ctx.measureText(rankLabel).width + 28;
    drawRoundedRect(ctx, rankBadgeX, rowY + 24, rankBadgeWidth, 30, 15);
    ctx.fillStyle = "rgba(250, 204, 21, 0.15)";
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.fillText(rankLabel, rankBadgeX + rankBadgeWidth / 2, rowY + 46);
    ctx.textAlign = "start";

    const nameX = rankBadgeX + rankBadgeWidth + 18;
    const pointsAreaWidth = 180;
    const nameMaxWidth = rowX + rowWidth - pointsAreaWidth - nameX - 24;
    const nickname = user.nickname?.trim();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 28px sans-serif";
    ctx.fillText(truncateText(ctx, user.name, nameMaxWidth), nameX, rowY + 44);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 20px sans-serif";
    const secondaryLine = nickname || isCurrentUser ? [nickname, isCurrentUser ? currentUserLabel : ""].filter(Boolean).join(" • ") : "";
    ctx.fillText(secondaryLine || " ", nameX, rowY + 70);

    const pointsX = rowX + rowWidth - 24;
    ctx.textAlign = "right";
    ctx.fillStyle = "#facc15";
    ctx.font = "900 30px sans-serif";
    ctx.fillText(formatNumber(user.weeklyPoints), pointsX, rowY + 42);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 18px sans-serif";
    ctx.fillText(pointsLabel, pointsX, rowY + 68);
    ctx.textAlign = "start";
  });

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 20px sans-serif";
  ctx.fillText(footerLabel, IMAGE_PADDING, imageHeight - 30);

  const blob = await canvasToBlob(canvas);
  return new File([blob], fileName, { type: "image/png" });
}

export { RANKING_LIMIT };
