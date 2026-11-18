# 交接文档：罪恶都市（vice-city）3D Web 游戏开发

> 面向**接续任务的模型**。当前状态：16 个功能 commit 已提交（见下），核心可玩闭环完成
> （城市/驾驶/行人/警察/武器/音效/10 章主线/出租车支线），并完成两轮体验/视觉/AI/内容专项打磨（见「1.2 」「1.3」）。
> 完整调研与规划见 `VICE_CITY_PLAN.md`（用户已确认：Three.js r160 本地化 / 标准版内容 / 双端）。

## 一、已完成并提交

| commit | 内容 |
|---|---|
| `85feeb2` | 3D 框架与主循环：Three.js 本地化 vendor（`site/vice-city/lib/three.module.min.js`）、`index.html`/`style.css` 页面与 HUD、`city.js` 占位世界 |
| `43f022d` | 程序化 3D 城市：道路网格/街区块/水域/机场/海星岛、559 碰撞盒、小地图静态底图、出生点 |
| `90e86cd` | 载具与驾驶系统：6 车型物理、E 上下车、玩家步行/相机跟随、碰撞 containment |
| `53b17af` | 行人/警察通缉/环境车流：36 行人（InstancedMesh+恐慌逃逸）、1-5 星通缉、BUSTED/WASTED 结算、8 辆车流 |
| `e39f0b3` | 武器与射击系统：拳头/马格南/Uzi/霰弹/步枪，曳光池+枪口闪光，命中扫描（行人圆/车辆圆/建筑 raymarch），开枪升星 |
| `ed21306` | 程序化音效系统（零外部音频资源）：引擎变调、3 电台 80s 音序器、警笛 LFO、枪声×4/撞击/爆炸/BUSTED/WASTED |
| `6936e8c` | 主线任务系统：3 任务（reach/delivery/eliminate）、对话面板、3D 标记、giver 接取、奖励+武器解锁+存档、动态小地图 |
| `7b92722` | 性能与收尾：爆炸火球（dispose 防泄漏）+镜头震动、车流/警车 800m 距离 LOD |

### 1.2 打磨轮（体验/视觉/AI 专项，见 git log）

| commit | 内容 |
|---|---|
| `89a2268` | A/D 与驾驶左右反向修复；对话 Enter/Space/E 键盘推进 + 对话期输入冻结；补齐移动端触屏接线（摇杆×2 + 动作键） |
| `118f0c6` | 行人 InstancedMesh 禁用视锥剔除（走近人反而消失的根因修复） |
| `22984ef` | 警察 AI：生成锁定 70–420m 道路交点、含避障切线绕行、卡住自动重生补员 |
| `95e0f92` | 视觉升级：玩家模型精细化（发/眼/手/鞋/持枪模型）、行人发色、建筑屋顶檐口/设备/遮阳棚/霓虹竖牌、5×6 窗贴图、全交叉口斑马线、60% 随机车漆 |
| `a2c01a2` | 碰撞火花粒子池 + 受损冒烟（玩家车 hp<40% 必冒）+ 车辆可见受损形变（压扁/侧倾），爆炸加烟 |

### 1.3 第二轮打磨（移动端+内容扩展，见 git log）

| commit | 内容 |
|---|---|
| `5111546` | 移动端任务交互与触屏布局：✋ 独立互动键；任务发放人跟前 inputs 由任务系统独占（offerInteract）；提示文案设备自适应；动作键簇移至右摇杆上方 + 安全区/矮屏适配 |
| `548ab8e` | 主线扩展到 10 章：新增 chase（路点追击者 AI+切线绕行+玩家碰撞互伤）/escape（强制升星+保持警车距离计时）类型；BUSTED/WASTED 联动任务失败；命中扫描纳入追击者 |
| `e8cc2f1` | 出租车支线：靠边停车自动接客、限时送达、车费 $、`taxiDone` 存档；含 dispose 与 headless 断言 |

另：`boot.js` 暴露 `window.__vc = game` 调试句柄。

## 二、架构与模块（`site/vice-city/`）

