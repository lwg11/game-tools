/**
 * 精灵宝可梦 · 丰缘冒险 - 数据层
 * ------------------------------------------------------------
 * 数值逻辑参考第三世代（Gen III）：
 * - 能力值：HP = floor((2*种族+个体+努力/4)*等级/100)+等级+10
 * - 伤害：floor(floor(floor(2*L/5+2)*威力*攻击/防御)/50)+2
 *         再乘 本系1.5 × 属性克制 × 随机0.85~1.0 × 会心2.0
 * - 捕获：a = ((3*最大HP-2*当前HP)*捕获率*球加成)/(3*最大HP)，附加状态加成，
 *         随后进行 4 次摇晃判定
 * - 经验：升级所需经验使用 mediumFast(L^3) / mediumSlow 曲线
 */

export const TYPE_NAMES = {
  normal: "一般", fire: "火", water: "水", electric: "电", grass: "草",
  ice: "冰", fighting: "格斗", poison: "毒", ground: "地面", flying: "飞行",
  psychic: "超能", bug: "虫", rock: "岩石", ghost: "幽灵", dragon: "龙",
  dark: "恶", steel: "钢",
};

export const TYPE_COLORS = {
  normal: "#9a9a82", fire: "#f08030", water: "#6890f0", electric: "#f8d030",
  grass: "#78c850", ice: "#98d8d8", fighting: "#c03028", poison: "#a040a0",
  ground: "#e0c068", flying: "#a890f0", psychic: "#f85888", bug: "#a8b820",
  rock: "#b8a038", ghost: "#705898", dragon: "#7038f8", dark: "#705848",
  steel: "#b8b8d0",
};

/** Gen III 属性克制表：攻击属性 -> 防御属性 -> 倍率 */
const CHART = {
  normal: { rock: 0.5, steel: 0.5, ghost: 0 },
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
  ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
  fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, ghost: 0 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5 },
  rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  ghost: { psychic: 2, ghost: 2, dark: 0.5, steel: 0.5, normal: 0 },
  dragon: { dragon: 2, steel: 0.5 },
  dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, steel: 0.5 },
  steel: { ice: 2, rock: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
};

export function effectiveness(moveType, defTypes) {
  let mult = 1;
  for (const t of defTypes || []) {
    const row = CHART[moveType];
    if (row && row[t] !== undefined) mult *= row[t];
  }
  return mult;
}

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export { STAT_KEYS };

export const STAT_NAMES = {
  hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度", acc: "命中",
};

export const NATURES = [
  { id: "hardy", name: "勤奋", plus: null, minus: null },
  { id: "lonely", name: "怕寂寞", plus: "atk", minus: "def" },
  { id: "brave", name: "勇敢", plus: "atk", minus: "spe" },
  { id: "adamant", name: "固执", plus: "atk", minus: "spa" },
  { id: "naughty", name: "顽皮", plus: "atk", minus: "spd" },
  { id: "bold", name: "大胆", plus: "def", minus: "atk" },
  { id: "docile", name: "坦率", plus: null, minus: null },
  { id: "relaxed", name: "悠闲", plus: "def", minus: "spe" },
  { id: "impish", name: "淘气", plus: "def", minus: "spa" },
  { id: "lax", name: "乐天", plus: "def", minus: "spd" },
  { id: "timid", name: "胆小", plus: "spe", minus: "atk" },
  { id: "hasty", name: "急躁", plus: "spe", minus: "def" },
  { id: "serious", name: "认真", plus: null, minus: null },
  { id: "jolly", name: "爽朗", plus: "spe", minus: "spa" },
  { id: "naive", name: "天真", plus: "spe", minus: "spd" },
  { id: "modest", name: "内敛", plus: "spa", minus: "atk" },
  { id: "mild", name: "温和", plus: "spa", minus: "def" },
  { id: "quiet", name: "冷静", plus: "spa", minus: "spe" },
  { id: "bashful", name: "害羞", plus: null, minus: null },
  { id: "rash", name: "马虎", plus: "spa", minus: "spd" },
  { id: "calm", name: "沉着", plus: "spd", minus: "atk" },
  { id: "gentle", name: "温顺", plus: "spd", minus: "def" },
  { id: "careful", name: "慎重", plus: "spd", minus: "spa" },
  { id: "sassy", name: "自大", plus: "spd", minus: "spe" },
  { id: "quirky", name: "浮躁", plus: null, minus: null },
];

// ---------------------------------------------------------------- 招式
function M(name, type, cat, power, acc, pp, effects = [], extra = {}) {
  return { name, type, cat, power, acc, pp, effects, ...extra };
}

