(() => {
  'use strict';

  /* ---------- 설정 ---------- */
  const TEAM_COUNT = 16;
  const NICK_MAX = 10;
  const LETTER_MAX = 30;
  // Supabase 공개(publishable) 키예요. 브라우저에 노출되는 용도로 만들어진 키라 코드에 둬도 돼요.
  // 접근 범위는 Supabase의 테이블 정책(RLS)으로 제한해요. secret 키는 절대 여기에 두지 않아요.
  const SUPABASE_URL = 'https://jcrpnjhdiutdbweyiuub.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_5JVd4gBphymZspARFZku1g_pxjLEQ7y';
  const MOVE_SEND_MS = 90; // 드래그 중 위치를 보내는 간격
  const REMOTE_TTL_MS = 6000; // 다른 사람의 선택 표시가 사라지는 시간
  const SELECT_BEAT_MS = 2500;

  // Figma 'deco' 컴포넌트의 이미지를 그대로 써요 (./img/orn-<id>.png).
  const ORNAMENTS = [
    { id: 'snow', label: '눈꽃' },
    { id: 'cookie', label: '진저맨 쿠키' },
    { id: 'gift', label: '선물 상자' },
    { id: 'ball', label: '빨간 볼' },
    { id: 'penguin-santa', label: '산타 펭귄' },
    { id: 'penguin-bow', label: '리본 펭귄' },
  ];
  const ornSrc = (id) => `./img/orn-${id}.png`;
  const ORN_MAP = Object.fromEntries(ORNAMENTS.map((o) => [o.id, o]));
  // 함께 편집하는 사람을 구분하는 색 (Figma 공동편집의 이름표 색처럼)
  const PEER_COLORS = ['#F97066', '#FDB022', '#47CD89', '#53B1FD', '#BDB4FE', '#F670C7', '#2ED3B7', '#FD853A'];

  // Figma 'tree' 컴포넌트 4종. 조마다 다른 트리가 보여요.
  const treeImg = (n) => `<img class="tree-img" src="./img/tree-${((n - 1) % 4) + 1}.png" alt="" draggable="false" />`;

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
  const clamp = (v) => Math.min(96, Math.max(4, Math.round(v * 10) / 10));

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    const dialog = $('#letterDialog');
    (dialog.open ? dialog : document.body).appendChild(el);
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  /* ---------- 상태 ---------- */
  const teamParam = Number(new URLSearchParams(location.search).get('team'));
  const team = Number.isInteger(teamParam) && teamParam >= 1 && teamParam <= TEAM_COUNT ? teamParam : null;

  let sid = store.get('tl:sid');
  if (!sid) {
    sid = newId();
    store.set('tl:sid', sid);
  }
  let nick = store.get('tl:nick') || '';
  const myColor = PEER_COLORS[[...sid].reduce((a, c) => a + c.charCodeAt(0), 0) % PEER_COLORS.length];

  const ornaments = new Map(); // id -> { id, type, x, y, nick }
  let letters = [];
  let selectedId = null;
  let drag = null; // { id, moved, lastSent }
  const remote = new Map(); // 다른 사람 sid -> { id, nick, color, at }
  let peerCount = 1;

  let db = null;
  let channel = null;
  let joined = false;

  /* ---------- Supabase ---------- */
  function connect() {
    if (joined) return;
    if (!window.supabase) return toast('연결하지 못했어요. 새로고침해 주세요.');
    joined = true;
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 12 } },
    });
    const filter = `team=eq.${team}`;
    channel = db
      .channel(`tree-${team}`, { config: { presence: { key: sid }, broadcast: { self: false } } })
      // 오너먼트는 표 전체를 한 번에 구독하고 조 번호는 여기서 걸러요.
      // (삭제 알림에는 id만 오기 때문에 조 번호로 미리 거를 수 없어요.)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tl_ornaments' }, (p) => {
        if (p.eventType === 'DELETE') dropOrnament(p.old && p.old.id);
        else if (p.new && p.new.team === team) upsertOrnament(p.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tl_letters', filter }, (p) => addLetter(p.new))
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

  async function loadAll() {
    const [o, l] = await Promise.all([
      db.from('tl_ornaments').select('id,type,x,y,nick').eq('team', team).order('created_at'),
      db.from('tl_letters').select('id,nick,text,created_at').eq('team', team).order('created_at', { ascending: false }).limit(500),
    ]);
    if (o.error || l.error) return toast('불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    const keep = drag && ornaments.get(drag.id);
    ornaments.clear();
    for (const row of o.data) ornaments.set(row.id, row);
    if (keep) ornaments.set(keep.id, keep);
    letters = l.data;
    if (selectedId && !ornaments.has(selectedId)) selectedId = null;
    renderAll();
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
    if (document.startViewTransition && !reduce) document.startViewTransition(swap);
    else swap();
    if (name === 'decorate') connect();
    if (name === 'nick') {
      const input = $('#nickInput');
      input.value = nick;
      updateNick();
      input.focus();
    }
  }

  function updateNick() {
    const input = $('#nickInput');
    $('#nickCount').textContent = `${[...input.value].length}/${NICK_MAX}`;
    $('#nickNext').disabled = input.value.trim().length === 0;
  }

  /* ---------- 트리 · 오너먼트 ---------- */
  function renderAll() {
    renderOrnaments();
    renderItems();
    renderLetters();
    renderTitle();
  }

  function renderTitle() {
    $$('[data-team-title]').forEach((el) => (el.textContent = `${team}조 트리 · ${peerCount}명`));
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
        el.setAttribute('aria-label', `${o.nick}님이 단 오너먼트`);
        el.innerHTML = `<img src="${ornSrc(def.id)}" alt="" draggable="false" />`;
        layer.appendChild(el);
      }
      el.style.left = `${o.x}%`;
      el.style.top = `${o.y}%`;
    }
    for (const el of layer.querySelectorAll('.orn')) if (!seen.has(el.dataset.id)) el.remove();
    refreshIcons();
    renderBoxes();
  }

  // 선택 박스: 내 것은 흰 점선 + X, 다른 사람 것은 그 사람 색 + 이름표.
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
    if (mine) {
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
    ornaments.set(row.id, { id: row.id, type: row.type, x: row.x, y: row.y, nick: row.nick });
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
    const o = { id: newId(), type, x: clamp(35 + Math.random() * 30), y: clamp(38 + Math.random() * 36), nick };
    ornaments.set(o.id, o);
    renderOrnaments();
    select(o.id);
    const { error } = await db.from('tl_ornaments').insert({ ...o, team });
    if (error) {
      dropOrnament(o.id);
      toast('달지 못했어요. 다시 시도해 주세요.');
    }
  }

  async function removeOrnament(id) {
    const backup = ornaments.get(id);
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
    $('#sheetHint').textContent = '누르면 트리에 달려요. 끌어서 옮기고, X로 지워요.';
    $('#items').innerHTML = ORNAMENTS.map(
      (o) => `
      <button type="button" class="item" data-orn="${o.id}" aria-label="${o.label} 달기">
        <img src="${ornSrc(o.id)}" alt="" draggable="false" />
      </button>`
    ).join('');
  }

  /* ---------- 편지 ---------- */
  function addLetter(row) {
    if (!row || letters.some((l) => l.id === row.id)) return;
    letters.unshift(row);
    renderLetters();
  }

  function renderLetters() {
    const badge = $('#letterBadge');
    badge.hidden = letters.length === 0;
    badge.textContent = letters.length > 99 ? '99+' : String(letters.length);

    const list = $('#letterList');
    if (letters.length === 0) {
      list.innerHTML = `<div class="empty">${icon('mail-open')}아직 남겨진 편지가 없어요.<br />첫 한마디를 남겨 보세요.</div>`;
      refreshIcons();
      return;
    }
    const cards = letters.map((l) => {
      const card = document.createElement('article');
      card.className = 'card';
      const who = document.createElement('span');
      who.className = 'card-nick';
      who.textContent = l.nick;
      const text = document.createElement('p');
      text.className = 'card-text';
      text.textContent = l.text;
      card.append(who, text);
      return card;
    });
    list.replaceChildren(...cards);
  }

  function updateLetter() {
    const input = $('#letterInput');
    $('#letterCount').textContent = `${[...input.value].length}/${LETTER_MAX}`;
    $('#letterSend').disabled = input.value.trim().length === 0;
  }

  async function sendLetter() {
    const input = $('#letterInput');
    const text = [...input.value.trim()].slice(0, LETTER_MAX).join('');
    if (!text || !db) return;
    $('#letterSend').disabled = true;
    const row = { id: newId(), team, nick, text };
    const { error } = await db.from('tl_letters').insert(row);
    if (error) {
      toast('남기지 못했어요. 다시 시도해 주세요.');
    } else {
      input.value = '';
      addLetter({ ...row, created_at: new Date().toISOString() });
      $('#letterList').scrollTop = 0;
      toast('편지를 남겼어요.');
    }
    updateLetter();
  }

  /* ---------- 이벤트 ---------- */
  function limitInput(input, max, onChange) {
    input.addEventListener('input', () => {
      const chars = [...input.value];
      // 한글 조합 중에는 자르지 않아요 (조합이 끝나면 다시 호출돼요).
      if (chars.length > max && !input.isComposing) input.value = chars.slice(0, max).join('');
      onChange();
    });
    input.addEventListener('compositionstart', () => (input.isComposing = true));
    input.addEventListener('compositionend', () => {
      input.isComposing = false;
      const chars = [...input.value];
      if (chars.length > max) input.value = chars.slice(0, max).join('');
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
      if (!el) {
        if (selectedId) {
          selectedId = null;
          send('select', { id: null });
          renderBoxes();
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
    $('#startBtn').addEventListener('click', () => show(nick ? 'decorate' : 'nick'));
    $('#nickBack').addEventListener('click', () => show('home'));

    limitInput($('#nickInput'), NICK_MAX, updateNick);
    $('#nickForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = [...$('#nickInput').value.trim()].slice(0, NICK_MAX).join('');
      if (!value) return;
      nick = value;
      store.set('tl:nick', nick);
      show('decorate');
    });

    $('#items').addEventListener('click', (e) => {
      if (!db) return;
      const orn = e.target.closest('[data-orn]');
      if (orn) addOrnament(orn.dataset.orn);
    });

    bindDrag();

    $('#shareBtn').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}?team=${team}`;
      try {
        if (navigator.share) await navigator.share({ title: `${team}조 트리`, url });
        else {
          await navigator.clipboard.writeText(url);
          toast('링크를 복사했어요.');
        }
      } catch (err) {
        if (err && err.name !== 'AbortError') toast('링크를 복사하지 못했어요.');
      }
    });

    const dialog = $('#letterDialog');
    $('#letterBtn').addEventListener('click', () => {
      updateLetter();
      dialog.showModal();
    });
    $('#letterClose').addEventListener('click', () => dialog.close());

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

  /* ---------- 시작 ---------- */
  function init() {
    refreshIcons();

    if (!team) {
      $('#teamGrid').innerHTML = Array.from(
        { length: TEAM_COUNT },
        (_, i) => `<a href="?team=${i + 1}">${i + 1}조</a>`
      ).join('');
      return show('team');
    }

    $$('[data-tree]').forEach((el) => (el.innerHTML = treeImg(team)));
    $$('[data-team-label]').forEach((el) => (el.textContent = `${team}조`));
    document.title = `${team}조 트리 · 허들링 트리`;
    bind();
    renderTitle();
    renderItems();
    renderLetters();
    show('home');
  }

  init();
})();
