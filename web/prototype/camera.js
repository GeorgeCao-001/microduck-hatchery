(() => {
  'use strict';
  const image = document.getElementById('frame');
  const status = document.getElementById('status');
  const refresh = document.getElementById('refresh');
  const workspaceURL = new URL(window.location.href);
  workspaceURL.port = '8088';
  workspaceURL.pathname = '/';
  workspaceURL.hash = '#console/servos/parameters';
  document.querySelector('header a').href = workspaceURL.href;
  let active = true, busy = false, previousURL, controller;
  async function capture() {
    if (!active || busy || document.hidden) return;
    busy = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('/frame', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.headers.get('content-type')?.startsWith('image/png')) throw new Error('回复不是相机图像');
      const blob = await response.blob();
      if (!active) return;
      const nextURL = URL.createObjectURL(blob);
      image.src = nextURL;
      image.hidden = false;
      if (previousURL) URL.revokeObjectURL(previousURL);
      previousURL = nextURL;
      status.textContent = `收到板端帧 · 浏览器接收时间 ${new Date().toLocaleTimeString()} · 只读快照`;
    } catch (error) {
      if (active) {
        image.hidden = true;
        status.textContent = `当前没有新帧 · ${error.message}。检查 mediad、摄像头节点和权限。`;
      }
    } finally { clearTimeout(timeout); busy = false; }
  }
  document.getElementById('capture').addEventListener('click', capture);
  const timer = setInterval(() => { if (refresh.checked) capture(); }, 1000);
  window.addEventListener('pagehide', () => {
    active = false; clearInterval(timer); controller?.abort();
    if (previousURL) URL.revokeObjectURL(previousURL);
  });
  capture();
})();
