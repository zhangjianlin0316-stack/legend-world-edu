/* 传奇学堂主循环：移动、战斗、答题、存档与画面。 */
(function () {
  'use strict';

  const LW = window.LW;
  if (!LW) {
    document.getElementById('fatal').style.display = 'block';
    document.getElementById('fatal').textContent = '游戏数据没有加载。';
    return;
  }
  const { T, classes, skills, monsters, itemTpls, potions, maps, RARITY, RARITY_ORDER, expNeed } = LW;
  const SAVE_KEY = 'legend-academy-save-v1';
  const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","WenQuanYi Micro Hei",sans-serif';
  const GRADES = ['', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
  const YES = ['答对啦！', '太棒了！', '正确，宝物出现了！'];
  const NO = ['这次没答对，我们一起看一看。', '没关系，看完讲解就记住了。', '差一点点，正确答案在下面。'];

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');

  const G = {
    mode: 'boot',
    bank: [],
    qmap: new Map(),
    map: maps.village,
    monsters: [],
    npcs: [],
    corpses: [],
    pet: null,
    player: null,
    particles: [],
    floats: [],
    shots: [],
    cam: { x: 0, y: 0 },
    viewW: 1280,
    viewH: 720,
    dpr: 1,
    TW: 96,
    TH: 48,
    anim: 0,
    time: 0,
    hover: null,
    marker: null,
    panel: null,
    selected: null,
    sound: localStorage.getItem('legend-academy-sound') === '1',
    tileCache: new Map(),
    uid: 1,
    gateLock: 0,
    saveAcc: 0,
    drawList: [],
  };

  const $ = (id) => document.getElementById(id);

  window.addEventListener('error', (e) => {
    const el = $('fatal');
    el.style.display = 'block';
    el.textContent = '出现问题：' + (e.message || e.error);
  });

  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function walkable(map, x, y) { return LW.walkable(map, x, y); }
  function dirFrom(dx, dy) {
    const sx = dx - dy;
    const sy = dx + dy;
    if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 'right' : 'left';
    return sy > 0 ? 'down' : 'up';
  }
  function tileToScreen(x, y) {
    const wx = (x - y) * (G.TW / 2);
    const wy = (x + y) * (G.TH / 2);
    return { x: wx - G.cam.x + G.viewW / 2, y: wy - G.cam.y + G.viewH / 2 };
  }
  function screenToTile(sx, sy) {
    const wx = sx - G.viewW / 2 + G.cam.x;
    const wy = sy - G.viewH / 2 + G.cam.y;
    const a = wx / (G.TW / 2);
    const b = wy / (G.TH / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  function worldOf(x, y) {
    return { x: (x - y) * (G.TW / 2), y: (x + y) * (G.TH / 2) };
  }

  function log(text, type) {
    const box = $('log');
    if (!box) return;
    const line = document.createElement('div');
    line.className = type || 'system';
    line.textContent = text;
    box.appendChild(line);
    while (box.childNodes.length > 80) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(G.toastTimer);
    G.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function showZone(name) {
    const el = $('zone-banner');
    el.textContent = name;
    el.classList.add('show');
    clearTimeout(G.zoneTimer);
    G.zoneTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  let audioCtx;
  function beep(freq, dur, type, vol) {
    if (!G.sound) return;
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = vol || 0.035;
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch (err) { /* 声音失败时游戏继续 */ }
  }

  function frozen() {
    return G.mode !== 'play' || G.panel || $('question').classList.contains('hidden') === false || !$('confirm').classList.contains('hidden');
  }

  function computeStats(equip) {
    const p = G.player;
    const c = classes[p.classId];
    const lv = p.level - 1;
    const s = {
      maxHp: c.hp + lv * c.gHp,
      maxMp: c.mp + lv * c.gMp,
      atkMin: c.atk[0] + lv * c.gAtk,
      atkMax: c.atk[1] + lv * c.gAtk * 1.35,
      magMin: c.mag[0] + lv * c.gMag,
      magMax: c.mag[1] + lv * c.gMag * 1.35,
      taoMin: c.tao[0] + lv * c.gTao,
      taoMax: c.tao[1] + lv * c.gTao * 1.35,
      def: c.def + lv * c.gDef,
      mdef: c.mdef + lv * c.gMdef,
    };
    Object.values(equip || p.equip).forEach((it) => {
      if (!it) return;
      if (it.atk) { s.atkMin += it.atk[0]; s.atkMax += it.atk[1]; }
      if (it.mag) { s.magMin += it.mag[0]; s.magMax += it.mag[1]; }
      if (it.tao) { s.taoMin += it.tao[0]; s.taoMax += it.tao[1]; }
      s.def += it.def || 0;
      s.mdef += it.mdef || 0;
      s.maxHp += it.hp || 0;
      s.maxMp += it.mp || 0;
    });
    ['atkMin', 'atkMax', 'magMin', 'magMax', 'taoMin', 'taoMax', 'def', 'mdef', 'maxHp', 'maxMp'].forEach((k) => {
      s[k] = Math.max(0, Math.round(s[k]));
    });
    if (s.atkMax < s.atkMin) s.atkMax = s.atkMin;
    if (s.magMax < s.magMin) s.magMax = s.magMin;
    if (s.taoMax < s.taoMin) s.taoMax = s.taoMin;
    return s;
  }

  function rollRange(a, b) { return a + Math.random() * Math.max(0, b - a); }
  function mitigate(amount, defense) {
    const red = defense * 0.4 + Math.random() * defense * 0.5;
    return Math.max(1, Math.round(amount - red));
  }

  function makeEquip(tpl, rarity) {
    const mul = RARITY[rarity].mul;
    const sc = (n) => Math.max(0, Math.round((n || 0) * mul));
    const pair = (p) => (p ? [sc(p[0]), Math.max(sc(p[0]), sc(p[1]))] : null);
    return {
      uid: 'i' + (G.uid++), tpl: tpl.id, name: tpl.name, slot: tpl.slot, cls: tpl.cls || null,
      level: tpl.level, rarity, atk: pair(tpl.atk), mag: pair(tpl.mag), tao: pair(tpl.tao),
      def: sc(tpl.def || 0), mdef: sc(tpl.mdef || 0), hp: sc(tpl.hp || 0), mp: sc(tpl.mp || 0),
      price: tpl.price, desc: tpl.desc, kind: 'equip',
    };
  }
  function makePotion(id, count) {
    const tpl = potions.find((p) => p.id === id);
    return {
      uid: 'i' + (G.uid++), tpl: tpl.id, name: tpl.name, kind: 'potion', slot: 'potion',
      count: count || 1, hp: tpl.hp || 0, mp: tpl.mp || 0, price: tpl.price, desc: tpl.desc,
    };
  }
  function makeBook(skill) {
    return {
      uid: 'i' + (G.uid++), tpl: 'book_' + skill.id, name: '《' + skill.name + '》', kind: 'book',
      slot: 'book', skill: skill.id, count: 1, price: skill.level * 80,
      desc: '使用后学会「' + skill.name + '」。需要 ' + skill.level + ' 级。' + skill.desc,
    };
  }
  function markOf(item) {
    if (!item) return '';
    if (item.kind === 'potion') return '药';
    if (item.kind === 'book') return '书';
    return { weapon: '剑', armor: '甲', helmet: '盔', necklace: '链', bracelet: '镯', ring: '戒' }[item.slot] || '物';
  }
  function giveItem(item) {
    const p = G.player;
    if (item.kind === 'potion' || item.kind === 'book') {
      const stack = p.bag.find((b) => b.kind === item.kind && b.tpl === item.tpl && b.count < 20);
      if (stack) { stack.count += item.count || 1; return true; }
    }
    if (p.bag.length >= 36) {
      const gold = Math.max(1, Math.round((item.price || 10) * 0.4));
      p.gold += gold;
      log('背包满了，' + item.name + '换成了 ' + gold + ' 金币。', 'warn');
      return false;
    }
    p.bag.push(item);
    return true;
  }
  function removeOne(item) {
    item.count = (item.count || 1) - 1;
    if (item.count <= 0) G.player.bag = G.player.bag.filter((b) => b !== item);
  }

  function equipSlots(item) {
    if (item.slot === 'bracelet') return ['bracelet1', 'bracelet2'];
    if (item.slot === 'ring') return ['ring1', 'ring2'];
    return [item.slot];
  }
  function canEquip(item) {
    const p = G.player;
    if (item.kind !== 'equip') return '这件东西不能穿戴。';
    if (item.level > p.level) return '等级不够，还不能装备「' + item.name + '」。';
    if (item.cls && item.cls !== p.classId) return '这不是你的职业能使用的装备。';
    return '';
  }
  function equipItem(item, slot) {
    const why = canEquip(item);
    if (why) { log(why, 'warn'); toast(why); return; }
    const slots = equipSlots(item);
    const use = slot && slots.includes(slot) ? slot : (slots.find((s) => !G.player.equip[s]) || slots[0]);
    const old = G.player.equip[use];
    G.player.equip[use] = item;
    G.player.bag = G.player.bag.filter((b) => b !== item);
    if (old) G.player.bag.push(old);
    const st = computeStats();
    G.player.hp = Math.min(G.player.hp, st.maxHp);
    G.player.mp = Math.min(G.player.mp, st.maxMp);
    log('装备了「' + item.name + '」。', 'loot');
    beep(520, 0.08, 'square', 0.03);
    save();
    renderPanel();
  }
  function unequip(slot) {
    const it = G.player.equip[slot];
    if (!it) return;
    if (G.player.bag.length >= 36) { toast('背包满了'); return; }
    G.player.equip[slot] = null;
    G.player.bag.push(it);
    save();
    renderPanel();
  }

  function useItem(item) {
    const p = G.player;
    const st = computeStats();
    if (item.kind === 'potion') {
      if (item.hp && p.hp >= st.maxHp) { toast('生命值已经满了'); return; }
      if (item.mp && !item.hp && p.mp >= st.maxMp) { toast('魔法值已经满了'); return; }
      p.hp = Math.min(st.maxHp, p.hp + (item.hp || 0));
      p.mp = Math.min(st.maxMp, p.mp + (item.mp || 0));
      removeOne(item);
      log('使用了' + item.name + '。', 'system');
      beep(660, 0.1, 'sine', 0.04);
      burstAt(p.x, p.y, item.hp ? '#7ddea0' : '#7eb6ff', 10);
      save();
      updateHud();
      if (G.panel) renderPanel();
      return;
    }
    if (item.kind === 'book') {
      const sk = skills.find((s) => s.id === item.skill);
      if (p.level < sk.level) { toast('等级不够，还读不懂这本技能书'); return; }
      if (p.skills.includes(sk.id)) { toast('你已经学会这个技能了'); return; }
      p.skills.push(sk.id);
      if (!p.hotbar.includes(sk.id)) {
        const i = p.hotbar.indexOf(null);
        if (i >= 0) p.hotbar[i] = sk.id;
      }
      if (sk.type === 'stance' && sk.id === 'w_basic') p.stances[sk.id] = true;
      removeOne(item);
      log('学会了「' + sk.name + '」！可以按 F1–F8 释放。', 'learn');
      toast('学会了「' + sk.name + '」');
      beep(523, 0.1, 'square', 0.04);
      setTimeout(() => beep(784, 0.14, 'square', 0.04), 90);
      save();
      if (G.panel) renderPanel();
      return;
    }
    equipItem(item);
  }

  function drink(kind) {
    const item = G.player.bag.find((b) => b.kind === 'potion' && (kind === 'hp' ? b.hp : b.mp) && !(kind === 'hp' ? false : b.hp && !b.mp));
    const found = G.player.bag.find((b) => b.kind === 'potion' && (kind === 'hp' ? b.hp > 0 : b.mp > 0 && !b.hp));
    if (!found) { toast(kind === 'hp' ? '没有金创药了' : '没有魔法药了'); return; }
    useItem(found);
  }

  function gainExp(n) {
    const p = G.player;
    if (n <= 0) return;
    p.exp += n;
    let up = false;
    while (p.level < 40 && p.exp >= expNeed(p.level)) {
      p.exp -= expNeed(p.level);
      p.level += 1;
      up = true;
      onLevel();
    }
    if (up) {
      const st = computeStats();
      p.hp = st.maxHp;
      p.mp = st.maxMp;
      toast('升级了！现在是 ' + p.level + ' 级');
      beep(523, 0.1, 'square', 0.04);
      setTimeout(() => beep(659, 0.1, 'square', 0.04), 110);
      setTimeout(() => beep(784, 0.16, 'square', 0.045), 220);
      burstAt(p.x, p.y, '#ffe08a', 24);
    }
  }
  function onLevel() {
    const p = G.player;
    log('升到了 ' + p.level + ' 级。', 'learn');
    skills.filter((s) => s.cls === p.classId && s.level === p.level && !p.skills.includes(s.id)).forEach((s) => {
      if (p.bag.some((b) => b.kind === 'book' && b.skill === s.id)) {
        log('背包里已经有《' + s.name + '》，打开就能学。', 'learn');
        return;
      }
      giveItem(makeBook(s));
      log('获得技能书《' + s.name + '》。打开背包使用它。', 'learn');
    });
  }

  function masteryScore(m) {
    if (!m) return 0;
    const t = m.c + m.w;
    if (!t) return 0;
    const acc = m.c / t;
    const confidence = 1 - Math.exp(-t / 3);
    return Math.round(acc * confidence * 100);
  }
  function recordMastery(q, ok) {
    const p = G.player;
    const m = p.mastery[q.knowledgePoint] || { c: 0, w: 0, subject: q.subject, topic: q.topic, grade: q.grade };
    if (ok) m.c += 1;
    else m.w += 1;
    p.mastery[q.knowledgePoint] = m;
    if (ok) {
      p.stats.correct += 1;
      p.combo = (p.combo || 0) + 1;
      p.bestCombo = Math.max(p.bestCombo || 0, p.combo);
    } else {
      p.stats.wrong += 1;
      p.combo = 0;
    }
  }
  function rarityFromScore(score) {
    if (score >= 88) return 'legend';
    if (score >= 70) return 'epic';
    if (score >= 48) return 'rare';
    if (score >= 22) return 'fine';
    return 'common';
  }
  function rollRarity(tier, ceiling) {
    const tables = {
      1: [['common', 70], ['fine', 26], ['rare', 4]],
      2: [['common', 42], ['fine', 40], ['rare', 16], ['epic', 2]],
      3: [['fine', 36], ['rare', 40], ['epic', 20], ['legend', 4]],
      4: [['fine', 18], ['rare', 40], ['epic', 32], ['legend', 10]],
    };
    const table = tables[tier] || tables[1];
    let sum = 0;
    table.forEach((row) => { sum += row[1]; });
    let r = Math.random() * sum;
    let picked = table[0][0];
    for (const row of table) {
      r -= row[1];
      if (r <= 0) { picked = row[0]; break; }
    }
    if (RARITY_ORDER.indexOf(picked) > RARITY_ORDER.indexOf(ceiling)) picked = ceiling;
    return picked;
  }
  function randomGear(tier, ceiling) {
    const p = G.player;
    const rarity = rollRarity(tier, ceiling);
    const slots = ['weapon', 'weapon', 'armor', 'helmet', 'necklace', 'bracelet', 'ring', 'ring'];
    const slot = slots[rand(0, slots.length - 1)];
    let pool = itemTpls.filter((t) => t.slot === slot && t.level <= p.level + 1 && (!t.cls || t.cls === p.classId));
    if (!pool.length) pool = itemTpls.filter((t) => t.slot === slot && (!t.cls || t.cls === p.classId));
    if (!pool.length) pool = itemTpls.filter((t) => !t.cls || t.cls === p.classId);
    pool = pool.slice().sort((a, b) => Math.abs(a.level - p.level) - Math.abs(b.level - p.level));
    const tpl = pool[rand(0, Math.min(2, pool.length - 1))];
    return makeEquip(tpl, rarity);
  }
  function maybeBook() {
    const p = G.player;
    const next = skills.find((s) => s.cls === p.classId && s.level <= p.level && !p.skills.includes(s.id) && !p.bag.some((b) => b.skill === s.id));
    if (next && Math.random() < 0.22) return makeBook(next);
    return null;
  }

  function buildLoot(mon, performance, score) {
    const goldRoll = rand(mon.gold[0], mon.gold[1]);
    if (performance <= 0) {
      return {
        exp: Math.max(1, Math.round(mon.exp * 0.3)),
        gold: Math.max(0, Math.round(goldRoll * 0.15)),
        items: [],
        comfort: true,
      };
    }
    const exp = Math.round(mon.exp * (0.45 + 0.55 * performance));
    const bonus = G.player.combo && G.player.combo % 3 === 0 ? Math.round(exp * 0.2) : 0;
    const gold = Math.round(goldRoll * (0.5 + 0.5 * performance));
    const items = [];
    const ceiling = rarityFromScore(score);
    if (Math.random() < mon.item * performance) items.push(randomGear(mon.tier, ceiling));
    if (mon.boss && performance >= 0.99) items.push(randomGear(4, ceiling));
    if (Math.random() < mon.potion * Math.max(0.45, performance)) {
      items.push(makePotion(Math.random() < 0.5 ? (Math.random() < 0.5 ? 'hp_s' : 'hp_m') : (Math.random() < 0.5 ? 'mp_s' : 'mp_m')));
    }
    const book = performance >= 0.6 ? maybeBook() : null;
    if (book) items.push(book);
    return { exp: exp + bonus, gold, items, bonus, ceiling, comfort: false };
  }
  function applyLoot(loot) {
    const lines = [];
    gainExp(loot.exp);
    G.player.gold += loot.gold;
    lines.push('经验 +' + loot.exp + (loot.bonus ? '（连对奖励）' : '') + '，金币 +' + loot.gold);
    loot.items.forEach((it) => {
      giveItem(it);
      const rare = it.rarity ? '（' + RARITY[it.rarity].name + '）' : '';
      lines.push('获得 ' + it.name + rare);
      log('获得 ' + it.name + rare, 'loot');
    });
    if (!loot.items.length && loot.comfort) lines.push('这次没有宝物，只留下了一点经验和金币。');
    if (!loot.comfort && loot.ceiling === 'common') lines.push('把知识点练得更熟，会遇见更好的装备。');
    floatText(G.player, '+' + loot.exp + ' 经验', '#ffe08a');
    return lines;
  }

  function qById(id) { return G.qmap.get(id); }
  function weightedPick(list, weights) {
    let sum = 0;
    weights.forEach((w) => { sum += w; });
    let r = Math.random() * sum;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }
  function pickQuestion(diff, used) {
    const grade = G.player.grade;
    let pool = G.bank.filter((q) => q.grade === grade && Math.abs(q.difficulty - diff) <= 1 && !used.has(q.id));
    if (pool.length < 6) pool = G.bank.filter((q) => q.grade === grade && !used.has(q.id));
    if (!pool.length) pool = G.bank.filter((q) => q.grade === grade);
    const last = G.player.recentSubjects || [];
    if (last.length >= 2 && last[0] === last[1]) {
      const other = last[0] === '语文' ? '数学' : '语文';
      const alt = pool.filter((q) => q.subject === other);
      if (alt.length >= 3) pool = alt;
    }
    const weights = pool.map((q) => {
      const m = G.player.mastery[q.knowledgePoint];
      const w = m ? m.w : 0;
      const c = m ? m.c : 0;
      let weight = (1 + w * 3.4) / (1 + c * 0.22);
      if ((G.player.recent || []).includes(q.id)) weight *= 0.12;
      return Math.max(0.05, weight);
    });
    return weightedPick(pool, weights);
  }
  function beginQuiz(mon, count, diff) {
    const used = new Set(G.player.recent || []);
    const qids = [];
    for (let i = 0; i < count; i++) {
      const q = pickQuestion(diff, new Set([...used, ...qids]));
      qids.push(q.id);
    }
    const pending = {
      mon: {
        name: mon.name, exp: mon.exp, gold: mon.gold, tier: mon.tier,
        item: mon.item, potion: mon.potion, boss: !!mon.boss,
      },
      qids, index: 0, correct: 0, phase: 'ask', applied: false, loot: null,
    };
    G.player.stats.kills += 1;
    if (mon.boss) G.player.stats.bosses = (G.player.stats.bosses || 0) + 1;
    if (G.player.pending) {
      G.player.quizQueue = G.player.quizQueue || [];
      G.player.quizQueue.push(pending);
      save();
      return;
    }
    G.player.pending = pending;
    save();
    showAsk();
  }
  function showAsk() {
    const pending = G.player.pending;
    const q = qById(pending.qids[pending.index]);
    G.picked = null;
    $('question').classList.remove('hidden');
    $('q-badge').textContent = q.subject;
    $('q-badge').className = 'badge' + (q.subject === '数学' ? ' math' : '');
    $('q-step').textContent = pending.mon.boss ? ('沃玛试炼 ' + (pending.index + 1) + '/' + pending.qids.length) : '战斗提问';
    $('q-kp').textContent = '知识点：' + q.topic + ' · ' + q.knowledgePoint;
    $('q-text').textContent = q.question;
    const box = $('q-options');
    box.replaceChildren();
    box.classList.toggle('hidden', q.type !== 'choice');
    $('q-form').classList.remove('hidden');
    $('q-input').classList.toggle('hidden', q.type !== 'fill');
    $('q-result').classList.add('hidden');
    $('q-next').classList.add('hidden');
    $('q-input').value = '';
    if (q.type === 'choice') {
      q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'q-opt';
        b.textContent = (i + 1) + '. ' + opt;
        b.dataset.value = opt;
        b.addEventListener('click', () => {
          G.picked = opt;
          [...box.children].forEach((el) => el.classList.remove('on'));
          b.classList.add('on');
        });
        box.appendChild(b);
      });
    } else {
      $('q-input').focus();
    }
    G.player.recent = (G.player.recent || []).concat(q.id).slice(-24);
    G.player.recentSubjects = [q.subject].concat(G.player.recentSubjects || []).slice(0, 2);
    G.player.tutorial.fought = true;
  }
  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[。．.，,、！!？?；;：:“”‘’「」『』（）()]/g, '');
  }
  function gradeFill(input, answer) {
    const answers = Array.isArray(answer) ? answer : [answer];
    const n = norm(input);
    if (!n) return false;
    if (answers.some((a) => norm(a) === n)) return true;
    const num = n.endsWith('%') ? n.slice(0, -1) : n;
    if (/^-?\d+(\.\d+)?$/.test(num)) {
      const v = Number(num);
      return answers.some((a) => {
        let na = norm(a);
        if (na.endsWith('%')) na = na.slice(0, -1);
        if (/^-?\d+(\.\d+)?$/.test(na) && Math.abs(Number(na) - v) < 1e-6) return true;
        const f = na.match(/^(-?\d+)\/(-?\d+)$/);
        return !!(f && Math.abs(v - Number(f[1]) / Number(f[2])) < 1e-6);
      });
    }
    return false;
  }
  function submitAnswer() {
    const pending = G.player.pending;
    if (!pending || pending.phase !== 'ask') return;
    const q = qById(pending.qids[pending.index]);
    let ok = false;
    if (q.type === 'choice') {
      if (!G.picked) { toast('先选一个答案'); return; }
      ok = G.picked === q.answer;
    } else {
      const text = $('q-input').value;
      if (!norm(text)) { toast('先把答案写下来'); return; }
      ok = gradeFill(text, q.answer);
    }
    recordMastery(q, ok);
    if (ok) pending.correct += 1;
    pending.phase = 'result';
    pending.lastOk = ok;
    const finished = pending.index >= pending.qids.length - 1;
    let lines = [];
    if (finished && !pending.applied) {
      const perf = pending.mon.boss ? pending.correct / pending.qids.length : (ok ? 1 : 0);
      const ids = pending.qids.map(qById);
      const score = ids.reduce((sum, item) => sum + masteryScore(G.player.mastery[item.knowledgePoint]), 0) / ids.length;
      pending.loot = buildLoot(pending.mon, perf, score);
      lines = applyLoot(pending.loot);
      pending.applied = true;
      G.player.tutorial.answered = true;
    } else if (!finished) {
      lines = ['试炼还没结束。先把这一题记住。'];
    }
    save();
    showResult(q, ok, lines);
    beep(ok ? 880 : 196, ok ? 0.12 : 0.18, ok ? 'sine' : 'triangle', 0.04);
  }
  function showResult(q, ok, lines) {
    const box = $('q-options');
    [...box.children].forEach((el) => {
      if (el.dataset.value === q.answer) el.classList.add('good');
      else if (el.classList.contains('on')) el.classList.add('bad');
    });
    $('q-form').classList.add('hidden');
    const result = $('q-result');
    result.className = ok ? 'good' : 'bad';
    result.replaceChildren();
    const title = document.createElement('div');
    title.style.fontWeight = '800';
    title.textContent = ok ? YES[rand(0, YES.length - 1)] : NO[rand(0, NO.length - 1)];
    result.appendChild(title);
    if (!ok) {
      const ans = document.createElement('div');
      const show = Array.isArray(q.answer) ? q.answer[0] : q.answer;
      ans.textContent = '正确答案：' + show;
      result.appendChild(ans);
    }
    const exp = document.createElement('div');
    exp.textContent = q.explanation;
    result.appendChild(exp);
    const ms = document.createElement('div');
    ms.textContent = '这个知识点的掌握度：' + masteryScore(G.player.mastery[q.knowledgePoint]) + '%';
    result.appendChild(ms);
    (lines || []).forEach((line) => {
      const d = document.createElement('div');
      d.textContent = line;
      result.appendChild(d);
    });
    result.classList.remove('hidden');
    const next = $('q-next');
    const pending = G.player.pending;
    next.textContent = pending.index >= pending.qids.length - 1 ? '继续冒险' : '下一题';
    next.classList.remove('hidden');
  }
  function nextQuestion() {
    const pending = G.player.pending;
    if (!pending || pending.phase !== 'result') return;
    if (pending.index < pending.qids.length - 1) {
      pending.index += 1;
      pending.phase = 'ask';
      save();
      showAsk();
      return;
    }
    G.player.pending = null;
    const queue = G.player.quizQueue || [];
    if (queue.length) {
      G.player.pending = queue.shift();
      G.player.quizQueue = queue;
      save();
      showAsk();
      return;
    }
    $('question').classList.add('hidden');
    save();
    updateHud();
  }

  function astar(map, x0, y0, x1, y1) {
    const sx = Math.floor(x0);
    const sy = Math.floor(y0);
    let gx = Math.floor(x1);
    let gy = Math.floor(y1);
    if (!walkable(map, gx, gy)) {
      let best = null;
      let bd = 1e9;
      for (let y = gy - 4; y <= gy + 4; y++) {
        for (let x = gx - 4; x <= gx + 4; x++) {
          if (!walkable(map, x, y)) continue;
          const d = Math.abs(x - gx) + Math.abs(y - gy);
          if (d < bd) { bd = d; best = { x, y }; }
        }
      }
      if (!best) return [];
      gx = best.x;
      gy = best.y;
    }
    if (sx === gx && sy === gy) return [];
    const key = (x, y) => x + ',' + y;
    const open = [{ x: sx, y: sy, g: 0, f: 0 }];
    const came = new Map();
    const gscore = new Map([[key(sx, sy), 0]]);
    const closed = new Set();
    const h = (x, y) => Math.hypot(x - gx, y - gy);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let steps = 0;
    while (open.length && steps++ < 2800) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (cur.x === gx && cur.y === gy) {
        const path = [];
        let k = ck;
        while (came.has(k)) {
          const [x, y] = k.split(',').map(Number);
          path.push({ x: x + 0.5, y: y + 0.5 });
          k = came.get(k);
        }
        path.reverse();
        return path;
      }
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!walkable(map, nx, ny)) continue;
        if (dx && dy && (!walkable(map, cur.x + dx, cur.y) || !walkable(map, cur.x, cur.y + dy))) continue;
        const nk = key(nx, ny);
        const ng = cur.g + (dx && dy ? 1.414 : 1);
        if (ng >= (gscore.get(nk) ?? 1e9)) continue;
        gscore.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
      }
    }
    return [];
  }
  function pathNear(from, target, range) {
    if (dist(from, target) <= range) return [];
    const tx = Math.floor(target.x);
    const ty = Math.floor(target.y);
    let best = null;
    let bd = 1e9;
    const r = Math.ceil(range) + 1;
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (!walkable(G.map, x, y)) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (Math.hypot(cx - target.x, cy - target.y) > range) continue;
        const d = Math.hypot(cx - from.x, cy - from.y);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
    }
    if (!best) best = { x: target.x, y: target.y };
    return astar(G.map, from.x, from.y, best.x, best.y);
  }
  function moveAlong(e, dt, speed) {
    if (!e.path || !e.path.length) { e.moving = false; return; }
    const n = e.path[0];
    const dx = n.x - e.x;
    const dy = n.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) { e.path.shift(); e.moving = e.path.length > 0; return; }
    const step = Math.min(d, speed * dt);
    const nx = e.x + (dx / d) * step;
    const ny = e.y + (dy / d) * step;
    if (!walkable(G.map, Math.floor(nx), Math.floor(ny))) { e.path = []; e.moving = false; return; }
    e.x = nx;
    e.y = ny;
    e.dir = dirFrom(dx, dy);
    e.moving = true;
  }

  function spawnMonster(tplId, x, y) {
    const tpl = monsters[tplId];
    const m = {
      id: 'm' + (G.uid++), kind: 'monster', tpl: tplId, name: tpl.name,
      x, y, homeX: x, homeY: y, dir: 'down', path: [], moving: false,
      hp: tpl.hp, maxHp: tpl.hp, atkCd: 0.4 + Math.random(), think: Math.random() * 1.5,
      angry: false, flash: 0, slow: 0, attackAnim: 0, windup: 0, slamCd: 2.5,
      boss: !!tpl.boss,
    };
    G.monsters.push(m);
    return m;
  }
  function spawnFromMap() {
    G.monsters = [];
    G.corpses = [];
    G.shots = [];
    G.npcs = G.map.npcs.map((n, i) => Object.assign({ id: 'npc' + i, kind: 'npc', dir: 'down' }, n));
    G.map.spawns.forEach((s) => spawnMonster(s.monster, s.x + 0.5, s.y + 0.5));
  }
  function enterMap(id, x, y) {
    const prev = G.map && G.map.id;
    G.map = maps[id];
    const p = G.player;
    p.mapId = id;
    p.x = x;
    p.y = y;
    p.path = [];
    p.pending = null;
    p.targetId = null;
    if (!p.visited.includes(id)) p.visited.push(id);
    spawnFromMap();
    if (G.pet) { G.pet.x = x + 0.7; G.pet.y = y + 0.2; G.pet.path = []; }
    const w = worldOf(x, y);
    G.cam.x = w.x;
    G.cam.y = w.y;
    showZone(G.map.name);
    if (prev !== id && G.map.safe) {
      const st = computeStats();
      p.hp = st.maxHp;
      p.mp = st.maxMp;
      log(G.map.name + '让你恢复了状态。', 'system');
    }
    G.gateLock = 1.1;
    save();
  }
  function snapOffGate(g) {
    const ix = Math.sign(G.map.w / 2 - g.x) || 0;
    const iy = Math.sign(G.map.h / 2 - g.y) || -1;
    const tries = [
      { x: g.x + 0.5 + ix * 1.3, y: g.y + 0.5 + iy * 1.3 },
      { x: g.x + 0.5 + ix * 1.3, y: g.y + 0.5 },
      { x: g.x + 0.5, y: g.y + 0.5 + iy * 1.3 },
    ];
    for (const t of tries) {
      if (walkable(G.map, Math.floor(t.x), Math.floor(t.y)) && G.map.tiles[Math.floor(t.y)][Math.floor(t.x)] !== T.GATE) {
        G.player.x = t.x;
        G.player.y = t.y;
        G.player.path = [];
        return;
      }
    }
  }
  async function tryGate(g) {
    if (G.gateLock > 0) return;
    G.gateLock = 2;
    const suggest = maps[g.to].suggest || 1;
    if (G.player.level < suggest - 1) {
      snapOffGate(g);
      const ok = await confirmBox(maps[g.to].name + '的怪物比较强（建议 ' + suggest + ' 级）。你现在是 ' + G.player.level + ' 级。还是要进去吗？');
      if (!ok) return;
    }
    enterMap(g.to, g.tx, g.ty);
  }

  function currentTarget() {
    return G.monsters.find((m) => m.id === G.player.targetId && m.hp > 0) || null;
  }
  function nearestMonster(from, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const m of G.monsters) {
      if (m.hp <= 0) continue;
      const d = dist(from, m);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  function floatText(ent, text, color) {
    G.floats.push({ x: ent.x, y: ent.y, oy: -52, text, life: 0.9, color: color || '#fff' });
  }
  function burstAt(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.4;
      G.particles.push({
        x, y, vx: Math.cos(a) * s * 0.35, vy: Math.sin(a) * s * 0.2 - 0.15,
        life: 0.4 + Math.random() * 0.4, max: 0.8, color, size: 2 + Math.random() * 3,
      });
    }
  }
  function hitMonster(m, dmg, color) {
    if (!m || m.hp <= 0) return;
    m.hp -= dmg;
    m.flash = 0.14;
    m.angry = true;
    floatText(m, '-' + dmg, color || '#fff');
    burstAt(m.x, m.y, color || '#ffe08a', 8);
    beep(180 + Math.min(400, dmg * 4), 0.05, 'square', 0.025);
    if (m.hp <= 0) killMonster(m);
  }
  function killMonster(m) {
    m.hp = 0;
    const tpl = monsters[m.tpl];
    G.monsters = G.monsters.filter((x) => x !== m);
    G.corpses.push({ tpl: m.tpl, x: m.homeX, y: m.homeY, at: G.time + (tpl.boss ? 26 : 13) });
    if (G.player.targetId === m.id) G.player.targetId = null;
    log('击败了' + m.name + '。', 'combat');
    burstAt(m.x, m.y, '#ffe08a', 16);
    beginQuiz(Object.assign({ name: m.name }, tpl), tpl.boss ? 3 : 1, tpl.boss ? 5 : G.map.difficulty);
  }
  function hurtPlayer(dmg) {
    const p = G.player;
    if (!p || p.hp <= 0 || p.hurt > 0) return;
    let real = dmg;
    if (p.shield > 0) real = Math.max(1, Math.round(dmg * 0.55));
    p.hp -= real;
    p.hurt = 0.42;
    floatText(p, '-' + real, '#ff8d8d');
    beep(110, 0.08, 'sawtooth', 0.03);
    if (p.hp <= 0) {
      p.hp = 0;
      p.downed = true;
    } else if (p.hp / computeStats().maxHp < 0.38 && G.time > (p.potionHint || 0)) {
      p.potionHint = G.time + 8;
      toast('生命值偏低，按 1 喝金创药');
    }
  }

  function basicRange() {
    const c = classes[G.player.classId];
    let range = c.basicRange;
    if (G.player.stances.w_stab && G.player.classId === 'warrior') range = 2.35;
    return range;
  }
  function tryBasic() {
    const p = G.player;
    const target = currentTarget();
    if (!target) return;
    if (dist(p, target) > basicRange()) return;
    if (G.time < (p.nextAtk || 0)) return;
    const cls = classes[p.classId];
    let extra = 0;
    if (p.stances.w_stab) extra += 2;
    if (p.stances.w_half) extra += 3;
    let stab = false;
    let half = false;
    if (p.mp >= extra) {
      p.mp -= extra;
      stab = !!p.stances.w_stab;
      half = !!p.stances.w_half;
    } else if (extra > 0 && G.time > (p.mpWarn || 0)) {
      p.mpWarn = G.time + 3;
      log('魔法不足，刺杀和半月暂时用不出。', 'warn');
    }
    p.nextAtk = G.time + cls.basicCd;
    p.dir = dirFrom(target.x - p.x, target.y - p.y);
    p.attackAnim = 0.22;
    if (p.stealth > 0) p.stealth = 0;
    const st = computeStats();
    if (cls.basicKind === 'melee') {
      let dmg = mitigate(rollRange(st.atkMin, st.atkMax), targetDef(target));
      if (p.stances.w_basic) dmg = Math.round(dmg * 1.2);
      if (stab) dmg = Math.round(dmg * 1.15);
      hitMonster(target, dmg, '#ffe7b0');
      slashFx(p, target);
      if (stab) {
        const behind = monsterBehind(p, target);
        if (behind) hitMonster(behind, Math.round(dmg * 0.85), '#ffe7b0');
      }
      if (half) {
        G.monsters.forEach((m) => {
          if (m !== target && dist(p, m) <= 1.45) hitMonster(m, Math.round(dmg * 0.62), '#ffd0a8');
        });
        arcFx(p);
      }
    } else if (cls.basicKind === 'bolt') {
      const dmg = mitigate(rollRange(st.magMin, st.magMax) * 0.75, monsterMdef(target));
      shoot(p, target, 'fire', () => hitMonster(target, dmg, '#ffb15a'));
    } else {
      const dmg = mitigate(rollRange(st.taoMin, st.taoMax) * 0.72, monsterMdef(target));
      shoot(p, target, 'talisman', () => hitMonster(target, dmg, '#ffe08a'));
    }
    p.tutorial.fought = true;
  }
  function targetDef(m) { return monsters[m.tpl].def || 0; }
  function monsterMdef(m) { return monsters[m.tpl].mdef || 0; }
  function monsterBehind(p, target) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = target.x + (dx / len) * 1.05;
    const py = target.y + (dy / len) * 1.05;
    let best = null;
    let bd = 0.9;
    G.monsters.forEach((m) => {
      if (m === target) return;
      const d = Math.hypot(m.x - px, m.y - py);
      if (d < bd) { bd = d; best = m; }
    });
    return best;
  }
  function slashFx(a, b) {
    const s = tileToScreen(b.x, b.y);
    for (let i = 0; i < 7; i++) {
      G.particles.push({ sx: s.x, sy: s.y - 20, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 40, life: 0.25, max: 0.25, color: '#fff6d8', size: 3, screen: true });
    }
  }
  function arcFx(p) {
    burstAt(p.x, p.y, '#ffe7b0', 14);
  }
  function shoot(from, target, kind, onHit) {
    G.shots.push({ x: from.x, y: from.y - 0.2, targetId: target.id, tx: target.x, ty: target.y, kind, speed: kind === 'fire' ? 7.5 : 6.4, onHit });
  }

  function release(sk, target) {
    const p = G.player;
    if (p.mp < sk.mp) { log('魔法值不足', 'warn'); return; }
    if ((p.cd[sk.id] || 0) > G.time) return;
    p.mp -= sk.mp;
    p.cd[sk.id] = G.time + sk.cd;
    p.pending = null;
    p.attackAnim = 0.25;
    if (p.stealth > 0 && sk.type !== 'stealth') p.stealth = 0;
    const st = computeStats();
    if (sk.id === 'w_fire' && target) {
      p.dir = dirFrom(target.x - p.x, target.y - p.y);
      let dmg = Math.round(mitigate(rollRange(st.atkMin, st.atkMax), targetDef(target)) * 2.05);
      hitMonster(target, dmg, '#ff7a3c');
      G.monsters.forEach((m) => { if (m !== target && dist(target, m) <= 1.15) hitMonster(m, Math.round(dmg * 0.5), '#ff7a3c'); });
      burstAt(target.x, target.y, '#ff6a2a', 22);
    } else if (sk.id === 'm_fire' && target) {
      const dmg = mitigate(rollRange(st.magMin, st.magMax) * 1.3, monsterMdef(target));
      shoot(p, target, 'fire', () => hitMonster(target, dmg, '#ff8a3c'));
    } else if (sk.id === 'm_thunder' && target) {
      const dmg = mitigate(rollRange(st.magMin, st.magMax) * 1.75, monsterMdef(target));
      hitMonster(target, dmg, '#d7e6ff');
      lightningFx(target);
    } else if (sk.id === 'm_ice' && target) {
      const dmg = mitigate(rollRange(st.magMin, st.magMax) * 1.15, monsterMdef(target));
      G.monsters.forEach((m) => {
        if (dist(m, target) <= sk.radius) {
          hitMonster(m, dmg, '#bfe9ff');
          m.slow = 3.2;
        }
      });
      burstAt(target.x, target.y, '#d7f4ff', 26);
    } else if (sk.id === 'm_shield') {
      p.shield = 16;
      log('魔法盾展开了。', 'learn');
      burstAt(p.x, p.y, '#8eb6ff', 16);
    } else if (sk.id === 't_heal') {
      const heal = Math.round((st.taoMin + st.taoMax) * 1.1 + 28);
      p.hp = Math.min(st.maxHp, p.hp + heal);
      floatText(p, '+' + heal, '#9be7b1');
      burstAt(p.x, p.y, '#9be7b1', 14);
      log('治愈术恢复了 ' + heal + ' 点生命。', 'learn');
    } else if (sk.id === 't_talisman' && target) {
      const dmg = mitigate(rollRange(st.taoMin, st.taoMax) * 1.35, monsterMdef(target));
      shoot(p, target, 'talisman', () => hitMonster(target, dmg, '#ffd56a'));
    } else if (sk.id === 't_summon') {
      const tao = (st.taoMin + st.taoMax) / 2;
      G.pet = {
        kind: 'pet', name: '骷髅', x: p.x + 0.6, y: p.y + 0.4, homeX: p.x, homeY: p.y,
        hp: Math.round(50 + tao * 8), maxHp: Math.round(50 + tao * 8),
        atkMin: Math.max(4, Math.round(tao * 0.7)), atkMax: Math.max(8, Math.round(tao * 1.25)),
        dir: 'down', path: [], atkCd: 0.4, think: 0.2,
      };
      log('召唤出了骷髅。', 'learn');
      burstAt(G.pet.x, G.pet.y, '#f4efe4', 12);
    } else if (sk.id === 't_stealth') {
      p.stealth = 8;
      G.monsters.forEach((m) => { m.angry = false; m.path = []; });
      log('你隐身了。攻击就会现身。', 'learn');
    }
    beep(640, 0.07, 'square', 0.03);
  }
  function lightningFx(target) {
    const s = tileToScreen(target.x, target.y);
    G.particles.push({ sx: s.x, sy: s.y - 80, vx: 0, vy: 220, life: 0.18, max: 0.18, color: '#f4f7ff', size: 4, screen: true });
    burstAt(target.x, target.y, '#d9e6ff', 12);
  }
  function castHotbar(i) {
    if (G.mode !== 'play' || !$('question').classList.contains('hidden')) return;
    const id = G.player.hotbar[i];
    if (!id) return;
    const sk = skills.find((s) => s.id === id);
    if (!sk || !G.player.skills.includes(sk.id)) return;
    if (sk.type === 'stance') {
      G.player.stances[sk.id] = !G.player.stances[sk.id];
      log((G.player.stances[sk.id] ? '开启' : '关闭') + '「' + sk.name + '」。', 'learn');
      return;
    }
    if ((G.player.cd[sk.id] || 0) > G.time) { toast('技能还在准备'); return; }
    if (G.player.mp < sk.mp) { log('魔法值不足', 'warn'); return; }
    if (sk.type === 'heal' || sk.type === 'shield' || sk.type === 'summon' || sk.type === 'stealth') {
      release(sk, null);
      return;
    }
    const tgt = currentTarget() || nearestMonster(G.player, (sk.range || 1.7) + 3);
    if (!tgt) { log('附近没有怪物。', 'warn'); return; }
    G.player.targetId = tgt.id;
    if (dist(G.player, tgt) > (sk.range || 1.6)) {
      G.player.pending = sk.id;
      G.player.path = pathNear(G.player, tgt, (sk.range || 1.6) * 0.92);
      return;
    }
    release(sk, tgt);
  }

  function updateMonster(m, dt) {
    const tpl = monsters[m.tpl];
    m.atkCd -= dt;
    m.flash = Math.max(0, m.flash - dt);
    m.attackAnim = Math.max(0, m.attackAnim - dt);
    if (m.slow > 0) m.slow -= dt;
    const p = G.player;
    const see = p && !(p.stealth > 0) && (m.angry || dist(m, p) <= tpl.aggro);
    if (m.boss && p && see) {
      m.slamCd -= dt;
      if (m.windup > 0) {
        m.windup -= dt;
        m.path = [];
        if (m.windup <= 0 && dist(m, p) < 1.9) {
          hurtPlayer(Math.round(mitigate(rollRange(tpl.atk[0], tpl.atk[1]), computeStats().def) * 1.45));
          burstAt(m.x, m.y, '#ff5a4a', 18);
        }
        return;
      }
      if (m.slamCd <= 0 && dist(m, p) < 4.2) {
        m.windup = 0.72;
        m.slamCd = 5.4;
        return;
      }
    }
    if (tpl.behavior === 'still') {
      if (see && p && dist(m, p) <= tpl.range && m.atkCd <= 0) {
        m.atkCd = tpl.atkCd;
        m.attackAnim = 0.2;
        hurtPlayer(mitigate(rollRange(tpl.atk[0], tpl.atk[1]), computeStats().def));
      }
      return;
    }
    if (see && p) {
      m.angry = true;
      const homeD = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (homeD > tpl.leash + 1.5) m.angry = false;
      if (dist(m, p) <= tpl.range) {
        m.path = [];
        m.dir = dirFrom(p.x - m.x, p.y - m.y);
        if (m.atkCd <= 0) {
          m.atkCd = tpl.atkCd;
          m.attackAnim = 0.2;
          const petCloser = G.pet && dist(m, G.pet) + 0.2 < dist(m, p);
          if (petCloser) hurtPet(mitigate(rollRange(tpl.atk[0], tpl.atk[1]), 1));
          else hurtPlayer(mitigate(rollRange(tpl.atk[0], tpl.atk[1]), computeStats().def));
        }
      } else {
        m.think -= dt;
        if (m.think <= 0) {
          m.think = 0.45;
          m.path = astar(G.map, m.x, m.y, p.x, p.y);
        }
        moveAlong(m, dt, tpl.speed * (m.slow > 0 ? 0.55 : 1));
      }
    } else if (tpl.speed > 0) {
      m.think -= dt;
      const homeD = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (m.angry || homeD > 0.4) {
        m.angry = false;
        if (!m.path || !m.path.length) m.path = astar(G.map, m.x, m.y, m.homeX, m.homeY);
        moveAlong(m, dt, tpl.speed * 0.8);
      } else if (m.think <= 0) {
        m.think = 1.4 + Math.random() * 2;
        const ang = Math.random() * Math.PI * 2;
        const tx = m.homeX + Math.cos(ang) * 2;
        const ty = m.homeY + Math.sin(ang) * 2;
        m.path = astar(G.map, m.x, m.y, tx, ty).slice(0, 4);
      } else {
        moveAlong(m, dt, tpl.speed * 0.65);
      }
    }
  }
  function hurtPet(dmg) {
    if (!G.pet) return;
    G.pet.hp -= dmg;
    floatText(G.pet, '-' + dmg, '#ffd0d0');
    if (G.pet.hp <= 0) {
      log('骷髅被打倒了。', 'warn');
      burstAt(G.pet.x, G.pet.y, '#ddd', 8);
      G.pet = null;
    }
  }
  function updatePet(dt) {
    const pet = G.pet;
    if (!pet) return;
    pet.atkCd -= dt;
    const tgt = nearestMonster(pet, 6.5);
    if (tgt) {
      if (dist(pet, tgt) <= 1.25) {
        pet.path = [];
        pet.dir = dirFrom(tgt.x - pet.x, tgt.y - pet.y);
        if (pet.atkCd <= 0) {
          pet.atkCd = 1.05;
          hitMonster(tgt, mitigate(rollRange(pet.atkMin, pet.atkMax), targetDef(tgt)), '#f4efe4');
        }
      } else {
        pet.think -= dt;
        if (pet.think <= 0) {
          pet.think = 0.4;
          pet.path = pathNear(pet, tgt, 1.15);
        }
        moveAlong(pet, dt, 2.3);
      }
    } else if (dist(pet, G.player) > 1.4) {
      pet.path = astar(G.map, pet.x, pet.y, G.player.x, G.player.y);
      moveAlong(pet, dt, 2.4);
    } else {
      moveAlong(pet, dt, 2);
    }
  }
  function updateShots(dt) {
    G.shots = G.shots.filter((s) => {
      const tgt = G.monsters.find((m) => m.id === s.targetId);
      const tx = tgt ? tgt.x : s.tx;
      const ty = tgt ? tgt.y : s.ty;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.speed * dt;
      if (d <= step + 0.15) {
        if (tgt && tgt.hp > 0) s.onHit();
        burstAt(tx, ty, s.kind === 'fire' ? '#ff8a3c' : '#ffd56a', 8);
        return false;
      }
      s.x += (dx / d) * step;
      s.y += (dy / d) * step;
      return true;
    });
  }
  function updateFx(dt) {
    G.particles.forEach((p) => {
      p.life -= dt;
      if (p.screen) { p.sx += p.vx * dt; p.sy += p.vy * dt; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
    });
    G.particles = G.particles.filter((p) => p.life > 0);
    G.floats.forEach((f) => { f.life -= dt; f.oy -= 28 * dt; });
    G.floats = G.floats.filter((f) => f.life > 0);
    if (G.marker) {
      G.marker.t -= dt;
      if (G.marker.t <= 0) G.marker = null;
    }
    if (G.particles.length < 70 && Math.random() < 0.35 && G.map) {
      const base = G.player && G.mode === 'play' ? G.player : { x: 16, y: 14 };
      const theme = G.map.theme;
      const color = theme === 'cave' ? '#c8c2b4' : theme === 'temple' ? '#ffb15a' : theme === 'forest' ? '#d2f0a8' : '#f8e7c2';
      G.particles.push({
        x: base.x + (Math.random() * 14 - 7),
        y: base.y + (Math.random() * 10 - 5),
        vx: 0.15, vy: -0.12 - Math.random() * 0.1,
        life: 1.6, max: 1.6, color, size: 2,
      });
    }
  }

  function update(dt) {
    G.anim += dt;
    if (G.mode === 'title') {
      G.monsters.forEach((m) => updateMonster(m, dt));
      updateFx(dt);
      const focus = worldOf(16.8 + Math.sin(G.anim * 0.15) * 1.4, 14.2);
      G.cam.x += (focus.x - G.viewW * 0.12 - G.cam.x) * Math.min(1, dt * 2);
      G.cam.y += (focus.y - G.cam.y) * Math.min(1, dt * 2);
      return;
    }
    if (G.mode !== 'play' || !G.player) { updateFx(dt); return; }
    if (G.gateLock > 0) G.gateLock -= dt;
    if (frozen()) { updateFx(dt); updateHud(); return; }
    const p = G.player;
    G.time += dt;
    p.playSeconds = (p.playSeconds || 0) + dt;
    if (p.hurt > 0) p.hurt -= dt;
    if (p.shield > 0) p.shield -= dt;
    if (p.stealth > 0) p.stealth -= dt;
    p.attackAnim = Math.max(0, (p.attackAnim || 0) - dt);
    moveAlong(p, dt, 3.15);
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (tx !== p.tileX || ty !== p.tileY) {
      p.tileX = tx;
      p.tileY = ty;
      const g = G.map.gates.find((gate) => gate.x === tx && gate.y === ty);
      if (g) tryGate(g);
    }
    const tgt = currentTarget();
    if (p.pending && tgt) {
      const sk = skills.find((s) => s.id === p.pending);
      if (sk && dist(p, tgt) <= (sk.range || 1.6)) {
        p.path = [];
        release(sk, tgt);
      }
    } else if (tgt) {
      if (dist(p, tgt) > basicRange()) {
        if (!p.path || !p.path.length) p.path = pathNear(p, tgt, basicRange() * 0.92);
      } else {
        p.path = [];
        tryBasic();
      }
    }
    G.monsters.forEach((m) => updateMonster(m, dt));
    if (p.downed) {
      p.downed = false;
      const loss = Math.min(p.gold, Math.max(6, Math.round(p.gold * 0.08)));
      p.gold -= loss;
      log('你受了重伤，村民把你送回新手村。损失 ' + loss + ' 金币。', 'warn');
      toast('被送回了新手村');
      enterMap('village', maps.village.spawn.x, maps.village.spawn.y);
      const st = computeStats();
      p.hp = st.maxHp;
      p.mp = st.maxMp;
      save();
      updateHud();
      return;
    }
    updatePet(dt);
    updateShots(dt);
    G.corpses = G.corpses.filter((c) => {
      if (G.time < c.at) return true;
      if (dist(p, c) < 1.3) { c.at = G.time + 2; return true; }
      spawnMonster(c.tpl, c.x, c.y);
      return false;
    });
    updateFx(dt);
    const w = worldOf(p.x, p.y);
    G.cam.x += (w.x - G.cam.x) * Math.min(1, dt * 6);
    G.cam.y += (w.y - G.cam.y) * Math.min(1, dt * 6);
    G.saveAcc += dt;
    if (G.saveAcc > 8) save();
    updateHud();
  }

  function diamondPath(g, x, y, tw, th) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + tw / 2, y + th / 2);
    g.lineTo(x, y + th);
    g.lineTo(x - tw / 2, y + th / 2);
    g.closePath();
  }
  function buildTileCache() {
    const types = [T.GRASS, T.DIRT, T.STONE, T.WATER, T.WOOD, T.SAND, T.CAVE, T.TEMPLE, T.FLOWER, T.CARPET, T.LAVA];
    const palette = {
      [T.GRASS]: ['#6fbe58', '#3f8a3a'],
      [T.DIRT]: ['#d7b56a', '#a67c45'],
      [T.STONE]: ['#c8c0b2', '#8e877c'],
      [T.WATER]: ['#5eb4e2', '#2d78b0'],
      [T.WOOD]: ['#c89255', '#8a5a30'],
      [T.SAND]: ['#ead39a', '#c7a56a'],
      [T.CAVE]: ['#6d675e', '#3e3a34'],
      [T.TEMPLE]: ['#8a4038', '#5c2824'],
      [T.FLOWER]: ['#67b850', '#3f8a3a'],
      [T.CARPET]: ['#a33b3b', '#6e2424'],
      [T.LAVA]: ['#ff8a3c', '#b43218'],
    };
    types.forEach((type) => {
      for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 256;
        const g = c.getContext('2d');
        diamondPath(g, 256, 2, 508, 252);
        const grd = g.createLinearGradient(0, 0, 512, 256);
        const pair = palette[type];
        grd.addColorStop(0, pair[0]);
        grd.addColorStop(1, pair[1]);
        g.fillStyle = grd;
        g.fill();
        g.save();
        diamondPath(g, 256, 2, 508, 252);
        g.clip();
        g.globalAlpha = 0.35;
        for (let i = 0; i < 18; i++) {
          const px = (v * 80 + i * 47) % 500;
          const py = (v * 30 + i * 29) % 240;
          g.fillStyle = i % 2 ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)';
          if (type === T.GRASS || type === T.FLOWER) {
            g.strokeStyle = '#2f6d32';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px + 2, py - 10);
            g.stroke();
          } else {
            g.fillRect(px, py, 8, 4);
          }
        }
        if (type === T.FLOWER) {
          g.globalAlpha = 0.9;
          ['#ffd1dc', '#ffe08a', '#ffffff'].forEach((col, i) => {
            g.fillStyle = col;
            g.beginPath();
            g.arc(140 + i * 90 + v * 10, 120, 7, 0, 7);
            g.fill();
          });
        }
        g.restore();
        diamondPath(g, 256, 2, 508, 252);
        g.strokeStyle = 'rgba(40,24,12,.28)';
        g.lineWidth = 6;
        g.stroke();
        G.tileCache.set(type + ':' + v, c);
      }
    });
  }
  function drawCube(g, x, y, h, top, left, right) {
    const tw = G.TW;
    const th = G.TH;
    g.fillStyle = left;
    g.beginPath();
    g.moveTo(x - tw / 2, y + th / 2);
    g.lineTo(x, y + th);
    g.lineTo(x, y + th - h);
    g.lineTo(x - tw / 2, y + th / 2 - h);
    g.closePath();
    g.fill();
    g.fillStyle = right;
    g.beginPath();
    g.moveTo(x + tw / 2, y + th / 2);
    g.lineTo(x, y + th);
    g.lineTo(x, y + th - h);
    g.lineTo(x + tw / 2, y + th / 2 - h);
    g.closePath();
    g.fill();
    g.fillStyle = top;
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + tw / 2, y + th / 2 - h);
    g.lineTo(x, y + th - h);
    g.lineTo(x - tw / 2, y + th / 2 - h);
    g.closePath();
    g.fill();
  }
  function drawTree(g, x, y, seed) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath();
    g.ellipse(0, 0, 16, 7, 0, 0, 7);
    g.fill();
    g.fillStyle = '#6d4524';
    g.fillRect(-4, -30, 8, 30);
    const cols = ['#2c6b30', '#3d8c40', '#245a28'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = cols[(i + seed) % 3];
      g.beginPath();
      g.arc((i - 1) * 9, -34 - i * 8, 16 - i, 0, 7);
      g.fill();
    }
    g.restore();
  }
  function drawActor(g, kind, dir, frame, flash, color) {
    const bob = Math.sin(frame) * (kind === 'boss' ? 2 : 2.4);
    g.save();
    g.translate(0, bob);
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath();
    g.ellipse(0, 4, kind === 'boss' ? 22 : 14, 6, 0, 0, 7);
    g.fill();
    const skin = '#f0c7a0';
    const leg = (side) => {
      g.fillStyle = '#3a2416';
      const swing = Math.sin(frame + side) * 4;
      g.fillRect(-7 + side * 6, 8, 5, 10 + swing * 0.2);
    };
    const ink = '#2a1810';
    const blob = (x, y, rx, ry, fill) => {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = ink;
      g.stroke();
    };
    if (kind === 'chicken') {
      g.strokeStyle = '#c47a2a';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-5, 2); g.lineTo(-7, 12); g.moveTo(4, 2); g.lineTo(6, 12); g.stroke();
      blob(0, -6, 13, 10, '#f6c453');
      blob(-2, -16, 7, 6, '#f3d27a');
      g.fillStyle = '#e23d3d';
      g.beginPath(); g.moveTo(-2, -22); g.lineTo(1, -28); g.lineTo(4, -21); g.fill();
      g.fillStyle = '#f08a2a';
      g.beginPath(); g.moveTo(5, -16); g.lineTo(14, -14); g.lineTo(5, -12); g.fill();
      g.fillStyle = ink;
      g.fillRect(1, -18, 2, 2);
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(-6, -4, 5, 3, -0.4, 0, 7); g.fill();
    } else if (kind === 'deer') {
      g.strokeStyle = '#5a3a22';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-8, 0); g.lineTo(-10, 12); g.moveTo(-2, 2); g.lineTo(-2, 13);
      g.moveTo(6, 2); g.lineTo(8, 13); g.moveTo(12, 0); g.lineTo(14, 12);
      g.stroke();
      blob(0, -6, 16, 9, '#a56b3c');
      blob(14, -14, 6, 5, '#c48a55');
      g.strokeStyle = '#f2e2c4';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(12, -18); g.lineTo(8, -30); g.lineTo(4, -22); g.moveTo(16, -18); g.lineTo(20, -30); g.lineTo(24, -22); g.stroke();
      g.fillStyle = ink;
      g.fillRect(16, -15, 2, 2);
    } else if (kind === 'cat') {
      blob(0, -2, 15, 10, '#e07a32');
      g.fillStyle = '#e07a32';
      g.strokeStyle = ink;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-8, -8); g.lineTo(-16, -22); g.lineTo(-2, -10); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(8, -8); g.lineTo(16, -22); g.lineTo(2, -10); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f2d2a8';
      g.beginPath(); g.ellipse(0, 0, 6, 4, 0, 0, 7); g.fill();
      g.fillStyle = ink;
      g.fillRect(-4, -6, 2, 2); g.fillRect(3, -6, 2, 2);
      g.strokeStyle = '#6b4423';
      g.beginPath(); g.moveTo(10, 0); g.lineTo(22, 6); g.lineTo(16, 10); g.stroke();
    } else if (kind === 'scarecrow') {
      g.strokeStyle = '#6b4423';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 12); g.lineTo(0, -28); g.moveTo(-16, -8); g.lineTo(16, -8); g.stroke();
      g.fillStyle = '#e0a030';
      g.fillRect(-8, -8, 16, 14);
      g.fillStyle = '#f2d48a';
      g.beginPath(); g.arc(0, -24, 8, 0, 7); g.fill();
      g.fillStyle = '#c4473a';
      g.beginPath(); g.ellipse(0, -30, 12, 4, 0, 0, 7); g.fill();
    } else if (kind === 'skeleton' || kind === 'pet') {
      g.strokeStyle = '#f4efe4';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(-6, 8); g.lineTo(-6, -8); g.moveTo(6, 8); g.lineTo(6, -8); g.moveTo(-10, -4); g.lineTo(10, -4); g.stroke();
      g.fillStyle = '#f7f3ea';
      g.beginPath(); g.arc(0, -16, 8, 0, 7); g.fill();
      g.fillStyle = '#222';
      g.fillRect(-4, -18, 2, 2); g.fillRect(2, -18, 2, 2);
    } else if (kind === 'zombie') {
      g.fillStyle = '#6f8f55';
      g.fillRect(-9, -18, 18, 24);
      g.fillStyle = '#d7e2b5';
      g.beginPath(); g.arc(0, -24, 8, 0, 7); g.fill();
      g.strokeStyle = '#314628';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(-9, -10); g.lineTo(-18, -2); g.moveTo(9, -10); g.lineTo(18, -2); g.stroke();
    } else {
      const pal = {
        warrior: ['#c4473a', '#8d2d24', '#f2d48a'],
        mage: ['#3d6fbf', '#24467e', '#d7e6ff'],
        taoist: ['#d7b15a', '#8d6a28', '#fff1c9'],
        guard: ['#a33b3b', '#5c1d1d', '#e8e8e8'],
        boss: ['#6e2430', '#3a1018', '#ffd56a'],
        npc: [color || '#f0d7a2', '#6a4424', '#fff'],
      }[kind] || ['#f0d7a2', '#6a4424', '#fff'];
      const scale = kind === 'boss' ? 1.7 : 1;
      g.save();
      g.scale(scale, scale);
      leg(0); leg(1);
      g.fillStyle = pal[0];
      g.beginPath();
      g.moveTo(-11, -20);
      g.lineTo(11, -20);
      g.lineTo(14, 8);
      g.lineTo(-14, 8);
      g.closePath();
      g.fill();
      g.fillStyle = pal[1];
      g.fillRect(-11, -6, 22, 4);
      g.fillStyle = skin;
      g.beginPath(); g.arc(dir === 'left' ? -2 : dir === 'right' ? 2 : 0, -28, 8, 0, 7); g.fill();
      g.strokeStyle = ink;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#3a2416';
      g.beginPath();
      g.arc(dir === 'left' ? -2 : dir === 'right' ? 2 : 0, -31, 8, Math.PI, 0);
      g.fill();
      g.fillStyle = '#3a2416';
      if (dir !== 'up') {
        const ex = dir === 'left' ? -4 : dir === 'right' ? 3 : -3;
        g.fillRect(ex, -30, 2, 2);
        g.fillRect(ex + 4, -30, 2, 2);
      } else {
        g.fillRect(-6, -34, 12, 4);
      }
      if (kind === 'boss') {
        g.strokeStyle = '#ffd56a';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(-6, -34); g.lineTo(-12, -46); g.moveTo(6, -34); g.lineTo(12, -46); g.stroke();
      }
      if (kind === 'warrior' || kind === 'guard' || kind === 'taoist') {
        g.strokeStyle = kind === 'taoist' ? '#f2d48a' : '#d9dde6';
        g.lineWidth = 3;
        const side = dir === 'left' ? -1 : 1;
        g.beginPath();
        g.moveTo(8 * side, -8);
        g.lineTo(16 * side, dir === 'up' ? -20 : 6);
        g.stroke();
      }
      if (kind === 'mage' || kind === 'boss') {
        g.strokeStyle = '#e8c98a';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(10, 6); g.lineTo(10, -24); g.stroke();
        g.fillStyle = kind === 'boss' ? '#ff5a3c' : '#7eb6ff';
        g.beginPath(); g.arc(10, -26, 4, 0, 7); g.fill();
      }
      g.restore();
    }
    if (flash > 0) {
      g.globalAlpha = 0.45;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, -16, 16, 0, 7); g.fill();
    }
    g.restore();
  }
  function label(g, text, x, y, color) {
    g.font = '700 13px ' + FONT;
    g.textAlign = 'center';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,.75)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  function render() {
    const w = G.viewW;
    const h = G.viewH;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = G.map.theme === 'cave' ? '#161311' : '#24301c';
    ctx.fillRect(0, 0, w, h);
    const list = G.drawList;
    list.length = 0;
    const padX = 3;
    const padY = 4;
    const center = screenToTile(w / 2, h / 2);
    const reach = Math.ceil(w / G.TW) + 8;
    for (let y = Math.max(0, Math.floor(center.y) - reach); y < Math.min(G.map.h, Math.floor(center.y) + reach); y++) {
      for (let x = Math.max(0, Math.floor(center.x) - reach); x < Math.min(G.map.w, Math.floor(center.x) + reach); x++) {
        const top = tileToScreen(x, y);
        if (top.x < -G.TW || top.x > w + G.TW || top.y < -G.TH * 3 || top.y > h + G.TH) continue;
        const type = G.map.tiles[y][x];
        list.push({ depth: x + y, layer: 0, draw: () => drawGround(top.x, top.y, type, x, y) });
        if (type === T.WALL || (type === T.ROCK && G.map.theme === 'cave')) {
          list.push({ depth: x + y, layer: 1, draw: () => {
            const roof = (G.map.roof[y] && G.map.roof[y][x]) || (G.map.theme === 'temple' ? '#8c2f2f' : '#9a9388');
            drawCube(ctx, top.x, top.y, G.TW * 0.62, roof, '#cbbfa8', '#8d8478');
          } });
        } else if (type === T.FENCE) {
          list.push({ depth: x + y, layer: 1, draw: () => drawCube(ctx, top.x, top.y, G.TW * 0.22, '#e6d2a2', '#b08958', '#8a6238') });
        } else if (type === T.TREE) {
          list.push({ depth: x + y, layer: 1, draw: () => drawTree(ctx, top.x, top.y + G.TH / 2, (x * 3 + y) % 5) });
        } else if (type === T.ROCK) {
          list.push({ depth: x + y, layer: 1, draw: () => drawCube(ctx, top.x, top.y, G.TW * 0.28, '#b7b1a6', '#7e786f', '#5e5952') });
        } else if (type === T.GATE) {
          list.push({ depth: x + y, layer: 1, draw: () => {
            ctx.save();
            ctx.translate(top.x, top.y + G.TH / 2);
            ctx.strokeStyle = 'rgba(255, 210, 120,' + (0.45 + Math.sin(G.anim * 4) * 0.25) + ')';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 8, 0, 0, 7);
            ctx.stroke();
            ctx.restore();
          } });
        }
      }
    }
    const drawEnt = (ent, kind, color) => {
      const foot = tileToScreen(ent.x, ent.y);
      list.push({
        depth: ent.x + ent.y,
        layer: 2,
        draw: () => {
          ctx.save();
          ctx.translate(foot.x, foot.y);
          if (ent.stealth > 0) ctx.globalAlpha = 0.4;
          const moving = !!(ent.moving || (ent.path && ent.path.length));
          drawActor(ctx, kind, ent.dir || 'down', moving ? G.anim * 10 : G.anim * 2, ent.flash || 0, color);
          ctx.restore();
          if (ent.shield > 0) {
            ctx.strokeStyle = 'rgba(120,170,255,.85)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(foot.x, foot.y - 28, 22, 0, 7);
            ctx.stroke();
          }
          const nameColor = ent.boss ? '#ffb15a' : ent.kind === 'npc' ? '#b7f7c2' : ent.kind === 'player' ? '#ffe7a8' : '#fff';
          label(ctx, ent.name, foot.x, foot.y - 58, nameColor);
          if (ent.kind === 'monster' || ent.kind === 'pet') {
            const pct = clamp(ent.hp / ent.maxHp, 0, 1);
            ctx.fillStyle = 'rgba(0,0,0,.55)';
            ctx.fillRect(foot.x - 18, foot.y - 50, 36, 5);
            ctx.fillStyle = pct > 0.35 ? '#67d36a' : '#e25b4a';
            ctx.fillRect(foot.x - 18, foot.y - 50, 36 * pct, 5);
          }
          if (ent.boss && ent.windup > 0) {
            ctx.strokeStyle = 'rgba(255,70,50,.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(foot.x, foot.y, G.TW * 0.9, G.TH * 0.9, 0, 0, 7);
            ctx.stroke();
          }
        },
      });
    };
    G.npcs.forEach((n) => drawEnt(n, 'npc', n.color));
    G.monsters.forEach((m) => drawEnt(m, m.tpl === 'boss' ? 'boss' : m.tpl, null));
    if (G.pet) drawEnt(G.pet, 'pet', null);
    if (G.player && G.mode === 'play') drawEnt(Object.assign({ kind: 'player', name: G.player.name }, G.player), G.player.classId, null);
    G.shots.forEach((s) => {
      const p = tileToScreen(s.x, s.y);
      list.push({
        depth: s.x + s.y, layer: 2, draw: () => {
          ctx.fillStyle = s.kind === 'fire' ? '#ff8a3c' : '#ffe08a';
          ctx.beginPath();
          ctx.arc(p.x, p.y - 18, s.kind === 'fire' ? 7 : 5, 0, 7);
          ctx.fill();
        },
      });
    });
    list.sort((a, b) => a.depth - b.depth || a.layer - b.layer);
    list.forEach((item) => item.draw());
    if (G.hover && G.mode === 'play') {
      const t = tileToScreen(G.hover.x, G.hover.y);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      diamondPath(ctx, t.x, t.y, G.TW, G.TH);
      ctx.stroke();
    }
    if (G.marker) {
      const t = tileToScreen(G.marker.x + 0.5, G.marker.y + 0.5);
      ctx.strokeStyle = 'rgba(255, 220, 120,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 10 + Math.sin(G.anim * 8) * 2, 5, 0, 0, 7);
      ctx.stroke();
    }
    G.particles.forEach((p) => {
      const pos = p.screen ? { x: p.sx, y: p.sy } : tileToScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / (p.max || 0.8));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    G.floats.forEach((f) => {
      const pos = tileToScreen(f.x, f.y);
      ctx.globalAlpha = Math.max(0, f.life);
      label(ctx, f.text, pos.x, pos.y + f.oy, f.color);
      ctx.globalAlpha = 1;
    });
    if (G.player && G.mode === 'play' && !G.player.tutorial.moved) {
      const pos = tileToScreen(G.player.x, G.player.y);
      label(ctx, '点击地面走路', pos.x, pos.y - 78, '#fff');
    } else if (G.player && G.mode === 'play' && !G.player.tutorial.fought) {
      const pos = tileToScreen(G.player.x, G.player.y);
      label(ctx, '点击怪物战斗', pos.x, pos.y - 78, '#fff');
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    if (G.mode === 'play') drawMinimap();
  }
  function drawGround(x, y, type, tx, ty) {
    let base = type;
    if (type === T.TREE || type === T.FENCE) base = T.GRASS;
    if (type === T.ROCK && G.map.theme !== 'cave') base = T.GRASS;
    if (type === T.GATE) base = G.map.theme === 'cave' ? T.CAVE : G.map.theme === 'temple' ? T.TEMPLE : T.DIRT;
    if (type === T.WALL) base = G.map.theme === 'city' ? T.STONE : T.DIRT;
    const variant = Math.abs((tx * 3 + ty * 7) % 4);
    const img = G.tileCache.get(base + ':' + variant) || G.tileCache.get(T.GRASS + ':0');
    if (img) ctx.drawImage(img, x - G.TW / 2, y, G.TW, G.TH);
    if (base === T.WATER || base === T.LAVA) {
      ctx.save();
      diamondPath(ctx, x, y, G.TW, G.TH);
      ctx.clip();
      ctx.strokeStyle = base === T.LAVA ? 'rgba(255,220,120,.45)' : 'rgba(255,255,255,.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const yy = y + 10 + i * (G.TH / 4) + Math.sin(G.anim * 2 + tx + i) * 3;
        ctx.beginPath();
        ctx.moveTo(x - G.TW / 3, yy);
        ctx.quadraticCurveTo(x, yy + 4, x + G.TW / 3, yy);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawMinimap() {
    const w = mini.width;
    const h = mini.height;
    mctx.clearRect(0, 0, w, h);
    const sx = w / G.map.w;
    const sy = h / G.map.h;
    const colors = {
      [T.GRASS]: '#3f8a3a', [T.DIRT]: '#a67c45', [T.STONE]: '#8e877c', [T.WATER]: '#2d78b0',
      [T.WOOD]: '#8a5a30', [T.SAND]: '#c7a56a', [T.CAVE]: '#4a453e', [T.TEMPLE]: '#6e2424',
      [T.FLOWER]: '#3f8a3a', [T.WALL]: '#d7c4a4', [T.TREE]: '#245a28', [T.ROCK]: '#5e5952',
      [T.FENCE]: '#b08958', [T.GATE]: '#e6c27a', [T.CARPET]: '#a33b3b', [T.LAVA]: '#ff6a2a',
    };
    for (let y = 0; y < G.map.h; y++) {
      for (let x = 0; x < G.map.w; x++) {
        mctx.fillStyle = colors[G.map.tiles[y][x]] || '#333';
        mctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    const dot = (x, y, color, r) => {
      mctx.fillStyle = color;
      mctx.fillRect(x * sx - r, y * sy - r, r * 2, r * 2);
    };
    G.npcs.forEach((n) => dot(n.x, n.y, '#ffe08a', 2));
    G.monsters.forEach((m) => dot(m.x, m.y, m.boss ? '#ff5a3c' : '#ff8d8d', m.boss ? 3 : 2));
    if (G.player) dot(G.player.x, G.player.y, '#ffffff', 3);
  }

  function updateHud() {
    if (!G.player) return;
    const p = G.player;
    const st = computeStats();
    $('who-name').textContent = p.name;
    $('who-meta').textContent = classes[p.classId].name + ' · ' + GRADES[p.grade] + ' · ' + p.level + '级';
    $('gold-text').textContent = '金币 ' + p.gold;
    $('hp-fill').style.width = (100 * clamp(p.hp / st.maxHp, 0, 1)) + '%';
    $('mp-fill').style.width = (100 * clamp(p.mp / st.maxMp, 0, 1)) + '%';
    $('exp-fill').style.width = (100 * clamp(p.exp / expNeed(p.level), 0, 1)) + '%';
    $('hp-text').textContent = p.hp + ' / ' + st.maxHp;
    $('mp-text').textContent = p.mp + ' / ' + st.maxMp;
    $('exp-text').textContent = p.exp + ' / ' + expNeed(p.level);
    const tgt = currentTarget();
    $('target-box').textContent = tgt ? (tgt.name + '  ' + Math.max(0, Math.ceil(tgt.hp)) + '/' + tgt.maxHp) : '';
    const slots = $('hotbar').children;
    for (let i = 0; i < 8; i++) {
      const btn = slots[i];
      const id = p.hotbar[i];
      const sk = id ? skills.find((s) => s.id === id) : null;
      btn.querySelector('b').textContent = sk ? sk.name.slice(0, 4) : '';
      btn.classList.toggle('on', !!(sk && p.stances[sk.id]));
      const cd = btn.querySelector('.cd');
      if (sk && sk.cd && (p.cd[sk.id] || 0) > G.time) cd.style.height = (((p.cd[sk.id] - G.time) / sk.cd) * 100) + '%';
      else cd.style.height = '0';
    }
    const hp = p.bag.find((b) => b.kind === 'potion' && b.hp);
    const mp = p.bag.find((b) => b.kind === 'potion' && b.mp && !b.hp);
    $('pot-hp').textContent = '1 金创药 ' + (hp ? 'x' + hp.count : '0');
    $('pot-mp').textContent = '2 魔法药 ' + (mp ? 'x' + mp.count : '0');
    $('btn-sound').textContent = G.sound ? '声音 开' : '声音 关';
  }

  function openPanel(name) {
    G.panel = name;
    G.selected = null;
    $('panel').classList.remove('hidden');
    renderPanel();
  }
  function closePanel() {
    G.panel = null;
    $('panel').classList.add('hidden');
  }
  function renderPanel() {
    if (!G.panel || !G.player) return;
    const body = $('panel-body');
    const title = $('panel-title');
    body.replaceChildren();
    if (G.panel === 'char') renderChar(title, body);
    else if (G.panel === 'bag') renderBag(title, body);
    else if (G.panel === 'skill') renderSkills(title, body);
    else if (G.panel === 'report') renderReport(title, body);
    else if (G.panel === 'map') renderMapPanel(title, body);
    else if (G.panel === 'help') renderHelp(title, body);
    else if (G.panel === 'shop') renderShop(title, body);
    else if (G.panel === 'talk') renderTalk(title, body);
    else if (G.panel === 'travel') renderTravel(title, body);
  }
  function statLine(name, value) {
    const d = document.createElement('div');
    d.className = 'item';
    d.textContent = name + '  ' + value;
    return d;
  }
  function renderChar(title, body) {
    title.textContent = '角色';
    const st = computeStats();
    const grid = document.createElement('div');
    grid.className = 'stat-grid';
    const p = G.player;
    [
      ['生命', p.hp + '/' + st.maxHp],
      ['魔法', p.mp + '/' + st.maxMp],
      ['攻击', st.atkMin + '-' + st.atkMax],
      ['魔法', st.magMin + '-' + st.magMax],
      ['道术', st.taoMin + '-' + st.taoMax],
      ['防御', String(st.def)],
      ['魔防', String(st.mdef)],
    ].forEach((row) => grid.appendChild(statLine(row[0], row[1])));
    body.appendChild(grid);
    const slots = ['helmet', 'weapon', 'armor', 'necklace', 'bracelet1', 'bracelet2', 'ring1', 'ring2'];
    const names = { helmet: '头盔', weapon: '武器', armor: '衣服', necklace: '项链', bracelet1: '手镯', bracelet2: '手镯', ring1: '戒指', ring2: '戒指' };
    const eg = document.createElement('div');
    eg.className = 'bag-grid';
    slots.forEach((slot) => {
      const it = p.equip[slot];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item';
      b.style.borderColor = it ? RARITY[it.rarity].color : '';
      const mark = document.createElement('div');
      mark.className = 'mark';
      mark.textContent = it ? markOf(it) : '空';
      mark.style.color = it ? RARITY[it.rarity].color : '';
      const sm = document.createElement('small');
      sm.textContent = (it ? it.name : names[slot]);
      b.appendChild(mark);
      b.appendChild(sm);
      b.addEventListener('click', () => { if (it) unequip(slot); });
      eg.appendChild(b);
    });
    body.appendChild(eg);
    const tip = document.createElement('p');
    tip.textContent = '点已装备的格子可以卸下。武器、衣服在背包里点一下就能穿上。';
    body.appendChild(tip);
  }
  function itemButton(item, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item';
    if (item.rarity) b.style.borderColor = RARITY[item.rarity].color;
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.textContent = markOf(item);
    if (item.rarity) mark.style.color = RARITY[item.rarity].color;
    const sm = document.createElement('small');
    sm.textContent = item.name + (item.count > 1 ? ' x' + item.count : '');
    b.appendChild(mark);
    b.appendChild(sm);
    b.addEventListener('click', onClick);
    return b;
  }
  function renderBag(title, body) {
    title.textContent = '背包';
    const grid = document.createElement('div');
    grid.className = 'bag-grid';
    G.player.bag.forEach((item) => {
      grid.appendChild(itemButton(item, () => { G.selected = item.uid; renderPanel(); }));
    });
    if (!G.player.bag.length) {
      const empty = document.createElement('p');
      empty.textContent = '背包是空的。去打败怪物，答对题目就能拿到东西。';
      body.appendChild(empty);
    }
    body.appendChild(grid);
    const item = G.player.bag.find((b) => b.uid === G.selected);
    if (item) body.appendChild(detailBlock(item));
  }
  function detailBlock(item) {
    const box = document.createElement('div');
    box.className = 'detail';
    const name = document.createElement('div');
    name.textContent = item.name + (item.rarity ? ' · ' + RARITY[item.rarity].name : '');
    name.style.color = item.rarity ? RARITY[item.rarity].color : '';
    name.style.fontWeight = '800';
    box.appendChild(name);
    const desc = document.createElement('div');
    desc.textContent = item.desc || '';
    box.appendChild(desc);
    const bits = [];
    if (item.atk) bits.push('攻击 ' + item.atk[0] + '-' + item.atk[1]);
    if (item.mag) bits.push('魔法 ' + item.mag[0] + '-' + item.mag[1]);
    if (item.tao) bits.push('道术 ' + item.tao[0] + '-' + item.tao[1]);
    if (item.def) bits.push('防御 +' + item.def);
    if (item.mdef) bits.push('魔防 +' + item.mdef);
    if (item.hp) bits.push('生命 +' + item.hp);
    if (item.mp && item.kind !== 'potion') bits.push('魔法值 +' + item.mp);
    if (item.kind === 'potion') bits.push(item.hp ? '恢复生命 ' + item.hp : '恢复魔法 ' + item.mp);
    if (item.level) bits.push('需要 ' + item.level + ' 级');
    const stat = document.createElement('div');
    stat.textContent = bits.join('  ');
    box.appendChild(stat);
    const row = document.createElement('div');
    row.className = 'row';
    if (item.kind === 'equip') {
      equipSlots(item).forEach((slot, idx) => {
        const b = document.createElement('button');
        b.className = 'primary';
        b.type = 'button';
        b.textContent = equipSlots(item).length > 1 ? ('装备到' + (idx + 1)) : '装备';
        b.addEventListener('click', () => equipItem(item, slot));
        row.appendChild(b);
      });
    } else {
      const b = document.createElement('button');
      b.className = 'primary';
      b.type = 'button';
      b.textContent = '使用';
      b.addEventListener('click', () => useItem(item));
      row.appendChild(b);
    }
    const drop = document.createElement('button');
    drop.className = 'ghost';
    drop.type = 'button';
    drop.textContent = '丢掉';
    drop.addEventListener('click', async () => {
      const ok = await confirmBox('丢掉「' + item.name + '」？');
      if (!ok) return;
      G.player.bag = G.player.bag.filter((b) => b !== item);
      save();
      renderPanel();
    });
    row.appendChild(drop);
    box.appendChild(row);
    return box;
  }
  function renderSkills(title, body) {
    title.textContent = '技能';
    skills.filter((s) => s.cls === G.player.classId).forEach((sk) => {
      const row = document.createElement('div');
      row.className = 'item';
      const known = G.player.skills.includes(sk.id);
      row.textContent = (known ? '已学会' : sk.level + '级学会') + '  ' + sk.name + '  魔法' + sk.mp + '  ' + sk.desc;
      body.appendChild(row);
    });
    const tip = document.createElement('p');
    tip.textContent = '技能会放到下方 F1 到 F8。姿态类技能点一下开启或关闭。升级时会得到技能书，也可以在导师那里买。';
    body.appendChild(tip);
  }
  function renderReport(title, body) {
    title.textContent = '学习报告';
    const p = G.player;
    const total = p.stats.correct + p.stats.wrong;
    const rate = total ? Math.round(100 * p.stats.correct / total) : 0;
    const head = document.createElement('p');
    head.textContent = p.name + ' · ' + GRADES[p.grade] + ' · 答对 ' + p.stats.correct + ' / ' + total + ' · 正确率 ' + rate + '% · 最高连对 ' + (p.bestCombo || 0) + ' · 击败怪物 ' + p.stats.kills;
    body.appendChild(head);
    const note = document.createElement('p');
    if (total < 3) note.textContent = '先去打几只怪物，学堂才会认识你的本领。';
    else if (rate >= 90) note.textContent = '正确率很高。掌握度越高，越容易得到稀有装备。';
    else if (rate >= 70) note.textContent = '学得不错。红色的知识点再练一练，会更稳。';
    else note.textContent = '答错的知识点会更常出现。看完讲解，下一次就有机会拿到宝物。';
    body.appendChild(note);
    const rows = Object.keys(p.mastery).map((k) => ({ k, m: p.mastery[k], s: masteryScore(p.mastery[k]) }));
    rows.sort((a, b) => a.s - b.s);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = '还没有答题记录。';
      body.appendChild(empty);
    }
    rows.slice(0, 18).forEach((row) => {
      const wrap = document.createElement('div');
      wrap.className = 'mastery' + (row.s < 60 ? ' weak' : '');
      const labelEl = document.createElement('div');
      labelEl.textContent = row.m.subject + ' · ' + row.k + '  ' + row.s + '%（对' + row.m.c + ' 错' + row.m.w + '）';
      const track = document.createElement('div');
      track.className = 'track';
      const bar = document.createElement('i');
      bar.style.width = row.s + '%';
      track.appendChild(bar);
      wrap.appendChild(labelEl);
      wrap.appendChild(track);
      body.appendChild(wrap);
    });
  }
  function renderMapPanel(title, body) {
    title.textContent = '地图';
    const list = document.createElement('div');
    list.className = 'map-list';
    Object.values(maps).forEach((map) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.type = 'button';
      const been = G.player.visited.includes(map.id);
      b.textContent = map.name + '  建议' + map.suggest + '级  ' + (been ? '已去过，点击前往' : '还没去过，请从路口步行');
      b.disabled = !been;
      b.addEventListener('click', () => {
        closePanel();
        enterMap(map.id, map.spawn.x, map.spawn.y);
      });
      list.appendChild(b);
    });
    body.appendChild(list);
  }
  function renderHelp(title, body) {
    title.textContent = '怎么玩';
    const lines = [
      '点击地面走路，点击怪物就会追上去攻击。',
      '怪物被打败后会出一道题。答对才有装备、药品和金币；答错会告诉你正确答案，并给一点点经验。',
      'F1 到 F8 是技能，1 喝金创药，2 喝魔法药。C 角色，B 背包，K 技能，L 学习报告，M 地图。',
      '战士适合近战，法师从远处放火球，道士能给自己治疗，还能召唤骷髅。',
      '同一个知识点如果老是答错，它会更常出现。掌握度越高，越容易掉落稀有装备。',
      '沃玛教主会连续问三题。建议先在新手村和森林把等级练上去。',
      '进度自动保存在这台浏览器。清除网站数据会把存档一起清掉。',
      '右上角可以全屏。画面会按屏幕清晰度绘制，最高支持 3840×2160。',
    ];
    lines.forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      body.appendChild(p);
    });
  }
  function shopStock(npc) {
    const p = G.player;
    if (npc.shop === 'potion') return potions.map((item) => ({ kind: 'potion', tpl: item, price: item.price, name: item.name, desc: item.desc }));
    if (npc.shop === 'trainer') {
      return skills.filter((s) => s.cls === p.classId && s.level <= p.level && !p.skills.includes(s.id)).map((s) => ({
        kind: 'book', skill: s, price: s.level * 80, name: '《' + s.name + '》', desc: s.desc,
      }));
    }
    const slot = npc.shop === 'weapon' ? 'weapon' : npc.shop === 'jewel' ? null : 'armor';
    return itemTpls.filter((t) => {
      if (t.level > p.level + 1) return false;
      if (t.cls && t.cls !== p.classId) return false;
      if (npc.shop === 'weapon') return t.slot === 'weapon';
      if (npc.shop === 'jewel') return t.slot === 'necklace' || t.slot === 'bracelet' || t.slot === 'ring' || t.slot === 'helmet';
      return t.slot === 'armor' || t.slot === 'helmet';
    }).map((t) => ({ kind: 'equip', tpl: t, price: t.price, name: t.name, desc: t.desc }));
  }
  function renderShop(title, body) {
    const npc = G.shopNpc;
    title.textContent = npc.name;
    const hello = document.createElement('p');
    hello.textContent = (npc.lines && npc.lines[0]) || '看看需要什么。';
    body.appendChild(hello);
    if (npc.shop === 'potion') {
      const heal = document.createElement('button');
      heal.className = 'primary';
      heal.type = 'button';
      heal.textContent = '免费疗伤';
      heal.addEventListener('click', () => {
        const st = computeStats();
        G.player.hp = st.maxHp;
        G.player.mp = st.maxMp;
        toast('状态恢复了');
        save();
        updateHud();
      });
      body.appendChild(heal);
    }
    const list = document.createElement('div');
    list.className = 'map-list';
    shopStock(npc).forEach((row) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.type = 'button';
      b.textContent = row.name + '  ' + row.price + '金币  ' + row.desc;
      b.addEventListener('click', () => buy(row));
      list.appendChild(b);
    });
    body.appendChild(list);
    const sellTip = document.createElement('p');
    sellTip.textContent = '出售背包里的东西（卖价是买价的一半左右）：';
    body.appendChild(sellTip);
    const bag = document.createElement('div');
    bag.className = 'bag-grid';
    G.player.bag.forEach((item) => {
      bag.appendChild(itemButton(item, () => sell(item)));
    });
    body.appendChild(bag);
  }
  function buy(row) {
    if (G.player.gold < row.price) { toast('金币不够'); return; }
    G.player.gold -= row.price;
    if (row.kind === 'potion') giveItem(makePotion(row.tpl.id, 1));
    else if (row.kind === 'book') giveItem(makeBook(row.skill));
    else giveItem(makeEquip(row.tpl, 'common'));
    log('买下了' + row.name + '。', 'loot');
    beep(700, 0.06, 'square', 0.03);
    save();
    updateHud();
    renderPanel();
  }
  function sell(item) {
    const price = Math.max(1, Math.floor((item.price || 10) * (item.rarity ? RARITY[item.rarity].mul : 1) * 0.45));
    if (item.count > 1) item.count -= 1;
    else G.player.bag = G.player.bag.filter((b) => b !== item);
    G.player.gold += price;
    log('卖出' + item.name + '，获得 ' + price + ' 金币。', 'loot');
    save();
    updateHud();
    renderPanel();
  }
  function renderTalk(title, body) {
    const npc = G.talkNpc;
    title.textContent = npc.name;
    const text = document.createElement('p');
    text.textContent = npc.lines[G.talkIndex] || '';
    text.style.fontSize = '18px';
    body.appendChild(text);
    const b = document.createElement('button');
    b.className = 'primary';
    b.type = 'button';
    b.textContent = G.talkIndex < npc.lines.length - 1 ? '下一句' : '我知道了';
    b.addEventListener('click', () => {
      if (G.talkIndex < npc.lines.length - 1) { G.talkIndex += 1; renderPanel(); }
      else closePanel();
    });
    body.appendChild(b);
  }
  function renderTravel(title, body) {
    title.textContent = '云游道人';
    const p = document.createElement('p');
    p.textContent = '去过的地方，我可以送你一程。';
    body.appendChild(p);
    renderMapPanel({ textContent: '' }, body);
    title.textContent = '云游道人';
  }

  function confirmBox(text) {
    $('confirm-text').textContent = text;
    $('confirm').classList.remove('hidden');
    return new Promise((resolve) => { G.confirmResolve = resolve; });
  }
  function closeConfirm(ok) {
    $('confirm').classList.add('hidden');
    const fn = G.confirmResolve;
    G.confirmResolve = null;
    if (fn) fn(ok);
  }

  function hitTest(sx, sy) {
    let best = null;
    let score = 1e9;
    const all = G.npcs.concat(G.monsters);
    if (G.pet) all.push(G.pet);
    all.forEach((e) => {
      const foot = tileToScreen(e.x, e.y);
      if (sx < foot.x - 26 || sx > foot.x + 26 || sy > foot.y + 8 || sy < foot.y - 70) return;
      let s = Math.abs(sx - foot.x) + Math.abs(sy - (foot.y - 30));
      if (e.kind === 'npc') s -= 30;
      if (s < score) { score = s; best = e; }
    });
    return best;
  }
  function onWorldClick(sx, sy) {
    if (G.mode !== 'play' || !G.player) return;
    if (!$('question').classList.contains('hidden')) return;
    if (G.panel) { closePanel(); return; }
    const ent = hitTest(sx, sy);
    if (ent && ent.kind === 'npc') {
      if (ent.role === 'shop' || ent.role === 'trainer') {
        G.shopNpc = ent;
        openPanel('shop');
      } else if (ent.role === 'travel') {
        openPanel('travel');
      } else {
        G.talkNpc = ent;
        G.talkIndex = 0;
        openPanel('talk');
      }
      return;
    }
    if (ent && ent.kind === 'monster') {
      G.player.targetId = ent.id;
      G.player.pending = null;
      G.player.path = pathNear(G.player, ent, basicRange() * 0.92);
      G.player.tutorial.moved = true;
      return;
    }
    const tile = screenToTile(sx, sy);
    const tx = Math.floor(tile.x);
    const ty = Math.floor(tile.y);
    if (!walkable(G.map, tx, ty)) { toast('那里走不过去'); return; }
    G.player.targetId = null;
    G.player.pending = null;
    G.player.path = astar(G.map, G.player.x, G.player.y, tx + 0.5, ty + 0.5);
    G.player.tutorial.moved = true;
    G.marker = { x: tx, y: ty, t: 0.8 };
  }

  function save() {
    if (!G.player || G.mode !== 'play') return;
    const p = G.player;
    const data = {
      v: 1, name: p.name, grade: p.grade, classId: p.classId, level: p.level, exp: p.exp,
      hp: p.hp, mp: p.mp, gold: p.gold, x: p.x, y: p.y, mapId: p.mapId,
      equip: p.equip, bag: p.bag, skills: p.skills, hotbar: p.hotbar, stances: p.stances, cd: p.cd,
      mastery: p.mastery, stats: p.stats, visited: p.visited, tutorial: p.tutorial,
      combo: p.combo, bestCombo: p.bestCombo, recent: p.recent, recentSubjects: p.recentSubjects,
      pending: p.pending, quizQueue: p.quizQueue || [], playSeconds: p.playSeconds,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    G.saveAcc = 0;
  }
  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !classes[data.classId] || !maps[data.mapId]) return null;
      return data;
    } catch (err) { return null; }
  }
  function applySave(data) {
    G.player = data;
    G.player.cd = data.cd || {};
    G.player.stances = data.stances || {};
    G.player.mastery = data.mastery || {};
    G.player.stats = data.stats || { kills: 0, correct: 0, wrong: 0, bosses: 0 };
    G.player.bag = data.bag || [];
    G.player.visited = data.visited || ['village'];
    G.player.tutorial = data.tutorial || { moved: true, fought: true, answered: true };
    G.player.hotbar = data.hotbar || [null, null, null, null, null, null, null, null];
    G.player.recent = data.recent || [];
    G.player.recentSubjects = data.recentSubjects || [];
    G.player.quizQueue = data.quizQueue || [];
    G.mode = 'play';
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    enterMap(data.mapId, data.x, data.y);
    G.player.hp = data.hp;
    G.player.mp = data.mp;
    if (G.player.pending) {
      if (G.player.pending.phase === 'result') {
        const q = qById(G.player.pending.qids[G.player.pending.index]);
        if (q) showResult(q, !!G.player.pending.lastOk, G.player.pending.applied ? ['奖赏已经放进背包了。'] : []);
      } else showAsk();
    }
    log('存档读取完成。欢迎回来，' + G.player.name + '。', 'system');
    updateHud();
    save();
  }
  function freshPlayer(name, grade, classId) {
    const c = classes[classId];
    const weapon = itemTpls.find((t) => t.slot === 'weapon' && t.cls === classId && t.level === 1);
    const first = skills.find((s) => s.cls === classId && s.level === 1);
    const hotbar = [first.id, null, null, null, null, null, null, null];
    const stances = {};
    if (first.type === 'stance') stances[first.id] = true;
    return {
      name, grade, classId, level: 1, exp: 0,
      hp: c.hp, mp: c.mp, gold: 80,
      x: maps.village.spawn.x, y: maps.village.spawn.y, mapId: 'village',
      equip: { weapon: makeEquip(weapon, 'common'), armor: null, helmet: null, necklace: null, bracelet1: null, bracelet2: null, ring1: null, ring2: null },
      bag: [makePotion('hp_s', 5), makePotion('mp_s', 3)],
      skills: [first.id], hotbar, stances, cd: {},
      mastery: {}, stats: { kills: 0, correct: 0, wrong: 0, bosses: 0 },
      visited: ['village'], tutorial: { moved: false, fought: false, answered: false },
      combo: 0, bestCombo: 0, recent: [], recentSubjects: [], pending: null, quizQueue: [], playSeconds: 0,
      targetId: null, path: [], dir: 'down', tileX: -1, tileY: -1,
    };
  }
  function startGame(name, grade, classId) {
    G.player = freshPlayer(name, grade, classId);
    G.mode = 'play';
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    enterMap('village', maps.village.spawn.x, maps.village.spawn.y);
    log('欢迎来到传奇学堂。点击地面走路，点击怪物战斗。', 'system');
    log('怪物倒下后会出题。答对，装备才会出现。按 H 可以看帮助。', 'system');
    updateHud();
    save();
  }

  function setupTitle() {
    const grades = $('grade-box');
    for (let i = 1; i <= 6; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = GRADES[i];
      b.dataset.grade = String(i);
      b.addEventListener('click', () => { G.pickGrade = i; refreshPicks(); });
      grades.appendChild(b);
    }
    const box = $('class-box');
    Object.values(classes).forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'class-card';
      b.dataset.cls = c.id;
      const cv = document.createElement('canvas');
      cv.width = 144;
      cv.height = 168;
      b.appendChild(cv);
      const text = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = c.name;
      const detail = document.createElement('span');
      detail.textContent = c.blurb + c.detail;
      text.appendChild(name);
      text.appendChild(detail);
      b.appendChild(text);
      b.addEventListener('click', () => { G.pickClass = c.id; refreshPicks(); });
      box.appendChild(b);
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 144, 168);
      g.translate(72, 108);
      g.scale(1.6, 1.6);
      drawActor(g, c.id, 'down', 1, 0);
    });
    const save = readSave();
    const cont = $('btn-continue');
    cont.disabled = !save;
    if (save) cont.textContent = '继续冒险（' + save.name + ' ' + save.level + '级）';
    $('btn-new').addEventListener('click', async () => {
      if (readSave()) {
        const ok = await confirmBox('已经有一个存档。开始新冒险会覆盖它。');
        if (!ok) return;
      }
      $('title-actions').classList.add('hidden');
      $('create').classList.remove('hidden');
    });
    cont.addEventListener('click', () => { const data = readSave(); if (data) applySave(data); });
    $('btn-start').addEventListener('click', () => {
      if (!G.pickGrade) { toast('先选一个年级'); return; }
      if (!G.pickClass) { toast('先选一个职业'); return; }
      let name = $('name-input').value.trim();
      if (!name) name = '小侠';
      startGame(name.slice(0, 8), G.pickGrade, G.pickClass);
    });
  }
  function refreshPicks() {
    [...$('grade-box').children].forEach((b) => b.classList.toggle('on', Number(b.dataset.grade) === G.pickGrade));
    [...$('class-box').children].forEach((b) => b.classList.toggle('on', b.dataset.cls === G.pickClass));
  }
  function bindUi() {
    const hot = $('hotbar');
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.type = 'button';
      b.innerHTML = '<small>F' + (i + 1) + '</small><b></b><i class="cd"></i>';
      b.addEventListener('click', () => castHotbar(i));
      hot.appendChild(b);
    }
    $('pot-hp').addEventListener('click', () => drink('hp'));
    $('pot-mp').addEventListener('click', () => drink('mp'));
    $('btn-char').addEventListener('click', () => openPanel('char'));
    $('btn-bag').addEventListener('click', () => openPanel('bag'));
    $('btn-skill').addEventListener('click', () => openPanel('skill'));
    $('btn-report').addEventListener('click', () => openPanel('report'));
    $('btn-map').addEventListener('click', () => openPanel('map'));
    $('btn-help').addEventListener('click', () => openPanel('help'));
    $('btn-save').addEventListener('click', () => { save(); toast('已经保存'); });
    $('btn-sound').addEventListener('click', () => {
      G.sound = !G.sound;
      localStorage.setItem('legend-academy-sound', G.sound ? '1' : '0');
      if (G.sound) beep(660, 0.08, 'square', 0.04);
      updateHud();
    });
    $('btn-full').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => toast('浏览器没有允许全屏'));
      else document.exitFullscreen();
    });
    $('panel-close').addEventListener('click', closePanel);
    $('q-form').addEventListener('submit', (e) => { e.preventDefault(); submitAnswer(); });
    $('q-next').addEventListener('click', nextQuestion);
    $('confirm-ok').addEventListener('click', () => closeConfirm(true));
    $('confirm-cancel').addEventListener('click', () => closeConfirm(false));
    $('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = e.target.value.trim();
        if (text && G.player) log('【附近】' + G.player.name + '：' + text, 'chat');
        e.target.value = '';
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      onWorldClick(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const t = screenToTile(e.clientX - r.left, e.clientY - r.top);
      const x = Math.floor(t.x);
      const y = Math.floor(t.y);
      G.hover = G.map && x >= 0 && y >= 0 && x < G.map.w && y < G.map.h ? { x, y } : null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      const r = canvas.getBoundingClientRect();
      onWorldClick(t.clientX - r.left, t.clientY - r.top);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (typing && e.target.id !== 'q-input') return;
      if (!$('question').classList.contains('hidden') && G.player && G.player.pending && G.player.pending.phase === 'ask') {
        if (e.key >= '1' && e.key <= '4') {
          const btn = $('q-options').children[Number(e.key) - 1];
          if (btn) btn.click();
        }
        if (e.key === 'Enter' && document.activeElement !== $('q-input')) submitAnswer();
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') {
        if (!$('confirm').classList.contains('hidden')) closeConfirm(false);
        else closePanel();
        return;
      }
      const mapKey = { c: 'char', b: 'bag', k: 'skill', l: 'report', m: 'map', h: 'help' };
      if (mapKey[e.key.toLowerCase()] && G.mode === 'play') {
        const name = mapKey[e.key.toLowerCase()];
        if (G.panel === name) closePanel();
        else openPanel(name);
        e.preventDefault();
        return;
      }
      if (e.key === '1') drink('hp');
      if (e.key === '2') drink('mp');
      if (e.key === ' ') { e.preventDefault(); const n = nearestMonster(G.player, 8); if (n) { G.player.targetId = n.id; tryBasic(); } }
      if (/^F[1-8]$/.test(e.key)) {
        e.preventDefault();
        castHotbar(Number(e.key.slice(1)) - 1);
      }
    });
    window.addEventListener('resize', resize);
    window.addEventListener('beforeunload', save);
    document.addEventListener('fullscreenchange', resize);
  }

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    let ratio = window.devicePixelRatio || 1;
    if (cssW * ratio > 3840) ratio = 3840 / cssW;
    if (cssH * ratio > 2160) ratio = Math.min(ratio, 2160 / cssH);
    ratio = Math.max(1, ratio);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.round(cssW * ratio));
    canvas.height = Math.max(1, Math.round(cssH * ratio));
    G.viewW = cssW;
    G.viewH = cssH;
    G.dpr = ratio;
    let tw = Math.round(Math.min(cssW, cssH) / 11);
    if (tw % 2) tw += 1;
    G.TW = clamp(tw, 64, 168);
    G.TH = G.TW / 2;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function loop(ts) {
    const dt = Math.min(0.05, ((ts - (G.lastTs || ts)) / 1000) || 0);
    G.lastTs = ts;
    try {
      update(dt);
      render();
    } catch (err) {
      console.error(err);
      $('fatal').style.display = 'block';
      $('fatal').textContent = '出现问题：' + err.message;
    }
    requestAnimationFrame(loop);
  }

  async function loadBank() {
    try {
      const res = await fetch('data/questions.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.questions) && data.questions.length > 40) return data.questions;
      }
    } catch (err) { /* 直接打开文件时改用 questions.js */ }
    const embedded = window.QUESTION_BANK;
    if (embedded && Array.isArray(embedded.questions)) return embedded.questions;
    if (Array.isArray(embedded)) return embedded;
    return [];
  }

  function installDebug() {
    window.__DBG = {
      start(opts) { startGame(opts.name || '测试', opts.grade || 3, opts.cls || 'warrior'); },
      state() {
        const p = G.player;
        return p ? { x: p.x, y: p.y, map: G.map.id, hp: p.hp, mp: p.mp, level: p.level, gold: p.gold, exp: p.exp, skills: p.skills.slice(), bag: p.bag.map((b) => b.name + (b.count ? 'x' + b.count : '')), mode: G.mode } : { mode: G.mode };
      },
      teleport(id, x, y) { enterMap(id, x, y); },
      setLevel(n) {
        while (G.player.level < n) {
          G.player.level += 1;
          onLevel();
        }
        G.player.exp = 0;
        const st = computeStats();
        G.player.hp = st.maxHp;
        G.player.mp = st.maxMp;
        updateHud();
        save();
      },
      monsters() { return G.monsters.map((m) => ({ id: m.id, name: m.name, x: m.x, y: m.y, hp: m.hp, tpl: m.tpl })); },
      clickTile(x, y) { const s = tileToScreen(x + 0.5, y + 0.5); onWorldClick(s.x, s.y); },
      killNearest() {
        const m = nearestMonster(G.player, 40);
        if (m) { m.hp = 1; hitMonster(m, 5, '#fff'); }
        return !!m;
      },
      useBooks() {
        G.player.bag.filter((b) => b.kind === 'book').forEach((b) => useItem(b));
        return G.player.skills.slice();
      },
      kill(tpl) {
        const m = G.monsters.find((x) => x.tpl === tpl) || nearestMonster(G.player, 40);
        if (!m) return false;
        m.hp = 1;
        hitMonster(m, 5, '#fff');
        return m.name;
      },
      quiz() {
        const pending = G.player && G.player.pending;
        if (!pending) return null;
        const q = qById(pending.qids[pending.index]);
        return { phase: pending.phase, question: q.question, answer: q.answer, type: q.type, options: q.options, index: pending.index, correct: pending.correct };
      },
      answer(text) {
        const pending = G.player.pending;
        const q = qById(pending.qids[pending.index]);
        if (q.type === 'choice') G.picked = text;
        else $('q-input').value = text;
        submitAnswer();
      },
      next: nextQuestion,
      canvas: () => ({ w: canvas.width, h: canvas.height, dpr: G.dpr, cssW: G.viewW, cssH: G.viewH }),
    };
  }

  async function boot() {
    if (LW.problems && LW.problems.length) console.error(LW.problems);
    resize();
    buildTileCache();
    G.bank = await loadBank();
    G.bank.forEach((q) => G.qmap.set(q.id, q));
    setupTitle();
    bindUi();
    G.map = maps.village;
    spawnFromMap();
    G.mode = 'title';
    const focus = worldOf(16.5, 14);
    G.cam.x = focus.x;
    G.cam.y = focus.y;
    if (location.search.indexOf('debug=1') >= 0) installDebug();
    window.__READY = true;
    requestAnimationFrame(loop);
  }

  boot();
})();
