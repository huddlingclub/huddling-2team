/* 사용 데이터 모으기 (Amplitude)
   - 다른 파일은 window.tlTrack('이벤트이름', { 추가정보 }) 만 부르면 돼요.
   - 편지 내용 · 닉네임 · 그룹 이름 같은 사람이 쓴 글은 보내지 않아요. 글자 수 같은 숫자만 보내요.
   - 실제 사이트(huddling-2team.vercel.app)에서만 Amplitude로 보내요.
     로컬이나 개인 Vercel 테스트에서는 보내지 않고, 개발자 도구 콘솔에 [track]으로 찍기만 해요. */
(() => {
  'use strict';

  // Amplitude 프로젝트의 API Key. Amplitude에서 프로젝트를 만들면 받을 수 있어요.
  // 브라우저에 노출되도록 만들어진 키라 코드에 둬도 괜찮아요. 비워 두면 아무것도 보내지 않아요.
  const AMPLITUDE_API_KEY = '97e2c36a68735ef0c9fb234a433af304';
  const LIVE_HOSTS = ['huddling-2team.vercel.app'];

  const live = Boolean(AMPLITUDE_API_KEY) && LIVE_HOSTS.includes(location.hostname);
  const inKakao = /KAKAOTALK/i.test(navigator.userAgent);
  const queue = []; // Amplitude가 다 뜨기 전에 생긴 이벤트는 모아 뒀다가 보내요.
  let ready = false;

  function track(name, props) {
    const data = { in_kakao: inKakao, ...props };
    if (!live) {
      console.info('[track]', name, data);
      return;
    }
    if (ready) window.amplitude.track(name, data);
    else queue.push([name, data]);
  }
  window.tlTrack = track;

  if (!live) return;

  // Amplitude 스크립트는 페이지를 막지 않도록 따로 불러와요.
  const s = document.createElement('script');
  s.src = `https://cdn.amplitude.com/script/${AMPLITUDE_API_KEY}.js`;
  s.async = true;
  s.onload = () => {
    if (!window.amplitude) return;
    window.amplitude.init(AMPLITUDE_API_KEY, {
      fetchRemoteConfig: true,
      // 방문 · 세션 · 페이지 보기 · 버튼 클릭을 자동으로 모아요.
      autocapture: true,
    });
    ready = true;
    queue.splice(0).forEach(([name, data]) => window.amplitude.track(name, data));
  };
  document.head.appendChild(s);
})();

/* 이미지 저장 창(save-image.js)의 버튼은 여기서 대신 기록해요. */
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('#saveBtn, #saveDownload, #saveShare, #makeOwn');
  if (!btn || !window.tlTrack) return;
  const names = {
    saveBtn: 'save_dialog_opened',
    saveDownload: 'image_save_clicked',
    saveShare: 'image_share_clicked',
    makeOwn: 'make_own_clicked',
  };
  window.tlTrack(names[btn.id]);
});
