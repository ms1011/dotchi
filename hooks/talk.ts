import type { Lang } from '../types'

/**
 * 펫이 하는 말(말풍선, 데스크톱 알림)과 펫 옆에 뜨는 짧은 글.
 * 명령 응답(MESSAGES)과 달리 펫 대사처럼 /dotchi lang을 따른다
 */
const KO = {
  limit: '주간 한도 {percent}%! ({reset} 리셋)',
  limitBare: '주간 한도 {percent}%!',
  limitForecast: '주간 한도 {percent}%! 지금 속도면 {empty}쯤 바닥나요 ({reset} 리셋)',
  permission: '허락이 필요해요!',
  done: '다 했어요! ({duration})',
  rest: '오랜만이에요! 대화가 커서({tokens}) 이어가면 주간 한도가 꽤 닳아요. 새로 시작하려면 /clear',
  noChannel: '알림이 안 가고 있어요. /dotchi notify fix 로 고칠까요?',
  clean: '깨끗해요',
  more: '+{n}개 더',
  files: '파일 {n}개',
  gaugeFull: '배부름',
  gaugeWeek: '주간',
  stuffed: '배가 꽉 찼어요 ({percent}%)… /compact 할까요?',
  evolved: '{name}이(가) {stage}단계로 자랐어요!',
  welcome: '돌아왔군요! 기다리고 있었어요',
  pat1: '헤헤, 좋아요',
  pat2: '더 쓰다듬어 주세요!',
  pat3: '기분 최고!',
  stageLabel: '{n}단계',
}

export type TalkKey = keyof typeof KO

export const TALK: Record<Lang, Record<TalkKey, string>> = {
  ko: KO,
  en: {
    limit: 'Weekly limit at {percent}%! (resets {reset})',
    limitBare: 'Weekly limit at {percent}%!',
    limitForecast: 'Weekly limit at {percent}%! At this pace it runs out around {empty} (resets {reset})',
    permission: 'I need your OK!',
    done: 'All done! ({duration})',
    rest: "Welcome back! This chat is big ({tokens}), so picking it up again eats a good chunk of the weekly limit. /clear starts fresh",
    noChannel: "Notifications aren't getting through. Fix it with /dotchi notify fix?",
    clean: 'All clean',
    more: '+{n} more',
    files: '{n} files',
    gaugeFull: 'Full',
    gaugeWeek: 'Week',
    stuffed: "I'm stuffed ({percent}%)… /compact?",
    evolved: '{name} grew to stage {stage}!',
    welcome: "You're back! I've been waiting",
    pat1: 'Hehe, that feels nice',
    pat2: 'More pats, please!',
    pat3: 'Best mood ever!',
    stageLabel: 'Stage {n}',
  },
  ja: {
    limit: '週の上限 {percent}%！（{reset} リセット）',
    limitBare: '週の上限 {percent}%！',
    limitForecast: '週の上限 {percent}%！このペースだと {empty} ごろ使い切りそう（{reset} リセット）',
    permission: '許可がほしいです！',
    done: 'できました！（{duration}）',
    rest: 'おかえりなさい！会話が大きいので（{tokens}）続けると週の上限がけっこう減ります。新しく始めるなら /clear',
    noChannel: '通知が届いていません。/dotchi notify fix で直しますか？',
    clean: 'きれいです',
    more: 'ほか {n} 件',
    files: 'ファイル {n} 件',
    gaugeFull: '満腹',
    gaugeWeek: '週',
    stuffed: 'おなかいっぱい（{percent}%）… /compact しますか？',
    evolved: '{name}が{stage}段階に育ちました！',
    welcome: 'おかえり！待ってたよ',
    pat1: 'えへへ、うれしい',
    pat2: 'もっとなでて！',
    pat3: 'ごきげん！',
    stageLabel: '{n}段階',
  },
  zh: {
    limit: '每周额度已用 {percent}%！（{reset} 重置）',
    limitBare: '每周额度已用 {percent}%！',
    limitForecast: '每周额度已用 {percent}%！照这个速度 {empty} 左右会用完（{reset} 重置）',
    permission: '需要你的允许！',
    done: '做完啦！（{duration}）',
    rest: '欢迎回来！这段对话很长（{tokens}），继续下去会消耗不少每周额度。想重新开始就 /clear',
    noChannel: '通知没有发出去。用 /dotchi notify fix 修好吗？',
    clean: '干干净净',
    more: '还有 {n} 个',
    files: '{n} 个文件',
    gaugeFull: '饱腹',
    gaugeWeek: '每周',
    stuffed: '吃得好撑（{percent}%）… 要 /compact 吗？',
    evolved: '{name}成长到第{stage}阶段了！',
    welcome: '你回来啦！我一直在等你',
    pat1: '嘿嘿，好舒服',
    pat2: '再摸摸我！',
    pat3: '心情超好！',
    stageLabel: '第{n}阶段',
  },
}

/** 펫의 말. {이름} 자리를 vars로 채운다 */
export const say = (lang: Lang, key: TalkKey, vars: Record<string, string> = {}): string =>
  TALK[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)

const DAYS: Record<Lang, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 이 컴퓨터 시간대의 요일과 시:분 */
export const when = (lang: Lang, at: number): string => {
  const date = new Date(at)
  return `${DAYS[lang][date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const UNITS: Record<Lang, { h: string; m: string; s: string; gap: string }> = {
  ko: { h: '시간', m: '분', s: '초', gap: ' ' },
  en: { h: 'h', m: 'm', s: 's', gap: ' ' },
  ja: { h: '時間', m: '分', s: '秒', gap: '' },
  zh: { h: '小时', m: '分', s: '秒', gap: '' },
}

/** 걸린 시간: 1시간이 넘으면 시·분, 아니면 분·초 */
export const duration = (lang: Lang, ms: number): string => {
  const u = UNITS[lang]
  const total = Math.max(0, Math.round(ms / 1000))
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
  const parts = h > 0 ? [`${h}${u.h}`, `${m}${u.m}`] : m > 0 ? [`${m}${u.m}`, `${s}${u.s}`] : [`${s}${u.s}`]
  return parts.join(u.gap)
}

/** 토큰 수를 짧게: 180k, 1.2M */
export const tokens = (n: number): string => {
  if (n >= 1000000) return `${(Math.round(n / 100000) / 10).toString()}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}
