(() => {
  'use strict';

  /* ---------- 설정 ---------- */
  const NAME_MAX = 20;
  const NICK_MAX = 10;
  const LETTER_MAX = 30;
  // Supabase 공개(publishable) 키예요. 브라우저에 노출되는 용도로 만들어진 키라 코드에 둬도 돼요.
  // secret 키는 절대 여기에 두지 않아요.
  // 키를 비워 두면 '미리보기 모드'로 돌아가요: 이 브라우저에만 저장되고 다른 사람과 공유되지 않아요.
  const SUPABASE_URL = 'https://lnnxswtfqhlrrmvwepit.supabase.co';
  const SUPABASE_KEY = ''; // sb_publishable_... 를 여기에 넣어요.
  const PREVIEW = !SUPABASE_KEY;
  const MOVE_SEND_MS = 90; // 드래그 중 위치를 보내는 간격
  const REMOTE_TTL_MS = 6000; // 다른 사람의 선택 표시가 사라지는 시간
  const SELECT_BEAT_MS = 2500;
  const RECENT_MAX = 6; // 메인에 보여 줄 '내 트리' 개수

  // Figma 'deco' 컴포넌트의 이미지를 그대로 써요 (./img/orn-<id>.png).
  const ORNAMENTS = [
    { id: 'snow', label: '눈꽃' },
    { id: 'cookie', label: '진저맨 쿠키' },
    { id: 'gift', label: '선물 상자' },
    { id: 'ball', label: '빨간 볼' },
    { id: 'penguin-santa', label: '산타 펭귄' },
    { id: 'penguin-bow', label: '리본 펭귄' },
    { id: 'claude', label: '산타 클로드' },
    { id: 'candy', label: '지팡이 사탕' },
  ];
  const ornSrc = (id) => `./img/orn-${id}.png`;
  const BACKGROUNDS = [
    { id: 'bg-1', label: '빨간 방', src: './img/bg-1.jpg', thumb: './img/bg-opt-1.png' },
    { id: 'bg-2', label: '초록 방', src: './img/bg-2.jpg', thumb: './img/bg-opt-2.png' },
    { id: 'bg-3', label: '눈 내린 마을', src: './img/bg-3.jpg', thumb: './img/bg-opt-3.png' },
  ];
  const BG_MAP = Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b]));
  const DEFAULT_BG = 'bg-1';
  const ORN_MAP = Object.fromEntries(ORNAMENTS.map((o) => [o.id, o]));
  const TREES = [1, 2, 3, 4];
  const treeSrc = (n) => `./img/tree-${TREES.includes(n) ? n : 1}.png`;
  // 함께 편집하는 사람을 구분하는 색 (Figma 공동편집의 이름표 색처럼)
  const PEER_COLORS = ['#F97066', '#FDB022', '#47CD89', '#53B1FD', '#BDB4FE', '#F670C7', '#2ED3B7', '#FD853A'];

  /* ---------- 도우미 ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const refreshIcons = () => {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  };
  // 로그인이 없어서 이 기기(브라우저)에 저장해요. 다시 들어와도 닉네임이 유지돼요.
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* 저장이 막힌 브라우저에서도 화면은 동작해야 해요 */
      }
    },
  };
  const newId = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  // 초대 링크에 들어가는 그룹 코드. 헷갈리는 글자(0 o 1 l i)는 빼고 8자리로 만들어요.
  const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
  const newCode = () => {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  };
  const isCode = (v) => typeof v === 'string' && /^[a-z0-9]{6,16}$/.test(v);
  const clamp = (v) => Math.min(96, Math.max(4, Math.round(v * 10) / 10));
  const chars = (s) => [...s];

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    const open = $$('dialog[open]').pop();
    (open || document.body).appendChild(el);
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  /* ---------- 미리보기 초기화: 주소 끝에 ?reset 을 붙이면 이 기기에 저장된 걸 모두 지우고 처음부터 시작해요 ---------- */
  if (PREVIEW && new URLSearchParams(location.search).has('reset')) {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('tl:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* 저장 공간을 못 쓰는 브라우저면 지울 것도 없어요 */
    }
    location.replace(location.pathname);
    return;
  }

  /* ---------- 상태 ---------- */
  const codeParam = new URLSearchParams(location.search).get('g');
  let code = isCode(codeParam) ? codeParam : null;
  let group = null; // { team, name, tree, bg, owner }

  let sid = store.get('tl:sid');
  if (!sid) {
    sid = newId();
    store.set('tl:sid', sid);
  }
  let nick = store.get('tl:nick') || '';
  const myColor = PEER_COLORS[chars(sid).reduce((a, c) => a + c.charCodeAt(0), 0) % PEER_COLORS.length];

  const draft = { name: '', tree: 1, bg: DEFAULT_BG }; // 만들기 화면에서 고르는 중인 값
  let creating = false; // 닉네임 다음에 트리를 새로 만들어야 하는지

  const ornaments = new Map(); // id -> { id, type, x, y, nick, owner }
  let letters = [];
  let selectedId = null;
  let tab = 'ornament';
  let bg = DEFAULT_BG;
  let drag = null; // { id, moved, lastSent }
  const remote = new Map(); // 다른 사람 sid -> { id, nick, color, at }
  let peerCount = 1;
  let notMineToldAt = 0;

  const db = PREVIEW ? window.TLLocalDB : window.supabase && window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 12 } },
  });
  let channel = null;
  let joined = false;

  const isMine = (row) => !!row && row.owner === sid;

  /* ---------- 내 트리 목록 (이 기기에만 저장) ---------- */
  function recentTrees() {
    try {
      const list = JSON.parse(store.get('tl:trees') || '[]');
      return Array.isArray(list) ? list.filter((t) => t && isCode(t.code)) : [];
    } catch {
      return [];
    }
  }

  function rememberTree(g) {
    const list = recentTrees().filter((t) => t.code !== g.team);
    list.unshift({ code: g.team, name: g.name });
    store.set('tl:trees', JSON.stringify(list.slice(0, RECENT_MAX)));
  }

  function renderRecent() {
    const list = recentTrees();
    $('#recent').hidden = list.length === 0;
    $('#recentList').replaceChildren(
      ...list.map((t) => {
        const a = document.createElement('a');
        a.className = 'recent-chip';
        a.href = `?g=${t.code}`;
        a.textContent = t.name;
        return a;
      })
    );
  }

  /* ---------- Supabase ---------- */
  function connect() {
    if (joined || !code) return;
    if (!db) return toast('연결하지 못했어요. 새로고침해 주세요.');
    joined = true;
    if (PREVIEW) {
      loadAll();
      return;
    }
    const filter = `team=eq.${code}`;
    channel = db
      .channel(`tree-${code}`, { config: { presence: { key: sid }, broadcast: { self: false } } })
      // 삭제 알림에는 id만 오기 때문에 그룹 코드로 미리 거를 수 없어서, 표 전체를 듣고 여기서 걸러요.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tl_ornaments' }, (p) => {
        if (p.eventType === 'DELETE') dropOrnament(p.old && p.old.id);
        else if (p.new && p.new.team === code) upsertOrnament(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tl_letters' }, (p) => {
        if (p.eventType === 'DELETE') dropLetter(p.old && p.old.id);
        else if (p.eventType === 'INSERT' && p.new && p.new.team === code) addLetter(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tl_settings', filter }, (p) => {
        if (p.new && p.new.bg) setBgLocal(p.new.bg);
      })
      // 드래그 중인 위치 · 선택 표시는 DB에 저장하지 않고 바로 주고받아요.
      .on('broadcast', { event: 'move' }, ({ payload }) => onRemoteMove(payload))
      .on('broadcast', { event: 'select' }, ({ payload }) => onRemoteSelect(payload))
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        peerCount = Math.max(1, Object.keys(state).length);
        for (const key of remote.keys()) if (!state[key]) remote.delete(key);
        renderTitle();
        renderBoxes();
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('tree-letter realtime', status, err);
        if (status === 'SUBSCRIBED') {
          channel.track({ nick, color: myColor });
          loadAll(); // 처음 접속했거나 끊겼다 다시 붙었을 때 전체를 다시 읽어요.
        }
      });
  }

  async function loadGroup() {
    const { data, error } = await db.from('tl_settings').select('team,name,tree,bg,owner').eq('team', code).maybeSingle();
    if (error) return { error };
    return { data };
  }

  async function loadAll() {
    const [o, l, st] = await Promise.all([
      db.from('tl_ornaments').select('id,type,x,y,nick,owner').eq('team', code).order('created_at'),
      db.from('tl_letters').select('id,nick,text,owner,created_at').eq('team', code).order('created_at', { ascending: false }).limit(500),
      db.from('tl_settings').select('bg').eq('team', code).maybeSingle(),
    ]);
    if (o.error || l.error) return toast('불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    const keep = drag && ornaments.get(drag.id);
    ornaments.clear();
    for (const row of o.data) ornaments.set(row.id, row);
    if (keep) ornaments.set(keep.id, keep);
    letters = l.data;
    if (st.data && st.data.bg) setBgLocal(st.data.bg);
    if (selectedId && !ornaments.has(selectedId)) selectedId = null;
    renderAll();
  }

  async function createGroup() {
    const row = { team: newCode(), name: draft.name, tree: draft.tree, bg: draft.bg, owner: sid };
    const { error } = await db.from('tl_settings').insert(row);
    if (error) {
      toast('트리를 만들지 못했어요. 다시 시도해 주세요.');
      return false;
    }
    code = row.team;
    applyGroup(row);
    history.replaceState(null, '', `?g=${code}`);
    return true;
  }

  function send(event, payload) {
    if (channel) channel.send({ type: 'broadcast', event, payload: { ...payload, sid, nick, color: myColor } });
  }

  /* ---------- 화면 전환 ---------- */
  // 화면이 툭 바뀌지 않도록 부드럽게 겹쳐서 넘겨요 (지원하지 않는 브라우저는 CSS 등장 효과만 써요).
  function show(name) {
    const swap = () =>
      $$('[data-screen]').forEach((el) => {
        el.hidden = el.dataset.screen !== name;
      });
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 탭이 가려져 있으면 전환 효과가 멈출 수 있어서, 그때는 바로 바꿔요.
    if (document.startViewTransition && !reduce && !document.hidden) {
      document.startViewTransition(swap).updateCallbackDone.then(() => name === 'decorate' && updateScrollHint());
    } else swap();
    if (name === 'decorate') {
      // 폰의 '뒤로 가기'를 눌러도 사이트를 나가지 않고 메인으로 오도록 기록을 하나 남겨요.
      if (!(history.state && history.state.screen === 'decorate')) history.pushState({ screen: 'decorate' }, '', location.href);
      connect();
      requestAnimationFrame(updateScrollHint);
      if (PREVIEW && !store.get('tl:preview-told')) {
        store.set('tl:preview-told', '1');
        toast('미리보기 모드예요. 이 기기에만 저장돼요.');
      }
    }
    if (name === 'nick') {
      const input = $('#nickInput');
      input.value = nick;
      updateNick();
      input.focus();
    }
    if (name === 'create') {
      $('#nameInput').value = draft.name;
      updateName();
      renderChoices();
    }
  }

  function updateNick() {
    const input = $('#nickInput');
    $('#nickCount').textContent = `${chars(input.value).length}/${NICK_MAX}`;
    $('#nickNext').disabled = input.value.trim().length === 0;
  }

  function updateName() {
    const input = $('#nameInput');
    draft.name = chars(input.value.trim()).slice(0, NAME_MAX).join('');
    $('#nameCount').textContent = `${chars(input.value).length}/${NAME_MAX}`;
    $('#createNext').disabled = draft.name.length === 0;
  }

  /* ---------- 메인 ---------- */
  function renderHome(mode) {
    const home = $('[data-screen="home"]');
    home.dataset.mode = mode;
    $$('[data-only]').forEach((el) => (el.hidden = el.dataset.only !== mode));
    const chip = $('#homeChip');
    const sub = $('#homeSub');
    const start = $('#startBtn');
    // 이름표(뱃지)는 그룹 이름이 있을 때만 보여요.
    chip.hidden = mode !== 'invite';
    // '우리 그룹 트리도 만들기'는 초대받은 사람에게만 보여요.
    $('#makeOwn').hidden = !(mode === 'invite' && !isMine(group));
    if (mode === 'invite') {
      chip.textContent = group.name;
      sub.textContent = isMine(group) ? '내가 만든 트리예요. 친구들을 초대해 보세요' : '함께 트리를 꾸미자는 초대가 왔어요';
      start.textContent = '트리 꾸미러 가기';
    } else if (mode === 'missing') {
      sub.textContent = '트리를 찾을 수 없어요.\n링크를 다시 확인하거나 새로 만들어 보세요.';
      start.textContent = '우리 그룹 트리 만들기';
    } else {
      sub.textContent = '친구들과 함께 꾸미는 크리스마스 트리';
      start.textContent = '우리 그룹 트리 만들기';
      renderRecent();
    }
  }

  // 꾸미던 그룹의 메인 화면으로 돌아가요.
  function goHome() {
    renderHome(group ? 'invite' : 'create');
    show('home');
  }

  /* ---------- 만들기: 트리 모양 · 배경 고르기 ---------- */
  function renderChoices() {
    $('#treeChoices').innerHTML = TREES.map(
      (n) => `
      <label class="choice choice--tree">
        <input type="radio" name="tree" value="${n}"${n === draft.tree ? ' checked' : ''} />
        <img src="${treeSrc(n)}" alt="트리 ${n}" draggable="false" />
      </label>`
    ).join('');
    $('#bgChoices').innerHTML = BACKGROUNDS.map(
      (b) => `
      <label class="choice choice--bg">
        <input type="radio" name="bg" value="${b.id}"${b.id === draft.bg ? ' checked' : ''} />
        <img src="${b.thumb}" alt="" draggable="false" />
        <span>${b.label}</span>
      </label>`
    ).join('');
  }

  /* ---------- 트리 · 오너먼트 ---------- */
  function applyGroup(g) {
    group = g;
    bg = BG_MAP[g.bg] ? g.bg : DEFAULT_BG;
    $$('[data-tree]').forEach(
      (el) => (el.innerHTML = `<img class="tree-img" src="${treeSrc(Number(g.tree))}" alt="" draggable="false" />`)
    );
    document.title = `${g.name} 트리 · Merry Huddling Tree`;
    // 배경은 그룹 전체에 적용되니까 만든 사람만 바꿀 수 있어요. 나머지는 오너먼트 목록만 보여요.
    $('.tabs').hidden = !isMine(g);
    if (!isMine(g) && tab === 'bg') {
      tab = 'ornament';
      renderItems();
    }
    paintBg(bg, true);
    renderTitle();
    rememberTree(g);
  }

  function renderAll() {
    renderOrnaments();
    renderItems();
    renderLetters();
    renderTitle();
  }

  function renderTitle() {
    if (!group) return;
    $$('[data-group-title]').forEach((el) => (el.textContent = PREVIEW ? group.name : `${group.name} · ${peerCount}명`));
  }

  let bgFront = 0;
  function paintBg(id, instant) {
    const def = BG_MAP[id] || BG_MAP[DEFAULT_BG];
    const layers = $$('.bg-layer');
    if (layers.length < 2) return;
    if (instant) {
      layers[bgFront].style.backgroundImage = `url('${def.src}')`;
      layers[bgFront].classList.add('is-on');
      return;
    }
    // 그림을 먼저 받아 둔 뒤에 넘겨야 중간에 빈 화면이 보이지 않아요.
    const img = new Image();
    img.onload = img.onerror = () => {
      if (bg !== def.id) return; // 그사이 다른 배경으로 바뀌었으면 건너뛰어요.
      const next = 1 - bgFront;
      layers[next].style.backgroundImage = `url('${def.src}')`;
      layers[next].classList.add('is-on');
      layers[bgFront].classList.remove('is-on');
      bgFront = next;
    };
    img.src = def.src;
  }

  function setBgLocal(next) {
    const id = BG_MAP[next] ? next : DEFAULT_BG;
    if (id === bg) return;
    bg = id;
    if (group) group.bg = id;
    paintBg(bg, false);
    if (tab === 'bg') renderItems();
  }

  async function setBackground(next) {
    if (next === bg || !db || !isMine(group)) return;
    const prev = bg;
    setBgLocal(next);
    const { error } = await db.from('tl_settings').update({ bg: next }).eq('team', code);
    if (error) {
      setBgLocal(prev);
      toast('배경을 바꾸지 못했어요.');
    }
  }

  // 요소를 지우고 다시 만들지 않고, id 기준으로 위치만 바꿔요 (드래그 중인 요소가 끊기지 않도록).
  function renderOrnaments() {
    const layer = $('#ornLayer');
    const seen = new Set();
    for (const o of ornaments.values()) {
      const def = ORN_MAP[o.type];
      if (!def) continue;
      seen.add(o.id);
      let el = layer.querySelector(`.orn[data-id="${o.id}"]`);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'orn';
        el.dataset.id = o.id;
        el.setAttribute('aria-label', `${o.nick}님이 단 ${def.label}`);
        el.innerHTML = `<img src="${ornSrc(def.id)}" alt="" draggable="false" />`;
        layer.appendChild(el);
      }
      el.classList.toggle('is-mine', isMine(o));
      el.style.left = `${o.x}%`;
      el.style.top = `${o.y}%`;
    }
    for (const el of layer.querySelectorAll('.orn')) if (!seen.has(el.dataset.id)) el.remove();
    refreshIcons();
    renderBoxes();
  }

  // 선택 박스: 내 것은 초록 테두리 + X, 다른 사람이 옮기는 중인 것은 노랑 + 이름표.
  function renderBoxes() {
    const layer = $('#ornLayer');
    layer.querySelectorAll('.orn-box').forEach((el) => el.remove());
    const now = Date.now();
    for (const [key, r] of remote) {
      if (now - r.at > REMOTE_TTL_MS) {
        remote.delete(key);
        continue;
      }
      const o = ornaments.get(r.id);
      if (!o || r.id === selectedId) continue;
      const box = document.createElement('div');
      box.className = 'orn-box is-remote';
      box.dataset.for = r.id;
      box.style.left = `${o.x}%`;
      box.style.top = `${o.y}%`;
      box.style.setProperty('--peer', r.color);
      const tag = document.createElement('span');
      tag.className = 'orn-tag';
      tag.textContent = r.nick;
      box.appendChild(tag);
      layer.appendChild(box);
    }
    const mine = selectedId && ornaments.get(selectedId);
    if (mine && isMine(mine)) {
      const box = document.createElement('div');
      box.className = 'orn-box is-mine';
      box.dataset.for = mine.id;
      box.style.left = `${mine.x}%`;
      box.style.top = `${mine.y}%`;
      box.innerHTML = `<button type="button" class="orn-x" data-remove="${mine.id}" aria-label="오너먼트 지우기">${icon('x')}</button>`;
      layer.appendChild(box);
      refreshIcons();
    }
  }

  function moveDom(id, x, y) {
    const layer = $('#ornLayer');
    for (const el of layer.querySelectorAll(`.orn[data-id="${id}"], .orn-box[data-for="${id}"]`)) {
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
    }
  }

  function upsertOrnament(row) {
    if (!row || !row.id) return;
    if (drag && drag.id === row.id) return; // 내가 끌고 있는 동안은 내 위치가 우선
    ornaments.set(row.id, { id: row.id, type: row.type, x: row.x, y: row.y, nick: row.nick, owner: row.owner });
    renderOrnaments();
  }

  function dropOrnament(id) {
    if (!id || !ornaments.has(id)) return;
    ornaments.delete(id);
    if (selectedId === id) selectedId = null;
    if (drag && drag.id === id) drag = null;
    renderOrnaments();
  }

  function select(id) {
    if (selectedId === id) return;
    selectedId = id;
    send('select', { id });
    renderBoxes();
  }

  async function addOrnament(type) {
    const o = { id: newId(), type, x: clamp(35 + Math.random() * 30), y: clamp(38 + Math.random() * 36), nick, owner: sid };
    ornaments.set(o.id, o);
    renderOrnaments();
    select(o.id);
    const { error } = await db.from('tl_ornaments').insert({ ...o, team: code });
    if (error) {
      dropOrnament(o.id);
      toast('달지 못했어요. 다시 시도해 주세요.');
    }
  }

  async function removeOrnament(id) {
    const backup = ornaments.get(id);
    if (!isMine(backup)) return;
    dropOrnament(id);
    send('select', { id: null });
    const { error } = await db.from('tl_ornaments').delete().eq('id', id);
    if (error && backup) {
      ornaments.set(id, backup);
      renderOrnaments();
      toast('지우지 못했어요. 다시 시도해 주세요.');
    }
  }

  /* ---------- 다른 사람의 편집 표시 ---------- */
  function onRemoteMove(p) {
    if (!p || p.sid === sid) return;
    remote.set(p.sid, { id: p.id, nick: p.nick, color: p.color, at: Date.now() });
    const o = ornaments.get(p.id);
    if (o && !(drag && drag.id === p.id)) {
      o.x = p.x;
      o.y = p.y;
      moveDom(p.id, p.x, p.y);
    }
    const box = $('#ornLayer').querySelector(`.orn-box.is-remote[data-for="${p.id}"]`);
    if (!box) renderBoxes();
  }

  function onRemoteSelect(p) {
    if (!p || p.sid === sid) return;
    if (p.id) remote.set(p.sid, { id: p.id, nick: p.nick, color: p.color, at: Date.now() });
    else remote.delete(p.sid);
    renderBoxes();
  }

  /* ---------- 하단 목록 ---------- */
  function renderItems() {
    $$('.tab').forEach((t) => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
    });
    const list = $('#items');
    list.dataset.tab = tab;
    if (tab === 'ornament') {
      list.innerHTML = ORNAMENTS.map(
        (o) => `
      <button type="button" class="item" data-orn="${o.id}" aria-label="${o.label} 달기">
        <img src="${ornSrc(o.id)}" alt="" draggable="false" />
      </button>`
      ).join('');
    } else {
      list.innerHTML = BACKGROUNDS.map(
        (o) => `
      <button type="button" class="item item--bg${o.id === bg ? ' is-on' : ''}" data-bg="${o.id}"
        aria-pressed="${o.id === bg}" aria-label="배경: ${o.label}">
        <img src="${o.thumb}" alt="" draggable="false" onerror="this.remove()" />
      </button>`
      ).join('');
    }
    list.scrollLeft = 0;
    updateScrollHint();
  }

  // 오른쪽에 더 있을 때만 어두운 가림막을 보여줘요.
  function updateScrollHint() {
    const list = $('#items');
    if (!list.clientWidth) return; // 화면에 안 보일 때는 폭이 0이라 계산하지 않아요.
    const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 4;
    $('#itemsWrap').classList.toggle('is-end', atEnd);
    $('#itemsWrap').classList.toggle('is-start', list.scrollLeft <= 4);
  }

  /* ---------- 편지 ---------- */
  function addLetter(row) {
    if (!row || letters.some((l) => l.id === row.id)) return;
    letters.unshift(row);
    renderLetters();
  }

  function dropLetter(id) {
    if (!id || !letters.some((l) => l.id === id)) return;
    letters = letters.filter((l) => l.id !== id);
    renderLetters();
  }

  // 읽은 위치는 이 기기에 그룹별로 저장해요 (마지막으로 본 편지의 시각).
  const readKey = () => `tl:read:${code}`;
  const letterTime = (l) => Date.parse(l.created_at) || 0;

  function markLettersRead() {
    const latest = letters.reduce((max, l) => Math.max(max, letterTime(l)), 0);
    if (latest > Number(store.get(readKey()) || 0)) store.set(readKey(), String(latest));
  }

  function renderLetters() {
    // 편지 모달이 열려 있으면 지금 보고 있는 것이므로 모두 읽은 것으로 처리해요.
    if ($('#letterDialog').open) markLettersRead();
    const readAt = Number(store.get(readKey()) || 0);
    const unread = letters.filter((l) => letterTime(l) > readAt && !isMine(l)).length;
    const badge = $('#letterBadge');
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? '99+' : String(unread);

    const list = $('#letterList');
    if (letters.length === 0) {
      list.innerHTML = `<div class="empty">${icon('mail-open')}아직 남겨진 편지가 없어요.<br />첫 한마디를 남겨 보세요.</div>`;
      refreshIcons();
      return;
    }
    const cards = letters.map((l) => {
      const card = document.createElement('article');
      card.className = 'card';
      const top = document.createElement('div');
      top.className = 'card-top';
      const who = document.createElement('span');
      who.className = 'card-nick';
      who.textContent = l.nick;
      top.appendChild(who);
      if (isMine(l)) {
        card.classList.add('is-mine');
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'card-del';
        del.dataset.delLetter = l.id;
        del.textContent = '지우기';
        top.appendChild(del);
      }
      const text = document.createElement('p');
      text.className = 'card-text';
      text.textContent = l.text;
      card.append(top, text);
      return card;
    });
    list.replaceChildren(...cards);
  }

  function updateLetter() {
    const input = $('#letterInput');
    $('#letterCount').textContent = `${chars(input.value).length}/${LETTER_MAX}`;
    $('#letterSend').disabled = input.value.trim().length === 0;
  }

  async function sendLetter() {
    const input = $('#letterInput');
    const text = chars(input.value.trim()).slice(0, LETTER_MAX).join('');
    if (!text || !db) return;
    $('#letterSend').disabled = true;
    const row = { id: newId(), team: code, nick, text, owner: sid };
    const { data: saved, error } = await db.from('tl_letters').insert(row).select('id,nick,text,owner,created_at').single();
    if (error) {
      toast('남기지 못했어요. 다시 시도해 주세요.');
    } else {
      input.value = '';
      addLetter(saved || { ...row, created_at: new Date().toISOString() });
      $('#letterList').scrollTop = 0;
      toast('편지를 남겼어요.');
    }
    updateLetter();
  }

  async function removeLetter(id) {
    const backup = letters.find((l) => l.id === id);
    if (!isMine(backup)) return;
    dropLetter(id);
    const { error } = await db.from('tl_letters').delete().eq('id', id);
    if (error) {
      addLetter(backup);
      letters.sort((a, b) => letterTime(b) - letterTime(a));
      renderLetters();
      toast('지우지 못했어요. 다시 시도해 주세요.');
    }
  }

  /* ---------- 공유 ---------- */
  async function share() {
    const url = `${location.origin}${location.pathname}?g=${code}`;
    const title = `${group.name} 트리에 초대할게요 🎄`;
    try {
      if (navigator.share) await navigator.share({ title, text: '오너먼트를 달고 한마디 남겨 주세요!', url });
      else {
        await navigator.clipboard.writeText(url);
        toast('초대 링크를 복사했어요.');
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('링크를 복사하지 못했어요.');
    }
  }

  /* ---------- 이벤트 ---------- */
  function limitInput(input, max, onChange) {
    input.addEventListener('input', () => {
      const list = chars(input.value);
      // 한글 조합 중에는 자르지 않아요 (조합이 끝나면 다시 호출돼요).
      if (list.length > max && !input.isComposing) input.value = list.slice(0, max).join('');
      onChange();
    });
    input.addEventListener('compositionstart', () => (input.isComposing = true));
    input.addEventListener('compositionend', () => {
      input.isComposing = false;
      const list = chars(input.value);
      if (list.length > max) input.value = list.slice(0, max).join('');
      onChange();
    });
  }

  function bindDrag() {
    const box = $('#treeBox');
    const point = (e) => {
      const rect = box.getBoundingClientRect();
      return {
        x: clamp(((e.clientX - rect.left) / rect.width) * 100),
        y: clamp(((e.clientY - rect.top) / rect.height) * 100),
      };
    };

    box.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-remove]')) return;
      const el = e.target.closest('.orn');
      if (!el || !isMine(ornaments.get(el.dataset.id))) {
        if (selectedId) {
          selectedId = null;
          send('select', { id: null });
          renderBoxes();
        }
        // 다른 사람이 단 것을 누르면 한 번씩만 알려줘요.
        if (el && Date.now() - notMineToldAt > 4000) {
          notMineToldAt = Date.now();
          const o = ornaments.get(el.dataset.id);
          toast(`${o && o.nick ? `${o.nick}님이` : '다른 사람이'} 단 오너먼트예요. 내 것만 옮길 수 있어요.`);
        }
        return;
      }
      e.preventDefault();
      select(el.dataset.id);
      drag = { id: el.dataset.id, moved: false, lastSent: 0, startX: e.clientX, startY: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 일부 브라우저에서는 실패할 수 있어요. 끌기는 그대로 동작해요. */
      }
      el.classList.add('is-dragging');
    });

    box.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      const o = ornaments.get(drag.id);
      if (!o) return;
      const p = point(e);
      o.x = p.x;
      o.y = p.y;
      moveDom(o.id, o.x, o.y);
      const now = Date.now();
      if (now - drag.lastSent >= MOVE_SEND_MS) {
        drag.lastSent = now;
        send('move', { id: o.id, x: o.x, y: o.y });
      }
    });

    const end = async () => {
      if (!drag) return;
      const { id, moved } = drag;
      drag = null;
      const el = $('#ornLayer').querySelector(`.orn[data-id="${id}"]`);
      if (el) el.classList.remove('is-dragging');
      const o = ornaments.get(id);
      if (!moved || !o) return;
      send('move', { id, x: o.x, y: o.y });
      const { error } = await db.from('tl_ornaments').update({ x: o.x, y: o.y }).eq('id', id);
      if (error) toast('위치를 저장하지 못했어요.');
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);

    box.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (remove) removeOrnament(remove.dataset.remove);
    });
  }

  function bind() {
    // 메인: 초대받았으면 꾸미러, 아니면 만들기로
    $('#startBtn').addEventListener('click', () => {
      if (group) {
        creating = false;
        show(nick ? 'decorate' : 'nick');
      } else {
        show('create');
      }
    });

    // 만들기
    $('#createBack').addEventListener('click', () => show('home'));
    limitInput($('#nameInput'), NAME_MAX, updateName);
    $('#createForm').addEventListener('change', (e) => {
      if (e.target.name === 'tree') draft.tree = Number(e.target.value);
      if (e.target.name === 'bg') draft.bg = e.target.value;
    });
    $('#createForm').addEventListener('submit', (e) => {
      e.preventDefault();
      updateName();
      if (!draft.name) return;
      creating = true;
      show('nick');
    });

    // 닉네임
    $('#nickBack').addEventListener('click', () => show(creating ? 'create' : 'home'));
    limitInput($('#nickInput'), NICK_MAX, updateNick);
    $('#nickForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = chars($('#nickInput').value.trim()).slice(0, NICK_MAX).join('');
      if (!value) return;
      nick = value;
      store.set('tl:nick', nick);
      if (creating) {
        $('#nickNext').disabled = true;
        const ok = await createGroup();
        $('#nickNext').disabled = false;
        if (!ok) return;
        creating = false;
        show('decorate');
        toast('트리를 만들었어요! 왼쪽 위 버튼으로 친구를 초대해요.');
        return;
      }
      show('decorate');
    });

    // 꾸미기 → 메인으로
    $('#decoBack').addEventListener('click', () => {
      if (history.state && history.state.screen === 'decorate') history.back(); // 아래 popstate에서 메인으로 가요
      else goHome();
    });
    window.addEventListener('popstate', () => {
      if ($('[data-screen="decorate"]').hidden) return;
      $$('dialog[open]').forEach((d) => d.close());
      goHome();
    });

    // 꾸미기
    $('#items').addEventListener('click', (e) => {
      if (!db) return;
      const orn = e.target.closest('[data-orn]');
      const bgBtn = e.target.closest('[data-bg]');
      if (orn) addOrnament(orn.dataset.orn);
      else if (bgBtn) setBackground(bgBtn.dataset.bg);
    });

    $$('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        if (tab === t.dataset.tab) return;
        tab = t.dataset.tab;
        renderItems();
      })
    );

    bindDrag();

    $('#items').addEventListener('scroll', updateScrollHint, { passive: true });
    // 목록 크기가 바뀔 때마다(숨겨져 있다가 화면에 나타날 때 포함) 화살표를 다시 계산해요.
    // 예전에는 화면 전환 효과보다 계산이 먼저 끝나서, 폭이 0으로 잡혀 화살표가 안 나올 때가 있었어요.
    if (window.ResizeObserver) new ResizeObserver(updateScrollHint).observe($('#items'));
    // 화살표를 누르면 보이는 폭의 70%만큼 넘겨요.
    $$('[data-scroll]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const list = $('#items');
        list.scrollBy({ left: Number(btn.dataset.scroll) * list.clientWidth * 0.7, behavior: 'smooth' });
      })
    );
    window.addEventListener('resize', updateScrollHint);

    $('#shareBtn').addEventListener('click', share);

    // 편지
    const dialog = $('#letterDialog');
    $('#letterBtn').addEventListener('click', () => {
      updateLetter();
      dialog.showModal();
      renderLetters();
    });
    $('#letterClose').addEventListener('click', () => dialog.close());
    $('#letterList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del-letter]');
      if (del) removeLetter(del.dataset.delLetter);
    });

    limitInput($('#letterInput'), LETTER_MAX, updateLetter);
    $('#letterForm').addEventListener('submit', (e) => {
      e.preventDefault();
      sendLetter();
    });

    // 선택 중이라는 표시를 주기적으로 다시 알리고, 오래된 표시는 지워요.
    setInterval(() => {
      if (selectedId && !drag) send('select', { id: selectedId });
      if (remote.size) renderBoxes();
    }, SELECT_BEAT_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && db && joined) loadAll();
    });
  }

  // 이미지 저장(save-image.js)이 그룹 이름과 편지를 읽어 갈 수 있게 열어 둬요.
  window.TL = {
    get group() {
      return group;
    },
    get letters() {
      return letters;
    },
  };

  /* ---------- 시작 ---------- */
  async function init() {
    refreshIcons();
    bind();
    renderItems();
    renderLetters();

    if (!code) {
      renderHome('create');
      return show('home');
    }
    if (!db) {
      renderHome('missing');
      toast('연결하지 못했어요. 새로고침해 주세요.');
      return show('home');
    }
    const { data, error } = await loadGroup();
    if (error || !data) {
      code = null;
      renderHome('missing');
      if (error) toast('불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      return show('home');
    }
    applyGroup(data);
    renderHome('invite');
    show('home');
  }

  init();
})();