export const MOVES = {
  // 一般
  tackle: M("撞击", "normal", "phys", 35, 95, 35),
  scratch: M("抓", "normal", "phys", 40, 100, 35),
  quickAttack: M("电光一闪", "normal", "phys", 40, 100, 30, [], { priority: 1 }),
  slash: M("切裂", "normal", "phys", 70, 100, 20, [], { highCrit: true }),
  bodySlam: M("泰山压顶", "normal", "phys", 85, 100, 15, [{ kind: "status", status: "par", chance: 30 }]),
  growl: M("叫声", "normal", "status", 0, 100, 40, [{ kind: "stat", target: "foe", stat: "atk", stages: -1 }]),
  tailWhip: M("摇尾巴", "normal", "status", 0, 100, 30, [{ kind: "stat", target: "foe", stat: "def", stages: -1 }]),
  harden: M("变硬", "normal", "status", 0, 100, 30, [{ kind: "stat", target: "self", stat: "def", stages: 1 }]),
  swordsDance: M("剑舞", "normal", "status", 0, 100, 20, [{ kind: "stat", target: "self", stat: "atk", stages: 2 }]),
  recover: M("自我再生", "normal", "status", 0, 100, 10, [{ kind: "heal", ratio: 0.5 }]),
  struggle: M("挣扎", "normal", "phys", 50, 100, 1, [], { recoil: 0.25 }),

  // 火
  ember: M("火花", "fire", "spec", 40, 100, 25, [{ kind: "status", status: "brn", chance: 10 }]),
  flameWheel: M("火焰轮", "fire", "phys", 60, 100, 25, [{ kind: "status", status: "brn", chance: 10 }]),
  flamethrower: M("喷射火焰", "fire", "spec", 95, 100, 15, [{ kind: "status", status: "brn", chance: 10 }]),
  firePunch: M("火焰拳", "fire", "phys", 75, 100, 15, [{ kind: "status", status: "brn", chance: 10 }]),

  // 草
  vineWhip: M("藤鞭", "grass", "phys", 35, 100, 25),
  absorb: M("吸取", "grass", "spec", 20, 100, 25, [], { drain: 0.5 }),
  megaDrain: M("超级吸取", "grass", "spec", 40, 100, 15, [], { drain: 0.5 }),
  gigaDrain: M("终极吸取", "grass", "spec", 60, 100, 10, [], { drain: 0.5 }),
  leafBlade: M("叶刃", "grass", "phys", 70, 100, 15, [], { highCrit: true }),
  sleepPowder: M("催眠粉", "grass", "status", 0, 75, 15, [{ kind: "status", status: "slp", chance: 100 }]),

  // 水
  waterGun: M("水枪", "water", "spec", 40, 100, 25),
  bubble: M("泡沫", "water", "spec", 20, 100, 30, [{ kind: "stat", target: "foe", stat: "spe", stages: -1, chance: 10 }]),
  bubbleBeam: M("泡沫光线", "water", "spec", 65, 100, 20, [{ kind: "stat", target: "foe", stat: "spe", stages: -1, chance: 10 }]),
  surf: M("冲浪", "water", "spec", 95, 100, 15),
  aquaTail: M("水流尾", "water", "phys", 90, 90, 10),

  // 电
  thundershock: M("电击", "electric", "spec", 40, 100, 30, [{ kind: "status", status: "par", chance: 10 }]),
  spark: M("电光", "electric", "phys", 65, 100, 20, [{ kind: "status", status: "par", chance: 30 }]),
  thunderbolt: M("十万伏特", "electric", "spec", 95, 100, 15, [{ kind: "status", status: "par", chance: 10 }]),
  thunderWave: M("电磁波", "electric", "status", 0, 100, 20, [{ kind: "status", status: "par", chance: 100 }]),

  // 冰
  icePunch: M("冰冻拳", "ice", "phys", 75, 100, 15, [{ kind: "status", status: "frz", chance: 10 }]),
  iceBeam: M("冰冻光束", "ice", "spec", 95, 100, 10, [{ kind: "status", status: "frz", chance: 10 }]),
  blizzard: M("暴风雪", "ice", "spec", 120, 70, 5, [{ kind: "status", status: "frz", chance: 10 }]),

  // 格斗
  doubleKick: M("二连踢", "fighting", "phys", 30, 100, 30, [], { hits: 2 }),
  brickBreak: M("劈瓦", "fighting", "phys", 75, 100, 15),
  skyUppercut: M("冲天拳", "fighting", "phys", 85, 90, 15),

  // 毒
  poisonSting: M("毒针", "poison", "phys", 15, 100, 35, [{ kind: "status", status: "psn", chance: 30 }]),
  sludge: M("污泥攻击", "poison", "spec", 65, 100, 20, [{ kind: "status", status: "psn", chance: 30 }]),

  // 地面
  mudSlap: M("泥巴射击", "ground", "spec", 20, 100, 10, [{ kind: "stat", target: "foe", stat: "acc", stages: -1 }]),
  bulldoze: M("重踏", "ground", "phys", 60, 100, 20, [{ kind: "stat", target: "foe", stat: "spe", stages: -1, chance: 100 }]),
  earthquake: M("地震", "ground", "phys", 100, 100, 10),

  // 飞行
  peck: M("啄", "flying", "phys", 35, 100, 35),
  wingAttack: M("翅膀攻击", "flying", "phys", 60, 100, 35),
  aerialAce: M("燕返", "flying", "phys", 60, 100, 20, [], { alwaysHit: true }),
  braveBird: M("勇鸟猛攻", "flying", "phys", 120, 100, 15, [], { recoil: 0.33 }),

  // 超能
  confusion: M("念力", "psychic", "spec", 50, 100, 25),
  psybeam: M("幻象光线", "psychic", "spec", 65, 100, 20),
  psychic: M("精神强念", "psychic", "spec", 90, 100, 10, [{ kind: "stat", target: "foe", stat: "spd", stages: -1, chance: 10 }]),
  hypnosis: M("催眠术", "psychic", "status", 0, 60, 20, [{ kind: "status", status: "slp", chance: 100 }]),
  calmMind: M("冥想", "psychic", "status", 0, 100, 20, [
    { kind: "stat", target: "self", stat: "spa", stages: 1 },
    { kind: "stat", target: "self", stat: "spd", stages: 1 },
  ]),

  // 虫
  bugBite: M("虫咬", "bug", "phys", 60, 100, 20),
  silverWind: M("银色旋风", "bug", "spec", 60, 100, 5, [
    { kind: "stat", target: "self", stat: "spa", stages: 1, chance: 10 },
    { kind: "stat", target: "self", stat: "spd", stages: 1, chance: 10 },
    { kind: "stat", target: "self", stat: "spe", stages: 1, chance: 10 },
  ]),
  stringShot: M("吐丝", "bug", "status", 0, 95, 40, [{ kind: "stat", target: "foe", stat: "spe", stages: -1 }]),

  // 岩石
  rockThrow: M("落石", "rock", "phys", 50, 90, 15),
  rockSlide: M("岩崩", "rock", "phys", 75, 90, 10),

  // 幽灵
  shadowSneak: M("影子偷袭", "ghost", "phys", 40, 100, 30, [], { priority: 1 }),
  shadowClaw: M("暗影爪", "ghost", "phys", 70, 100, 15, [], { highCrit: true }),
  shadowBall: M("影子球", "ghost", "spec", 80, 100, 15, [{ kind: "stat", target: "foe", stat: "spd", stages: -1, chance: 20 }]),

  // 龙
  dragonBreath: M("龙息", "dragon", "spec", 60, 100, 20, [{ kind: "status", status: "par", chance: 30 }]),
  dragonClaw: M("龙爪", "dragon", "phys", 80, 100, 15),
  dragonDance: M("龙之舞", "dragon", "status", 0, 100, 20, [
    { kind: "stat", target: "self", stat: "atk", stages: 1 },
    { kind: "stat", target: "self", stat: "spe", stages: 1 },
  ]),

  // 恶
  bite: M("咬住", "dark", "phys", 60, 100, 25),
  crunch: M("咬碎", "dark", "phys", 80, 100, 15, [{ kind: "stat", target: "foe", stat: "spd", stages: -1, chance: 20 }]),
  faintAttack: M("出奇一击", "dark", "phys", 60, 100, 20, [], { alwaysHit: true }),
  nightSlash: M("暗袭要害", "dark", "phys", 70, 100, 15, [], { highCrit: true }),

  // 钢
  metalClaw: M("金属爪", "steel", "phys", 50, 95, 35, [{ kind: "stat", target: "self", stat: "atk", stages: 1, chance: 10 }]),
  ironHead: M("铁头", "steel", "phys", 80, 100, 15),
  flashCannon: M("加农光炮", "steel", "spec", 80, 100, 10, [{ kind: "stat", target: "foe", stat: "spd", stages: -1, chance: 10 }]),
};

