<div align="center">

<img src="assets/squirrel.gif" alt="摇尾巴的松鼠 dotchi" width="200"> <img src="assets/turtle.gif" alt="全速冲刺的乌龟 dotchi" width="200">

# dotchi

**把任何图片孵化成像素风宠物，让它陪在 Claude Code 旁边。**

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **中文**

</div>

---

dotchi 是 [Claude Code](https://docs.claude.com/en/docs/claude-code) 的一个 mod。宠物住在终端里、对话旁边。Claude 工作时它会动起来，用漫画气泡说话，把加载提示换成自己的台词，还能在每次回答后补上一句。

<p align="center">
  <img src="assets/screen-band.png" alt="Claude 工作时，松鼠在输入框上方说“Gathering acorns…”" width="720">
</p>

## 功能

- 🥚 **孵化自己的宠物。** 给它任何图片，图像处理会把它变成 32×32 像素画。接着 Claude 修饰细节，询问名字、性格和要动的部位，让这些部位动起来，并写好台词。你同意之前什么都不会保存。
- 🎞️ **真正的像素动画。** 不是整张图移动，而是你选的手臂、腿、耳朵、尾巴、车轮等部位在动。
- 💬 **会说话。** 漫画气泡、Claude 工作时的加载台词，以及回答后的一句话（可选）。
- 🪟 **输入框上方或侧边面板。** 可以把宠物放在右侧面板，回答使用其余的屏幕空间。
- 📦 **分享角色包。** 每个角色就是一个小角色包。导出成 zip，任何人都能安装。
- 🌏 **台词支持四种语言。** 宠物可以用韩语、英语、日语或简体中文说话。命令提示为英语。
- 🐿️🐢 **一开始就有两只：** 抱着橡果的松鼠，以及其实跑得飞快的乌龟

<p align="center">
  <img src="assets/screen-side.png" alt="左边正在写诗，右侧面板里的乌龟在全速冲刺" width="820">
</p>

## 安装

在 Claude Code 中：

```
/plugin install dotchi --marketplace ms1011/dotchi
```

询问是否添加 marketplace 时输入 `y`，范围选择用户（user）。也可以在终端中：

```sh
claude plugin install dotchi --marketplace ms1011/dotchi
```

**需要**

- 支持 mod 的 Claude Code（v2.1.306 或更高）
- 孵化和 zip 角色包需要 Python 3。第一次孵化时会把 OpenCV、numpy、Pillow 安装到 `~/.claude/dotchi/venv`。

**更新**

```sh
claude plugin marketplace update dotchi
claude plugin update dotchi
```

然后重启 Claude Code。你自己的角色保存在 `~/.claude/dotchi`，更新后也不会丢失。

## 命令

全部在 `/dotchi` 下。

| 命令 | 作用 |
| :- | :- |
| `/dotchi` | 查看当前设置 |
| `/dotchi <角色>` | 切换角色（id 或名字） |
| `/dotchi list` | 内置角色和我的角色列表 |
| `/dotchi hatch [图片路径]` | 用图片孵化新角色 |
| `/dotchi edit <角色>` | 和 Claude 一起修改角色 |
| `/dotchi install <zip 或文件夹>` | 安装角色包 |
| `/dotchi export <角色> [--with-source]` | 在当前文件夹保存为 `<id>.dotchi.zip` |
| `/dotchi remove <角色>` | 删除我的角色 |
| `/dotchi show always\|working\|side` | 始终显示 / 仅在 Claude 工作时 / 侧边面板 |
| `/dotchi voice on\|off` | 回答后的一句话 |
| `/dotchi lang ko\|en\|ja\|zh\|auto` | 宠物台词和名字的语言（`auto` 跟随系统设置） |

**侧边面板。** `/dotchi show side` 会把宠物放到右侧面板（约占宽度 20%）。面板在全屏模式下会停靠在对话旁边，所以请先运行一次 `/tui fullscreen`。用 `Ctrl+X` 加方向键调整宽度，用 `Ctrl+X` 加 `X` 关闭。

## 孵化自己的宠物

```
/dotchi hatch ~/Pictures/my-cat.png
```

<p align="center">
  <img src="assets/hatch.png" alt="把兔子插画变成 32×32 像素画" width="620">
</p>

Claude 会一次问一个问题，带你完成：

1. 把图片变成像素画，修好糊掉的地方（眼睛、嘴巴、轮廓）。
2. 询问名字和性格。
3. 建议可以动的部位（手臂、腿、耳朵、尾巴；如果是汽车，就是车轮和烟），让你选择。
4. 只让选中的部位以 3～5 帧动起来。
5. 写出符合性格的台词。
6. 展示预览图和动图 GIF，检查角色包，你同意后才保存。

以后要修改：`/dotchi edit <角色>`。

## 分享角色包

```
/dotchi export my-cat              # → ./my-cat.dotchi.zip
/dotchi install ~/Downloads/my-cat.dotchi.zip
```

角色包是一个文件夹（或它的 zip）：

```
<角色包>/
  dotchi.json   { "format": 1, "id", "name", "author"?, "description"?, "frameMs"? }
  art.json      { "width": 32, "height": 32, "idle": Frame, "work": [Frame, …] }   （1～5 帧）
  lines.json    { "<语言>": { "spinner": [...], "idle": [...], "ending": [...] }, … }
  grid/         （可选）可编辑的文本网格
  source/       （可选）原始图片
```

- `id`：小写字母、数字和 `-`，最多 32 个字符。如果已被占用，安装时会加上 `-2`、`-3`……
- `name`：一个字符串，或按语言分别命名：`{ "zh": "松鼠", "en": "Squirrel" }`
- `frameMs`：每帧时长，60～1000 毫秒（默认 250）
- `lines.json`：`ko`、`en`、`ja`、`zh` 任意几种。缺少的语言先用英语，再用角色包里的第一种语言。
- `Frame` 是 32 行 × 32 格，每格是 `"rrggbb"` 或透明（`null`）。
- 安装和导出时只复制上面这些文件，并跳过符号链接。不加 `--with-source` 时不会导出 `source/`。

> [!NOTE]
> **请尊重作者。** 如果你用别人的作品孵化角色，请只在个人范围内使用，不要公开分享角色包。

## 文件位置

| 路径 | 内容 |
| :- | :- |
| `~/.claude/dotchi/characters/` | 孵化或安装的角色 |
| `~/.claude/dotchi/drafts/` | 正在孵化或修改的角色 |
| `~/.claude/dotchi/venv/` | 图像处理工具 |

## 开发

```sh
claude --plugin-dir .                     # 把这个文件夹作为 mod 启动 Claude Code
claude plugin validate .
claude plugin test .
sh tools/setup.sh                         # 创建 ~/.claude/dotchi/venv
~/.claude/dotchi/venv/bin/python -m unittest discover -s tools -p "test_*.py"
~/.claude/dotchi/venv/bin/python tools/defaults/build.py   # 重新生成内置角色
```

`tsconfig.json` 继承 `.claude-plugin/types/`。这个文件夹会在 Claude Code 第一次从此文件夹加载 mod 时（`claude --plugin-dir .`）生成。之后就可以用 `tsc -p .` 做类型检查。

## 许可证

[MIT](LICENSE)
