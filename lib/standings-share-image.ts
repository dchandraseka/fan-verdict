import type { StandingRow } from './types';

const STANDINGS_SHARE_IMAGE_WIDTH = 1080;
const STANDINGS_SHARE_IMAGE_MAX_ROWS = 50;

type StandingsShareImageOptions = {
  standings: StandingRow[];
  title: string;
  subtitle?: string;
};

const drawRoundedRectangle = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
};

const truncateCanvasText = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (context.measureText(text).width <= maxWidth) return text;

  const ellipsis = '...';
  let truncated = text;

  while (truncated.length > 0 && context.measureText(`${truncated}${ellipsis}`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated.trimEnd()}${ellipsis}`;
};

const drawCanvasText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    align?: CanvasTextAlign;
    color?: string;
    font?: string;
    maxWidth?: number;
  } = {},
) => {
  context.fillStyle = options.color ?? '#0f172a';
  context.font = options.font ?? '400 28px Arial, sans-serif';
  context.textAlign = options.align ?? 'left';
  context.textBaseline = 'middle';
  context.fillText(options.maxWidth ? truncateCanvasText(context, text, options.maxWidth) : text, x, y);
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Unable to create standings image.'));
    }, 'image/png');
  });

export const slugifyFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'fanverdict';

export const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

export const createStandingsShareImage = async ({ standings, title, subtitle = 'Player Standings' }: StandingsShareImageOptions) => {
  const rows = standings.slice(0, STANDINGS_SHARE_IMAGE_MAX_ROWS);
  const hiddenRowCount = Math.max(standings.length - rows.length, 0);
  const tableHeaderHeight = 54;
  const rowHeight = 68;
  const hiddenNoticeHeight = hiddenRowCount > 0 ? 48 : 0;
  const footerHeight = 52;
  const tableTop = 320;
  const cardMargin = 40;
  const imageHeight = Math.max(
    720,
    tableTop + tableHeaderHeight + rows.length * rowHeight + hiddenNoticeHeight + footerHeight + cardMargin,
  );
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Unable to prepare standings image.');

  canvas.width = STANDINGS_SHARE_IMAGE_WIDTH;
  canvas.height = imageHeight;

  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#ffffff';
  drawRoundedRectangle(context, cardMargin, cardMargin, canvas.width - cardMargin * 2, canvas.height - cardMargin * 2, 28);

  context.fillStyle = '#2563eb';
  drawRoundedRectangle(context, cardMargin, cardMargin, canvas.width - cardMargin * 2, 18, 9);

  const contentLeft = 80;
  const contentRight = canvas.width - 80;
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  const leader = standings[0] ?? null;

  drawCanvasText(context, 'FanVerdict', contentLeft, 98, {
    color: '#2563eb',
    font: '800 30px Arial, sans-serif',
  });
  drawCanvasText(context, generatedAt, contentRight, 98, {
    align: 'right',
    color: '#64748b',
    font: '500 24px Arial, sans-serif',
  });
  drawCanvasText(context, title, contentLeft, 158, {
    font: '800 46px Arial, sans-serif',
    maxWidth: 760,
  });
  drawCanvasText(context, subtitle, contentLeft, 212, {
    color: '#475569',
    font: '700 30px Arial, sans-serif',
    maxWidth: 760,
  });

  context.fillStyle = '#eff6ff';
  drawRoundedRectangle(context, contentLeft, 244, 250, 48, 24);
  drawCanvasText(context, `${standings.length} player${standings.length === 1 ? '' : 's'}`, contentLeft + 22, 268, {
    color: '#1d4ed8',
    font: '700 23px Arial, sans-serif',
  });

  if (leader) {
    context.fillStyle = '#f1f5f9';
    drawRoundedRectangle(context, contentLeft + 270, 244, 560, 48, 24);
    drawCanvasText(context, `Leader: ${leader.display_name} (${leader.total_points} pts)`, contentLeft + 292, 268, {
      color: '#334155',
      font: '700 23px Arial, sans-serif',
      maxWidth: 510,
    });
  }

  const tableLeft = contentLeft;
  const tableRight = contentRight;
  const tableWidth = tableRight - tableLeft;
  const participantColumnX = tableLeft + 150;
  const pointsColumnX = tableLeft + 650;
  const correctColumnX = tableLeft + 800;
  const accuracyColumnX = tableRight - 24;
  const participantMaxWidth = pointsColumnX - participantColumnX - 56;

  context.fillStyle = '#f8fafc';
  drawRoundedRectangle(context, tableLeft, tableTop, tableWidth, tableHeaderHeight, 14);
  drawCanvasText(context, 'Rank', tableLeft + 24, tableTop + tableHeaderHeight / 2, {
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Participant', participantColumnX, tableTop + tableHeaderHeight / 2, {
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Points', pointsColumnX, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Correct', correctColumnX, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Accuracy', accuracyColumnX, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });

  rows.forEach((row, index) => {
    const y = tableTop + tableHeaderHeight + index * rowHeight;
    const midpoint = y + rowHeight / 2;

    context.fillStyle = index === 0 ? '#eff6ff' : index % 2 === 0 ? '#ffffff' : '#f8fafc';
    context.fillRect(tableLeft, y, tableWidth, rowHeight);

    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(tableLeft, y + rowHeight);
    context.lineTo(tableRight, y + rowHeight);
    context.stroke();

    drawCanvasText(context, `#${index + 1}`, tableLeft + 24, midpoint, {
      font: '800 24px Arial, sans-serif',
    });
    drawCanvasText(context, row.display_name, participantColumnX, midpoint, {
      font: '700 26px Arial, sans-serif',
      maxWidth: participantMaxWidth,
    });
    drawCanvasText(context, String(row.total_points), pointsColumnX, midpoint, {
      align: 'right',
      color: '#1d4ed8',
      font: '900 30px Arial, sans-serif',
    });
    drawCanvasText(context, String(row.correct_picks), correctColumnX, midpoint, {
      align: 'right',
      color: '#334155',
      font: '700 24px Arial, sans-serif',
    });
    drawCanvasText(context, `${row.accuracy}%`, accuracyColumnX, midpoint, {
      align: 'right',
      color: '#334155',
      font: '700 24px Arial, sans-serif',
    });
  });

  const noticeTop = tableTop + tableHeaderHeight + rows.length * rowHeight;

  if (hiddenRowCount > 0) {
    drawCanvasText(context, `Top ${rows.length} shown. Open the dashboard for ${hiddenRowCount} more.`, tableLeft + 24, noticeTop + 24, {
      color: '#64748b',
      font: '600 22px Arial, sans-serif',
    });
  }

  return canvasToPngBlob(canvas);
};