// ---------------------------------------------------------------- 宝可梦
// moves: [习得等级, 招式]
function S(def) {
  return { catchRate: 120, growth: "mediumFast", evolve: null, ...def };
}

export const SPECIES = {
  torchic: S({
    name: "火稚鸡", types: ["fire"], shape: "chick", color: "#ffb03a", color2: "#ff7a2f", stage: 1,
    base: { hp: 45, atk: 60, def: 40, spa: 70, spd: 50, spe: 45 }, baseExp: 65, catchRate: 45, growth: "mediumSlow",
    evolve: { level: 16, to: "combusken" },
    desc: "体内有火袋，抱起来暖烘烘的。紧张时会喷出小火苗。",
    moves: [[1, "scratch"], [1, "growl"], [7, "ember"], [10, "peck"], [16, "flameWheel"], [19, "slash"], [25, "flamethrower"], [28, "firePunch"]],
  }),
  combusken: S({
    name: "力壮鸡", types: ["fire", "fighting"], shape: "chick", color: "#f08a3a", color2: "#d84a2a", stage: 2,
    base: { hp: 60, atk: 85, def: 60, spa: 85, spd: 60, spe: 55 }, baseExp: 142, catchRate: 45, growth: "mediumSlow",
    evolve: { level: 36, to: "blaziken" },
    desc: "腿力惊人，能连续踢出高速的火焰脚。",
    moves: [[1, "scratch"], [1, "growl"], [1, "ember"], [1, "peck"], [16, "doubleKick"], [20, "flameWheel"], [25, "slash"], [30, "skyUppercut"], [35, "flamethrower"]],
  }),
  blaziken: S({
    name: "火焰鸡", types: ["fire", "fighting"], shape: "chick", color: "#e8562a", color2: "#ffcf4a", stage: 3,
    base: { hp: 80, atk: 120, def: 70, spa: 110, spd: 70, spe: 80 }, baseExp: 209, catchRate: 45, growth: "mediumSlow",
    desc: "手腕喷出烈焰，从高处发起华丽的踢击。",
    moves: [[1, "doubleKick"], [1, "ember"], [1, "peck"], [1, "firePunch"], [30, "skyUppercut"], [36, "flamethrower"], [42, "braveBird"]],
  }),

  treecko: S({
    name: "木守宫", types: ["grass"], shape: "gecko", color: "#7fd06a", color2: "#2f8f4a", stage: 1,
    base: { hp: 40, atk: 45, def: 35, spa: 65, spd: 55, spe: 70 }, baseExp: 65, catchRate: 45, growth: "mediumSlow",
    evolve: { level: 16, to: "grovyle" },
    desc: "脚底有细小的钩刺，能在垂直的墙面上行走。",
    moves: [[1, "tackle"], [1, "absorb"], [6, "quickAttack"], [11, "megaDrain"], [16, "leafBlade"], [21, "gigaDrain"], [26, "swordsDance"]],
  }),
  grovyle: S({
    name: "森林蜥蜴", types: ["grass"], shape: "gecko", color: "#5fb85a", color2: "#1f6f3a", stage: 2,
    base: { hp: 50, atk: 65, def: 45, spa: 85, spd: 65, spe: 95 }, baseExp: 141, catchRate: 45, growth: "mediumSlow",
    evolve: { level: 36, to: "sceptile" },
    desc: "像忍者一样在树冠间跳跃，用叶刃切开空气。",
    moves: [[1, "tackle"], [1, "absorb"], [1, "quickAttack"], [1, "megaDrain"], [16, "leafBlade"], [23, "gigaDrain"], [29, "slash"], [35, "swordsDance"]],
  }),
  sceptile: S({
    name: "蜥蜴王", types: ["grass"], shape: "gecko", color: "#4a9f4a", color2: "#e8e04a", stage: 3,
    base: { hp: 70, atk: 85, def: 65, spa: 105, spd: 85, spe: 120 }, baseExp: 208, catchRate: 45, growth: "mediumSlow",
    desc: "身上的叶子像刀锋一样锋利，动作快得看不清。",
    moves: [[1, "leafBlade"], [1, "gigaDrain"], [1, "slash"], [1, "quickAttack"], [30, "dragonBreath"], [36, "swordsDance"], [42, "dragonClaw"]],
  }),

  mudkip: S({
    name: "水跃鱼", types: ["water"], shape: "mudkip", color: "#5ab8ef", color2: "#2f7fc4", stage: 1,
    base: { hp: 50, atk: 70, def: 50, spa: 50, spd: 50, spe: 40 }, baseExp: 65, catchRate: 45, growth: "mediumSlow",
    evolve: { level: 16, to: "marshtomp" },
    desc: "头顶的鳍能感知水流变化，是天然的雷达。",
    moves: [[1, "tackle"], [1, "growl"], [6, "mudSlap"], [10, "waterGun"], [16, "bulldoze"], [20, "aquaTail"], [25, "surf"]],
  }),
  marshtomp: S({
    name: "沼跃鱼", types: ["water", "ground"], shape: "mudkip", color: "#4aa8d8", color2: "#2a6fa8", stage: 2,
    base: { hp: 70, atk: 85, def: 70, spa: 60, spd: 70, spe: 50 }, baseExp: 143, catchRate: 45, growth: "mediumSlow",
    evolve: { level: 36, to: "swampert" },
    desc: "在泥浆里也能快速游动，尾巴能感知大地的震动。",
    moves: [[1, "tackle"], [1, "mudSlap"], [1, "waterGun"], [16, "bulldoze"], [20, "aquaTail"], [25, "surf"], [30, "earthquake"]],
  }),
  swampert: S({
    name: "巨沼怪", types: ["water", "ground"], shape: "mudkip", color: "#3f8fc8", color2: "#1f5f8f", stage: 3,
    base: { hp: 100, atk: 110, def: 90, spa: 85, spd: 90, spe: 60 }, baseExp: 210, catchRate: 45, growth: "mediumSlow",
    desc: "能用鳍感知海流与风暴，力量大得能拖动巨石。",
    moves: [[1, "waterGun"], [1, "mudSlap"], [1, "bulldoze"], [1, "aquaTail"], [30, "surf"], [35, "earthquake"], [40, "icePunch"], [45, "brickBreak"]],
  }),

  poochyena: S({
    name: "土狼犬", types: ["dark"], shape: "dog", color: "#6f6a80", color2: "#3c3850", stage: 1,
    base: { hp: 35, atk: 55, def: 35, spa: 30, spd: 30, spe: 35 }, baseExp: 55, catchRate: 255,
    evolve: { level: 18, to: "mightyena" },
    desc: "闻到猎物的气味就会一路追踪，个性非常执着。",
    moves: [[1, "tackle"], [1, "growl"], [5, "bite"], [9, "tailWhip"], [13, "quickAttack"], [17, "crunch"], [21, "faintAttack"], [25, "nightSlash"]],
  }),
  mightyena: S({
    name: "大狼犬", types: ["dark"], shape: "dog", color: "#5a5568", color2: "#2c2838", stage: 2,
    base: { hp: 70, atk: 90, def: 70, spa: 60, spd: 60, spe: 70 }, baseExp: 128, catchRate: 127,
    desc: "群体行动，头领会用眼神指挥伙伴包围猎物。",
    moves: [[1, "tackle"], [1, "bite"], [1, "quickAttack"], [1, "crunch"], [18, "faintAttack"], [22, "nightSlash"], [27, "swordsDance"]],
  }),

  zigzagoon: S({
    name: "蛇纹熊", types: ["normal"], shape: "raccoon", color: "#c9905a", color2: "#8a5a2a", stage: 1,
    base: { hp: 38, atk: 30, def: 41, spa: 30, spd: 41, spe: 60 }, baseExp: 60, catchRate: 255,
    evolve: { level: 20, to: "linoone" },
    desc: "走路永远歪歪扭扭，喜欢捡路边闪亮的东西。",
    moves: [[1, "tackle"], [1, "growl"], [5, "tailWhip"], [9, "quickAttack"], [13, "bite"], [17, "slash"], [21, "bodySlam"]],
  }),
  linoone: S({
    name: "直冲熊", types: ["normal"], shape: "raccoon", color: "#b8804a", color2: "#6f4a1f", stage: 2,
    base: { hp: 78, atk: 70, def: 61, spa: 50, spd: 61, spe: 100 }, baseExp: 128, catchRate: 90,
    desc: "直线冲刺时速能超过一百公里，但拐不了弯。",
    moves: [[1, "tackle"], [1, "growl"], [1, "quickAttack"], [1, "bite"], [20, "slash"], [24, "bodySlam"], [28, "swordsDance"]],
  }),

  wurmple: S({
    name: "刺尾虫", types: ["bug"], shape: "worm", color: "#d06a8a", color2: "#f0d0d8", stage: 1,
    base: { hp: 45, atk: 45, def: 35, spa: 20, spd: 30, spe: 20 }, baseExp: 56, catchRate: 255,
    evolve: { level: 10, to: "beautifly" },
    desc: "尾部的尖刺会分泌黏液，遇到危险时用来吓退敌人。",
    moves: [[1, "tackle"], [1, "stringShot"], [5, "poisonSting"], [9, "bugBite"]],
  }),
  beautifly: S({
    name: "狩猎凤蝶", types: ["bug", "flying"], shape: "butterfly", color: "#7fb4e8", color2: "#e88ab8", stage: 2,
    base: { hp: 60, atk: 70, def: 50, spa: 90, spd: 50, spe: 65 }, baseExp: 161, catchRate: 45,
    desc: "翅膀上的花纹会随季节变化，喜欢吸食花蜜。",
    moves: [[1, "tackle"], [1, "stringShot"], [1, "bugBite"], [10, "silverWind"], [14, "megaDrain"], [18, "sleepPowder"], [22, "gigaDrain"]],
  }),

  taillow: S({
    name: "傲骨燕", types: ["normal", "flying"], shape: "bird", color: "#5a8fd8", color2: "#ff6b5a", stage: 1,
    base: { hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 85 }, baseExp: 59, catchRate: 200,
    evolve: { level: 22, to: "swellow" },
    desc: "无论多强的对手都敢挑战，肚子饿了就会大声吵闹。",
    moves: [[1, "peck"], [1, "growl"], [5, "quickAttack"], [9, "wingAttack"], [13, "aerialAce"], [17, "slash"], [21, "braveBird"]],
  }),
  swellow: S({
    name: "大王燕", types: ["normal", "flying"], shape: "bird", color: "#3f6fb8", color2: "#e84a3a", stage: 2,
    base: { hp: 60, atk: 85, def: 60, spa: 50, spd: 50, spe: 125 }, baseExp: 159, catchRate: 45,
    desc: "以惊人的速度俯冲，会在空中划出优美的弧线。",
    moves: [[1, "peck"], [1, "quickAttack"], [1, "wingAttack"], [1, "aerialAce"], [22, "slash"], [26, "braveBird"], [30, "swordsDance"]],
  }),

  electrike: S({
    name: "落雷兽", types: ["electric"], shape: "electric", color: "#8fd35a", color2: "#f2d94e", stage: 1,
    base: { hp: 40, atk: 45, def: 40, spa: 65, spd: 40, spe: 65 }, baseExp: 59, catchRate: 120,
    evolve: { level: 26, to: "manectric" },
    desc: "毛发会积蓄静电，跑动时发出噼啪的响声。",
    moves: [[1, "tackle"], [1, "growl"], [4, "thundershock"], [9, "quickAttack"], [13, "spark"], [17, "bite"], [21, "thunderWave"], [25, "thunderbolt"]],
  }),
  manectric: S({
    name: "雷电兽", types: ["electric"], shape: "electric", color: "#7fb84a", color2: "#f2c81e", stage: 2,
    base: { hp: 70, atk: 75, def: 60, spa: 105, spd: 60, spe: 105 }, baseExp: 166, catchRate: 45,
    desc: "鬃毛像雷电一样竖起，会从头顶放出电云。",
    moves: [[1, "tackle"], [1, "thundershock"], [1, "quickAttack"], [1, "spark"], [22, "bite"], [26, "thunderWave"], [30, "thunderbolt"], [34, "crunch"]],
  }),

  geodude: S({
    name: "小拳石", types: ["rock", "ground"], shape: "rock", color: "#9a958a", color2: "#6f6a60", stage: 1,
    base: { hp: 40, atk: 80, def: 100, spa: 30, spd: 30, spe: 20 }, baseExp: 73, catchRate: 255,
    evolve: { level: 25, to: "graveler" },
    desc: "喜欢待在山路上，只露出上半身，看起来像石头。",
    moves: [[1, "tackle"], [1, "harden"], [6, "rockThrow"], [10, "mudSlap"], [14, "bulldoze"], [18, "rockSlide"], [22, "earthquake"], [26, "bodySlam"]],
  }),
  graveler: S({
    name: "隆隆石", types: ["rock", "ground"], shape: "rock", color: "#8a857a", color2: "#5f5a50", stage: 2,
    base: { hp: 55, atk: 95, def: 115, spa: 45, spd: 45, spe: 35 }, baseExp: 134, catchRate: 120,
    desc: "用坚硬的身体从山上滚下来，沿途撞碎岩壁。",
    moves: [[1, "tackle"], [1, "harden"], [1, "rockThrow"], [1, "mudSlap"], [18, "rockSlide"], [22, "earthquake"], [27, "bodySlam"], [32, "bulldoze"]],
  }),

  marill: S({
    name: "玛力露", types: ["water"], shape: "aqua", color: "#5ab8e8", color2: "#ffffff", stage: 1,
    base: { hp: 70, atk: 20, def: 50, spa: 20, spd: 50, spe: 40 }, baseExp: 58, catchRate: 190,
    evolve: { level: 18, to: "azumarill" },
    desc: "尾巴末端的水球充满弹性，能在水面上弹跳前进。",
    moves: [[1, "tackle"], [1, "waterGun"], [6, "bubble"], [10, "tailWhip"], [14, "aquaTail"], [18, "bubbleBeam"], [22, "bodySlam"], [26, "surf"]],
  }),
  azumarill: S({
    name: "玛力露丽", types: ["water"], shape: "aqua", color: "#4aa8e0", color2: "#f0f8ff", stage: 2,
    base: { hp: 100, atk: 50, def: 80, spa: 50, spd: 80, spe: 50 }, baseExp: 153, catchRate: 75,
    desc: "能用尾巴上的水球感知水流，是河里的游泳高手。",
    moves: [[1, "tackle"], [1, "waterGun"], [1, "bubbleBeam"], [1, "aquaTail"], [18, "bodySlam"], [22, "surf"], [27, "brickBreak"], [32, "icePunch"]],
  }),

  ralts: S({
    name: "拉鲁拉丝", types: ["psychic"], shape: "psychic", color: "#9fd8b8", color2: "#f26a8a", stage: 1,
    base: { hp: 28, atk: 25, def: 25, spa: 45, spd: 35, spe: 40 }, baseExp: 70, catchRate: 235,
    evolve: { level: 20, to: "kirlia" },
    desc: "能感知人类的情绪，心情好时会靠近你。",
    moves: [[1, "growl"], [1, "confusion"], [6, "hypnosis"], [10, "calmMind"], [14, "psybeam"], [18, "psychic"], [22, "shadowBall"], [26, "thunderWave"]],
  }),
  kirlia: S({
    name: "奇鲁莉安", types: ["psychic"], shape: "psychic", color: "#8fcfa8", color2: "#e85a7a", stage: 2,
    base: { hp: 38, atk: 35, def: 35, spa: 65, spd: 55, spe: 50 }, baseExp: 140, catchRate: 120,
    evolve: { level: 30, to: "gardevoir" },
    desc: "会为了训练家的心情而跳舞，裙摆随着情绪飘动。",
    moves: [[1, "growl"], [1, "confusion"], [1, "hypnosis"], [1, "calmMind"], [14, "psybeam"], [18, "psychic"], [23, "shadowBall"], [28, "thunderbolt"]],
  }),
  gardevoir: S({
    name: "沙奈朵", types: ["psychic"], shape: "psychic", color: "#7fbf98", color2: "#e84a6a", stage: 3,
    base: { hp: 68, atk: 65, def: 65, spa: 125, spd: 115, spe: 80 }, baseExp: 233, catchRate: 45,
    desc: "能预知未来，为了保护训练家会释放全部超能力。",
    moves: [[1, "confusion"], [1, "hypnosis"], [1, "calmMind"], [1, "psybeam"], [18, "psychic"], [23, "shadowBall"], [28, "thunderbolt"], [33, "recover"]],
  }),

  sableye: S({
    name: "勾魂眼", types: ["dark", "ghost"], shape: "ghost", color: "#5a4a70", color2: "#e84a6a", stage: 1,
    base: { hp: 50, atk: 75, def: 75, spa: 65, spd: 65, spe: 50 }, baseExp: 133, catchRate: 45,
    desc: "眼睛在黑暗里会发出宝石般的光，喜欢恶作剧。",
    moves: [[1, "scratch"], [1, "growl"], [6, "faintAttack"], [10, "shadowSneak"], [14, "nightSlash"], [18, "shadowClaw"], [22, "shadowBall"], [26, "recover"]],
  }),
  mawile: S({
    name: "大嘴娃", types: ["steel"], shape: "steel", color: "#e8d06a", color2: "#5a4a5a", stage: 1,
    base: { hp: 50, atk: 85, def: 85, spa: 55, spd: 55, spe: 50 }, baseExp: 133, catchRate: 45,
    desc: "角上长着巨大的颚，会用可爱的外表让对手放松警惕。",
    moves: [[1, "tackle"], [1, "growl"], [6, "bite"], [10, "metalClaw"], [14, "faintAttack"], [18, "ironHead"], [22, "crunch"], [26, "swordsDance"]],
  }),

  numel: S({
    name: "呆火驼", types: ["fire", "ground"], shape: "camel", color: "#e8a85a", color2: "#4a7fb8", stage: 1,
    base: { hp: 60, atk: 60, def: 40, spa: 65, spd: 45, spe: 35 }, baseExp: 88, catchRate: 255,
    evolve: { level: 33, to: "camerupt" },
    desc: "背上的驼峰里装满滚烫的熔岩，迟钝但很耐打。",
    moves: [[1, "tackle"], [1, "growl"], [5, "ember"], [10, "mudSlap"], [14, "bulldoze"], [18, "flameWheel"], [22, "rockSlide"], [26, "flamethrower"]],
  }),
  camerupt: S({
    name: "喷火驼", types: ["fire", "ground"], shape: "camel", color: "#d8784a", color2: "#3a5f98", stage: 2,
    base: { hp: 70, atk: 100, def: 70, spa: 105, spd: 75, spe: 40 }, baseExp: 175, catchRate: 150,
    desc: "背上的火山口会喷出岩浆，生气时震动大地。",
    moves: [[1, "tackle"], [1, "growl"], [1, "ember"], [1, "mudSlap"], [18, "flameWheel"], [22, "rockSlide"], [26, "earthquake"], [30, "flamethrower"]],
  }),

  cacnea: S({
    name: "沙漠奈亚", types: ["grass"], shape: "cactus", color: "#6fbf5a", color2: "#e8d04a", stage: 1,
    base: { hp: 50, atk: 85, def: 40, spa: 85, spd: 40, spe: 35 }, baseExp: 97, catchRate: 190,
    desc: "在沙漠里也能顽强生长，身上的刺会储存水分。",
    moves: [[1, "tackle"], [1, "growl"], [5, "absorb"], [10, "poisonSting"], [14, "mudSlap"], [18, "leafBlade"], [22, "gigaDrain"], [26, "sleepPowder"]],
  }),
};

