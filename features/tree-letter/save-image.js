/* 트리 이미지 저장 (준비 단계 · 아직 index.html에 연결하지 않았어요)
   연결 방법: index.html에 아래 두 줄을 추가하면 저장 버튼과 모달이 생겨요.
     <link rel="stylesheet" href="./save-image.css" />        ← style.css 다음 줄
     <script src="./save-image.js"></script>                  ← script.js 다음 줄
   script.js는 건드리지 않고, 이 파일이 버튼과 모달을 직접 만들어 넣어요. */
(() => {
  'use strict';

  const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const CAPTURE_SCALE = 2; // 화면보다 2배 크게 찍어서 저장했을 때 덜 흐리게 해요.

  const $ = (sel) => document.querySelector(sel);
  const team = new URLSearchParams(location.search).get('team') || '';
  const fileName = () => `huddling-tree-${team || 'team'}조.png`;
  const refreshIcons = () => {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  };

  let blob = null; // 마지막으로 찍은 이미지

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
        <button class="btn btn--primary" id="saveDownload" type="button" disabled>이미지 저장</button>
      </div>`;
    document.body.appendChild(dialog);
    refreshIcons();

    saveBtn.addEventListener('click', open);
    $('#saveClose').addEventListener('click', () => dialog.close());
    $('#saveDownload').addEventListener('click', save);
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
  async function capture() {
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

  async function open() {
    const dialog = $('#saveDialog');
    const preview = $('#savePreview');
    const button = $('#saveDownload');
    blob = null;
    button.disabled = true;
    preview.innerHTML = '<p class="save-status">이미지를 만드는 중이에요…</p>';
    dialog.showModal();
    try {
      const canvas = await capture();
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('empty_image');
      const img = document.createElement('img');
      img.className = 'save-img';
      img.alt = `${team}조 트리`;
      img.src = URL.createObjectURL(blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      preview.replaceChildren(img);
      button.disabled = false;
    } catch (err) {
      console.warn('tree-letter save image', err);
      preview.innerHTML = '<p class="save-status">이미지를 만들지 못했어요. 닫고 다시 눌러 주세요.</p>';
    }
  }

  /* ---------- 저장 ---------- */
  async function save() {
    if (!blob) return;
    const file = new File([blob], fileName(), { type: 'image/png' });
    // 폰에서는 공유 창을 띄워 사진 앱에 저장할 수 있게 하고, 안 되면 파일로 내려받아요.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${team}조 트리` });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // 사용자가 공유 창을 닫은 경우
      }
    }
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
