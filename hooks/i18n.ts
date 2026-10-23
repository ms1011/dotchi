import type { Lang } from '../types'
import { isLang } from './packs'

/** 컴퓨터 언어 설정(대사·이름에 쓴다): LC_ALL → LC_MESSAGES → LANG 앞 두 글자. 네 언어가 아니면 영어 */
export const detectLang = (env: { LC_ALL?: string; LC_MESSAGES?: string; LANG?: string }): Lang => {
  const raw = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  const code = raw.slice(0, 2).toLowerCase()
  return isLang(code) ? code : 'en'
}

/**
 * 안내 문구(설정 표시, 오류, 사용법)는 영어 하나로 둔다.
 * /dotchi lang 은 캐릭터 대사와 이름의 언어만 바꾼다
 */
export const MESSAGES = {
  status: 'Now: {name} · Shown: {show} · One-liner after answers: {voice}',
  changed: 'Done. {status}',
  usage:
    'Usage: /dotchi [character] · list · hatch [image path] · edit <character> · install <zip, folder or site id> · export <character> [--with-source] · share <character> [--as <id>] · unshare <character> · remove <character> · show [always|working|side] · voice [on|off] · lang [ko|en|ja|zh|auto]',
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
  notOnSite: "No pet called '{id}' on the dotchi site",
  siteUnreachable: "Couldn't reach the dotchi site. Check your connection and try again",
  exported: 'Pack created: {path}',
  exportFailed: "Couldn't create the pack. Python 3 is required",
  removed: 'Removed {id}',
  ghMissing: 'Sharing needs the GitHub CLI (gh). Install it from https://cli.github.com, run gh auth login, then try again',
  ghLoggedOut: "gh isn't logged in. Run gh auth login, then try again",
  idTaken: "'{id}' is already taken on the dotchi site. Try /dotchi share {target} --as {suggestion}",
  asInvalid: "'{id}' can't be an id: use lowercase letters, digits and -, up to 32 characters",
  asExists: "You already have a character called '{id}'",
  shareFailed: "Couldn't open the share issue: {reason}",
  bundleFailed: "couldn't bundle the pack. Python 3 is required",
  shared: 'Sent {name} ({id}) to the dotchi site. The check posts its result there in a minute: {issue}\nPage: {page}',
  unshareRequested: 'Asked to take down {id}. The result will be posted here: {issue}',
  cannotRemoveBuiltin: "{id} is built in and can't be removed",
}

export type MessageKey = keyof typeof MESSAGES

/** 사용자에게 보이는 안내 문구. {이름} 자리를 vars로 채운다 */
export const t = (key: MessageKey, vars: Record<string, string> = {}): string =>
  MESSAGES[key].replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)

/** Claude에게 사용자와 어떤 언어로 말하라고 할 때 쓰는 이름 */
export const LANG_NAMES: Record<Lang, string> = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Simplified Chinese' }
