(() => {
  'use strict';

  /* 모두의 트리: 16개 조의 트리를 한 화면에 모아 실시간으로 보여줘요. (보기 전용) */
  const TEAM_COUNT = 16;
  const STAGE_W = 1920;
  const STAGE_H = 1080;
  // script.js 와 같은 Supabase 공개(publishable) 키예요. 브라우저에 노출되는 용도의 키예요.
  const SUPABASE_URL = 'https://jcrpnjhdiutdbweyiuub.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_5JVd4gBphymZspARFZku1g_pxjLEQ7y';
  const ORNAMENT_TYPES = ['snow', 'cookie', 'gift', 'ball', 'penguin-santa', 'penguin-bow', 'claude', 'candy'];

  const $ = (sel) => document.querySelector(sel);
  const ornaments = new Map(); // id -> { id, team, type, x, y }
  const liveUntil = new Map(); // 끌고 있는 중인 오너먼트 id -> 표시를 유지할 시각
  let db = null;

  /* ---------- 화면 맞춤 ---------- */
  function fit() {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    $('#stage').style.setProperty('--scale', String(scale));
  }

  /* ---------- 뼈대 ---------- */
  function build() {
    const lights = $('#lights');
    const N = 33;
    for (let i = 0; i < N; i += 1) {
      const t = i / (N - 1);
      const bulb = document.createElement('span');
      bulb.className = 'bulb';
      bulb.style.left = `${30 + t * (STAGE_W - 60)}px`;
      bulb.style.top = `${18 + Math.sin(((t * 4) % 1) * Math.PI) * 34}px`;
      bulb.style.animationDelay = `${(i % 5) * 0.7}s`;
      lights.appendChild(bulb);
    }

    const rows = $('#rows');
    for (let r = 0; r < 2; r += 1) {
      const row = document.createElement('div');
      row.className = 'row';
      for (let c = 0; c < 8; c += 1) {
        const team = r * 8 + c + 1;
        const cell = document.createElement('a');
        cell.className = 'cell';
        cell.href = `./?team=${team}`;
        cell.setAttribute('aria-label', `${team}조 트리로 이동`);
        cell.innerHTML = `
          <div class="tree-box">
            <div class="tree" data-team="${team}">
              <img src="./img/tree-${((team - 1) % 4) + 1}.png" alt="" draggable="false" />
            </div>
          </div>
          <span class="label" data-label="${team}">${team}조 <span class="count" data-count="${team}">0개</span></span>`;
        row.appendChild(cell);
      }
      rows.appendChild(row);
    }
  }

  /* ---------- 그리기 ---------- */
  function draw(o, isNew) {
    if (!ORNAMENT_TYPES.includes(o.type)) return;
    const tree = document.querySelector(`.tree[data-team="${o.team}"]`);
    if (!tree) return;
    let el = tree.querySelector(`.orn[data-id="${o.id}"]`);
    if (!el) {
      el = document.createElement('span');
      el.className = 'orn';
      el.dataset.id = o.id;
      if (isNew) el.classList.add('is-new');
      el.innerHTML = `<img src="./img/orn-${o.type}.png" alt="" draggable="false" />`;
      tree.appendChild(el);
    }
    el.style.left = `${o.x}%`;
    el.style.top = `${o.y}%`;
  }

  function counts(bumpTeam) {
    const perTeam = new Array(TEAM_COUNT + 1).fill(0);
    for (const o of ornaments.values()) perTeam[o.team] += 1;
    for (let t = 1; t <= TEAM_COUNT; t += 1) {
      const el = document.querySelector(`[data-count="${t}"]`);
      if (el) el.textContent = `${perTeam[t]}개`;
    }
    $('#summary').textContent = `16개 조 · 오너먼트 ${ornaments.size}개`;
    if (bumpTeam) {
      const label = document.querySelector(`[data-label="${bumpTeam}"]`);
      if (label) {
        label.classList.remove('is-bump');
        void label.offsetWidth; // 같은 효과를 다시 틀기 위해 한 번 끊어요.
        label.classList.add('is-bump');
      }
    }
  }

  function upsert(row) {
    if (!row || !row.id) return;
    const isNew = !ornaments.has(row.id);
    const live = (liveUntil.get(row.id) || 0) > Date.now();
    ornaments.set(row.id, { id: row.id, team: row.team, type: row.type, x: row.x, y: row.y });
    if (!live) draw(ornaments.get(row.id), isNew);
    if (isNew) counts(row.team);
  }

  function remove(id) {
    const o = ornaments.get(id);
    if (!o) return;
    ornaments.delete(id);
    const el = document.querySelector(`.orn[data-id="${id}"]`);
    if (el) el.remove();
    counts(o.team);
  }

  // 누군가 끌고 있는 동안의 위치 (DB에 저장되기 전)
  function onMove(p) {
    if (!p || !p.id) return;
    const o = ornaments.get(p.id);
    if (!o) return;
    o.x = p.x;
    o.y = p.y;
    liveUntil.set(p.id, Date.now() + 600);
    const el = document.querySelector(`.orn[data-id="${p.id}"]`);
    if (el) {
      el.classList.add('is-live');
      el.style.left = `${p.x}%`;
      el.style.top = `${p.y}%`;
      clearTimeout(el.liveTimer);
      el.liveTimer = setTimeout(() => el.classList.remove('is-live'), 600);
    }
  }

  /* ---------- 데이터 ---------- */
  async function loadAll() {
    const { data, error } = await db.from('tl_ornaments').select('id,team,type,x,y').order('created_at').limit(5000);
    if (error) return;
    const seen = new Set(data.map((r) => r.id));
    for (const id of [...ornaments.keys()]) if (!seen.has(id)) remove(id);
    for (const row of data) {
      ornaments.set(row.id, row);
      draw(row);
    }
    counts();
  }

  function connect() {
    if (!window.supabase) return;
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    db.channel('tree-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tl_ornaments' }, (p) => {
        if (p.eventType === 'DELETE') remove(p.old && p.old.id);
        else upsert(p.new);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadAll(); // 처음 접속했거나 다시 붙었을 때 전체를 다시 읽어요.
      });

    // 조별 화면이 주고받는 '끌기' 신호도 받아서, 옮기는 모습이 그대로 보이게 해요.
    for (let t = 1; t <= TEAM_COUNT; t += 1) {
      setTimeout(() => {
        db.channel(`tree-${t}`)
          .on('broadcast', { event: 'move' }, ({ payload }) => onMove(payload))
          .subscribe();
      }, t * 150);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadAll();
    });
  }

  build();
  fit();
  window.addEventListener('resize', fit);
  connect();
})();