```
index.html        页面骨架 + HUD（血条/护甲/武器/电台/任务/提示/小地图/对话面板）
style.css         霓虹 80s 风格 UI
lib/three.module.min.js   Three.js r160（655KB，MIT，本地化）
js/
  common.js   全局面量/常量（WORLD size=2400 half=1200 gridN=13 → 路 step≈184.6）
  city.js     City 类：程序化城市 + 559 colliders + collideCircle(x,z,r) + minimapCv(512²)
  player.js   玩家：步行/上车状态机、E 交互、受伤
  vehicle.js  Car 类（物理/碰撞/损伤/爆炸回调 onCrash/onExplode）、VehicleSystem
  ped.js      行人：InstancedMesh(48 上限)/慌乱/逃跑/checkCarHit/panicAt
  police.js   PoliceSystem：星级/追击 AI（橡皮筋）/BUSTED/DEX 距离衰减
  traffic.js  TrafficSystem：网格路点驾驶 + 转向随机 + 与玩家车碰撞
  weapons.js  WeaponSystem：5 武器参数/半自&自动/命中扫描/曳光池
  sfx.js      SfxSystem：WebAudio 合成（引擎/电台/警笛/单次音效），首次交互 unlock
  missions.js MissionSystem：10 章主线（reach/delivery/eliminate/chase/escape）/giver 接取/对话/标记/奖励/存档；chase 含追击者 AI（_runner）
  taxi.js    TaxiSystem：出租车支线（靠边接客/送达计费/taxiDone）
  —— 移动端任务接取必须经 missions.offerInteract 通道（玩家 toggleVehicle 会被拦截）
  game.js     ViceCityGame 主类：场景/相机/昼夜（_applyDayNight/HUD/小地图/_syncMinimap/
              startDialog/floater/toast/BUSTED/WASTED/爆炸 FX/镜头震动/火花&烟雾粒子池）+ InputManager（含 _initTouch 触屏接线）
```

### 关键约束（改代码前必读）

- **headless 兼容**：所有渲染/音频/DOM 操作都有 `game.headless` 守卫；headless 下 `city.minimapCv = null`、`peds` 跳过 `_applyColors`、对话同步回调。新增可视化逻辑必须保持 headless 安全。
- **坐标**：世界 XZ 地面 + Y 高度；`world.collideCircle` 返回 `{box,nx,nz,dx,dz,d}`；
  玩家朝向 `player.angle`（0=+Z）；相机 yaw/pitch 手动维护（`cameraYaw/cameraPitch`）。
- **存档**：`ProgressStore`（`site/assets/js/progress.js`）vice-city 键：
  `money/weapons/ammo/weaponIndex/armor/missionsDone/taxiDone/tutorialSeen`。
  写入一律 `store.update(s => {...})`（自动 local + 云端）。武器解锁进 store.weapons。
- **物理修复**：命中判定中**射线-圆求交必须先把 XZ 方向归一化**再算判别式
  （`weapons.js _rayCircle`，曾因直接用 3D 单位向量分量导致永不相交）。
- **步行/驾驶左右方向（易错点）**：相机系右向 = `(-cos yaw, sin yaw)`；
  正舵量使车头 +X 偏（屏幕左）→ 驾驶 `steer = -clamp(strafe)`。改动相机/转向相关逻辑后务必回归 A/D。
- **行人 InstancedMesh 不可依赖视锥剔除**：包围球只在首帧按初始矩阵计算一次，
  行人散开后会把整个系统错误剔除（玩家看不到任何行人）——静态实例（棕榈/路灯）无此问题，
  会变动实例的系统（行人）一律 `frustumCulled = false`。
- 固定步长（`FIXED_DT = 1/60`），`update(dt)` 每系统调用顺序：
  input→player→vehicles→traffic→peds→weapons→police→missions→world→sfx→camera→fx→HUD→minimap(每 10 帧)。

## 三、当前工作区状态（已提交）

全部功能 commit 已入库（13 个，如上节 1 + 1.2），仅 `tools/_vc_headless_test.mjs`
作为回归工具入库；临时验证脚本（截图/结构断言）不提交。

## 四、剩余工作（按优先级）

### 4.1 移动端完善（已完成）
- `index.html` 已有 #vc-touch（双摇杆 + A/🚗/🛑），`InputManager._initTouch()` 完成接线：
  左摇杆=移动/油门，右摇杆=横移/转向 + 纵推俯仰，A=开火、B/🚗=上下车、🛑=手刹。
- 后续可选：横屏提示、射击目标辅助、 HUD 密度设置。