export const SPECIES_ORDER = Object.keys(SPECIES);
export const SPECIES_COUNT = SPECIES_ORDER.length;
export const STARTERS = ["torchic", "treecko", "mudkip"];

// ---------------------------------------------------------------- 道具
export const BALLS = {
  pokeBall: { id: "pokeBall", name: "精灵球", mult: 1, price: 200, color: "#e85050", desc: "最普通的精灵球，捕获率 ×1.0" },
  greatBall: { id: "greatBall", name: "超级球", mult: 1.5, price: 600, color: "#4a8fe8", desc: "性能更好的球，捕获率 ×1.5" },
  ultraBall: { id: "ultraBall", name: "高级球", mult: 2, price: 1200, color: "#e8c84a", desc: "高性能精灵球，捕获率 ×2.0" },
  masterBall: { id: "masterBall", name: "大师球", mult: 255, price: 0, color: "#b05ae8", desc: "必定捕获的传说中的精灵球" },
};
export const BALL_IDS = Object.keys(BALLS);

export const ITEMS = {
  potion: { id: "potion", name: "伤药", kind: "heal", heal: 20, price: 300, color: "#7ddc91", desc: "恢复 20 点 HP" },
  superPotion: { id: "superPotion", name: "好伤药", kind: "heal", heal: 50, price: 700, color: "#4cc06b", desc: "恢复 50 点 HP" },
  hyperPotion: { id: "hyperPotion", name: "厉害伤药", kind: "heal", heal: 120, price: 1500, color: "#2f9a4a", desc: "恢复 120 点 HP" },
  ...BALLS,
};
export const ITEM_IDS = ["potion", "superPotion", "hyperPotion", "pokeBall", "greatBall", "ultraBall"];

