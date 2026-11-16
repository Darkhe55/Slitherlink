# 数回 Slitherlink

一个基于 Web 的数回（Slitherlink）谜题游戏，原生 SVG 渲染，内置逻辑解题器。

## 在线体验

```bash
npm install
npm start
```

`npm start` 会等开发服务就绪后用默认浏览器打开 **http://127.0.0.1:5177/**。

> 也可以用 `npm run dev`，但不会自动打开浏览器。

## 游戏规则

- 在格点之间画线，形成一条闭合环路
- 每个数字格内的数字等于围绕它的四条边中被画线的数量
- 环路必须单一闭合，不能分叉或开口

## 操作

| 操作 | 说明 |
|------|------|
| 左键点格边 | 画线 / 取消 |
| 右键点格边 | 标叉 / 取消 |
| 按住拖动 | 连续画线或标叉 |
| 滚轮 / 中键拖拽 | 缩放 / 平移画布 |
| Z / Shift+Z / Y | 撤销 / 重做 |
| C / H / S / Esc | 检查 / 提示一格 / 显示解 / 清空 |
| R / L / P / M | 随机抽题 / 逻辑解题 / 暂停回放 / 音效开关 |
| 0 / + / - | 视图复位 / 放大 / 缩小 |

## 数据存放

运行 `npm start` / `npm run dev` 时，题库、进度和上次题目保存在项目内 `data/` 目录；静态部署时自动降级到浏览器 localStorage。

## 功能

- **题库**：内置多道题，题目均校验唯一解
- **实时校验**：冲突与违规位置即时高亮，满足的条件同步变灰
- **逻辑解题**：规则引擎逐帧回放，显示每一步理由；回放中按钮变为停止，按 `P` 暂停/继续
- **提示一格 / 显示解**：提示优先揭示所有解一致的格子，显示解直接填入可行答案
- **撤销/重做**：按手势分组，一次拖拽只需一步撤销
- **进度保存**：自动保存当前题目进度，刷新不丢失
- **音效特效**：Web Audio 合成拨弦、水滴与落子动画，无外部音频资源
- **缩放/平移**：滚轮缩放，中键或 `Shift` 拖拽平移
- **染色提示**：实时显示环路内外区域（绿色为外侧，橙色为内侧，杂色为未确定）
- **自定义题库**：输入任意尺寸和数字，保存到个人题库，支持编辑和删除

## 技术栈

- Vite + TypeScript
- 原生 SVG（无框架）
- Web Audio 合成音效（无外部资源）
- localStorage / 项目内 `data/` 存储进度与题库

## 项目结构

```
src/
  main.ts
  render.ts
  logic.ts
  coloring.ts
  solver.ts
  puzzles.ts
  puzzles-data.ts
  state.ts
  validate.ts
  store.ts
  library.ts
  audio.ts
  styles.css
```

## 命令

```bash
npm run dev       # 开发服务（127.0.0.1:5177）
npm start         # 开发服务 + 就绪后自动打开浏览器
npm run build     # tsc --noEmit + vite build
npm run preview   # 预览构建结果
npm run import-image -- 题板.png   # 识图导入（预览）
npm run ocr-board -- 题板.png      # 仅 OCR，输出簇原型供排查
```

## 识图导入

```bash
# 预览：自动识别点阵、数字 0–3，并打印数字网格
npm run import-image -- 题板.png

# 写入题库；--verify 会启动本地 solver 校验唯一解（大图可能超时，默认跳过）
npm run import-image -- 题板.png --name "识图 · 25×30" --append --verify
```

- 数字识别优先用内置无衬线字体模板匹配，字体差异大时用字形结构兜底；
- 如果自动映射不对，可人工指定字形簇：`--map 0=3,1=2,4=1`；
- `--series` 可指定题库系列，默认 `human`；
- `--verify` 成功确认唯一解时会把 `solH/solV` 一起写入题库，超时或非唯一则不写参考解。