### 4.2 主线扩展到 10 章（已完成）
- `missions.js` 已有 10 章（m1..m10），覆盖 reach/delivery/eliminate/chase/escape 五型。
  新任务复制对象并设置 type/path/stars/radius 即可；chase 目标车支持 runnerSpeed。
- BUSTED/WASTED 会让当前任务失败（`game.busted/wasted` → `missions._failMission`）。
- 任务进度仍只写 `missionsDone`，跨会话任务链重启会重置（可加 `missionStage` 字段）。

### 4.3 深度打磨（进行中）
- 车流车被炸后的残骸保留（现 25s 后消失）；更多车型（货车/摩托）；
- 房产购买；4 座电台（现 3 座）。
- 出租车支线已实现（taxi.js，taxiDone 存档）。

## 五、验证命令（每次改动必跑）

```bash
# 服务端 27 用例
python -m unittest discover -s tests

# 全项目冒烟（5 个游戏入口 import + 90 帧逻辑）
node tools/smoke.mjs

# 罪恶都市专项 headless（Node DOM stub，覆盖 城市/驾驶/碰撞/行人/警察/武器/任务/音效/特效）
node tools/_vc_headless_test.mjs    # 期望结尾 HEADLESS ... TEST PASS
```

当前基线：unittest 27/27 OK；smoke 5/5 PASS；headless 全 PASS（含任务奖励/存档断言）。
浏览器实测：无控制台错误；draw calls ≈ 96 / tris ≈ 160k（pc 配 GTX 1660 同构核显环境流畅）。

## 六、部署

```bash
python deploy/deploy.py
```
- SSH 凭据在 `ssh.env`（gitignore，勿提交）；部署到 `/opt/game-tools`，
  systemd `game-tools.service` + nginx 8092 端口（3011 对外），远端自动备份保留 20 份。
- 部署后浏览器打开站点 → `vice-city/` 验证加载与音频解锁（需点击一次页面）。
- 移动端验证：同一 SConstruct 无需打包，手机浏览器访问站点即自适应（device.js 提供 UA 判断）。

## 七、防坑提示（本次实践）

1. `weapons._rayCircle` 必须 XZ 归一化（见上「物理修复」）。
2. 调试修改 `player.weapons` 后启动会被 `store.state.weapons` 覆盖——boot 已改为**并集**，
   任务解锁 uzi/shotgun 依赖此逻辑；如果新增武器记得并入 boot 初始 `PLAYER_WEAPON_ORDER.slice(0, 1 + UNLOCKED_AT_START)`。
3. 对话/任务在 headless 下同步完成（`game.startDialog` 直接回调）——新增依赖时留意同步回调中递归启动下一任务的深度。
4. 行人血包上限 48（`MAX_PEDS`），gang 任务杀完/失败后从 `peds.peds` 数组**移除**（`_clearGang` 已实现），
   重做主线前注意别突破上限。
5. 距离 LOD（traffic/police >800m 跳过）会让“传送远处 NPC 再测”的断言失效——测试时先把目标放回玩家 30m 内。
   - **浏览器 vs headless**：startDialog 在浏览器需点击推进（异步），headless 同步回调；浏览器验证任务流程时必须模拟点击 `.vc-dialog-next`，否则 `_dialogRunning` 卡住任务逻辑。
6. PowerShell 无 `<` 重定向；`node --check` 前用 `Copy-Item xx.js $env:TEMP\chk.mjs` 包一层。
7. **CSP 限制**：`server/app.py` 对所有 `.html` 下发 `Content-Security-Policy: script-src 'self'`，页面**不允许内联脚本/事件处理器**（曾导致 vice-city 内联 boot 被拦截、卡在加载页）。新页面/新游戏入口一律写成 `<script type="module" src="./js/boot.js">` 外链；同理避免 `onclick=` 属性。
8. `Car` 的 `damage()` 使用 `this.body/this.cabin/this._bodyY` 等实例引用——这些引用在两处 `_buildMesh` 中赋值；若为 headless 新建更轻量的车身模型，注意同步。`game` 新增粒子/公告板 FX 接口均以 `spawnSparks/spawnSmoke(x,y,z,...)` 命名，headless 自动跳过。
9. 调试可用 `window.__vc`（boot.js 暴露）：改 `worldHour` 切昼夜、读 `renderer.info.render` 看 draw calls、直改 `input.keys` 模拟按键。
