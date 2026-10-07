(function (root) {
  'use strict';

  // Read-only reference kinematics. Camera gestures never produce robot goals.
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const assetRoot = 'assets/microduck-reference/';
  let assetPromise = null, enginePromise = null, active = null;
  let mode = 'draft', savedCamera = null, renders = 0;

  function render() {
    return `<section class="panel joint-viewer-panel" aria-labelledby="joint-viewer-title"><div class="joint-viewer-heading"><div><h2 id="joint-viewer-title">3D 姿态</h2><span class="badge example">参考模型 · 样例映射</span></div><label>显示 <select data-viewer-mode aria-label="3D 姿态来源"><option value="draft" ${mode === 'draft' ? 'selected' : ''}>目标草稿</option><option value="feedback" ${mode === 'feedback' ? 'selected' : ''}>样例反馈</option></select></label></div><div class="joint-viewer-stage" data-viewer-stage><p class="joint-viewer-message" data-viewer-message role="status">正在加载本地 3D 资源…</p></div><div class="joint-viewer-tools"><button type="button" data-viewer-reset>复位视角</button><button type="button" data-viewer-zoom="in" aria-label="放大模型">＋</button><button type="button" data-viewer-zoom="out" aria-label="缩小模型">−</button><span>拖动旋转 · 滚轮缩放 · 点击关节选中</span></div><p class="joint-viewer-source" data-viewer-source role="status">只读姿态展示；没有实机命令。</p><details class="joint-viewer-missing" data-viewer-missing hidden><summary>缺测与参考姿态</summary><ul></ul></details><details class="joint-viewer-notes"><summary>模型与映射说明</summary><p>参考外形来自 Pollen Microduck，经 microduck_rl 与复刻仓库转换；嘴部 #34 的铰链位置为估计。它未匹配本机 Radxa / FT 装配。当前 ticks 仅按 UI 样例范围映射演示角度，不表示真实校准或运动限位。</p><p>模型：CC BY-NC-SA 4.0。<a href="https://github.com/fanhao375/microduck-replica/tree/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/model" target="_blank" rel="noopener">来源与署名</a></p></details></section>`;
  }

  function embeddedAssets() { return root.HatcheryStandaloneViewer || null; }

  function loadEngine() {
    if (root.THREE) return Promise.resolve(root.THREE);
    if (!enginePromise) enginePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const inline = embeddedAssets();
      script.src = inline ? inline.engineURL : 'vendor/three-0.160.0.min.js';
      script.onload = () => root.THREE ? resolve(root.THREE) : reject(new Error('3D 引擎未能加载'));
      script.onerror = () => { script.remove(); enginePromise = null; reject(new Error('本地 3D 引擎资源不可用')); };
      document.head.append(script);
    }).catch(error => { enginePromise = null; throw error; });
    return enginePromise;
  }

  function loadAssets() {
    if (!assetPromise) assetPromise = (async () => {
      const inline = embeddedAssets();
      let model, binary;
      if (inline) {
        model = inline.model;
        const decoded = atob(inline.meshesBase64);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = decoded.charCodeAt(i);
        binary = bytes.buffer;
      } else {
        const responses = await Promise.all([fetch(assetRoot + 'model.json'), fetch(assetRoot + 'meshes.bin')]);
        if (responses.some(response => !response.ok)) throw new Error('本地参考模型资源不可用');
        [model, binary] = await Promise.all([responses[0].json(), responses[1].arrayBuffer()]);
      }
      root.JointViewerGeometry.validateModel(model);
      return { model, binary };
    })().catch(error => { assetPromise = null; throw error; });
    return assetPromise;
  }

  function schedule(instance) {
    if (instance.disposed || !instance.renderer || !instance.visible || document.hidden || instance.frame) return;
    instance.frame = requestAnimationFrame(() => {
      instance.frame = 0;
      if (instance.disposed || !instance.visible || document.hidden) return;
      instance.renderer.render(instance.scene, instance.camera);
      instance.renders += 1; renders += 1;
    });
  }

  function updateCamera(instance) {
    const view = instance.view, radius = view.radius;
    instance.camera.position.set(view.target[0] + radius * Math.cos(view.pitch) * Math.cos(view.yaw), view.target[1] + radius * Math.cos(view.pitch) * Math.sin(view.yaw), view.target[2] + radius * Math.sin(view.pitch));
    instance.camera.lookAt(...view.target);
    savedCamera = { ...view, target: [...view.target] };
    schedule(instance);
  }

  function resize(instance) {
    if (!instance.renderer || instance.disposed) return;
    const width = Math.max(1, instance.stage.clientWidth), height = Math.max(1, instance.stage.clientHeight);
    instance.renderer.setSize(width, height, false);
    instance.camera.aspect = width / height;
    instance.camera.updateProjectionMatrix();
    schedule(instance);
  }

  function update(instance = active) {
    if (!instance || instance.disposed || !instance.nodes) return;
    const pose = root.JointViewerModel.poseFromStore(instance.options.store, mode, instance.options.state);
    const signature = JSON.stringify([mode, instance.options.state, instance.options.jointId, pose.joints.map(joint => [joint.angle, joint.available, joint.stale, joint.value, joint.reason])]);
    if (signature === instance.signature) return;
    instance.signature = signature;
    pose.joints.forEach(joint => {
      const node = instance.nodes.get(joint.id);
      const rotation = new instance.THREE.Quaternion().setFromAxisAngle(node.axis, joint.available ? joint.angle : joint.referenceAngle);
      node.group.quaternion.copy(node.base).multiply(rotation);
      node.materials.forEach(material => {
        material.opacity = joint.available ? joint.stale ? 0.68 : 1 : 0.3;
        material.transparent = !joint.available || joint.stale;
        material.depthWrite = joint.available && !joint.stale;
        material.color.copy(joint.available ? material.userData.original : instance.missingColor);
        material.emissive.set(joint.id === instance.options.jointId ? 0x574011 : 0x000000);
        material.emissiveIntensity = joint.id === instance.options.jointId ? 0.22 : 0;
      });
    });
    const missing = pose.joints.filter(joint => !joint.available || joint.stale);
    const detail = instance.container.querySelector('[data-viewer-missing]');
    detail.hidden = missing.length === 0;
    detail.querySelector('summary').textContent = `缺测 ${pose.summary.missing} · 陈旧 ${pose.summary.stale} / 15`;
    detail.querySelector('ul').innerHTML = missing.map(joint => `<li>#${joint.id} ${escape(joint.name)}：${escape(joint.reason)}</li>`).join('');
    instance.container.querySelector('[data-viewer-source]').textContent = `${mode === 'draft' ? '目标草稿' : '样例反馈'} · 可显示 ${pose.summary.available} / 15${pose.summary.stale ? ' · 含陈旧样例' : ''}；灰色透明关节保留中性参考姿态，不代表实测。当前选中 #${instance.options.jointId}。`;
    instance.pose = pose;
    schedule(instance);
  }

  function bindGestures(instance) {
    const canvas = instance.renderer.domElement, signal = instance.abort.signal;
    let drag = null;
    const zoom = delta => { instance.view.radius = Math.max(instance.defaultView.radius * 0.4, Math.min(instance.defaultView.radius * 3, instance.view.radius * Math.exp(delta))); updateCamera(instance); };
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Microduck 参考模型，15 个关节含嘴部；方向键旋转，加减缩放，R 复位');
    canvas.addEventListener('pointerdown', event => { if (drag) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, pan: event.button === 2 || event.shiftKey }; canvas.setPointerCapture(event.pointerId); }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.pan) {
        const side = new instance.THREE.Vector3().setFromMatrixColumn(instance.camera.matrix, 0);
        const up = new instance.THREE.Vector3().setFromMatrixColumn(instance.camera.matrix, 1);
        const shift = side.multiplyScalar(-dx * instance.view.radius / canvas.clientHeight).add(up.multiplyScalar(dy * instance.view.radius / canvas.clientHeight));
        instance.view.target = instance.view.target.map((value, index) => value + shift.getComponent(index));
      } else { instance.view.yaw -= dx * 0.008; instance.view.pitch = Math.max(0.05, Math.min(1.4, instance.view.pitch + dy * 0.008)); }
      updateCamera(instance);
    }, { signal });
    canvas.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const select = !drag.moved && !drag.pan; drag = null;
      if (select) {
        instance.camera.updateMatrixWorld(); instance.robot.updateMatrixWorld(true);
        const bounds = canvas.getBoundingClientRect();
        const pointer = new instance.THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
        const ray = new instance.THREE.Raycaster(); ray.setFromCamera(pointer, instance.camera);
        const hit = ray.intersectObject(instance.robot, true).find(item => Number.isInteger(item.object.userData.jointId));
        if (hit && instance.options.onSelect) instance.options.onSelect(hit.object.userData.jointId);
      }
    }, { signal });
    canvas.addEventListener('pointercancel', () => { drag = null; }, { signal });
    canvas.addEventListener('lostpointercapture', () => { drag = null; }, { signal });
    canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.max(-0.25, Math.min(0.25, event.deltaY * 0.001))); }, { signal, passive: false });
    canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'r', 'R'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === '+' || event.key === '=') zoom(-0.15);
      else if (event.key === '-') zoom(0.15);
      else if (event.key.toLowerCase() === 'r') instance.view = { ...instance.defaultView, target: [...instance.defaultView.target] };
      else if (event.key === 'ArrowLeft') instance.view.yaw += 0.1;
      else if (event.key === 'ArrowRight') instance.view.yaw -= 0.1;
      else instance.view.pitch = Math.max(0.05, Math.min(1.4, instance.view.pitch + (event.key === 'ArrowUp' ? 0.1 : -0.1)));
      updateCamera(instance);
    }, { signal });
    instance.container.addEventListener('change', event => { if (event.target.matches('[data-viewer-mode]')) { mode = event.target.value; update(instance); } }, { signal });
    instance.container.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.matches('[data-viewer-reset]')) { instance.view = { ...instance.defaultView, target: [...instance.defaultView.target] }; updateCamera(instance); }
      if (button?.matches('[data-viewer-zoom]')) zoom(button.dataset.viewerZoom === 'in' ? -0.15 : 0.15);
    }, { signal });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); instance.visible = false; instance.container.querySelector('[data-viewer-message]').hidden = false; instance.container.querySelector('[data-viewer-message]').textContent = '3D 显示上下文已丢失，可切换页面后重试；目标草稿仍保留。'; }, { signal });
  }

  function createScene(instance, THREE, assets) {
    instance.THREE = THREE;
    instance.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    instance.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    instance.renderer.outputColorSpace = THREE.SRGBColorSpace;
    instance.scene = new THREE.Scene(); instance.scene.background = new THREE.Color(0xf6f6ef);
    instance.camera = new THREE.PerspectiveCamera(36, 1, 0.001, 10); instance.camera.up.set(0, 0, 1);
    instance.robot = new THREE.Group(); instance.scene.add(instance.robot);
    instance.missingColor = new THREE.Color(0x879386);
    instance.geometries = []; instance.materials = []; instance.nodes = new Map();
    const meshes = new Map();
    Object.entries(assets.model.meshes).forEach(([name, descriptor]) => {
      const decoded = root.JointViewerGeometry.decodeMesh(descriptor, assets.binary);
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(decoded.positions, 3)); geometry.setIndex(new THREE.BufferAttribute(decoded.indices, 1)); geometry.computeVertexNormals();
      instance.geometries.push(geometry); meshes.set(name, geometry);
    });
    const groups = [];
    assets.model.bodies.forEach(body => {
      const group = new THREE.Group(); group.position.fromArray(body.pos);
      const base = new THREE.Quaternion(body.quat[1], body.quat[2], body.quat[3], body.quat[0]).normalize(); group.quaternion.copy(base);
      (body.parent < 0 ? instance.robot : groups[body.parent]).add(group); groups.push(group);
      const materials = [];
      if (body.joint) instance.nodes.set(body.joint.id, { group, base, axis: new THREE.Vector3(...body.joint.axis).normalize(), materials });
      body.geoms.forEach(geom => {
        const rgba = geom.rgba || [0.7, 0.7, 0.7, 1];
        const accent = ['top_head_shell', 'sole_left', 'sole_right'].includes(geom.mesh);
        const color = accent ? new THREE.Color(0xd5a12b) : new THREE.Color(rgba[0], rgba[1], rgba[2]);
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12, side: THREE.DoubleSide });
        material.userData.original = color.clone(); materials.push(material); instance.materials.push(material);
        const mesh = new THREE.Mesh(meshes.get(geom.mesh), material); mesh.position.fromArray(geom.pos); mesh.quaternion.set(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]).normalize();
        mesh.userData.jointId = body.joint?.id ?? null; group.add(mesh);
      });
    });
    const bounds = new THREE.Box3().setFromObject(instance.robot); instance.robot.position.z -= bounds.min.z;
    bounds.setFromObject(instance.robot);
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    instance.defaultView = { yaw: -0.9, pitch: 0.28, radius: Math.max(size.length() * 1.8, 0.5), target: [center.x, center.y, center.z] };
    instance.view = savedCamera ? { ...savedCamera, target: [...savedCamera.target] } : { ...instance.defaultView, target: [...instance.defaultView.target] };
    const grid = new THREE.GridHelper(0.8, 20, 0xc1cabb, 0xe0e4d9); grid.rotation.x = Math.PI / 2; grid.position.z = -0.001; instance.scene.add(grid); instance.geometries.push(grid.geometry); instance.materials.push(...(Array.isArray(grid.material) ? grid.material : [grid.material]));
    const light = new THREE.HemisphereLight(0xffffff, 0xa2a98c, 2); light.position.set(0, 0, 1); instance.scene.add(light);
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, -0.3, 1); instance.scene.add(key);
    instance.stage.append(instance.renderer.domElement);
    instance.container.querySelector('[data-viewer-message]').hidden = true;
    bindGestures(instance); resize(instance); updateCamera(instance); update(instance);
    instance.resizeObserver = new ResizeObserver(() => resize(instance)); instance.resizeObserver.observe(instance.stage);
    if (root.IntersectionObserver) { instance.intersectionObserver = new IntersectionObserver(entries => { instance.visible = entries[0].isIntersecting; if (instance.visible) { resize(instance); schedule(instance); } }); instance.intersectionObserver.observe(instance.stage); }
    root.addEventListener('joint-draft-change', () => update(instance), { signal: instance.abort.signal });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(instance); }, { signal: instance.abort.signal });
  }

  function mount(options) {
    unmount();
    const container = options.container;
    if (!container) return false;
    const instance = { container, stage: container.querySelector('[data-viewer-stage]'), options: { ...options }, abort: new AbortController(), visible: true, disposed: false, frame: 0, renders: 0 };
    active = instance;
    Promise.all([loadEngine(), loadAssets()]).then(([engine, assets]) => {
      if (!instance.disposed) createScene(instance, engine, assets);
    }).catch(error => {
      if (instance.disposed) return;
      disposeGraphics(instance);
      const message = container.querySelector('[data-viewer-message]'); message.hidden = false;
      message.textContent = `3D 无法显示：${error.message}。联调草稿可继续编辑。`;
      container.querySelector('[data-viewer-source]').textContent = '当前没有可显示的 3D 模型；没有发送实机命令。';
      instance.error = error.message;
    });
    return true;
  }

  function disposeGraphics(instance) {
    instance.resizeObserver?.disconnect(); instance.intersectionObserver?.disconnect();
    instance.abort.abort();
    if (instance.frame) cancelAnimationFrame(instance.frame);
    instance.frame = 0;
    instance.geometries?.forEach(geometry => geometry.dispose()); instance.materials?.forEach(material => material.dispose());
    if (instance.renderer) { instance.renderer.dispose(); instance.renderer.forceContextLoss(); instance.renderer.domElement.remove(); }
    instance.renderer = null; instance.nodes = null;
  }

  function unmount() {
    if (!active) return;
    active.disposed = true; disposeGraphics(active); active = null;
  }

  function setContext(options) { if (active) { active.options = { ...active.options, ...options }; update(active); } }
  function snapshot() { return { mounted: !!active, ready: !!active?.renderer, mode, error: active?.error || null, totalRenders: renders, renders: active?.renders || 0, jointIds: active?.nodes ? [...active.nodes.keys()] : [], pose: active?.pose || null, camera: savedCamera ? { ...savedCamera, target: [...savedCamera.target] } : null }; }
  root.JointViewer = Object.freeze({ render, mount, unmount, setContext, update, snapshot });
})(window);
