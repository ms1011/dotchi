import type { Lang } from '../types'
import { isLang } from './packs'

/** 컴퓨터 언어 설정: LC_ALL → LC_MESSAGES → LANG 앞 두 글자. 네 언어가 아니면 영어 */
export const detectLang = (env: { LC_ALL?: string; LC_MESSAGES?: string; LANG?: string }): Lang => {
  const raw = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  const code = raw.slice(0, 2).toLowerCase()
  return isLang(code) ? code : 'en'
}

const ko = {
  status: '지금: {name} · 보이는 때: {show} · 답변 끝 한마디: {voice}',
  changed: '바꿨어요. {status}',
  usage:
    '사용법: /dotchi [캐릭터] · list · hatch [그림 경로] · edit <캐릭터> · install <zip 또는 폴더> · export <캐릭터> [--with-source] · remove <캐릭터> · show [always|working|side] · voice [on|off] · lang [ko|en|ja|zh|auto]',
  unknownCharacter: "'{arg}' 캐릭터가 없어요. /dotchi list로 목록을 볼 수 있어요",
  listItem: '{mark}{id} ({name}) · {origin}',
  'origin.builtin': '기본',
  'origin.user': '내 캐릭터',
  'show.always': '항상',
  'show.working': '일할 때만',
  'show.side': '옆 패널',
  voiceOn: '켜짐',
  voiceOff: '꺼짐',
  hatchStarted: '부화를 시작해요. Claude가 이어서 물어볼게요',
  editStarted: '{name} 다듬기를 시작해요. Claude가 이어서 물어볼게요',
  promptMissing: '{file}을(를) 읽지 못했어요',
  installed: '{name}({id})을(를) 설치했어요. /dotchi {id}로 바꿀 수 있어요',
  installedRenamed: '같은 id가 있어서 {id}(으)로 설치했어요. /dotchi {id}로 바꿀 수 있어요',
  installFailed: '설치하지 못했어요: {reason}',
  'reason.notFound': '경로를 찾을 수 없어요 ({path})',
  'reason.noPack': 'dotchi.json이 든 팩 폴더를 찾지 못했어요',
  'reason.badPack': '팩 파일이 깨졌어요 ({file})',
  'reason.unzip': 'zip을 풀지 못했어요. Python 3가 필요해요',
  exported: '팩을 만들었어요: {path}',
  exportFailed: '팩을 만들지 못했어요. Python 3가 필요해요',
  removed: '{id}을(를) 지웠어요',
  cannotRemoveBuiltin: '{id}은(는) 기본 캐릭터라 지울 수 없어요',
}

export type MessageKey = keyof typeof ko

const en: Record<MessageKey, string> = {
  status: 'Now: {name} · Shown: {show} · One-liner after answers: {voice}',
  changed: 'Done. {status}',
  usage:
    'Usage: /dotchi [character] · list · hatch [image path] · edit <character> · install <zip or folder> · export <character> [--with-source] · remove <character> · show [always|working|side] · voice [on|off] · lang [ko|en|ja|zh|auto]',
  unknownCharacter: "No character '{arg}'. See /dotchi list",
  listItem: '{mark}{id} ({name}) · {origin}',
  'origin.builtin': 'built-in',
  'origin.user': 'mine',
  'show.always': 'always',
  'show.working': 'while working',
  'show.side': 'side panel',
  voiceOn: 'on',
  voiceOff: 'off',
  hatchStarted: 'Starting to hatch. Claude will ask you a few things next',
  editStarted: 'Starting to touch up {name}. Claude will ask you a few things next',
  promptMissing: "Couldn't read {file}",
  installed: 'Installed {name} ({id}). Switch with /dotchi {id}',
  installedRenamed: 'That id was taken, so it was installed as {id}. Switch with /dotchi {id}',
  installFailed: "Couldn't install: {reason}",
  'reason.notFound': 'path not found ({path})',
  'reason.noPack': 'no pack folder with dotchi.json found',
  'reason.badPack': 'a pack file is broken ({file})',
  'reason.unzip': "couldn't unzip it. Python 3 is required",
  exported: 'Pack created: {path}',
  exportFailed: "Couldn't create the pack. Python 3 is required",
  removed: 'Removed {id}',
  cannotRemoveBuiltin: "{id} is built in and can't be removed",
}

