/* 트리 이미지 저장: 위에는 트리, 아래에는 편지 목록이 들어간 세로 이미지를 만들어요.
   script.js는 window.TL로 그룹 이름과 편지만 열어 주고, 버튼과 모달은 이 파일이 직접 만들어 넣어요. */
(() => {
  'use strict';

  const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const CAPTURE_SCALE = 2; // 화면보다 2배 크게 찍어서 저장했을 때 덜 흐리게 해요.
  const LETTER_LIMIT = 20; // 이미지에 넣는 편지 수 (최신순). 나머지는 '외 N개'로 적어요.
  const FONT = "'Wanted Sans Variable', 'Wanted Sans', -apple-system, 'Apple SD Gothic Neo', sans-serif";
  const SCRIPT_FONT = "'bickham-script-pro-3', cursive";

  const $ = (sel) => document.querySelector(sel);
  const groupName = () => (window.TL && window.TL.group && window.TL.group.name) || '우리';
  const fileName = () => `${groupName().replace(/[\\/:*?"<>|]/g, '')}-트리.png`;
  const refreshIcons = () => {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  };

  let blob = null; // 마지막으로 만든 이미지

  /* ---------- 버튼 · 모달 만들기 ---------- */
  function build() {
    const bar = $('.bar--decorate');
    const letterBtn = $('#letterBtn');
    if (!bar || !letterBtn || $('#saveBtn')) return false;

    // 오른쪽에 [저장] [편지] 두 버튼을 나란히 둬요.
    const group = document.createElement('div');
    group.className = 'bar-group';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'saveBtn';
    saveBtn.className = 'icon-btn icon-btn--solid';
    saveBtn.setAttribute('aria-label', '트리 이미지 저장');
    saveBtn.innerHTML = '<i data-lucide="download"></i>';
    bar.insertBefore(group, letterBtn);
    group.append(saveBtn, letterBtn);

    const dialog = document.createElement('dialog');
    dialog.id = 'saveDialog';
    dialog.className = 'save-dialog';
    dialog.setAttribute('aria-labelledby', 'saveTitle');
    dialog.innerHTML = `
      <div class="save-inner">
        <div class="save-head">
          <h2 class="save-title" id="saveTitle">트리 이미지 저장</h2>
          <button class="icon-btn" id="saveClose" type="button" aria-label="닫기"><i data-lucide="x"></i></button>
        </div>
        <div class="save-preview" id="savePreview" aria-live="polite"></div>
        <div class="save-actions">
          <button class="btn btn--secondary" id="saveDownload" type="button" disabled>
            <i data-lucide="download"></i>이미지 저장
          </button>
          <button class="btn btn--primary" id="saveShare" type="button" disabled>
            <i data-lucide="share-2"></i>공유하기
          </button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    refreshIcons();

    saveBtn.addEventListener('click', open);
    $('#saveClose').addEventListener('click', () => dialog.close());
    $('#saveDownload').addEventListener('click', save);
    $('#saveShare').addEventListener('click', share);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // 바깥(어두운 부분)을 누르면 닫혀요.
    });
    return true;
  }

  /* ---------- html2canvas 불러오기 (처음 누를 때 한 번만) ---------- */
  let loading = null;
  function loadHtml2canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = HTML2CANVAS_URL;
        s.onload = () => resolve(window.html2canvas);
        s.onerror = () => {
          loading = null;
          reject(new Error('html2canvas_load_failed'));
        };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  /* ---------- 트리 부분 찍기 ---------- */
  async function captureTree() {
    const target = $('#canvas'); // 방 배경 + 트리 + 오너먼트
    const html2canvas = await loadHtml2canvas();
    // 그림 파일이 다 뜬 뒤에 찍어요.
    await Promise.all(
      [...target.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => null)))
    );
    return html2canvas(target, {
      scale: CAPTURE_SCALE,
      backgroundColor: '#171412',
      useCORS: true,
      logging: false,
      // 선택 박스 · X 버튼 · 이름표는 편집용 표시라 이미지에서 빼요.
      ignoreElements: (el) => el.classList && el.classList.contains('orn-box'),
      // 찍는 순간에는 등장 효과를 꺼요 (켜 두면 반투명하게 찍힐 수 있어요).
      onclone: (doc) => {
        const style = doc.createElement('style');
        style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
        doc.head.appendChild(style);
      },
    });
  }

  /* ---------- 편지 목록 그리기 ---------- */
  // 한글은 띄어쓰기 없이도 길 수 있어서 글자 단위로 줄을 나눠요.
  function wrap(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const ch of [...text]) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch.trim() ? ch : '';
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function compose(tree) {
    const all = (window.TL && window.TL.letters) || [];
    const shown = all.slice(0, LETTER_LIMIT);
    const W = tree.width;
    const k = W / 430; // 화면 1px이 이미지에서 몇 px인지
    const pad = 20 * k;
    const cardPad = 14 * k;
    const gap = 8 * k;
    const textSize = 14 * k;
    const nickSize = 11 * k;
    const lineH = textSize * 1.5;
    const innerW = W - pad * 2 - cardPad * 2;

    // 글꼴이 다 받아진 뒤에 그려야 기본 글꼴로 찍히지 않아요.
    await Promise.all([
      document.fonts.load(`600 ${textSize}px ${FONT}`),
      document.fonts.load(`400 ${textSize}px ${FONT}`),
      document.fonts.load(`${36 * k}px ${SCRIPT_FONT}`),
    ]).catch(() => null);

    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `400 ${textSize}px ${FONT}`;
    const cards = shown.map((l) => {
      const lines = wrap(measure, l.text || '', innerW);
      const h = cardPad * 2 + nickSize * 1.4 + 6 * k + lines.length * lineH;
      return { nick: l.nick || '', lines, h };
    });

    const headH = all.length ? 56 * k : 0;
    const listH = cards.reduce((sum, c) => sum + c.h + gap, 0);
    const moreH = all.length > shown.length ? 28 * k : 0;
    // 필기체는 y·g 꼬리가 아래로 길게 내려와요. 실제 높이를 재서 아래 글씨와 겹치지 않게 해요.
    const titleSize = 36 * k;
    const subSize = 11 * k;
    measure.font = `${titleSize}px ${SCRIPT_FONT}`;
    const tm = measure.measureText('Merry Huddling Tree');
    const titleAscent = tm.actualBoundingBoxAscent || titleSize * 0.8;
    const titleDescent = tm.actualBoundingBoxDescent || titleSize * 0.35;
    const footTop = 20 * k;
    const footGap = 10 * k;
    const footBottom = 24 * k;
    const footH = footTop + titleAscent + titleDescent + footGap + subSize + footBottom;
    const H = tree.height + headH + listH + moreH + footH;

    const out = document.createElement('canvas');
    out.width = W;
    out.height = Math.ceil(H);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#290f0f';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(tree, 0, 0);

    let y = tree.height;
    if (all.length) {
      ctx.fillStyle = '#fafaf9';
      ctx.font = `600 ${16 * k}px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${groupName()}에 남긴 편지 ${all.length}개`, pad, y + 30 * k);
      y += headH;
    }

    for (const c of cards) {
      roundRect(ctx, pad, y, W - pad * 2, c.h, 14 * k);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = k;
      ctx.stroke();

      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fdb022';
      ctx.font = `600 ${nickSize}px ${FONT}`;
      ctx.fillText(c.nick, pad + cardPad, y + cardPad);

      ctx.fillStyle = '#fafaf9';
      ctx.font = `400 ${textSize}px ${FONT}`;
      let ty = y + cardPad + nickSize * 1.4 + 6 * k + (lineH - textSize) / 2;
      for (const line of c.lines) {
        ctx.fillText(line, pad + cardPad, ty);
        ty += lineH;
      }
      y += c.h + gap;
    }

    if (moreH) {
      ctx.fillStyle = '#a9a29d';
      ctx.font = `400 ${12 * k}px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(`외 ${all.length - shown.length}개의 편지가 더 있어요`, W / 2, y + 10 * k);
      ctx.textAlign = 'left';
      y += moreH;
    }

    // 맨 아래 서명
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fafaf9';
    ctx.font = `${titleSize}px ${SCRIPT_FONT}`;
    const baseY = y + footTop + titleAscent;
    ctx.fillText('Merry Huddling Tree', W / 2, baseY);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#a9a29d';
    ctx.font = `400 ${subSize}px ${FONT}`;
    ctx.fillText('by 허들링 클럽', W / 2, baseY + titleDescent + footGap);
    ctx.textAlign = 'left';
    return out;
  }

  async function open() {
    const dialog = $('#saveDialog');
    const preview = $('#savePreview');
    const buttons = [$('#saveDownload'), $('#saveShare')];
    blob = null;
    buttons.forEach((b) => (b.disabled = true));
    preview.innerHTML = '<p class="save-status">이미지를 만드는 중이에요…</p>';
    dialog.showModal();
    try {
      const canvas = await compose(await captureTree());
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('empty_image');
      const img = document.createElement('img');
      img.className = 'save-img';
      img.alt = `${groupName()} 트리와 편지`;
      img.src = URL.createObjectURL(blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      preview.replaceChildren(img);
      buttons.forEach((b) => (b.disabled = false));
    } catch (err) {
      console.warn('tree-letter save image', err);
      preview.innerHTML = '<p class="save-status">이미지를 만들지 못했어요. 닫고 다시 눌러 주세요.</p>';
    }
  }

  /* ---------- 저장 ---------- */
  // 그룹 코드 없는 첫 화면 주소: 받은 사람이 '나도 만들어 볼까?' 하고 바로 시작할 수 있는 곳
  function homeUrl() {
    return `${location.origin}${location.pathname}`;
  }

  /* ---------- 공유: 이미지 + '나도 만들기' 링크 ---------- */
  async function share() {
    if (!blob) return;
    const file = new File([blob], fileName(), { type: 'image/png' });
    const title = `${groupName()} 트리 🎄`;
    const text = `우리 그룹이 함께 꾸민 크리스마스 트리예요 🎄\n나도 우리 그룹 트리 만들기 👉 ${homeUrl()}`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
      } else if (navigator.share) {
        await navigator.share({ title, text }); // 이미지를 못 보내는 브라우저는 글과 링크만
      } else {
        await navigator.clipboard.writeText(text);
        flash($('#saveShare'), '링크를 복사했어요');
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') flash($('#saveShare'), '공유하지 못했어요');
    }
  }

  // 버튼 글자를 잠깐 바꿔서 결과를 알려 줘요.
  function flash(btn, msg) {
    const html = btn.innerHTML;
    btn.textContent = msg;
    setTimeout(() => {
      btn.innerHTML = html;
    }, 1600);
  }

  /* ---------- 저장: 파일로 내려받기 ---------- */
  function save() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
