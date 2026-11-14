(() => {
  'use strict';

  /* ---------- 설정 (api/tree-letter.js 의 값과 맞춰야 해요) ---------- */
  const TEAM_COUNT = 6; // 조 개수. 확정되면 바꿔 주세요.
  const NICK_MAX = 10;
  const LETTER_MAX = 30;
  const POLL_MS = 5000;
  const API = '/api/tree-letter';

  const ORNAMENTS = [
    { id: 'ball', icon: 'sparkle', color: '#D8433B' },
    { id: 'star', icon: 'star', color: '#E8B94A' },
    { id: 'heart', icon: 'heart', color: '#E26D8A' },
    { id: 'gift', icon: 'gift', color: '#3F7FBF' },
    { id: 'bell', icon: 'bell', color: '#C98A2B' },
    { id: 'snow', icon: 'snowflake', color: '#6FB6D9' },
    { id: 'candy', icon: 'candy-cane', color: '#C2453F' },
    { id: 'cookie', icon: 'cookie', color: '#9A6A3C' },
  ];
  const BACKGROUNDS = [
    { id: 'night', label: '밤하늘' },
    { id: 'snow', label: '눈 오는 날' },
    { id: 'warm', label: '따뜻한 방' },
    { id: 'forest', label: '숲속' },
  ];
  // 편지에 붙이는 임시 이미지. 색은 Figma 변수의 300 단계 값이에요.
  const LETTER_IMAGES = [
    { id: 'heart', icon: 'heart', fg: '#FDA29B' },
    { id: 'star', icon: 'star', fg: '#FEC84B' },
    { id: 'gift', icon: 'gift', fg: '#75E0A7' },
    { id: 'snow', icon: 'snowflake', fg: '#D7D3D0' },
  ];
  const ORN_MAP = Object.fromEntries(ORNAMENTS.map((o) => [o.id, o]));
  const IMG_MAP = Object.fromEntries(LETTER_IMAGES.map((o) => [o.id, o]));

  // 임시 트리 그래픽. 최종 일러스트가 나오면 이 부분만 바꾸면 돼요.
  const TREE_SVG = `
    <svg class="tree-svg" viewBox="0 0 300 360" aria-hidden="true">
      <rect x="134" y="296" width="32" height="46" rx="6" fill="#7A5236"/>
      <path d="M150 150 L262 300 H38 Z" fill="#1F5A41" stroke="#1F5A41" stroke-width="16" stroke-linejoin="round"/>
      <path d="M150 90 L236 220 H64 Z" fill="#27704F" stroke="#27704F" stroke-width="16" stroke-linejoin="round"/>
      <path d="M150 44 L210 140 H90 Z" fill="#2F8560" stroke="#2F8560" stroke-width="16" stroke-linejoin="round"/>
      <polygon points="150,10 155,23.1 169,23.8 158.1,32.6 161.8,46.2 150,38.5 138.2,46.2 141.9,32.6 131,23.8 145,23.1"
        fill="#E8B94A" stroke="#E8B94A" stroke-width="4" stroke-linejoin="round"/>
    </svg>`;

  /* ---------- 도우미 ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const refreshIcons = () => {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  };
  const session = {
    get: (k) => {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        sessionStorage.setItem(k, v);
      } catch {
        /* 저장이 막힌 브라우저에서도 화면은 동작해야 해요 */
      }
    },
  };
  const newId = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    const dialog = $('#letterDialog');
    // 편지 모달이 열려 있으면 모달 위에 보여야 해서 모달 안으로 옮겨요.
    (dialog.open ? dialog : document.body).appendChild(el);
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  /* ---------- 상태 ---------- */
  const teamParam = Number(new URLSearchParams(location.search).get('team'));
  const team = Number.isInteger(teamParam) && teamParam >= 1 && teamParam <= TEAM_COUNT ? teamParam : null;

  // 참여는 세션(브라우저 탭) 단위: 탭을 닫으면 닉네임과 내 오너먼트 표시가 초기화돼요.
  let sid = session.get('tl:sid');
  if (!sid) {
    sid = newId();
    session.set('tl:sid', sid);
  }
  let nick = session.get('tl:nick') || '';

  let data = { ornaments: [], letters: [], bg: 'night' };
  let dataKey = '';
  let mode = 'remote'; // 'remote' = Vercel 저장소, 'local' = 이 기기에만
  let remoteOk = false;
  let pending = 0;
  let pollTimer = null;

  let tab = 'ornament';
  let selectedOrn = null;
  let activeOrn = null;
  let selectedImg = null;

  /* ---------- 저장소 ---------- */
  const localKey = () => `tl:local:${team}`;
  function localRead() {
    try {
      const raw = JSON.parse(localStorage.getItem(localKey()));
      if (raw && Array.isArray(raw.ornaments) && Array.isArray(raw.letters)) return raw;
    } catch {
      /* 없으면 새로 만들어요 */
    }
    return { ornaments: [], letters: [], bg: 'night' };
  }
  function localWrite(db) {
    try {
      localStorage.setItem(localKey(), JSON.stringify(db));
    } catch {
      /* 무시 */
    }
  }
  function localCall(method, body) {
    const db = localRead();
    if (method === 'GET') {
      const mark = ({ sid: owner, ...rest }) => ({ ...rest, mine: owner === sid });
      return { ornaments: db.ornaments.map(mark), letters: db.letters.map(mark), bg: db.bg };
    }
    if (method === 'DELETE') {
      db.ornaments = db.ornaments.filter((o) => !(o.id === body.id && o.sid === sid));
    } else if (body.kind === 'ornament') {
      db.ornaments.push({ id: newId(), type: body.type, x: body.x, y: body.y, nick, sid, at: Date.now() });
    } else if (body.kind === 'letter') {
      db.letters.push({ id: newId(), text: body.text, image: body.image, nick, sid, at: Date.now() });
    } else if (body.kind === 'bg') {
      db.bg = body.bg;
    }
    localWrite(db);
    return { ok: true };
  }

  async function remoteCall(method, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    let url = API;
    if (method === 'GET') url += `?team=${team}&sid=${encodeURIComponent(sid)}`;
    else opt.body = JSON.stringify({ ...body, team, sid, nick });
    const res = await fetch(url, opt);
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!isJson || res.status === 404 || res.status === 503) {
      throw Object.assign(new Error('unavailable'), { unavailable: true });
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'request_failed');
    return json;
  }

  async function call(method, body) {
    if (mode === 'remote') {
      try {
        const out = await remoteCall(method, body);
        remoteOk = true;
        return out;
      } catch (err) {
        // 한 번이라도 저장소에 연결됐다면 기기 저장으로 바꾸지 않아요 (데이터가 갈라지면 안 되니까요).
        const cannotReach = err.unavailable || err instanceof TypeError;
        if (remoteOk || !cannotReach) throw err;
        mode = 'local';
        $('#localNotice').hidden = false;
        refreshIcons();
      }
    }
    return localCall(method, body);
  }

  async function refresh() {
    if (pending > 0) return;
    let next;
    try {
      next = await call('GET');
    } catch {
      return; // 잠깐 끊긴 경우: 다음 주기에 다시 시도
    }
    if (pending > 0) return;
    const key = JSON.stringify(next);
    if (key === dataKey) return;
    dataKey = key;
    data = {
      ornaments: next.ornaments || [],
      letters: (next.letters || []).slice().sort((a, b) => b.at - a.at),
      bg: next.bg || 'night',
    };
    renderAll();
  }

  /* ---------- 화면 전환 ---------- */
  function show(name) {
    $$('[data-screen]').forEach((el) => {
      el.hidden = el.dataset.screen !== name;
    });
    clearInterval(pollTimer);
    pollTimer = null;
    if (name === 'decorate') {
      refresh();
      pollTimer = setInterval(refresh, POLL_MS);
    }
    if (name === 'nick') {
      const input = $('#nickInput');
      input.value = nick;
      updateNick();
      input.focus();
    }
  }

  /* ---------- ② 닉네임 ---------- */
  function updateNick() {
    const input = $('#nickInput');
    const value = input.value.trim();
    $('#nickCount').textContent = `${[...input.value].length}/${NICK_MAX}`;
    $('#nickNext').disabled = value.length === 0;
  }

  /* ---------- ③ 꾸미기 ---------- */
  function renderAll() {
    $('#canvas').dataset.bg = data.bg;
    renderOrnaments();
    renderItems();
    renderLetters();
  }

  function renderOrnaments() {
    const layer = $('#ornLayer');
    if (activeOrn && !data.ornaments.some((o) => o.id === activeOrn)) activeOrn = null;
    const nodes = [];
    for (const o of data.ornaments) {
      const def = ORN_MAP[o.type];
      if (!def) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'orn';
      if (o.pending) b.classList.add('is-pending');
      if (o.id === activeOrn) b.classList.add('is-active');
      b.dataset.id = o.id;
      b.style.left = `${o.x}%`;
      b.style.top = `${o.y}%`;
      b.style.setProperty('--c', def.color);
      b.setAttribute('aria-label', `${o.nick}님의 오너먼트`);
      b.innerHTML = icon(def.icon);
      nodes.push(b);
    }
    const active = data.ornaments.find((o) => o.id === activeOrn);
    if (active) {
      const bubble = document.createElement('div');
      bubble.className = 'orn-bubble';
      bubble.style.left = `${active.x}%`;
      bubble.style.top = `${active.y}%`;
      const name = document.createElement('span');
      name.textContent = active.mine ? `${active.nick} (나)` : active.nick;
      bubble.appendChild(name);
      if (active.mine && !active.pending) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.remove = active.id;
        remove.textContent = '떼기';
        bubble.appendChild(remove);
      }
      nodes.push(bubble);
    }
    layer.replaceChildren(...nodes);
    refreshIcons();
  }

  function renderItems() {
    const box = $('#items');
    $$('.tab').forEach((t) => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (tab === 'ornament') {
      $('#sheetHint').textContent = selectedOrn
        ? '트리에서 달고 싶은 자리를 눌러 주세요.'
        : '오너먼트를 고른 뒤 트리를 눌러 달아 주세요.';
      box.innerHTML = ORNAMENTS.map(
        (o) => `
        <button type="button" class="item${o.id === selectedOrn ? ' is-on' : ''}" data-orn="${o.id}"
          aria-pressed="${o.id === selectedOrn}" aria-label="오너먼트 ${o.id}">
          <span class="dot" style="--c:${o.color}">${icon(o.icon)}</span>
        </button>`
      ).join('');
    } else {
      $('#sheetHint').textContent = '배경은 우리 조 모두에게 똑같이 보여요.';
      box.innerHTML = BACKGROUNDS.map(
        (b) => `
        <button type="button" class="item item--bg${b.id === data.bg ? ' is-on' : ''}" data-bg="${b.id}"
          aria-pressed="${b.id === data.bg}">
          <span class="swatch" data-bg="${b.id}"></span>${b.label}
        </button>`
      ).join('');
    }
    refreshIcons();
  }

  async function placeOrnament(x, y) {
    const temp = { id: `tmp-${newId()}`, type: selectedOrn, x, y, nick, mine: true, pending: true };
    data.ornaments.push(temp);
    renderOrnaments();
    pending += 1;
    let failed = false;
    try {
      await call('POST', { kind: 'ornament', type: temp.type, x, y });
    } catch (err) {
      failed = true;
      toast(err.message === 'full' ? '트리가 가득 찼어요.' : '달지 못했어요. 다시 시도해 주세요.');
    }
    pending -= 1;
    if (failed) {
      data.ornaments = data.ornaments.filter((o) => o !== temp);
      renderOrnaments();
    }
    dataKey = '';
    refresh();
  }

  async function removeOrnament(id) {
    activeOrn = null;
    data.ornaments = data.ornaments.filter((o) => o.id !== id);
    renderOrnaments();
    pending += 1;
    try {
      await call('DELETE', { id });
    } catch {
      toast('떼지 못했어요. 다시 시도해 주세요.');
    }
    pending -= 1;
    dataKey = '';
    refresh();
  }

  async function setBackground(bg) {
    if (bg === data.bg) return;
    const prev = data.bg;
    data.bg = bg;
    $('#canvas').dataset.bg = bg;
    renderItems();
    pending += 1;
    try {
      await call('POST', { kind: 'bg', bg });
    } catch {
      data.bg = prev;
      $('#canvas').dataset.bg = prev;
      renderItems();
      toast('배경을 바꾸지 못했어요.');
    }
    pending -= 1;
    dataKey = '';
    refresh();
  }

  /* ---------- ④ 편지 ---------- */
  function renderLetters() {
    const badge = $('#letterBadge');
    badge.hidden = data.letters.length === 0;
    badge.textContent = data.letters.length > 99 ? '99+' : String(data.letters.length);

    const list = $('#letterList');
    if (data.letters.length === 0) {
      list.innerHTML = `<div class="empty">${icon('mail-open')}아직 남겨진 편지가 없어요.<br />첫 한마디를 남겨 보세요.</div>`;
      refreshIcons();
      return;
    }
    const cards = data.letters.map((l) => {
      const card = document.createElement('article');
      card.className = `card${l.mine ? ' is-mine' : ''}`;
      const img = IMG_MAP[l.image];
      if (img) {
        const tile = document.createElement('span');
        tile.className = 'card-img';
        tile.style.setProperty('--fg', img.fg);
        tile.innerHTML = icon(img.icon);
        card.appendChild(tile);
      }
      const text = document.createElement('p');
      text.className = 'card-text';
      text.textContent = l.text;
      const who = document.createElement('span');
      who.className = 'card-nick';
      who.textContent = l.mine ? `${l.nick} (나)` : l.nick;
      card.append(text, who);
      return card;
    });
    list.replaceChildren(...cards);
    refreshIcons();
  }

  function renderImagePicker() {
    $('#imgRow').innerHTML = LETTER_IMAGES.map(
      (i) => `
      <button type="button" class="img-opt${i.id === selectedImg ? ' is-on' : ''}" data-img="${i.id}"
        role="radio" aria-checked="${i.id === selectedImg}" aria-label="이미지 ${i.id}"
        style="--fg:${i.fg}">${icon(i.icon)}</button>`
    ).join('');
    refreshIcons();
  }

  function updateLetter() {
    const input = $('#letterInput');
    $('#letterCount').textContent = `${[...input.value].length}/${LETTER_MAX}`;
    $('#letterSend').disabled = input.value.trim().length === 0;
  }

  async function sendLetter() {
    const input = $('#letterInput');
    const text = input.value.trim();
    if (!text) return;
    $('#letterSend').disabled = true;
    try {
      await call('POST', { kind: 'letter', text, image: selectedImg });
      input.value = '';
      selectedImg = null;
      renderImagePicker();
      dataKey = '';
      await refresh();
      $('#letterList').scrollTop = 0;
      toast('편지를 남겼어요.');
    } catch {
      toast('남기지 못했어요. 다시 시도해 주세요.');
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

  function bind() {
    $('#startBtn').addEventListener('click', () => show(nick ? 'decorate' : 'nick'));
    $('#nickBack').addEventListener('click', () => show('home'));

    limitInput($('#nickInput'), NICK_MAX, updateNick);
    $('#nickForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = [...$('#nickInput').value.trim()].slice(0, NICK_MAX).join('');
      if (!value) return;
      nick = value;
      session.set('tl:nick', nick);
      show('decorate');
    });

    $$('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        tab = t.dataset.tab;
        renderItems();
      })
    );

    $('#items').addEventListener('click', (e) => {
      const orn = e.target.closest('[data-orn]');
      const bg = e.target.closest('[data-bg]');
      if (orn) {
        selectedOrn = selectedOrn === orn.dataset.orn ? null : orn.dataset.orn;
        renderItems();
      } else if (bg) {
        setBackground(bg.dataset.bg);
      }
    });

    $('#treeBox').addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (remove) return removeOrnament(remove.dataset.remove);
      if (e.target.closest('.orn-bubble')) return;
      const orn = e.target.closest('.orn');
      if (orn) {
        activeOrn = activeOrn === orn.dataset.id ? null : orn.dataset.id;
        return renderOrnaments();
      }
      if (activeOrn) {
        activeOrn = null;
        return renderOrnaments();
      }
      if (!selectedOrn) return toast('아래에서 오너먼트를 먼저 골라 주세요.');
      const rect = $('#treeBox').getBoundingClientRect();
      const clamp = (v) => Math.min(96, Math.max(4, Math.round(v * 10) / 10));
      placeOrnament(
        clamp(((e.clientX - rect.left) / rect.width) * 100),
        clamp(((e.clientY - rect.top) / rect.height) * 100)
      );
    });

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
      renderImagePicker();
      updateLetter();
      dialog.showModal();
      refresh();
    });
    $('#letterClose').addEventListener('click', () => dialog.close());

    limitInput($('#letterInput'), LETTER_MAX, updateLetter);
    $('#imgRow').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-img]');
      if (!opt) return;
      selectedImg = selectedImg === opt.dataset.img ? null : opt.dataset.img;
      renderImagePicker();
    });
    $('#letterForm').addEventListener('submit', (e) => {
      e.preventDefault();
      sendLetter();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && pollTimer) refresh();
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    $$('[data-tree]').forEach((el) => (el.innerHTML = TREE_SVG));
    refreshIcons();

    if (!team) {
      $('#teamGrid').innerHTML = Array.from(
        { length: TEAM_COUNT },
        (_, i) => `<a href="?team=${i + 1}">${i + 1}조</a>`
      ).join('');
      return show('team');
    }

    $$('[data-team-label]').forEach((el) => (el.textContent = `${team}조`));
    $$('[data-team-title]').forEach((el) => (el.textContent = `${team}조 트리`));
    document.title = `${team}조 트리 · 허들링 트리`;
    bind();
    renderAll();
    show('home');
  }

  init();
})();
