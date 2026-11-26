/* 배경음악: 캐롤을 작게 반복해서 틀어요.
   브라우저는 사람이 화면을 한 번 누르기 전에는 소리를 못 내게 막아서, 첫 터치 때 시작해요.
   스피커 버튼으로 끄면 그 기기에서는 다음에 와도 꺼진 채로 있어요. */
(() => {
  const $ = (s) => document.querySelector(s);
  const KEY = 'tl:bgm';
  const audio = new Audio('./audio/jingle-bells.mp3');
  audio.loop = true;
  audio.volume = 0.3;
  audio.preload = 'none';

  let on = localStorage.getItem(KEY) !== 'off';
  const buttons = [];

  function render() {
    buttons.forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? '배경음악 끄기' : '배경음악 켜기');
      b.innerHTML = `<i data-lucide="${on ? 'volume-2' : 'volume-x'}"></i>`;
    });
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  }

  function play() {
    if (on && !document.hidden) audio.play().catch(() => {});
  }

  function toggle(e) {
    e.stopPropagation();
    on = !on;
    localStorage.setItem(KEY, on ? 'on' : 'off');
    on ? play() : audio.pause();
    render();
  }

  function makeBtn(extra) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `icon-btn icon-btn--solid bgm-btn ${extra}`;
    b.addEventListener('click', toggle);
    buttons.push(b);
    return b;
  }

  // 메인: 오른쪽 위
  const home = $('[data-screen="home"]');
  if (home) home.prepend(makeBtn('bgm-btn--home'));

  // 꾸미기: 오른쪽 아래, 오너먼트 시트 바로 위에 떠 있게
  const sheet = $('[data-screen="decorate"] .sheet');
  if (sheet) sheet.prepend(makeBtn('bgm-btn--float'));
  render();

  // 첫 터치에 시작
  const start = () => {
    play();
    ['pointerdown', 'keydown'].forEach((t) => document.removeEventListener(t, start));
  };
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, start));

  // 다른 탭으로 가면 멈추고, 돌아오면 다시
  document.addEventListener('visibilitychange', () => (document.hidden ? audio.pause() : play()));
})();
