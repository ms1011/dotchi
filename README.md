<div align="center">

<img src="assets/squirrel.gif" alt="Squirrel dotchi wagging its tail" width="200"> <img src="assets/turtle.gif" alt="Turtle dotchi sprinting" width="200">

# dotchi

**Hatch a pixel-art pet from any picture and keep it beside you in Claude Code.**

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

---

dotchi is a mod for [Claude Code](https://docs.claude.com/en/docs/claude-code). Your pet lives in the terminal next to your conversation. It moves while Claude works, talks in a comic speech bubble, swaps the spinner word for its own lines, and can add a one-liner after each answer.

<p align="center">
  <img src="assets/screen-band.png" alt="The squirrel above the prompt, saying 'Gathering acorns…' while Claude works" width="720">
</p>

## Features

- 🥚 **Hatch your own pet.** Give it any picture. Image processing turns it into 32×32 pixel art, then Claude touches it up, asks for a name, a personality and which parts should move, animates those parts and writes its lines. Nothing is saved until you approve.
- 🎞️ **Real pixel animation.** Arms, legs, ears, tails, wheels: the parts you choose move, not just the whole picture.
- 💬 **It talks.** A comic speech bubble, its own spinner lines while Claude works, and an optional one-liner after each answer.
- 🪟 **Above the prompt or in a side panel.** Keep your pet in a panel on the right while answers use the rest of the screen.
- 📦 **Share packs.** Every character is a small pack. Share it on [the dotchi pets site](https://ms1011.github.io/dotchi-packs) with one command, or export it as a zip.
- 🌏 **Lines in four languages.** Your pet can talk in Korean, English, Japanese or Simplified Chinese. Command messages are in English.
- 🐿️🐢 **Two pets to start with:** a squirrel hugging an acorn, and a turtle that turns out to be very fast.

<p align="center">
  <img src="assets/screen-side.png" alt="The turtle sprinting in a side panel while a poem is written on the left" width="820">
</p>

## Install

In Claude Code:

```
/plugin install dotchi --marketplace ms1011/dotchi
```

Answer `y` to add the marketplace and pick the user scope. Or from a shell:

```sh
claude plugin install dotchi --marketplace ms1011/dotchi
```

**Requirements**

- Claude Code with mods (v2.1.306 or later)
- Python 3 for hatching and for zip packs. The first hatch installs OpenCV, numpy and Pillow into `~/.claude/dotchi/venv`.
- The [GitHub CLI](https://cli.github.com) (`gh`, logged in) to share pets on the site

**Update**

```sh
claude plugin marketplace update dotchi
claude plugin update dotchi
```

Then restart Claude Code. Your own characters live in `~/.claude/dotchi` and survive updates.

## Commands

Everything is under `/dotchi`.

| Command | What it does |
| :- | :- |
| `/dotchi` | Show the current settings |
| `/dotchi <character>` | Switch character (id or any of its names) |
| `/dotchi list` | List built-in characters and yours |
| `/dotchi hatch [image path]` | Hatch a new character from a picture |
| `/dotchi edit <character>` | Touch up a character with Claude |
| `/dotchi install <zip, folder or site id>` | Install a pack, or a pet from the site by id or link |
| `/dotchi export <character> [--with-source]` | Save a pack as `<id>.dotchi.zip` in the current folder |
| `/dotchi share <character> [--as <id>]` | Share a pet on the dotchi site (`--as` renames it first if the id is taken) |
| `/dotchi unshare <character>` | Take your pet down from the site |
| `/dotchi remove <character>` | Remove one of your characters |
| `/dotchi show always\|working\|side` | Show always, only while Claude works, or in a side panel |
| `/dotchi voice on\|off` | One-liner after each answer |
| `/dotchi lang ko\|en\|ja\|zh\|auto` | Language of the pet's lines and names (`auto` follows your system) |

**Side panel.** `/dotchi show side` puts your pet in a panel on the right, about 20% of the width. It docks beside the conversation in fullscreen mode, so run `/tui fullscreen` once. Resize it with `Ctrl+X` then the arrow keys, and close it with `Ctrl+X` then `X`.

## Hatch your own

```
/dotchi hatch ~/Pictures/my-cat.png
```

<p align="center">
  <img src="assets/hatch.png" alt="A bunny illustration turned into 32×32 pixel art" width="620">
</p>

Claude walks you through it, one question at a time:

1. Turns the picture into pixel art and fixes what got mushed (eyes, mouth, outline).
2. Asks for a name and a personality.
3. Suggests what could move (arms, legs, ears, tail, or wheels and smoke for a car) and lets you choose.
4. Animates only those parts, in 3 to 5 frames.
5. Writes lines that fit the personality.
6. Shows you a preview image and an animated GIF, checks the pack, and saves it only when you approve.

Change it later with `/dotchi edit <character>`.

## Share packs

**On the dotchi pets site.** [ms1011.github.io/dotchi-packs](https://ms1011.github.io/dotchi-packs) lists pets people made. Each page has a copy button for its install command.

```
/dotchi share my-cat               # opens an issue on ms1011/dotchi-packs with gh
/dotchi install my-cat             # anyone can install it by id (or by its page link)
/dotchi unshare my-cat             # take it down
```

Sharing needs `gh` logged in to GitHub. A check runs on the issue and the pet shows up on the site within a minute or two if it passes. Likes are 👍 reactions on the pet's issue on GitHub, so you need a GitHub account to like one; the site shows the new count within a minute or so.

**As a file.**

```
/dotchi export my-cat              # → ./my-cat.dotchi.zip
/dotchi install ~/Downloads/my-cat.dotchi.zip
```

A pack is a folder (or a zip of one):

```
<pack>/
  dotchi.json   { "format": 1, "id", "name", "author"?, "description"?, "frameMs"? }
  art.json      { "width": 32, "height": 32, "idle": Frame, "work": [Frame, …] }   (1 to 5 frames)
  lines.json    { "<lang>": { "spinner": [...], "idle": [...], "ending": [...] }, … }
  grid/         (optional) editable text grids
  source/       (optional) original pictures
```

- `id`: lowercase letters, digits and `-`, up to 32 characters. If it is taken, the install adds `-2`, `-3`, ….
- `name`: a string, or one name per language: `{ "en": "Squirrel", "ko": "다람쥐" }`.
- `frameMs`: time per frame, 60 to 1000 ms (default 250).
- `lines.json`: any of `ko`, `en`, `ja`, `zh`. A missing language falls back to English, then to the first one in the pack.
- A `Frame` is 32 rows of 32 cells, each `"rrggbb"` or `null` for transparent.
- Only these files are copied on install and export, and symbolic links are skipped. `source/` is left out of exports unless you add `--with-source`.

> [!NOTE]
> **Please respect artists.** If you hatch a character from someone else's artwork, keep it for personal use and don't share the pack publicly.

## Where things live

| Path | What |
| :- | :- |
| `~/.claude/dotchi/characters/` | Characters you hatched or installed |
| `~/.claude/dotchi/drafts/` | Characters being hatched or edited |
| `~/.claude/dotchi/venv/` | Image-processing tools |

## Development

```sh
claude --plugin-dir .                     # run Claude Code with this folder as the mod
claude plugin validate .
claude plugin test .
sh tools/setup.sh                         # creates ~/.claude/dotchi/venv
~/.claude/dotchi/venv/bin/python -m unittest discover -s tools -p "test_*.py"
~/.claude/dotchi/venv/bin/python tools/defaults/build.py   # rebuild the built-in characters
```

`tsconfig.json` extends `.claude-plugin/types/`, which Claude Code writes the first time it loads the mod from this folder (`claude --plugin-dir .`). After that, `tsc -p .` type-checks the hooks.

## License

[MIT](LICENSE)
