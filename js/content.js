/* 传奇学堂：职业、技能、怪物、装备与地图。画面与名字为原创教学设定。 */
(function () {
  'use strict';

  const T = {
    GRASS: 0, DIRT: 1, STONE: 2, WATER: 3, WOOD: 4, SAND: 5,
    CAVE: 6, TEMPLE: 7, FLOWER: 8, WALL: 9, TREE: 10, ROCK: 11,
    FENCE: 12, GATE: 13, CARPET: 14, LAVA: 15,
  };
  const BLOCK = new Set([T.WATER, T.WALL, T.TREE, T.ROCK, T.FENCE, T.LAVA]);

  const classes = {
    warrior: {
      id: 'warrior', name: '战士', blurb: '近身拼刀，血厚防高。',
      detail: '用剑砍出道路。基本剑术、刺杀剑术、半月弯刀、烈火剑法会随等级打开。',
      color: '#d4573a',
      hp: 130, mp: 42, atk: [7, 12], mag: [0, 0], tao: [0, 0], def: 3, mdef: 1,
      gHp: 24, gMp: 6, gAtk: 1.55, gMag: 0, gTao: 0, gDef: 0.85, gMdef: 0.25,
      basicRange: 1.45, basicCd: 0.68, basicKind: 'melee',
    },
    mage: {
      id: 'mage', name: '法师', blurb: '远程法术，魔法强，身子脆。',
      detail: '火球、雷电、冰咆哮和魔法盾。站远一点放技能，记得喝魔法药。',
      color: '#4c8dff',
      hp: 74, mp: 120, atk: [2, 4], mag: [8, 14], tao: [0, 0], def: 1, mdef: 2,
      gHp: 10, gMp: 20, gAtk: 0.3, gMag: 1.85, gTao: 0, gDef: 0.28, gMdef: 0.5,
      basicRange: 6.1, basicCd: 0.82, basicKind: 'bolt',
    },
    taoist: {
      id: 'taoist', name: '道士', blurb: '会治病、用符，还能召唤帮手。',
      detail: '治愈术、灵魂火符、召唤骷髅、隐身术。可以一边照顾自己一边输出。',
      color: '#e2b143',
      hp: 98, mp: 92, atk: [3, 6], mag: [1, 3], tao: [7, 12], def: 2, mdef: 2,
      gHp: 15, gMp: 14, gAtk: 0.45, gMag: 0.35, gTao: 1.55, gDef: 0.45, gMdef: 0.42,
      basicRange: 5.4, basicCd: 0.78, basicKind: 'talisman',
    },
  };

  const skills = [
    { id: 'w_basic', name: '基本剑术', cls: 'warrior', level: 1, mp: 0, cd: 0, type: 'stance', desc: '摆好剑势，普通攻击伤害提高两成。' },
    { id: 'w_stab', name: '刺杀剑术', cls: 'warrior', level: 3, mp: 2, cd: 0, type: 'stance', desc: '刺穿更远的距离，并打到目标身后的敌人。每次挥砍消耗少量魔法。' },
    { id: 'w_half', name: '半月弯刀', cls: 'warrior', level: 6, mp: 3, cd: 0, type: 'stance', desc: '剑光成半月，溅射身边的怪物。' },
    { id: 'w_fire', name: '烈火剑法', cls: 'warrior', level: 9, mp: 14, cd: 8, type: 'active', range: 1.6, desc: '剑上燃起烈火，重重砍中目标，并燎到旁边的怪物。' },
    { id: 'm_fire', name: '火球术', cls: 'mage', level: 1, mp: 4, cd: 0.55, type: 'projectile', range: 6.4, desc: '丢出一颗火球，造成魔法伤害。' },
    { id: 'm_thunder', name: '雷电术', cls: 'mage', level: 3, mp: 10, cd: 1.25, type: 'bolt', range: 6.6, desc: '召下一道雷，伤害更高。' },
    { id: 'm_ice', name: '冰咆哮', cls: 'mage', level: 6, mp: 18, cd: 6.5, type: 'aoe', range: 6.2, radius: 2.35, desc: '在目标身边卷起冰浪，打中一片，并让怪物变慢。' },
    { id: 'm_shield', name: '魔法盾', cls: 'mage', level: 9, mp: 16, cd: 18, type: 'shield', desc: '用魔法罩住自己，一段时间内少受伤害。' },
    { id: 't_heal', name: '治愈术', cls: 'taoist', level: 1, mp: 8, cd: 1, type: 'heal', desc: '治疗自己的生命。道术越高，回复越多。' },
    { id: 't_talisman', name: '灵魂火符', cls: 'taoist', level: 3, mp: 5, cd: 0.7, type: 'projectile', range: 5.8, desc: '掷出符咒，对远处的怪物造成道术伤害。' },
    { id: 't_summon', name: '召唤骷髅', cls: 'taoist', level: 6, mp: 20, cd: 18, type: 'summon', desc: '召唤一只骷髅帮忙战斗，直到它被打倒。' },
    { id: 't_stealth', name: '隐身术', cls: 'taoist', level: 9, mp: 10, cd: 14, type: 'stealth', desc: '隐身一小会儿，怪物会失去目标。一旦攻击就会现身。' },
  ];

  const monsters = {
    chicken: { id: 'chicken', name: '鸡', hp: 30, atk: [2, 5], def: 0, mdef: 0, exp: 24, gold: [5, 12], aggro: 2.7, speed: 1.45, range: 1.15, atkCd: 1.35, behavior: 'wander', tier: 1, item: 0.28, potion: 0.22, leash: 5 },
    deer: { id: 'deer', name: '鹿', hp: 52, atk: [4, 8], def: 1, mdef: 0, exp: 36, gold: [8, 16], aggro: 3.1, speed: 1.7, range: 1.2, atkCd: 1.3, behavior: 'wander', tier: 1, item: 0.32, potion: 0.2, leash: 6 },
    scarecrow: { id: 'scarecrow', name: '稻草人', hp: 70, atk: [5, 10], def: 2, mdef: 1, exp: 46, gold: [10, 20], aggro: 2.4, speed: 0, range: 1.25, atkCd: 1.45, behavior: 'still', tier: 1, item: 0.36, potion: 0.16, leash: 0 },
    cat: { id: 'cat', name: '钉耙猫', hp: 110, atk: [9, 16], def: 3, mdef: 2, exp: 78, gold: [14, 28], aggro: 4.6, speed: 1.85, range: 1.25, atkCd: 1.15, behavior: 'chase', tier: 2, item: 0.4, potion: 0.22, leash: 8 },
    skeleton: { id: 'skeleton', name: '骷髅', hp: 170, atk: [13, 22], def: 6, mdef: 4, exp: 120, gold: [20, 40], aggro: 5.2, speed: 1.55, range: 1.3, atkCd: 1.2, behavior: 'chase', tier: 3, item: 0.46, potion: 0.24, leash: 8 },
    zombie: { id: 'zombie', name: '僵尸', hp: 250, atk: [16, 28], def: 8, mdef: 3, exp: 165, gold: [28, 52], aggro: 4.4, speed: 1.05, range: 1.25, atkCd: 1.5, behavior: 'chase', tier: 3, item: 0.5, potion: 0.26, leash: 7 },
    guard: { id: 'guard', name: '沃玛卫士', hp: 420, atk: [22, 36], def: 12, mdef: 8, exp: 260, gold: [40, 80], aggro: 5.5, speed: 1.4, range: 1.35, atkCd: 1.25, behavior: 'chase', tier: 4, item: 0.62, potion: 0.3, leash: 9 },
    boss: { id: 'boss', name: '沃玛教主', hp: 1100, atk: [30, 48], def: 14, mdef: 12, exp: 1100, gold: [220, 420], aggro: 7.5, speed: 1.35, range: 1.5, atkCd: 1.35, behavior: 'boss', tier: 4, item: 1, potion: 0.8, leash: 12, boss: true },
  };

  const itemTpls = [
    { id: 'w_wood', name: '木剑', slot: 'weapon', cls: 'warrior', level: 1, atk: [2, 5], price: 40, desc: '新手用的木剑，轻，但是能砍鸡。' },
    { id: 'w_qing', name: '青锋剑', slot: 'weapon', cls: 'warrior', level: 3, atk: [5, 10], price: 220, desc: '剑身青亮，比木剑锋利。' },
    { id: 'w_han', name: '寒星剑', slot: 'weapon', cls: 'warrior', level: 6, atk: [10, 18], price: 780, desc: '剑锋像寒星，适合去洞里冒险。' },
    { id: 'w_chi', name: '赤霞剑', slot: 'weapon', cls: 'warrior', level: 9, atk: [16, 28], price: 2100, desc: '剑身上有一层暖红色的光。' },
    { id: 'w_yao', name: '曜炎剑', slot: 'weapon', cls: 'warrior', level: 12, atk: [22, 38], price: 5600, desc: '学堂勇士的佩剑，挥起来带风。' },
    { id: 'm_wood', name: '木杖', slot: 'weapon', cls: 'mage', level: 1, mag: [2, 6], price: 40, desc: '一根能导魔法的木杖。' },
    { id: 'm_xue', name: '学徒杖', slot: 'weapon', cls: 'mage', level: 3, mag: [6, 12], price: 220, desc: '法师学徒的第一根正式法杖。' },
    { id: 'm_lei', name: '雷纹杖', slot: 'weapon', cls: 'mage', level: 6, mag: [11, 20], price: 780, desc: '杖身刻着雷纹。' },
    { id: 'm_bing', name: '冰晶杖', slot: 'weapon', cls: 'mage', level: 9, mag: [17, 30], price: 2100, desc: '杖头镶着冰晶。' },
    { id: 'm_huo', name: '流火杖', slot: 'weapon', cls: 'mage', level: 12, mag: [24, 40], price: 5600, desc: '火球会沿着杖尖飞出去。' },
    { id: 't_wood', name: '桃木剑', slot: 'weapon', cls: 'taoist', level: 1, tao: [2, 6], price: 40, desc: '道士入门的桃木剑。' },
    { id: 't_fu', name: '符文剑', slot: 'weapon', cls: 'taoist', level: 3, tao: [6, 12], price: 220, desc: '剑身上贴着小小的符。' },
    { id: 't_xuan', name: '玄铁剑', slot: 'weapon', cls: 'taoist', level: 6, tao: [11, 19], price: 780, desc: '比桃木更沉，道术更稳。' },
    { id: 't_ling', name: '通灵剑', slot: 'weapon', cls: 'taoist', level: 9, tao: [16, 28], price: 2100, desc: '适合召唤和符咒一起使用。' },
    { id: 't_zhen', name: '镇魂剑', slot: 'weapon', cls: 'taoist', level: 12, tao: [22, 36], price: 5600, desc: '道观里流传的镇守之剑。' },

    { id: 'a_cloth', name: '布衣', slot: 'armor', level: 1, def: 2, hp: 8, price: 50, desc: '普通布衣，三个职业都能穿。' },
    { id: 'a_leather', name: '轻皮甲', slot: 'armor', cls: 'warrior', level: 3, def: 5, hp: 20, price: 260, desc: '皮甲，战士穿上更扛打。' },
    { id: 'a_lock', name: '锁子甲', slot: 'armor', cls: 'warrior', level: 6, def: 9, hp: 40, price: 860, desc: '铁环编成的甲。' },
    { id: 'a_red', name: '赤铜铠', slot: 'armor', cls: 'warrior', level: 9, def: 14, hp: 70, price: 2400, desc: '铜红色的重铠。' },
    { id: 'a_robe1', name: '学徒袍', slot: 'armor', cls: 'mage', level: 3, def: 2, mdef: 3, mp: 25, price: 260, desc: '宽袖法袍。' },
    { id: 'a_robe2', name: '霜纹袍', slot: 'armor', cls: 'mage', level: 6, def: 4, mdef: 7, mp: 50, price: 860, desc: '袍摆绣着霜纹。' },
    { id: 'a_robe3', name: '星辉袍', slot: 'armor', cls: 'mage', level: 9, def: 6, mdef: 11, mp: 80, price: 2400, desc: '夜里会微微发亮。' },
    { id: 'a_tao1', name: '灵纹道袍', slot: 'armor', cls: 'taoist', level: 3, def: 3, mdef: 2, hp: 12, mp: 16, price: 260, desc: '轻便的道袍。' },
    { id: 'a_tao2', name: '松纹道袍', slot: 'armor', cls: 'taoist', level: 6, def: 6, mdef: 5, hp: 28, mp: 30, price: 860, desc: '颜色像松针。' },
    { id: 'a_tao3', name: '玄素道袍', slot: 'armor', cls: 'taoist', level: 9, def: 9, mdef: 8, hp: 46, mp: 48, price: 2400, desc: '黑白相间的道袍。' },

    { id: 'h_cloth', name: '布帽', slot: 'helmet', level: 1, def: 1, price: 30, desc: '一顶软布帽。' },
    { id: 'h_copper', name: '铜盔', slot: 'helmet', level: 4, def: 3, hp: 10, price: 320, desc: '铜做的头盔。' },
    { id: 'h_iron', name: '铁盔', slot: 'helmet', level: 7, def: 5, hp: 18, mdef: 1, price: 980, desc: '更结实的铁盔。' },
    { id: 'h_feather', name: '赤羽盔', slot: 'helmet', level: 10, def: 7, hp: 28, mdef: 3, price: 2600, desc: '盔顶插着一根红羽。' },

    { id: 'n_gold', name: '金项链', slot: 'necklace', level: 1, tao: [0, 1], mag: [0, 1], atk: [0, 1], price: 80, desc: '细细的金项链。' },
    { id: 'n_jade', name: '蓝玉项链', slot: 'necklace', level: 4, mag: [1, 4], mp: 15, price: 420, desc: '蓝色玉石，法师很喜欢。' },
    { id: 'n_amber', name: '琥珀项链', slot: 'necklace', level: 7, tao: [2, 6], hp: 12, price: 1100, desc: '温热的琥珀。' },
    { id: 'n_dragon', name: '云纹项链', slot: 'necklace', level: 10, atk: [2, 6], mag: [2, 6], tao: [2, 6], price: 2800, desc: '项链上刻着云纹。' },

    { id: 'b_iron', name: '铁手镯', slot: 'bracelet', level: 1, def: 1, price: 60, desc: '普通铁镯。' },
    { id: 'b_silver', name: '银手镯', slot: 'bracelet', level: 4, def: 2, mdef: 1, price: 360, desc: '银白色的手镯。' },
    { id: 'b_gold', name: '金手镯', slot: 'bracelet', level: 7, def: 3, hp: 16, price: 980, desc: '沉甸甸的金镯。' },
    { id: 'b_spirit', name: '灵纹镯', slot: 'bracelet', level: 10, mag: [1, 5], tao: [1, 5], mdef: 3, price: 2400, desc: '纹路会随魔法轻轻亮一下。' },

    { id: 'r_copper', name: '铜戒指', slot: 'ring', level: 1, atk: [0, 2], price: 70, desc: '铜戒，稍微增加攻击。' },
    { id: 'r_pearl', name: '珍珠戒指', slot: 'ring', level: 4, mag: [1, 3], mp: 10, price: 380, desc: '一颗小珍珠。' },
    { id: 'r_light', name: '灵光戒', slot: 'ring', level: 7, tao: [1, 5], mdef: 2, price: 1080, desc: '戒面有一点柔光。' },
    { id: 'r_stone', name: '曜石戒', slot: 'ring', level: 10, atk: [2, 6], mag: [2, 6], tao: [2, 6], price: 2600, desc: '黑亮的曜石戒指。' },
  ];

  const potions = [
    { id: 'hp_s', name: '金创药(小)', kind: 'potion', hp: 48, price: 20, desc: '恢复少量生命。' },
    { id: 'hp_m', name: '金创药(中)', kind: 'potion', hp: 110, price: 55, desc: '恢复较多生命。' },
    { id: 'mp_s', name: '魔法药(小)', kind: 'potion', mp: 36, price: 20, desc: '恢复少量魔法。' },
    { id: 'mp_m', name: '魔法药(中)', kind: 'potion', mp: 90, price: 55, desc: '恢复较多魔法。' },
  ];

  const SUGGEST = { village: 1, city: 1, forest: 3, cave: 6, temple: 9 };
  const DIFFICULTY = { village: 1, city: 1, forest: 2, cave: 4, temple: 5 };

  function expNeed(level) {
    return Math.round(48 + level * 26);
  }

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeMap(id, name, w, h, fill, theme) {
    const tiles = [];
    const roof = [];
    for (let y = 0; y < h; y++) {
      tiles.push(new Array(w).fill(fill));
      roof.push(new Array(w).fill(null));
    }
    return {
      id, name, w, h, tiles, roof, theme,
      npcs: [], spawns: [], gates: [],
      spawn: { x: 2.5, y: 2.5 },
      difficulty: DIFFICULTY[id] || 1,
      suggest: SUGGEST[id] || 1,
      safe: id === 'village' || id === 'city',
    };
  }

  function inMap(map, x, y) {
    return x >= 0 && y >= 0 && x < map.w && y < map.h;
  }
  function set(map, x, y, t) {
    if (inMap(map, x, y)) map.tiles[y][x] = t;
  }
  function rect(map, x, y, w, h, t) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(map, x + i, y + j, t);
  }
  function walkable(map, x, y) {
    if (!inMap(map, x, y)) return false;
    return !BLOCK.has(map.tiles[y][x]);
  }
  function building(map, x, y, w, h, color) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
        const door = j === h - 1 && i === (w >> 1);
        set(map, x + i, y + j, edge && !door ? T.WALL : T.WOOD);
        if (edge && !door) map.roof[y + j][x + i] = color;
      }
    }
    return { x: x + (w >> 1), y: y + h - 1 };
  }
  function border(map, type) {
    for (let x = 0; x < map.w; x++) {
      set(map, x, 0, type);
      set(map, x, map.h - 1, type);
    }
    for (let y = 0; y < map.h; y++) {
      set(map, 0, y, type);
      set(map, map.w - 1, y, type);
    }
  }
  function scatter(map, rng, from, chance, to) {
    for (let y = 2; y < map.h - 2; y++) {
      for (let x = 2; x < map.w - 2; x++) {
        if (map.tiles[y][x] !== from) continue;
        if (rng() < chance) map.tiles[y][x] = to;
      }
    }
  }
  function clearDisk(map, x, y, r, tile) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (i * i + j * j > r * r + 0.1) continue;
        if (!inMap(map, x + i, y + j)) continue;
        const cur = map.tiles[y + j][x + i];
        if (cur === T.TREE || cur === T.FENCE || cur === T.ROCK) map.tiles[y + j][x + i] = tile;
      }
    }
  }
  function gate(map, x, y, to, tx, ty) {
    set(map, x, y, T.GATE);
    clearDisk(map, x, y, 1, map.theme === 'cave' ? T.CAVE : map.theme === 'temple' ? T.TEMPLE : T.DIRT);
    set(map, x, y, T.GATE);
    map.gates.push({ x, y, to, tx, ty });
  }

  function buildVillage(rng) {
    const m = makeMap('village', '新手村', 34, 30, T.GRASS, 'village');
    border(m, T.TREE);
    building(m, 3, 3, 6, 5, '#c4473a');
    building(m, 14, 3, 6, 5, '#2f8f4e');
    building(m, 24, 3, 6, 5, '#3d6fbf');
    rect(m, 4, 8, 26, 3, T.STONE);
    rect(m, 10, 12, 14, 7, T.STONE);
    rect(m, 2, 14, 6, 4, T.WATER);
    rect(m, 1, 13, 8, 6, T.SAND);
    rect(m, 2, 14, 6, 4, T.WATER);
    rect(m, 24, 20, 8, 6, T.DIRT);
    for (let y = 19; y <= 28; y++) { set(m, 16, y, T.DIRT); set(m, 17, y, T.DIRT); }
    for (let x = 20; x <= 32; x++) { set(m, x, 15, T.DIRT); set(m, x, 16, T.DIRT); }
    scatter(m, rng, T.GRASS, 0.045, T.FLOWER);
    gate(m, 16, 29, 'forest', 20.5, 3.5);
    gate(m, 17, 29, 'forest', 21.5, 3.5);
    gate(m, 33, 15, 'city', 3.5, 16.5);
    gate(m, 33, 16, 'city', 3.5, 17.5);
    m.spawn = { x: 16.5, y: 15.5 };
    const npc = (name, role, shop, x, y, color, lines) => m.npcs.push({ name, role, shop, x, y, color, lines });
    npc('铁匠老张', 'shop', 'weapon', 6.5, 8.5, '#d4573a', ['兵器都在这儿。看中了就买，背包装不下我可不赊账。']);
    npc('药婆婆', 'shop', 'potion', 17.5, 8.5, '#6fbf73', ['金创药补血，魔法药补蓝。打不过就回来，婆婆免费给你疗伤。']);
    npc('珍姐', 'shop', 'jewel', 27.5, 8.5, '#7eb6ff', ['项链、手镯、戒指，戴上会变强一点点。']);
    npc('玄真道长', 'trainer', 'trainer', 12.5, 14.5, '#e2b143', ['技能书可以在我这儿买。等级够了，再在背包里打开它。']);
    npc('王大爷', 'talk', null, 18.5, 14.5, '#f0d7a2', [
      '孩子，点地面就能走路，点怪物就会上去打。',
      '怪物倒下后会考你一道题。答对，装备和金币才会掉出来。',
      '答错也没关系，看看讲解，记住了，下次就能拿到奖赏。',
      '南边是森林，东边是比奇城。洞和寺庙在更深处。',
    ]);
    npc('云游道人', 'travel', null, 20.5, 16.5, '#d7c4ff', ['去过的地方，我可以送你一程。']);
    [[4, 22], [6, 24], [5, 26], [8, 23]].forEach(([x, y]) => m.spawns.push({ monster: 'chicken', x, y }));
    [[12, 24], [22, 23], [11, 21]].forEach(([x, y]) => m.spawns.push({ monster: 'deer', x, y }));
    [[26, 22], [29, 24]].forEach(([x, y]) => m.spawns.push({ monster: 'scarecrow', x, y }));
    m.spawns.forEach((s) => clearDisk(m, s.x, s.y, 1, s.monster === 'scarecrow' ? T.DIRT : T.GRASS));
    return m;
  }

  function buildCity(rng) {
    const m = makeMap('city', '比奇城', 40, 34, T.STONE, 'city');
    border(m, T.WALL);
    building(m, 4, 4, 6, 5, '#b64032');
    building(m, 16, 4, 7, 5, '#2f8f4e');
    building(m, 28, 4, 6, 5, '#3d6fbf');
    rect(m, 8, 20, 24, 8, T.GRASS);
    scatter(m, rng, T.GRASS, 0.08, T.FLOWER);
    rect(m, 17, 12, 5, 3, T.WATER);
    for (let x = 1; x <= 10; x++) { set(m, x, 16, T.STONE); set(m, x, 17, T.STONE); }
    for (let y = 24; y <= 32; y++) { set(m, 19, y, T.DIRT); set(m, 20, y, T.DIRT); }
    gate(m, 0, 16, 'village', 30.5, 15.5);
    gate(m, 0, 17, 'village', 30.5, 16.5);
    gate(m, 19, 33, 'forest', 8.5, 3.5);
    gate(m, 20, 33, 'forest', 9.5, 3.5);
    m.spawn = { x: 8.5, y: 16.5 };
    m.npcs.push({ name: '城中铁匠', role: 'shop', shop: 'weapon', x: 7.5, y: 9.5, color: '#d4573a', lines: ['比奇的兵器更趁手，先看看你的等级够不够。'] });
    m.npcs.push({ name: '济世堂', role: 'shop', shop: 'potion', x: 19.5, y: 9.5, color: '#8ee08a', lines: ['城里的药更全。需要疗伤就跟我说。'] });
    m.npcs.push({ name: '琳琅阁', role: 'shop', shop: 'jewel', x: 31.5, y: 9.5, color: '#9dc2ff', lines: ['好首饰能让攻击、魔法或道术更进一步。'] });
    m.npcs.push({ name: '书院先生', role: 'trainer', shop: 'trainer', x: 14.5, y: 16.5, color: '#f0d7a2', lines: ['把题目答熟，稀有装备才肯露面。技能书也可以在我这里买。'] });
    m.npcs.push({ name: '城门守卫', role: 'talk', x: 22.5, y: 28.5, color: '#e8e8e8', lines: ['南边森林有钉耙猫。再往深处是僵尸洞，洞的尽头连着沃玛寺庙。', '等级不够就别硬闯，先在村子和森林里把题目答顺。'] });
    [[12, 23], [18, 24], [26, 22]].forEach(([x, y]) => m.spawns.push({ monster: 'deer', x, y }));
    [[30, 24], [10, 25]].forEach(([x, y]) => m.spawns.push({ monster: 'scarecrow', x, y }));
    m.spawns.forEach((s) => clearDisk(m, s.x, s.y, 1, T.GRASS));
    return m;
  }

  function buildForest(rng) {
    const m = makeMap('forest', '比奇森林', 42, 38, T.GRASS, 'forest');
    border(m, T.TREE);
    for (let y = 1; y < m.h - 1; y++) { set(m, 20, y, T.DIRT); set(m, 21, y, T.DIRT); }
    for (let y = 1; y <= 12; y++) { set(m, 8, y, T.DIRT); set(m, 9, y, T.DIRT); }
    for (let x = 8; x <= 21; x++) { set(m, x, 10, T.DIRT); set(m, x, 11, T.DIRT); }
    for (let x = 20; x <= 37; x++) { set(m, x, 20, T.DIRT); set(m, x, 21, T.DIRT); }
    rect(m, 28, 8, 6, 4, T.WATER);
    rect(m, 27, 7, 8, 6, T.SAND);
    rect(m, 28, 8, 6, 4, T.WATER);
    scatter(m, rng, T.GRASS, 0.18, T.TREE);
    scatter(m, rng, T.GRASS, 0.05, T.FLOWER);
    gate(m, 20, 0, 'village', 16.5, 26.5);
    gate(m, 21, 0, 'village', 17.5, 26.5);
    gate(m, 8, 0, 'city', 19.5, 30.5);
    gate(m, 9, 0, 'city', 20.5, 30.5);
    gate(m, 36, 20, 'cave', 4.5, 4.5);
    gate(m, 37, 20, 'cave', 5.5, 4.5);
    set(m, 35, 19, T.ROCK); set(m, 35, 22, T.ROCK); set(m, 38, 19, T.ROCK); set(m, 38, 22, T.ROCK);
    m.spawn = { x: 20.5, y: 4.5 };
    m.npcs.push({ name: '采药人', role: 'talk', x: 18.5, y: 8.5, color: '#9be07a', lines: ['钉耙猫跑得快。法师和道士尽量离远一点放技能。', '东边石洞里有骷髅和僵尸，再往里就是沃玛寺庙。'] });
    [[6, 16], [14, 18], [24, 14], [30, 16]].forEach(([x, y]) => m.spawns.push({ monster: 'deer', x, y }));
    [[12, 26], [26, 28], [16, 30]].forEach(([x, y]) => m.spawns.push({ monster: 'scarecrow', x, y }));
    [[28, 24], [32, 27], [18, 22], [24, 26], [33, 30]].forEach(([x, y]) => m.spawns.push({ monster: 'cat', x, y }));
    m.spawns.forEach((s) => clearDisk(m, s.x, s.y, 1, T.GRASS));
    clearDisk(m, 18, 8, 1, T.GRASS);
    return m;
  }

  function buildCave() {
    const m = makeMap('cave', '僵尸洞', 36, 32, T.ROCK, 'cave');
    const carve = (x, y, w, h, t) => rect(m, x, y, w, h, t || T.CAVE);
    carve(2, 2, 12, 10);
    carve(8, 8, 6, 12);
    carve(6, 16, 16, 8);
    carve(18, 18, 14, 5);
    carve(26, 16, 8, 13);
    rect(m, 10, 20, 3, 2, T.LAVA);
    gate(m, 3, 3, 'forest', 33.5, 20.5);
    gate(m, 4, 3, 'forest', 34.5, 20.5);
    gate(m, 31, 26, 'temple', 14.5, 22.5);
    gate(m, 32, 26, 'temple', 15.5, 22.5);
    m.spawn = { x: 5.5, y: 5.5 };
    [[8, 18], [9, 21], [16, 18], [14, 22], [10, 16]].forEach(([x, y]) => m.spawns.push({ monster: 'skeleton', x, y }));
    [[28, 20], [30, 23], [27, 25], [32, 22]].forEach(([x, y]) => m.spawns.push({ monster: 'zombie', x, y }));
    m.npcs.push({ name: '洞口石碑', role: 'talk', x: 6.5, y: 6.5, color: '#d9d3c5', lines: ['碑上写着：答对的孩子，才能把洞里的宝物带出去。', '东南深处有通往沃玛寺庙的石阶。'] });
    return m;
  }

  function buildTemple() {
    const m = makeMap('temple', '沃玛寺庙', 28, 26, T.WALL, 'temple');
    rect(m, 2, 2, 24, 22, T.TEMPLE);
    for (let y = 6; y <= 18; y += 4) {
      set(m, 6, y, T.WALL); m.roof[y][6] = '#8c2f2f';
      set(m, 21, y, T.WALL); m.roof[y][21] = '#8c2f2f';
    }
    for (let y = 8; y <= 22; y++) { set(m, 13, y, T.CARPET); set(m, 14, y, T.CARPET); }
    for (let x = 8; x <= 19; x++) { set(m, x, 8, T.CARPET); }
    gate(m, 13, 25, 'cave', 30.5, 24.5);
    gate(m, 14, 25, 'cave', 31.5, 24.5);
    set(m, 13, 24, T.CARPET); set(m, 14, 24, T.CARPET);
    m.spawn = { x: 14.5, y: 21.5 };
    [[8, 12], [19, 12], [8, 16], [19, 16]].forEach(([x, y]) => m.spawns.push({ monster: 'guard', x, y }));
    m.spawns.push({ monster: 'boss', x: 14, y: 6 });
    m.npcs.push({ name: '残碑', role: 'talk', x: 10.5, y: 20.5, color: '#f0d7a2', lines: ['沃玛教主会连问三道题。答得越多，宝物越好。', '它出拳前地面会亮起红圈，赶快走开。'] });
    return m;
  }

  function validate(maps) {
    const errors = [];
    Object.values(maps).forEach((map) => {
      const s = map.spawn;
      if (!walkable(map, Math.floor(s.x), Math.floor(s.y))) errors.push(map.id + ' 出生点堵住了');
      map.gates.forEach((g) => {
        if (map.tiles[g.y][g.x] !== T.GATE) errors.push(map.id + ' 出口不是门 ' + g.x + ',' + g.y);
        const dest = maps[g.to];
        if (!dest) errors.push('缺少地图 ' + g.to);
        else {
          const dx = Math.floor(g.tx);
          const dy = Math.floor(g.ty);
          if (!walkable(dest, dx, dy)) errors.push(map.id + ' -> ' + g.to + ' 落点堵住 ' + dx + ',' + dy);
          if (dest.tiles[dy][dx] === T.GATE) errors.push(map.id + ' -> ' + g.to + ' 落在另一扇门上');
        }
      });
      map.npcs.forEach((n) => {
        if (!walkable(map, Math.floor(n.x), Math.floor(n.y))) errors.push(map.id + ' NPC堵住 ' + n.name);
      });
      map.spawns.forEach((sp) => {
        if (!walkable(map, sp.x, sp.y)) errors.push(map.id + ' 怪物堵住 ' + sp.monster + ' ' + sp.x + ',' + sp.y);
      });
    });
    return errors;
  }

  const maps = {
    village: buildVillage(mulberry(11)),
    city: buildCity(mulberry(22)),
    forest: buildForest(mulberry(33)),
    cave: buildCave(),
    temple: buildTemple(),
  };
  const problems = validate(maps);

  const RARITY = {
    common: { name: '普通', mul: 1, color: '#f4efe4' },
    fine: { name: '优秀', mul: 1.22, color: '#7ddea0' },
    rare: { name: '稀有', mul: 1.5, color: '#7eb6ff' },
    epic: { name: '史诗', mul: 1.9, color: '#d2a6ff' },
    legend: { name: '传说', mul: 2.45, color: '#ffc15a' },
  };
  const RARITY_ORDER = ['common', 'fine', 'rare', 'epic', 'legend'];

  window.LW = {
    T, BLOCK, classes, skills, monsters, itemTpls, potions, maps, problems,
    SUGGEST, RARITY, RARITY_ORDER, expNeed, walkable,
  };
})();
