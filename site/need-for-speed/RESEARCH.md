# 极品飞车 · 调研笔记（M2–M6 前置）

> 目的：开工前先调研（资产可达性 / 许可 / 竞品 UI 惯例），记录在案，避免盲目开发。
> 调研时间：2026-11-19，环境：本地可直连 quaternius.com、github.com、cdn.jsdelivr.net；**itch.io / drive.google.com / raw.githubusercontent.com 被网络策略拦截**。

## 1. 资产可达性调研（实测，非推测）

| 来源 | 实测结果 | 决策 |
|---|---|---|
| quaternius.com | 页面 200，但下载链接指向 Google Drive 文件夹，实测 curl `000`（不可达）；itch.io 镜像同样 `000` | ❌ 依赖风险，缓用 |
| kenney.nl | 403（bot 防护） | ❌ |
| cdn.jsdelivr.net | 200 ✅ | ✅ 主要下载通道 |
| api.github.com | 可用（注意限流 60/h） | ✅ 用于搜索镜像 |
| github.com | 页面 200 ✅ | ✅ 列目录 |

### 关键发现：Kenney CC0 全量镜像
- GitHub 仓库 **`shorepine/kenney`**（133MB）：Kenney 全部 CC0 资产整理，含 `3d/` 完整 glTF 模型树。
- 通过 jsDelivr 直接下载单个文件：`https://cdn.jsdelivr.net/gh/shorepine/kenney@main/3d/<套件>/<文件>.glb`
- 验证过的目录（`3d/` 下）：`car / racing / city-commercial / city-industrial / city-suburban / building / modular-buildings / toy-car / road / train ...`
- **license：CC0**（与 Kenney 官方一致，镜像 README/LICENSE 可查）。

### 已入库资产清单（site/need-for-speed/assets/kits/）
```
car/   hatchback-sports / sedan-sports / suv / race-future / police
       + Textures/colormap.png（外部贴图，glb 按相对路径引用）
racing/ grandStand / pitsGarage / billboard / billboardLow / bannerTowerRed / bannerTowerGreen
       / barrierRed / lightPostModern / flagCheckers / tent / pylon / rail
```
- 车模（Kenney）：前向 = **+Z**（与项目约定一致），轮子节点名 `wheel-front-left` 等（可直接接转向/滚动动画），单 glb 180–210KB。
- 赛道道具：贴图全部**内嵌**（bufferView），无需额外文件；单个文件 KB 级。

### 里程碑资产用法（研究结论）
- **M2 世界**：`racing/` 道具入景（已做：看台/维修间/信号塔/护栏/广告牌/帐篷）；`city-*` 套件可用于替换程序化楼体（决策：保留程序化楼 + 加模块包边，避免大改）。
- **M3 竞速**：`racing/raceCar*`4 色 + `car/` 民用车（sedan/taxi/van/truck）做 AI/车流。
- **M4 车库**：Kenney car kit 共 25+ 车型（含 ambulance/firetruck/tractor...），可做解锁车队；`debris-*` 零件天然对应车损掉件。
- **M5 特效/警匪**：`police.glb`、`debris-*`、`flagCheckers`（终点旗）直接使用；武器贴脸元素再用 2D/程序化特效。
- **M6 打磨**：`city-roads/` 模块化路面、`overhead*` 灯架、`lightPost*` 路灯可继续替换升级。

## 2. 竞品 UI 惯例调研（车库/选车/氮气）

- **QQ飞车（腾讯）**：选车 = 3D 车辆**旋转展台**（可拖动旋转），右侧五维属性条（速度/加速/集气/操控/耐撞）；氮气 = **按住持续喷射**（耗条），漂移集气，条满有提示；触屏氮气大按钮带余量反馈。→ 本方案采纳：菜单 3D 展台 + 五维条 + 触屏按钮环形进度（conic-gradient）。
- **NFS Mobile（网易/腾讯版）**：车库 3D 旋转 + 性能面板；氮气按住加速、FOV 拉广 + 尾焰。→ 对应本项目 FOV/尾焰。
- 说明：竞品游戏官网在本环境不可直连（404/被墙），以上为产品形态公认惯例 + 历史调研；**落地时所有实现均为本地程序化/CC0 素材**。

## 3. 待验证/风险
- Quaternius 车辆包（8 车带动画）若日后放行可替代 Kenney（驱动轮子动画更细）→ 当前 Kenney 已够用。
- GitHub API 限流影响自动化批量搜索，需要时改用 jsDelivr 直链。

## 4. 调研动作规范（P0 经验）
1. 先确认下载通道可达（curl 实测）；2. 查许可证；3. 检查 glb 内贴图引用方式（bufferView 内嵌 or 外部 uri）；4. 检查节点命名与正反方向再进代码。