// ---------------------------------------------------------------- 等级 / 经验
export function expForLevel(level, growth = "mediumFast") {
  if (level <= 1) return 0;
  if (growth === "mediumSlow") {
    return Math.max(0, Math.floor((6 / 5) * level ** 3 - 15 * level ** 2 + 100 * level - 140));
  }
  return Math.floor(level ** 3);
}

export function expToNext(mon) {
  const sp = SPECIES[mon.species];
  if (mon.level >= 100) return 0;
  return Math.max(0, expForLevel(mon.level + 1, sp.growth) - mon.exp);
}

export function levelProgress(mon) {
  const sp = SPECIES[mon.species];
  if (mon.level >= 100) return 1;
  const cur = expForLevel(mon.level, sp.growth);
  const next = expForLevel(mon.level + 1, sp.growth);
  return next <= cur ? 0 : Math.max(0, Math.min(1, (mon.exp - cur) / (next - cur)));
}

function learnablePool(sp, level) {
  const out = [];
  for (const [lv, id] of sp.moves) {
    if (lv <= level && MOVES[id] && !out.includes(id)) out.push(id);
  }
  return out;
}

export function movesAtLevel(sp, level) {
  return learnablePool(sp, level).slice(-4);
}

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `pk_${Date.now().toString(36)}_${uidCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function rndIv() {
  return Math.floor(Math.random() * 32);
}

export function createMon(speciesId, level, opts = {}) {
  const sp = SPECIES[speciesId];
  const lv = Math.max(1, Math.min(100, level));
  const ivs = opts.ivs || {
    hp: rndIv(), atk: rndIv(), def: rndIv(), spa: rndIv(), spd: rndIv(), spe: rndIv(),
  };
  const nature = opts.nature || NATURES[Math.floor(Math.random() * NATURES.length)].id;
  const mon = {
    uid: opts.uid || uid(),
    species: speciesId,
    level: lv,
    exp: expForLevel(lv, sp.growth),
    ivs,
    nature,
    moves: movesAtLevel(sp, lv),
  };
  return mon;
}

export function calcStats(mon) {
  const sp = SPECIES[mon.species];
  const nature = NATURES.find((n) => n.id === mon.nature) || NATURES[0];
  const out = {};
  for (const key of STAT_KEYS) {
    const base = sp.base[key];
    const iv = (mon.ivs && mon.ivs[key]) || 0;
    if (key === "hp") {
      out.hp = Math.floor(((2 * base + iv) * mon.level) / 100) + mon.level + 10;
    } else {
      let val = Math.floor(((2 * base + iv) * mon.level) / 100) + 5;
      if (nature.plus === key) val = Math.floor(val * 1.1);
      if (nature.minus === key) val = Math.floor(val * 0.9);
      out[key] = val;
    }
  }
  return out;
}

/**
 * 获得经验并升级、进化、学习招式。
 * 返回 { gained, levels, learned, evolvedFrom, evolvedTo }
 */
export function grantExp(mon, amount) {
  const events = { gained: Math.max(0, Math.floor(amount)), levels: [], learned: [], evolvedFrom: null, evolvedTo: null };
  mon.exp += events.gained;
  let guard = 0;
  while (mon.level < 100 && guard++ < 100) {
    const sp = SPECIES[mon.species];
    if (mon.exp < expForLevel(mon.level + 1, sp.growth)) break;
    mon.level += 1;
    events.levels.push(mon.level);
    // 本等级新招式（最多一个）
    const found = sp.moves.filter(([lv, id]) => lv === mon.level && MOVES[id]).map(([, id]) => id);
    for (const id of found) {
      if (mon.moves.includes(id)) continue;
      mon.moves.push(id);
      if (mon.moves.length > 4) mon.moves.shift();
      events.learned.push(id);
      break;
    }
    // 进化
    const cur = SPECIES[mon.species];
    if (cur.evolve && mon.level >= cur.evolve.level && SPECIES[cur.evolve.to]) {
      events.evolvedFrom = mon.species;
      mon.species = cur.evolve.to;
      events.evolvedTo = mon.species;
    }
  }
  return events;
}

/** Gen III 捕获判定 */
export function catchChance(target, ballMult = 1, force = false) {
  if (force || ballMult >= 255) {
    return { caught: true, shakes: 4, a: 255, b: 65536 };
  }
  const maxHp = Math.max(1, target.maxHp);
  const hp = Math.max(1, target.hp);
  let statusMult = 1;
  if (target.status === "slp" || target.status === "frz") statusMult = 2;
  else if (target.status) statusMult = 1.5;
  const rate = target.catchRate || 120;
  const a = Math.max(1, Math.floor(((3 * maxHp - 2 * hp) * rate * ballMult) / (3 * maxHp) * statusMult));
  if (a >= 255) return { caught: true, shakes: 4, a, b: 65536 };
  const b = Math.floor(65536 / Math.pow(255 / a, 0.1875));
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (Math.random() * 65536 < b) shakes++;
    else break;
  }
  return { caught: shakes >= 4, shakes, a, b };
}

// ---------------------------------------------------------------- 关卡
export const LEVELS = [
  {
    id: 1, name: "101号道路", sub: "野生 · 土狼犬", theme: "route", wild: true,
    enemies: [{ species: "poochyena", level: 3 }], reward: 300, items: { pokeBall: 3 },
    intro: "草丛沙沙作响，一只土狼犬跳了出来！",
  },
  {
    id: 2, name: "卡那兹市", sub: "训练家 · 小胜", theme: "city", trainer: "小胜",
    enemies: [{ species: "zigzagoon", level: 5 }, { species: "taillow", level: 6 }],
    reward: 600, items: { potion: 2 }, intro: "小胜拦住了你：来一场宝可梦对战吧！",
  },
  {
    id: 3, name: "橙华森林", sub: "野生 · 刺尾虫 / 蛇纹熊", theme: "forest", wild: true,
    enemies: [{ species: "wurmple", level: 7 }, { species: "zigzagoon", level: 8 }],
    reward: 500, items: { greatBall: 2 }, intro: "森林深处传来窸窸窣窣的声音……",
  },
  {
    id: 4, name: "卡那兹道馆", sub: "馆主 · 杜娟", theme: "gym", trainer: "杜娟",
    enemies: [{ species: "geodude", level: 10 }, { species: "mawile", level: 12 }],
    reward: 1200, items: { superPotion: 2 }, intro: "馆主杜娟：让我看看你和岩石的羁绊！",
  },
  {
    id: 5, name: "流星瀑布", sub: "野生 · 玛力露 / 呆火驼", theme: "cave", wild: true,
    enemies: [{ species: "marill", level: 12 }, { species: "numel", level: 13 }],
    reward: 800, items: { ultraBall: 1 }, intro: "瀑布的水雾中，两只宝可梦正在嬉戏。",
  },
  {
    id: 6, name: "紫堇市", sub: "劲敌 · 小遥", theme: "city", trainer: "小遥", rivals: true,
    enemies: [{ species: "taillow", level: 15 }, { species: "ralts", level: 16 }, { species: "marshtomp", level: 17 }],
    reward: 1800, items: { hyperPotion: 1 }, intro: "小遥跑了过来：好久不见，来对战吧！",
  },
  {
    id: 7, name: "送神火山", sub: "野生 · 勾魂眼 / 拉鲁拉丝", theme: "volcano", wild: true,
    enemies: [{ species: "sableye", level: 18 }, { species: "ralts", level: 19 }],
    reward: 1000, items: { greatBall: 3 }, intro: "山顶的雾气里，一双宝石般的眼睛在闪动。",
  },
  {
    id: 8, name: "冠军之路", sub: "冠军 · 大吾", theme: "champion", trainer: "大吾",
    enemies: [{ species: "mawile", level: 22 }, { species: "sableye", level: 22 }, { species: "gardevoir", level: 25 }],
    reward: 5000, items: { masterBall: 1 }, intro: "冠军大吾：真正的冒险，现在才刚刚开始！",
  },
];

export const TOTAL_LEVELS = LEVELS.length;

export const RIVAL_TEAMS = {
  torchic: [{ species: "marshtomp", level: 17 }, { species: "taillow", level: 15 }, { species: "ralts", level: 16 }],
  treecko: [{ species: "combusken", level: 17 }, { species: "taillow", level: 15 }, { species: "ralts", level: 16 }],
  mudkip: [{ species: "grovyle", level: 17 }, { species: "taillow", level: 15 }, { species: "ralts", level: 16 }],
};

export function getLevelEnemies(level, starter) {
  if (level.rivals && RIVAL_TEAMS[starter]) return RIVAL_TEAMS[starter];
  return level.enemies;
}

export function getLevel(id) {
  return LEVELS.find((lv) => lv.id === id) || LEVELS[0];
}
