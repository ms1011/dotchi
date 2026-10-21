export type BandLayout = 'large' | 'small' | 'text'

/** 전체 화면이 아니면 maxRows는 터미널 높이: 입력창·스피너·답변 자리를 이만큼 남긴다 */
const HEADROOM = 24

/**
 * 큰 그림은 16줄 + 말풍선 자리, 작은 그림은 8줄. 터미널이 아니면 도트를 못 그린다.
 * 전체 화면에서는 maxRows가 띠에 남은 줄 수이고, 아니면 터미널 전체 높이다.
 */
export const bandLayout = (
  maxRows: number,
  bodyColumns: number,
  surface: string,
  isFullscreen: boolean,
): BandLayout => {
  if (surface !== 'terminal') return 'text'
  const rows = isFullscreen ? maxRows : maxRows - HEADROOM
  if (rows >= 16 && bodyColumns >= 48) return 'large'
  if (rows >= 0 && maxRows >= 8 && bodyColumns >= 28) return 'small'
  return 'text'
}

/** 옆 패널: 말풍선(3줄)과 꼬리(1줄)를 위에 두고 아래에 그림 */
export const paneLayout = (bodyColumns: number, bodyRows: number, surface: string): BandLayout => {
  if (surface !== 'terminal') return 'text'
  if (bodyColumns >= 34 && bodyRows >= 22) return 'large'
  if (bodyColumns >= 18 && bodyRows >= 14) return 'small'
  return 'text'
}
