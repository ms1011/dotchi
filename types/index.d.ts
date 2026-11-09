export type Lang = 'ko' | 'en' | 'ja' | 'zh'
export type ShowMode = 'always' | 'working' | 'side'
/** 상태 줄: 다 보여 주기, 퍼센트와 브랜치만, 끄기 */
export type LineMode = 'full' | 'mini' | 'off'
/** git 상태 한 줄의 표시: 수정·추가·삭제·이름 바뀜·새 파일 */
export type GitCode = 'M' | 'A' | 'D' | 'R' | '?'
export type GitFile = { code: GitCode; path: string }
export type GitState = {
  branch: string
  /** push하지 않은 커밋 수. upstream이 없으면 null */
  ahead: number | null
  files: GitFile[]
  /** 커밋하지 않은 변경의 더한 줄·뺀 줄 (git diff --numstat HEAD). 모르면 없음 */
  added?: number
  removed?: number
}
/** 이 세션에서 만들거나 연 아티팩트 */
export type ArtifactLink = { url: string; title: string }

/** 컨텍스트·주간 한도·비용·모델: 상태 줄과 패널 카드의 재료 */
export type Meter = {
  context: { percent: number | null; tokens: number | null; window: number }
  /** 주간 창. 구독이 아니거나 아직 모르면 null */
  week: { percent: number; resetsAt: number | null; emptyAt: number | null } | null
  costUsd: number | null
  model: string | null
}

/** 게이지 단계: 괜찮음·주의·위험 */
export type Level = 'ok' | 'warn' | 'danger'
/** 상태 줄 테마의 모양: 색, 얼굴, 하트·막대 글자, 기호 */
export type Look = {
  /** '#rrggbb'. accent는 'pet'이면 펫 그림에서 뽑은 대표색 */
  colors: { ok: string; warn: string; danger: string; dim: string; accent: string }
  faces: Record<Level, string>
  /** [찬 칸, 빈 칸] */
  hearts: [string, string]
  bar: [string, string]
  symbols: { week: string; tired: string; reset: string; time: string }
}
export type ThemeMeta = {
  format: 1
  id: string
  name: string | Partial<Record<Lang, string>>
  author?: string
  description?: string
}
export type Theme = { meta: ThemeMeta; look: Look; dir: string; origin: Origin }

/** 게이지 기준(%): 이만큼부터 주의(노랑), 이만큼부터 위험(코랄) */
export type Threshold = { warn: number; danger: number }
export type Gauge = { context: Threshold; week: Threshold }

export type RestRule = { hours: number; tokens: number }
export type Settings = {
  character: string
  show: ShowMode
  voice: boolean
  lang: Lang | null
  /** 주간 한도 80/85/90/95/99% 경고 */
  limit: boolean
  /** 긴 작업이 끝나면 데스크톱 알림 */
  notify: boolean
  /** 이만큼(초) 걸린 턴만 알린다 */
  notifyAfterSec: number
  /** 오래 쉬고 큰 대화를 이어갈 때 경고. null이면 끔 */
  rest: RestRule | null
  /** 상태 줄에 무엇을 보일지 */
  line: LineMode
  /** 상태 줄과 패널에 세션 비용 ($) */
  cost: boolean
  /** 배부름·주간 게이지의 주의·위험 기준 */
  gauge: Gauge
  /** 상태 줄 테마 id */
  theme: string
  /** 진화: 주간 리셋 때 1단계로 돌아갈지, 한도가 없는 계정의 주간 달러 예산(null이면 함께한 날 수) */
  grow: GrowRule
}
export type GrowRule = { reset: boolean; budgetUsd: number | null }
/** 행 우선 32×32. 각 칸은 'rrggbb' (#없음, 소문자) 또는 null(투명) */
export type Frame = (string | null)[][]
/** 한 단계의 그림: 멈춘 그림 1장과 움직임 1~5컷 */
export type StageArt = { idle: Frame; work: Frame[] }
/** idle·work는 1단계. stages는 선택: 2·3단계 (빠진 단계는 바로 아래 단계 그림) */
export type Art = { width: 32; height: 32; idle: Frame; work: Frame[]; stages?: Partial<Record<'2' | '3', StageArt>> }
export type LineSet = { spinner: string[]; idle: string[]; ending: string[] }
export type PackLines = Partial<Record<Lang, LineSet>>
export type PackMeta = {
  format: 1
  id: string
  name: string | Partial<Record<Lang, string>>
  author?: string
  description?: string
  frameMs?: number
  /** 상태 줄 맨 앞에 서는 이모지 하나 (도토리, 대나무…) */
  icon?: string
}
export type Origin = 'builtin' | 'user'
export type Character = { meta: PackMeta; art: Art; lines: PackLines; dir: string; origin: Origin }

declare module 'claude-code' {
  interface PluginState {
    dotchi: {
      settings: Settings
      tick: number
      working: boolean
      paneShown: boolean
      /** 잠깐 띄우는 경고 말풍선. until(ms)이 지나면 사라진다 */
      alert: { text: string; until: number } | null
      /** 옆 패널·상태 줄에 보여 줄 git 상태. 저장소가 아니면 null */
      git: GitState | null
      /** 이 세션에서 만들거나 연 아티팩트, 최근 것이 앞 */
      artifacts: ArtifactLink[]
      /** 이 세션에서 Claude가 고친 파일(저장소 기준 경로) */
      touched: string[]
      /** 컨텍스트·주간 한도·비용·모델 (상태 줄과 패널 카드) */
      meter: Meter | null
      /** 분 단위 시계: 패널의 지난 시간을 1분마다 다시 그리게 */
      minute: number
    }
  }
}
