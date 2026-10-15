# 数回（Slitherlink）数据结构

## 目标

网页版数回。循环画在格线上；数字是格约束；合法性靠顶点度数 + 单环连通。

## padding 约定（关键）

为了让**每个顶点都有恰好四条边**（解题器无需边界分支），在逻辑层给边数组加一圈恒为「排除」的 padding，**不渲染、不可点**。

- 横边 `h`：左右各加一列 pad（`x = 0` 与 `x = W+1`）
- 竖边 `v`：上下各加一行 pad（`y = 0` 与 `y = H+1`）

所有 pad 边初始化为 `EdgeState.Forbidden = 2`，且运行期锁死不可改。

## 坐标与索引

设题面 `width = W`、`height = H`（格数）。

| 元素 | 范围 | 数量 |
|------|------|------|
| 格子 `(cx, cy)` | `0≤cx<W`, `0≤cy<H` | `W*H` |
| 逻辑横边 `(hx, hy)` | `0≤hx≤W+1`, `0≤hy≤H` | `(H+1)*(W+2)` |
| 逻辑竖边 `(vx, vy)` | `0≤vx≤W`, `0≤vy≤H+1` | `(H+2)*(W+1)` |
| 顶点 `(px, py)` | `0≤px≤W`, `0≤py≤H` | `(W+1)*(H+1)` |

扁平索引：

```ts
hIndex(hx, hy) = hy * (W + 2) + hx
vIndex(vx, vy) = vy * (W + 1) + vx
```

### 真实边 ↔ padding

- 真实横边：`hx ∈ [1, W]`（对应格子左右沿；`hx = W` 是最右一列格的右边）
- pad 横边：`hx = 0` 或 `hx = W+1`
- 真实竖边：`vy ∈ [1, H]`
- pad 竖边：`vy = 0` 或 `vy = H+1`

### 格子的四条边

格子 `(cx, cy)`：

| 边 | 索引 |
|----|------|
| 上 | `hIndex(cx + 1, cy)` |
| 下 | `hIndex(cx + 1, cy + 1)` |
| 左 | `vIndex(cx, cy + 1)` |
| 右 | `vIndex(cx + 1, cy + 1)` |

### 顶点的四条边（统一，无边界分支）

顶点 `(px, py)`：

| 边 | 索引 | 越界时 |
|----|------|--------|
| 西 West | `hIndex(px, py)` | `px=0` → 左 pad |
| 东 East | `hIndex(px + 1, py)` | `px=W` → 右 pad |
| 北 North | `vIndex(px, py)` | `py=0` → 上 pad |
| 南 South | `vIndex(px, py + 1)` | `py=H` → 下 pad |

## 类型

```ts
type CellNumber = 0 | 1 | 2 | 3 | null

enum EdgeState {
  Unknown = 0,
  On = 1,        // 在环上
  Forbidden = 2, // 排除 / ×
}

interface Puzzle {
  id: string
  name: string
  width: number
  height: number
  cells: CellNumber[] // length = W * H, row-major
  difficulty: 'easy' | 'medium' | 'hard'
}

interface GameState {
  puzzleId: string
  width: number
  height: number
  h: EdgeState[] // length = (H+1)*(W+2)
  v: EdgeState[] // length = (H+2)*(W+1)
}

interface Move {
  axis: 'h' | 'v'
  index: number
  from: EdgeState
  to: EdgeState
}
```

## 点击循环

真实边：`Unknown → On → Forbidden → Unknown`。
pad 边：无交互。

## 校验

1. 点：每顶点 ON 度数 ∈ {0, 2}（度数 1 = 开口，3/4 = 分叉）
2. 格：四边 ON 数 = 数字；数字为 null 则不校验
3. 环：若存在 ON 边，必须单连通且每点度数为 2（即恰好一个简单环）

解题器读到的顶点邻接始终是 4 条边；pad 恒为 Forbidden，可当作「已确定不走」参与约束传播。

## 渲染

- 只画真实边与格点、数字
- pad 不出现在 SVG 中
- 命中检测也只对真实边开启

## 技术

Vite + TypeScript + 原生 SVG，无框架。localStorage 存进度。