const ja: Record<MessageKey, string> = {
  status: '現在: {name} · 表示: {show} · 返答のあとの一言: {voice}',
  changed: '変更しました。{status}',
  usage:
    '使い方: /dotchi [キャラクター] · list · hatch [画像のパス] · edit <キャラクター> · install <zip またはフォルダー> · export <キャラクター> [--with-source] · remove <キャラクター> · show [always|working|side] · voice [on|off] · lang [ko|en|ja|zh|auto]',
  unknownCharacter: "「{arg}」というキャラクターはいません。/dotchi list で一覧を見られます",
  listItem: '{mark}{id} ({name}) · {origin}',
  'origin.builtin': '標準',
  'origin.user': 'マイキャラ',
  'show.always': '常に',
  'show.working': '作業中のみ',
  'show.side': 'サイドパネル',
  voiceOn: 'オン',
  voiceOff: 'オフ',
  hatchStarted: 'ふ化を始めます。続けて Claude が質問します',
  editStarted: '{name} の手直しを始めます。続けて Claude が質問します',
  promptMissing: '{file} を読み込めませんでした',
  installed: '{name}（{id}）をインストールしました。/dotchi {id} で切り替えられます',
  installedRenamed: '同じ id があったため {id} としてインストールしました。/dotchi {id} で切り替えられます',
  installFailed: 'インストールできませんでした: {reason}',
  'reason.notFound': 'パスが見つかりません（{path}）',
  'reason.noPack': 'dotchi.json の入ったパックフォルダーが見つかりません',
  'reason.badPack': 'パックのファイルが壊れています（{file}）',
  'reason.unzip': 'zip を展開できませんでした。Python 3 が必要です',
  exported: 'パックを作成しました: {path}',
  exportFailed: 'パックを作成できませんでした。Python 3 が必要です',
  removed: '{id} を削除しました',
  cannotRemoveBuiltin: '{id} は標準キャラクターなので削除できません',
}

const zh: Record<MessageKey, string> = {
  status: '当前: {name} · 显示: {show} · 回答后的一句话: {voice}',
  changed: '已更改。{status}',
  usage:
    '用法: /dotchi [角色] · list · hatch [图片路径] · edit <角色> · install <zip 或文件夹> · export <角色> [--with-source] · remove <角色> · show [always|working|side] · voice [on|off] · lang [ko|en|ja|zh|auto]',
  unknownCharacter: '没有名为“{arg}”的角色。可用 /dotchi list 查看列表',
  listItem: '{mark}{id} ({name}) · {origin}',
  'origin.builtin': '内置',
  'origin.user': '我的角色',
  'show.always': '始终',
  'show.working': '仅工作时',
  'show.side': '侧边面板',
  voiceOn: '开',
  voiceOff: '关',
  hatchStarted: '开始孵化。接下来 Claude 会问你几个问题',
  editStarted: '开始修改 {name}。接下来 Claude 会问你几个问题',
  promptMissing: '无法读取 {file}',
  installed: '已安装 {name}（{id}）。用 /dotchi {id} 切换',
  installedRenamed: '已有相同的 id，所以安装为 {id}。用 /dotchi {id} 切换',
  installFailed: '无法安装: {reason}',
  'reason.notFound': '找不到路径（{path}）',
  'reason.noPack': '找不到包含 dotchi.json 的角色包文件夹',
  'reason.badPack': '角色包文件已损坏（{file}）',
  'reason.unzip': '无法解压 zip。需要 Python 3',
  exported: '已创建角色包: {path}',
  exportFailed: '无法创建角色包。需要 Python 3',
  removed: '已删除 {id}',
  cannotRemoveBuiltin: '{id} 是内置角色，无法删除',
}

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { ko, en, ja, zh }

/** 사용자에게 보이는 문구. {이름} 자리를 vars로 채운다 */
export const t = (lang: Lang, key: MessageKey, vars: Record<string, string> = {}): string =>
  MESSAGES[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)

/** Claude에게 사용자와 어떤 언어로 말하라고 할 때 쓰는 이름 */
export const LANG_NAMES: Record<Lang, string> = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Simplified Chinese' }
