import './style.css';
import { parseGguf } from './ggufParser.js';
import { parseOnnx } from './onnxParser.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <canvas class="graph-background" id="graph-background" aria-hidden="true"></canvas>
  <div class="app-controls">
    <button
      class="theme-toggle"
      id="theme-toggle"
      type="button"
      aria-pressed="false"
      aria-label="Switch to light theme"
      title="Switch to light theme"
    >
      <span class="theme-toggle-icon" aria-hidden="true">&#9681;</span>
    </button>
    <button
      class="motion-toggle"
      id="motion-toggle"
      type="button"
      aria-pressed="false"
      aria-label="Freeze background motion"
      title="Freeze background motion"
    >
      <span class="motion-toggle-icon" aria-hidden="true">&#10043;</span>
    </button>
  </div>
  <main class="shell">
    <section class="hero">
      <h1>Private AI model inspection directly in your browser.</h1>
      <p class="lede source-link">
        This project is
        <a href="https://github.com/mejustandrew/ai-model-inspector" rel="noreferrer" target="_blank">
          public on GitHub
        </a>
        .
      </p>
      <p class="lede">Your model, your data.</p>
    </section>


    <section class="panel upload-panel">
      <div class="upload-dropzones" id="upload-dropzones">
        <label class="dropzone" for="file-input" id="dropzone">
          <input id="file-input" type="file" accept=".gguf,.onnx,application/octet-stream" multiple />
          <button class="dropzone-remove hidden" id="dropzone-remove" type="button" aria-label="Remove first model">
            X
          </button>
          <span class="dropzone-title">Choose one model file to run simple analysis, or two for direct comparison</span>
          <div class="dropzone-selection hidden" id="dropzone-selection">
            <span class="dropzone-file mono" id="dropzone-file"></span>
          </div>
          <span class="dropzone-copy">or drag and drop it here</span>
        </label>
        <label class="dropzone compare-dropzone hidden" for="compare-file-input" id="compare-dropzone">
          <input id="compare-file-input" type="file" accept=".gguf,.onnx,application/octet-stream" />
          <button class="dropzone-remove hidden" id="compare-dropzone-remove" type="button" aria-label="Remove second model">
            X
          </button>
          <span class="dropzone-title">Add a second model for comparison</span>
          <div class="dropzone-selection hidden" id="compare-dropzone-selection">
            <span class="dropzone-file mono" id="compare-dropzone-file"></span>
          </div>
          <span class="dropzone-copy">or drag and drop it here</span>
        </label>
      </div>
      <div class="upload-feedback">
        <div class="status" id="status">Waiting for a GGUF or ONNX file.</div>
        <div class="hash-status hidden mono" id="dropzone-hash">
          <span class="hash-label">SHA-256:</span>
          <span class="hash-value" id="dropzone-hash-value"></span>
          <button class="hash-cancel hidden" id="hash-cancel" type="button" aria-label="Cancel SHA-256 calculation">
            Cancel
          </button>
        </div>
      </div>
    </section>

    <section class="intro-copy" aria-label="About AI Model Inspector">
      <p class="lede">
        AI Model Inspector is an analyzer for AI models. Drop a <code>.gguf</code> or
        <code>.onnx</code> file to visualize headers, metadata, graph structure, and tensor or
        node indexes without uploading anything to a server.
      </p>
      <p class="lede">
        Review the extracted details in your browser, download the full result as JSON, and
        calculate the model SHA-256 hash on demand when you need a reproducible file fingerprint.
      </p>
    </section>

    <section class="panel hidden collapsible-panel" id="summary-panel" data-collapsed="false">
      <div class="panel-head">
        <div>
          <h2>Summary</h2>
          <p>Quick model details at a glance.</p>
        </div>
        <div class="panel-actions">
          <button
            class="panel-toggle"
            type="button"
            data-panel-toggle
            aria-expanded="true"
            aria-label="Collapse section"
          ></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="summary-grid" id="summary-grid"></div>
      </div>
    </section>

    <section class="panel hidden collapsible-panel" id="compare-panel" data-collapsed="false">
      <div class="panel-head">
        <div>
          <h2>Comparison</h2>
          <p id="compare-subtitle">Common data first, then entries that differ or exist in only one model.</p>
        </div>
        <div class="panel-actions">
          <button
            class="panel-toggle"
            type="button"
            data-panel-toggle
            aria-expanded="true"
            aria-label="Collapse section"
          ></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="summary-grid" id="compare-summary-grid"></div>
        <div class="metadata-table-wrap">
          <table class="metadata-table compare-table">
            <thead>
              <tr>
                <th>Data path</th>
                <th id="compare-left-title">Model A</th>
                <th id="compare-right-title">Model B</th>
              </tr>
            </thead>
            <tbody id="compare-body"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel hidden collapsible-panel" id="metadata-panel" data-collapsed="false">
      <div class="panel-head">
        <div>
          <h2 id="metadata-title">Metadata</h2>
          <p id="metadata-subtitle">Search extracted key-value pairs.</p>
        </div>
        <div class="panel-actions">
          <input id="metadata-filter" type="search" placeholder="Filter by key or value" />
          <button id="download-json" type="button">Download JSON</button>
          <button
            class="panel-toggle"
            type="button"
            data-panel-toggle
            aria-expanded="true"
            aria-label="Collapse section"
          ></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="metadata-table-wrap">
          <table class="metadata-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody id="metadata-body"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel hidden collapsible-panel" id="graph-io-panel" data-collapsed="false">
      <div class="panel-head">
        <div>
          <h2>Graph Inputs & Outputs</h2>
          <p>Model interface as declared by the graph.</p>
        </div>
        <div class="panel-actions">
          <button
            class="panel-toggle"
            type="button"
            data-panel-toggle
            aria-expanded="true"
            aria-label="Collapse section"
          ></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="metadata-table-wrap">
          <table class="metadata-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Name</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody id="graph-io-body"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel hidden collapsible-panel" id="dependency-trace-panel" data-collapsed="false">
      <div class="panel-head">
        <div>
          <h2>Dependency Trace</h2>
          <p id="dependency-trace-subtitle">Full ONNX tensor flow from inputs to outputs.</p>
        </div>
        <div class="panel-actions">
          <div class="trace-mode-control" role="group" aria-label="Dependency trace direction">
            <button class="trace-mode-button" id="trace-forward" type="button" data-active="true">
              Input Graph
            </button>
            <button class="trace-mode-button" id="trace-backward" type="button" data-active="false">
              Output Graph
            </button>
          </div>
          <button
            class="panel-toggle"
            type="button"
            data-panel-toggle
            aria-expanded="true"
            aria-label="Collapse section"
          ></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="trace-stats" id="dependency-trace-stats"></div>
        <div class="trace-canvas-wrap" id="dependency-trace-canvas"></div>
        <div class="metadata-table-wrap">
          <table class="metadata-table trace-summary-table">
            <thead id="dependency-trace-head"></thead>
            <tbody id="dependency-trace-body"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel hidden collapsible-panel" id="detail-panel" data-collapsed="false">
      <div class="panel-head">
        <div>
          <h2 id="detail-title">Tensor Index</h2>
          <p id="detail-subtitle">First 25 tensor descriptors from the file.</p>
        </div>
        <div class="panel-actions">
          <button
            class="panel-toggle"
            type="button"
            data-panel-toggle
            aria-expanded="true"
            aria-label="Collapse section"
          ></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="metadata-table-wrap">
          <table class="metadata-table">
            <thead id="detail-head"></thead>
            <tbody id="detail-body"></tbody>
          </table>
        </div>
      </div>
    </section>

    <p class="app-disclaimer">
      Work in progress. Results may contain mistakes.
    </p>
  </main>
`;

const graphBackground = document.querySelector('#graph-background');
const themeToggle = document.querySelector('#theme-toggle');
const motionToggle = document.querySelector('#motion-toggle');
const fileInput = document.querySelector('#file-input');
const compareFileInput = document.querySelector('#compare-file-input');
const uploadDropzones = document.querySelector('#upload-dropzones');
const dropzone = document.querySelector('#dropzone');
const compareDropzone = document.querySelector('#compare-dropzone');
const dropzoneSelection = document.querySelector('#dropzone-selection');
const dropzoneFile = document.querySelector('#dropzone-file');
const compareDropzoneSelection = document.querySelector('#compare-dropzone-selection');
const compareDropzoneFile = document.querySelector('#compare-dropzone-file');
const dropzoneRemoveButton = document.querySelector('#dropzone-remove');
const compareDropzoneRemoveButton = document.querySelector('#compare-dropzone-remove');
const dropzoneHash = document.querySelector('#dropzone-hash');
const dropzoneHashValue = document.querySelector('#dropzone-hash-value');
const hashCancelButton = document.querySelector('#hash-cancel');
const status = document.querySelector('#status');
const summaryPanel = document.querySelector('#summary-panel');
const summaryGrid = document.querySelector('#summary-grid');
const comparePanel = document.querySelector('#compare-panel');
const compareSubtitle = document.querySelector('#compare-subtitle');
const compareSummaryGrid = document.querySelector('#compare-summary-grid');
const compareLeftTitle = document.querySelector('#compare-left-title');
const compareRightTitle = document.querySelector('#compare-right-title');
const compareBody = document.querySelector('#compare-body');
const metadataPanel = document.querySelector('#metadata-panel');
const metadataTitle = document.querySelector('#metadata-title');
const metadataSubtitle = document.querySelector('#metadata-subtitle');
const metadataBody = document.querySelector('#metadata-body');
const metadataFilter = document.querySelector('#metadata-filter');
const graphIoPanel = document.querySelector('#graph-io-panel');
const graphIoBody = document.querySelector('#graph-io-body');
const dependencyTracePanel = document.querySelector('#dependency-trace-panel');
const dependencyTraceSubtitle = document.querySelector('#dependency-trace-subtitle');
const dependencyTraceStats = document.querySelector('#dependency-trace-stats');
const dependencyTraceCanvas = document.querySelector('#dependency-trace-canvas');
const dependencyTraceHead = document.querySelector('#dependency-trace-head');
const dependencyTraceBody = document.querySelector('#dependency-trace-body');
const traceForwardButton = document.querySelector('#trace-forward');
const traceBackwardButton = document.querySelector('#trace-backward');
const detailPanel = document.querySelector('#detail-panel');
const detailTitle = document.querySelector('#detail-title');
const detailSubtitle = document.querySelector('#detail-subtitle');
const detailHead = document.querySelector('#detail-head');
const detailBody = document.querySelector('#detail-body');
const downloadJsonButton = document.querySelector('#download-json');
const collapsiblePanels = document.querySelectorAll('.collapsible-panel');

let latestResult = null;
let latestFile = null;
let pendingUploadMode = 'replace';
let modelSlots = [null, null];
let uploadPaneSplit = false;
let activeFileToken = 0;
let hashWorker = null;
const COLLAPSIBLE_VALUE_LENGTH = 2000;
const COLLAPSIBLE_ARRAY_LENGTH = 40;
const COLLAPSIBLE_COMPARE_VALUE_LENGTH = 120;
const COPY_RESET_DELAY_MS = 1500;
const GRAPH_CONNECTION_DISTANCE = 140;
const GRAPH_CONNECTION_DISTANCE_SQUARED = GRAPH_CONNECTION_DISTANCE ** 2;
const GRAPH_PARTICLE_AREA = 18000;
const GRAPH_MIN_PARTICLES = 36;
const GRAPH_MAX_PARTICLES = 110;
const GRAPH_MIN_PARTICLE_SPEED = 0.08;
const GRAPH_MAX_PARTICLE_SPEED = 0.24;
const GRAPH_FRAME_INTERVAL = 1000 / 45;
const THEME_STORAGE_KEY = 'ami-theme';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
let activeTraceMode = 'forward';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyTheme(theme, graphController) {
  document.documentElement.dataset.theme = theme;
  graphController?.syncPalette();
}

function updateThemeToggle(button, theme) {
  if (!button) {
    return;
  }

  const isLight = theme === 'light';
  button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  button.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  button.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
}

function setupThemeToggle(button) {
  const systemLightQuery = window.matchMedia('(prefers-color-scheme: light)');
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  let activeTheme = savedTheme || (systemLightQuery.matches ? 'light' : 'dark');

  applyTheme(activeTheme, graphBackgroundController);
  updateThemeToggle(button, activeTheme);

  if (!savedTheme) {
    systemLightQuery.addEventListener('change', (event) => {
      activeTheme = event.matches ? 'light' : 'dark';
      applyTheme(activeTheme, graphBackgroundController);
      updateThemeToggle(button, activeTheme);
    });
  }

  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    activeTheme = activeTheme === 'light' ? 'dark' : 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
    applyTheme(activeTheme, graphBackgroundController);
    updateThemeToggle(button, activeTheme);
  });
}

function setupDynamicGraphBackground(canvas) {
  if (!canvas) {
    return null;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreenQuery = window.matchMedia('(max-width: 720px)');
  const particles = [];
  let width = 0;
  let height = 0;
  let animationFrameId = 0;
  let lastFrameTime = 0;
  let isFrozen = false;
  let particleFillStyle = 'rgba(148, 193, 255, 0.8)';
  let lineColor = '111, 170, 255';

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createParticle() {
    const speed = randomBetween(GRAPH_MIN_PARTICLE_SPEED, GRAPH_MAX_PARTICLE_SPEED);
    const direction = randomBetween(0, Math.PI * 2);

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      radius: randomBetween(1.2, 2.8),
    };
  }

  function syncGraphPalette() {
    const isLightTheme = document.documentElement.dataset.theme === 'light';
    particleFillStyle = isLightTheme ? 'rgba(134, 143, 153, 0.62)' : 'rgba(148, 193, 255, 0.8)';
    lineColor = isLightTheme ? '148, 156, 166' : '111, 170, 255';
  }

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const particleCount = clamp(
      Math.round((width * height) / GRAPH_PARTICLE_AREA),
      GRAPH_MIN_PARTICLES,
      GRAPH_MAX_PARTICLES
    );

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    while (particles.length < particleCount) {
      particles.push(createParticle());
    }

    if (particles.length > particleCount) {
      particles.length = particleCount;
    }
  }

  function updateParticles() {
    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x <= 0 || particle.x >= width) {
        particle.vx *= -1;
        particle.x = clamp(particle.x, 0, width);
      }

      if (particle.y <= 0 || particle.y >= height) {
        particle.vy *= -1;
        particle.y = clamp(particle.y, 0, height);
      }
    }
  }

  function drawGraph() {
    context.clearRect(0, 0, width, height);

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];

      context.beginPath();
      context.fillStyle = particleFillStyle;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();

      for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex += 1) {
        const other = particles[otherIndex];
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared > GRAPH_CONNECTION_DISTANCE_SQUARED) {
          continue;
        }

        const distance = Math.sqrt(distanceSquared);
        const opacity = 1 - distance / GRAPH_CONNECTION_DISTANCE;
        context.beginPath();
        context.strokeStyle = `rgba(${lineColor}, ${opacity * 0.45})`;
        context.lineWidth = opacity * 1.3;
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    }
  }

  function renderFrame() {
    if (smallScreenQuery.matches) {
      context.clearRect(0, 0, width, height);
      return;
    }

    drawGraph();
  }

  function animate(timestamp = 0) {
    if (document.hidden || mediaQuery.matches || smallScreenQuery.matches || isFrozen) {
      renderFrame();
      animationFrameId = 0;
      lastFrameTime = 0;
      return;
    }

    if (lastFrameTime && timestamp - lastFrameTime < GRAPH_FRAME_INTERVAL) {
      animationFrameId = window.requestAnimationFrame(animate);
      return;
    }

    lastFrameTime = timestamp;
    updateParticles();
    drawGraph();
    animationFrameId = window.requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (animationFrameId) {
      return;
    }

    animationFrameId = window.requestAnimationFrame(animate);
  }

  function handleVisibilityChange() {
    if (document.hidden || mediaQuery.matches || smallScreenQuery.matches || isFrozen) {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      lastFrameTime = 0;
      renderFrame();
      return;
    }

    startAnimation();
  }

  resizeCanvas();
  syncGraphPalette();
  renderFrame();
  startAnimation();

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  mediaQuery.addEventListener('change', handleVisibilityChange);
  smallScreenQuery.addEventListener('change', handleVisibilityChange);

  return {
    isFrozen() {
      return isFrozen;
    },
    toggleFrozen() {
      isFrozen = !isFrozen;
      handleVisibilityChange();
      return isFrozen;
    },
    syncPalette() {
      syncGraphPalette();
      renderFrame();
    },
  };
}

function setPanelCollapsed(panel, collapsed) {
  panel.dataset.collapsed = collapsed ? 'true' : 'false';
  const toggleButton = panel.querySelector('[data-panel-toggle]');
  if (toggleButton) {
    toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleButton.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
  }
}

function expandAllPanels() {
  collapsiblePanels.forEach((panel) => {
    setPanelCollapsed(panel, false);
  });
}

function toUserFacingError(error, file) {
  if (error && typeof error === 'object' && 'name' in error) {
    if (error.name === 'NotReadableError') {
      return new Error(
        `The browser could not read "${file.name}". If it is being updated by another app, copy it to a regular local folder and try again.`
      );
    }

    if (error.name === 'AbortError') {
      return new Error(`Reading "${file.name}" was interrupted. Please try again.`);
    }
  }

  return error instanceof Error ? error : new Error('Failed to parse file.');
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.append(textArea);
  textArea.select();

  const succeeded = document.execCommand('copy');
  textArea.remove();

  if (!succeeded) {
    throw new Error('Copy to clipboard is not available in this browser.');
  }
}

function createCopyButton(valueText) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-value-button';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Copy value to clipboard');

  let resetTimerId = null;

  button.addEventListener('click', async () => {
    try {
      await copyText(valueText);
      button.textContent = 'Copied';
      button.dataset.state = 'success';
    } catch (error) {
      button.textContent = 'Failed';
      button.dataset.state = 'error';
    }

    window.clearTimeout(resetTimerId);
    resetTimerId = window.setTimeout(() => {
      button.textContent = 'Copy';
      delete button.dataset.state;
    }, COPY_RESET_DELAY_MS);
  });

  return button;
}

function createSummaryCard(label, value) {
  const card = document.createElement('article');
  card.className = 'summary-card';

  const labelNode = document.createElement('p');
  labelNode.className = 'summary-label';
  labelNode.textContent = label;

  const valueNode = document.createElement('p');
  valueNode.className = 'summary-value';
  valueNode.textContent = value;

  card.append(labelNode, valueNode);
  return card;
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

function setTraceMode(mode) {
  activeTraceMode = mode;
  traceForwardButton.dataset.active = mode === 'forward' ? 'true' : 'false';
  traceBackwardButton.dataset.active = mode === 'backward' ? 'true' : 'false';

  if (latestResult?.kind === 'onnx') {
    renderDependencyTrace(latestResult.graph.dependencyTrace);
  }
}

function resetUploadSelection() {
  dropzoneFile.textContent = '';
  compareDropzoneFile.textContent = '';
  dropzoneHashValue.textContent = '';
  dropzoneSelection.classList.add('hidden');
  compareDropzoneSelection.classList.add('hidden');
  dropzoneRemoveButton.classList.add('hidden');
  compareDropzoneRemoveButton.classList.add('hidden');
  dropzoneHash.classList.add('hidden');
  setCompareDropzoneVisible(false);
  hashCancelButton.classList.add('hidden');
  dropzoneHashValue.removeAttribute('role');
  dropzoneHashValue.removeAttribute('tabindex');
  dropzoneHashValue.removeAttribute('aria-disabled');
  dropzoneHashValue.classList.remove('hash-action-text');
}

function setCompareDropzoneVisible(visible) {
  uploadPaneSplit = visible;
  compareDropzone.classList.toggle('hidden', !visible);
  uploadDropzones.classList.toggle('has-compare-dropzone', visible);
  fileInput.multiple = !visible;
}

function setUploadSlot(index, file, result) {
  modelSlots[index] = file && result ? { file, result } : null;
}

function resetUploadSlots() {
  modelSlots = [null, null];
}

function renderSlotSelections(showCompare = false) {
  const leftFile = modelSlots[0]?.file;
  const rightFile = modelSlots[1]?.file;

  dropzoneFile.textContent = leftFile ? leftFile.name : '';
  dropzoneSelection.classList.toggle('hidden', !leftFile);
  dropzoneRemoveButton.classList.toggle('hidden', !leftFile);
  compareDropzoneFile.textContent = rightFile ? rightFile.name : '';
  compareDropzoneSelection.classList.toggle('hidden', !rightFile);
  compareDropzoneRemoveButton.classList.toggle('hidden', !rightFile);
  setCompareDropzoneVisible(showCompare || Boolean(rightFile));
}

function renderUploadSelection(files, hashState = { phase: 'idle' }) {
  const selectedFiles = Array.isArray(files) ? files : [files];
  dropzoneFile.textContent = selectedFiles[0]?.name || '';
  dropzoneRemoveButton.classList.toggle('hidden', !modelSlots[0]);
  compareDropzoneFile.textContent = selectedFiles[1]?.name || modelSlots[1]?.file.name || '';
  compareDropzoneSelection.classList.toggle('hidden', !compareDropzoneFile.textContent);
  compareDropzoneRemoveButton.classList.toggle('hidden', !modelSlots[1]);
  setCompareDropzoneVisible(uploadPaneSplit || selectedFiles.length > 1 || Boolean(modelSlots[1]));

  if (selectedFiles.length !== 1) {
    dropzoneHash.classList.add('hidden');
    hashCancelButton.classList.add('hidden');
    dropzoneSelection.classList.remove('hidden');
    return;
  }

  dropzoneHash.classList.remove('hidden');
  dropzoneHashValue.removeAttribute('aria-disabled');

  switch (hashState.phase) {
    case 'ready':
      dropzoneHashValue.textContent = 'Click to calculate';
      hashCancelButton.classList.add('hidden');
      dropzoneHashValue.setAttribute('role', 'button');
      dropzoneHashValue.setAttribute('tabindex', '0');
      dropzoneHashValue.classList.add('hash-action-text');
      break;
    case 'hashing':
      dropzoneHashValue.textContent = `calculating... ${hashState.progressText}`;
      hashCancelButton.classList.remove('hidden');
      dropzoneHashValue.removeAttribute('role');
      dropzoneHashValue.removeAttribute('tabindex');
      dropzoneHashValue.setAttribute('aria-disabled', 'true');
      dropzoneHashValue.classList.remove('hash-action-text');
      break;
    case 'complete':
      dropzoneHashValue.textContent = hashState.value;
      hashCancelButton.classList.add('hidden');
      dropzoneHashValue.removeAttribute('role');
      dropzoneHashValue.removeAttribute('tabindex');
      dropzoneHashValue.classList.remove('hash-action-text');
      break;
    case 'error':
      dropzoneHashValue.textContent = `unavailable: ${hashState.message}`;
      hashCancelButton.classList.add('hidden');
      dropzoneHashValue.setAttribute('role', 'button');
      dropzoneHashValue.setAttribute('tabindex', '0');
      dropzoneHashValue.classList.add('hash-action-text');
      break;
    default:
      dropzoneHashValue.textContent = 'Click to calculate';
      hashCancelButton.classList.add('hidden');
      dropzoneHashValue.setAttribute('role', 'button');
      dropzoneHashValue.setAttribute('tabindex', '0');
      dropzoneHashValue.classList.add('hash-action-text');
      break;
  }

  dropzoneSelection.classList.remove('hidden');
}

function terminateHashWorker() {
  if (!hashWorker) {
    return;
  }

  hashWorker.terminate();
  hashWorker = null;
}

function formatHashProgress(processedBytes, totalBytes) {
  if (!totalBytes) {
    return '0%';
  }

  const percent = Math.max(0, Math.min(100, (processedBytes / totalBytes) * 100));
  return `${percent.toFixed(percent >= 10 || percent === 0 ? 0 : 1)}%`;
}

function startHashing(file, fileToken, result) {
  terminateHashWorker();
  hashWorker = new Worker(new URL('./hashWorker.js', import.meta.url), { type: 'module' });

  hashWorker.onmessage = (event) => {
    if (fileToken !== activeFileToken) {
      return;
    }

    const message = event.data ?? {};

    if (message.type === 'progress') {
      renderUploadSelection(file, {
        phase: 'hashing',
        progressText: formatHashProgress(message.processedBytes, message.totalBytes),
      });
      return;
    }

    if (message.type === 'complete') {
      result.fileHash = {
        algorithm: message.algorithm,
        value: message.value,
      };
      renderUploadSelection(file, { phase: 'complete', value: message.value });
      terminateHashWorker();
      return;
    }

    if (message.type === 'error') {
      renderUploadSelection(file, { phase: 'error', message: message.message });
      terminateHashWorker();
    }
  };

  hashWorker.onerror = () => {
    if (fileToken !== activeFileToken) {
      return;
    }

    renderUploadSelection(file, {
      phase: 'error',
      message: 'The browser could not start the hashing worker.',
    });
    terminateHashWorker();
  };

  renderUploadSelection(file, { phase: 'hashing', progressText: '0%' });
  hashWorker.postMessage({ type: 'hash', file });
}

function renderSummary(result, file) {
  summaryGrid.innerHTML = '';

  const cards =
    result.kind === 'gguf'
      ? [
          ['Format', 'GGUF'],
          ['File', file.name],
          ['Version', String(result.header.version)],
          ['Metadata entries', String(result.header.metadataCount)],
          ['Tensor count', String(result.header.tensorCount)],
          ['Parsed bytes', result.header.bytesRead.toLocaleString()],
          ['File size', file.size.toLocaleString()],
        ]
      : [
          ['Format', 'ONNX'],
          ['File', file.name],
          ['IR version', result.header.irVersion],
          ['Opsets', String(result.header.opsetCount)],
          ['Metadata entries', String(result.header.metadataCount)],
          ['Inputs', String(result.header.inputCount)],
          ['Outputs', String(result.header.outputCount)],
          ['Nodes', String(result.header.nodeCount)],
          ['Initializers', String(result.header.initializerCount)],
          ['File size', file.size.toLocaleString()],
        ];

  cards.forEach(([label, value]) => {
    summaryGrid.append(createSummaryCard(label, value));
  });

  summaryPanel.classList.remove('hidden');
}

function renderMetadata(entries) {
  const filter = metadataFilter.value.trim().toLowerCase();
  metadataBody.innerHTML = '';

  const visibleEntries = entries.filter((entry) => {
    if (!filter) {
      return true;
    }

    const valueText = formatValue(entry.value).toLowerCase();
    return entry.key.toLowerCase().includes(filter) || valueText.includes(filter);
  });

  for (const entry of visibleEntries) {
    const row = document.createElement('tr');

    const keyCell = document.createElement('td');
    keyCell.className = 'mono';
    keyCell.textContent = entry.key;

    const typeCell = document.createElement('td');
    typeCell.textContent = entry.arrayElementTypeName
      ? `${entry.valueTypeName}<${entry.arrayElementTypeName}>`
      : entry.valueTypeName;

    const valueCell = document.createElement('td');
    valueCell.className = 'value-cell';
    const valueText = formatValue(entry.value);
    const shouldCollapse =
      valueText.length >= COLLAPSIBLE_VALUE_LENGTH ||
      (Array.isArray(entry.value) && entry.value.length >= COLLAPSIBLE_ARRAY_LENGTH);
    const valueContent = document.createElement('div');
    valueContent.className = 'value-content';
    const copyButton = createCopyButton(valueText);

    if (shouldCollapse) {
      const details = document.createElement('details');
      details.className = 'value-details';

      const summary = document.createElement('summary');
      summary.className = 'value-summary';
      summary.textContent = `Show value (${valueText.length.toLocaleString()} chars)`;

      const pre = document.createElement('pre');
      pre.textContent = valueText;

      details.append(summary, pre);
      valueContent.append(details);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = valueText;
      valueContent.append(pre);
    }

    valueCell.append(valueContent, copyButton);
    row.append(keyCell, typeCell, valueCell);
    metadataBody.append(row);
  }

  metadataPanel.classList.remove('hidden');
}

function renderGraphIo(items) {
  graphIoBody.innerHTML = '';

  for (const item of items) {
    const row = document.createElement('tr');

    const directionCell = document.createElement('td');
    directionCell.textContent = item.direction;

    const nameCell = document.createElement('td');
    nameCell.className = 'mono';
    nameCell.textContent = item.name;

    const typeCell = document.createElement('td');
    const pre = document.createElement('pre');
    pre.textContent = item.typeDescription || 'unknown';
    typeCell.append(pre);

    row.append(directionCell, nameCell, typeCell);
    graphIoBody.append(row);
  }

  graphIoPanel.classList.remove('hidden');
}

function getTraceNodeLabel(node) {
  return node.domain ? `${node.domain}::${node.opType}` : node.opType;
}

function getTensorKindClass(kind) {
  return String(kind || 'Intermediate').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function appendTraceText(parent, text, x, y, className) {
  const textNode = createSvgElement('text', { x, y, class: className });
  textNode.textContent = text;
  parent.append(textNode);
  return textNode;
}

function renderDependencyTraceGraph(traceData, mode) {
  dependencyTraceCanvas.innerHTML = '';

  if (!traceData) {
    return;
  }

  const trace = mode === 'forward' ? traceData.forward : traceData.backward;
  const nodeById = new Map(traceData.nodes.map((node) => [node.id, node]));
  const tensorByName = new Map(traceData.tensors.map((tensor) => [tensor.name, tensor]));
  const graphItems = [];

  for (const tensorName of trace.tensorNames) {
    graphItems.push({
      id: `tensor:${tensorName}`,
      kind: 'tensor',
      name: tensorName,
      depth: trace.tensorDepths[tensorName] ?? 0,
      tensor: tensorByName.get(tensorName),
    });
  }

  for (const nodeId of trace.nodeIds) {
    graphItems.push({
      id: `node:${nodeId}`,
      kind: 'node',
      nodeId,
      depth: trace.nodeDepths[String(nodeId)] ?? 0,
      node: nodeById.get(nodeId),
    });
  }

  if (graphItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'trace-empty';
    empty.textContent = 'No dependency trace was found in this ONNX graph.';
    dependencyTraceCanvas.append(empty);
    return;
  }

  const layers = new Map();
  for (const item of graphItems) {
    if (!layers.has(item.depth)) {
      layers.set(item.depth, []);
    }
    layers.get(item.depth).push(item);
  }

  const sortedDepths = Array.from(layers.keys()).sort((left, right) => left - right);
  const positions = new Map();
  const columnWidth = 260;
  const rowHeight = 86;
  const nodeWidth = 190;
  const nodeHeight = 54;
  let maxLayerSize = 1;

  for (const depth of sortedDepths) {
    const layer = layers.get(depth).sort((left, right) => {
      const leftLabel = left.kind === 'node' ? left.node?.label || '' : left.name;
      const rightLabel = right.kind === 'node' ? right.node?.label || '' : right.name;
      return leftLabel.localeCompare(rightLabel);
    });
    maxLayerSize = Math.max(maxLayerSize, layer.length);

    layer.forEach((item, index) => {
      positions.set(item.id, {
        x: 40 + sortedDepths.indexOf(depth) * columnWidth,
        y: 36 + index * rowHeight,
      });
    });
  }

  const width = Math.max(720, 80 + sortedDepths.length * columnWidth);
  const height = Math.max(280, 76 + maxLayerSize * rowHeight);
  const svg = createSvgElement('svg', {
    class: 'trace-svg',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    'aria-label': mode === 'forward' ? 'Input dependency graph' : 'Output dependency graph',
  });

  const defs = createSvgElement('defs');
  const marker = createSvgElement('marker', {
    id: `trace-arrow-${mode}`,
    markerWidth: 10,
    markerHeight: 10,
    refX: 8,
    refY: 3,
    orient: 'auto',
    markerUnits: 'strokeWidth',
  });
  marker.append(createSvgElement('path', { d: 'M0,0 L0,6 L9,3 z', class: 'trace-arrow' }));
  defs.append(marker);
  svg.append(defs);

  const edgeLayer = createSvgElement('g', { class: 'trace-edges' });
  const itemLayer = createSvgElement('g', { class: 'trace-items' });
  svg.append(edgeLayer, itemLayer);

  for (const edge of trace.edges) {
    const fromId = `${edge.fromType}:${edge.from}`;
    const toId = `${edge.toType}:${edge.to}`;
    const from = positions.get(fromId);
    const to = positions.get(toId);

    if (!from || !to) {
      continue;
    }

    const fromX = from.x + nodeWidth;
    const fromY = from.y + nodeHeight / 2;
    const toX = to.x;
    const toY = to.y + nodeHeight / 2;
    const midX = fromX + Math.max(36, (toX - fromX) / 2);
    const path = createSvgElement('path', {
      d: `M${fromX},${fromY} C${midX},${fromY} ${midX},${toY} ${toX},${toY}`,
      class: 'trace-edge',
      'marker-end': `url(#trace-arrow-${mode})`,
    });
    edgeLayer.append(path);
  }

  for (const item of graphItems) {
    const position = positions.get(item.id);
    if (!position) {
      continue;
    }

    const group = createSvgElement('g', {
      class:
        item.kind === 'node'
          ? 'trace-item trace-item-node'
          : `trace-item trace-item-tensor trace-item-${getTensorKindClass(item.tensor?.kind)}`,
      transform: `translate(${position.x}, ${position.y})`,
    });
    group.append(createSvgElement('rect', { width: nodeWidth, height: nodeHeight, rx: 8 }));

    if (item.kind === 'node') {
      appendTraceText(group, getTraceNodeLabel(item.node || {}), 12, 22, 'trace-item-title');
      appendTraceText(group, item.node?.label || `Node #${item.nodeId + 1}`, 12, 40, 'trace-item-subtitle');
    } else {
      appendTraceText(group, item.tensor?.kind || 'Tensor', 12, 20, 'trace-item-title');
      appendTraceText(group, item.name, 12, 39, 'trace-item-subtitle');
    }

    itemLayer.append(group);
  }

  dependencyTraceCanvas.append(svg);
}

function renderDependencyTraceTable(traceData, mode) {
  dependencyTraceHead.innerHTML = '';
  dependencyTraceBody.innerHTML = '';

  const headRow = document.createElement('tr');
  const headers =
    mode === 'forward'
      ? ['Output', 'Upstream inputs', 'Initializers', 'Nodes', 'Ops']
      : ['Input', 'Downstream outputs', 'Initializers', 'Nodes', 'Ops'];

  for (const label of headers) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  }
  dependencyTraceHead.append(headRow);

  const summaries = mode === 'forward' ? traceData.outputSummaries : traceData.inputSummaries;

  for (const summary of summaries) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'mono';
    nameCell.textContent = summary.name;

    const connectedCell = document.createElement('td');
    const connectedPre = document.createElement('pre');
    connectedPre.textContent = summary.connectedStarts.join('\n') || '(none)';
    connectedCell.append(connectedPre);

    const initializerCell = document.createElement('td');
    const initializerPre = document.createElement('pre');
    initializerPre.textContent = summary.initializerNames.join('\n') || '(none)';
    initializerCell.append(initializerPre);

    const nodesCell = document.createElement('td');
    nodesCell.textContent = `${summary.nodeCount.toLocaleString()} nodes, depth ${summary.maxDepth}`;

    const opCell = document.createElement('td');
    const opPre = document.createElement('pre');
    opPre.textContent = summary.opTypes.join(', ') || '(none)';
    opCell.append(opPre);

    row.append(nameCell, connectedCell, initializerCell, nodesCell, opCell);
    dependencyTraceBody.append(row);
  }
}

function renderDependencyTraceStats(traceData, mode) {
  const trace = mode === 'forward' ? traceData.forward : traceData.backward;
  const stats =
    mode === 'forward'
      ? [
          ['Mode', 'Input graph'],
          ['Starts', traceData.graphInputNames.length.toLocaleString()],
          ['Reached outputs', traceData.outputSummaries.filter((item) => item.isReachableInFullTrace).length.toLocaleString()],
          ['Nodes', trace.nodeIds.length.toLocaleString()],
          ['Tensors', trace.tensorNames.length.toLocaleString()],
          ['Edges', trace.edges.length.toLocaleString()],
        ]
      : [
          ['Mode', 'Output graph'],
          ['Starts', traceData.graphOutputNames.length.toLocaleString()],
          ['Reached inputs', traceData.inputSummaries.filter((item) => item.isReachableInFullTrace).length.toLocaleString()],
          ['Nodes', trace.nodeIds.length.toLocaleString()],
          ['Tensors', trace.tensorNames.length.toLocaleString()],
          ['Edges', trace.edges.length.toLocaleString()],
        ];

  dependencyTraceStats.innerHTML = '';
  for (const [label, value] of stats) {
    const item = document.createElement('div');
    item.className = 'trace-stat';
    const labelNode = document.createElement('span');
    labelNode.className = 'trace-stat-label';
    labelNode.textContent = label;
    const valueNode = document.createElement('strong');
    valueNode.textContent = value;
    item.append(labelNode, valueNode);
    dependencyTraceStats.append(item);
  }
}

function renderDependencyTrace(traceData) {
  if (!traceData) {
    dependencyTracePanel.classList.add('hidden');
    return;
  }

  dependencyTraceSubtitle.textContent =
    activeTraceMode === 'forward'
      ? 'Forward dependency trace from declared graph inputs toward model outputs.'
      : 'Backward dependency trace from declared graph outputs toward model inputs.';
  renderDependencyTraceStats(traceData, activeTraceMode);
  renderDependencyTraceGraph(traceData, activeTraceMode);
  renderDependencyTraceTable(traceData, activeTraceMode);
  dependencyTracePanel.classList.remove('hidden');
}

function setDetailTableHeaders(labels) {
  detailHead.innerHTML = '';
  const row = document.createElement('tr');

  labels.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    row.append(th);
  });

  detailHead.append(row);
}

function renderGgufTensors(tensors) {
  detailBody.innerHTML = '';
  detailTitle.textContent = 'Tensor Index';
  detailSubtitle.textContent = 'First 25 tensor descriptors from the file.';
  setDetailTableHeaders(['Name', 'Dimensions', 'GGML Type', 'Offset']);

  const preview = tensors.slice(0, 25);

  for (const tensor of preview) {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.className = 'mono';
    nameCell.textContent = tensor.name;

    const dimensionsCell = document.createElement('td');
    dimensionsCell.textContent = tensor.dimensions.join(' x ') || 'scalar';

    const typeCell = document.createElement('td');
    typeCell.textContent = String(tensor.ggmlType);

    const offsetCell = document.createElement('td');
    offsetCell.className = 'mono';
    offsetCell.textContent = tensor.offset;

    row.append(nameCell, dimensionsCell, typeCell, offsetCell);
    detailBody.append(row);
  }

  detailPanel.classList.remove('hidden');
}

function renderOnnxNodes(nodes) {
  detailBody.innerHTML = '';
  detailTitle.textContent = 'Graph Nodes';
  detailSubtitle.textContent = 'First 50 nodes from the ONNX graph.';
  setDetailTableHeaders(['Name', 'Op Type', 'Inputs', 'Outputs']);

  const preview = nodes.slice(0, 50);

  for (const node of preview) {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.className = 'mono';
    nameCell.textContent = node.name || '(unnamed)';

    const opTypeCell = document.createElement('td');
    opTypeCell.textContent = node.domain ? `${node.domain}::${node.opType}` : node.opType;

    const inputsCell = document.createElement('td');
    const inputPre = document.createElement('pre');
    inputPre.textContent = node.inputs.join('\n') || '(none)';
    inputsCell.append(inputPre);

    const outputsCell = document.createElement('td');
    const outputPre = document.createElement('pre');
    outputPre.textContent = node.outputs.join('\n') || '(none)';
    outputsCell.append(outputPre);

    row.append(nameCell, opTypeCell, inputsCell, outputsCell);
    detailBody.append(row);
  }

  detailPanel.classList.remove('hidden');
}

function addComparableValue(entries, path, value) {
  entries.set(path, formatValue(value));
}

function addComparableList(entries, path, values) {
  entries.set(path, values.length ? values.join('\n') : '(none)');
}

function flattenComparableData(result, file) {
  const entries = new Map();

  addComparableValue(entries, 'file.name', file.name);
  addComparableValue(entries, 'file.size', file.size);
  addComparableValue(entries, 'format', result.kind.toUpperCase());

  Object.entries(result.header).forEach(([key, value]) => {
    addComparableValue(entries, `header.${key}`, value);
  });

  result.metadataEntries.forEach((entry) => {
    addComparableValue(entries, `metadata.${entry.key}`, entry.value);
  });

  if (result.kind === 'gguf') {
    result.tensors.forEach((tensor, index) => {
      const tensorPath = `tensors.${tensor.name || `#${index + 1}`}`;
      addComparableList(entries, `${tensorPath}.dimensions`, tensor.dimensions.map(String));
      addComparableValue(entries, `${tensorPath}.ggmlType`, tensor.ggmlType);
      addComparableValue(entries, `${tensorPath}.offset`, tensor.offset);
    });
    return entries;
  }

  addComparableValue(entries, 'graph.name', result.graph.name || '(unnamed)');

  result.graph.interface.forEach((item) => {
    const direction = item.direction.toLowerCase();
    const itemPath = `graph.${direction}.${item.name}`;
    addComparableValue(entries, `${itemPath}.type`, item.typeDescription || 'unknown');
  });

  result.graph.nodes.forEach((node, index) => {
    const nodePath = `graph.nodes.${node.name || `#${index + 1}`}`;
    addComparableValue(entries, `${nodePath}.opType`, node.domain ? `${node.domain}::${node.opType}` : node.opType);
    addComparableList(entries, `${nodePath}.inputs`, node.inputs);
    addComparableList(entries, `${nodePath}.outputs`, node.outputs);
  });

  return entries;
}

function buildComparisonRows(leftResult, leftFile, rightResult, rightFile) {
  const leftEntries = flattenComparableData(leftResult, leftFile);
  const rightEntries = flattenComparableData(rightResult, rightFile);
  const paths = Array.from(new Set([...leftEntries.keys(), ...rightEntries.keys()]));

  return paths.map((path) => {
    const leftHasValue = leftEntries.has(path);
    const rightHasValue = rightEntries.has(path);
    const leftValue = leftEntries.get(path) || '';
    const rightValue = rightEntries.get(path) || '';
    let statusKey = 'changed';
    let statusLabel = 'Different';

    if (leftHasValue && rightHasValue && leftValue === rightValue) {
      statusKey = 'common';
      statusLabel = 'Common';
    } else if (leftHasValue && !rightHasValue) {
      statusKey = 'left-only';
      statusLabel = 'Only in A';
    } else if (!leftHasValue && rightHasValue) {
      statusKey = 'right-only';
      statusLabel = 'Only in B';
    }

    return {
      path,
      leftValue,
      rightValue,
      statusKey,
      statusLabel,
    };
  }).sort((left, right) => {
    const leftPresenceOrder =
      left.statusKey === 'common' || left.statusKey === 'changed' ? 0 : 1;
    const rightPresenceOrder =
      right.statusKey === 'common' || right.statusKey === 'changed' ? 0 : 1;

    return leftPresenceOrder - rightPresenceOrder || left.path.localeCompare(right.path);
  });
}

function appendCompareValueCell(row, value, statusKey) {
  const cell = document.createElement('td');
  cell.className = `compare-value-cell compare-value-cell-${statusKey}`;
  const valueText = value || '-';
  const lineCount = valueText.split('\n').length;
  const shouldCollapse = lineCount > 1 || valueText.length > COLLAPSIBLE_COMPARE_VALUE_LENGTH;

  if (shouldCollapse) {
    const details = document.createElement('details');
    details.className = 'value-details compare-value-details';

    const summary = document.createElement('summary');
    summary.className = 'value-summary';
    summary.textContent =
      lineCount > 1
        ? `Show value (${lineCount.toLocaleString()} lines)`
        : `Show value (${valueText.length.toLocaleString()} chars)`;

    const pre = document.createElement('pre');
    pre.textContent = valueText;

    details.append(summary, pre);
    cell.append(details);
    row.append(cell);
    return;
  }

  const pre = document.createElement('pre');
  pre.textContent = valueText;
  cell.append(pre);
  row.append(cell);
}

function renderComparison(leftResult, leftFile, rightResult, rightFile) {
  const rows = buildComparisonRows(leftResult, leftFile, rightResult, rightFile);
  const commonCount = rows.filter((row) => row.statusKey === 'common').length;
  const changedCount = rows.filter((row) => row.statusKey === 'changed').length;
  const leftOnlyCount = rows.filter((row) => row.statusKey === 'left-only').length;
  const rightOnlyCount = rows.filter((row) => row.statusKey === 'right-only').length;

  compareSubtitle.textContent = `${leftFile.name} compared with ${rightFile.name}.`;
  compareLeftTitle.textContent = leftFile.name;
  compareRightTitle.textContent = rightFile.name;
  compareSummaryGrid.innerHTML = '';
  compareBody.innerHTML = '';

  [
    ['Common entries', commonCount.toLocaleString()],
    ['Different values', changedCount.toLocaleString()],
    [`Only in ${leftFile.name}`, leftOnlyCount.toLocaleString()],
    [`Only in ${rightFile.name}`, rightOnlyCount.toLocaleString()],
  ].forEach(([label, value]) => {
    compareSummaryGrid.append(createSummaryCard(label, value));
  });

  for (const item of rows) {
    const row = document.createElement('tr');
    row.dataset.compareStatus = item.statusKey;

    const pathCell = document.createElement('td');
    pathCell.className = 'mono';
    pathCell.textContent = item.path;

    row.append(pathCell);
    appendCompareValueCell(row, item.leftValue, item.statusKey);
    appendCompareValueCell(row, item.rightValue, item.statusKey);
    compareBody.append(row);
  }

  comparePanel.classList.remove('hidden');
}

function resetPanels() {
  expandAllPanels();
  summaryPanel.classList.add('hidden');
  comparePanel.classList.add('hidden');
  metadataPanel.classList.add('hidden');
  graphIoPanel.classList.add('hidden');
  dependencyTracePanel.classList.add('hidden');
  detailPanel.classList.add('hidden');
}

function renderResult(result, file) {
  renderSummary(result, file);

  metadataTitle.textContent = result.kind === 'gguf' ? 'Metadata' : 'Model Properties';
  metadataSubtitle.textContent =
    result.kind === 'gguf'
      ? 'Search extracted key-value pairs.'
      : 'Search model properties and ONNX metadata.';
  renderMetadata(result.metadataEntries);

  if (result.kind === 'gguf') {
    graphIoPanel.classList.add('hidden');
    renderGgufTensors(result.tensors);
    return;
  }

  renderGraphIo(result.graph.interface);
  renderDependencyTrace(result.graph.dependencyTrace);
  renderOnnxNodes(result.graph.nodes);
}

async function parseModelFile(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.gguf')) {
    return parseGguf(file);
  }

  if (lowerName.endsWith('.onnx')) {
    return parseOnnx(file);
  }

  throw new Error('Unsupported file type. Please choose a .gguf or .onnx file.');
}

function getSupportedModelFormat(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.gguf')) {
    return 'gguf';
  }

  if (lowerName.endsWith('.onnx')) {
    return 'onnx';
  }

  return null;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.state = isError ? 'error' : 'normal';
}

function getReadyHashState(result) {
  return result.fileHash
    ? { phase: 'complete', value: result.fileHash }
    : { phase: 'ready' };
}

function resetActiveModelState() {
  latestResult = null;
  latestFile = null;
  resetUploadSlots();
}

function resetFileInput() {
  fileInput.value = '';
  compareFileInput.value = '';
  pendingUploadMode = 'replace';
  fileInput.multiple = !uploadDropzones.classList.contains('has-compare-dropzone');
}

function renderSingleModelState(slot, removedFileName = '') {
  terminateHashWorker();
  resetUploadSlots();
  latestResult = slot.result;
  latestFile = slot.file;
  setUploadSlot(0, slot.file, slot.result);
  uploadPaneSplit = false;
  renderUploadSelection(slot.file, getReadyHashState(slot.result));
  resetPanels();
  renderResult(slot.result, slot.file);
  setStatus(
    removedFileName
      ? `Removed ${removedFileName}. Showing ${slot.file.name}.`
      : `Showing ${slot.file.name}.`
  );
  resetFileInput();
}

function removeUploadSlot(slotIndex) {
  const removedSlot = modelSlots[slotIndex];
  if (!removedSlot) {
    return;
  }

  const remainingSlot = modelSlots[slotIndex === 0 ? 1 : 0];

  if (remainingSlot) {
    renderSingleModelState(remainingSlot, removedSlot.file.name);
    return;
  }

  terminateHashWorker();
  resetActiveModelState();
  resetUploadSelection();
  resetPanels();
  setStatus('Waiting for a GGUF or ONNX file.');
  resetFileInput();
}

async function handleSlotReplacement(file, slotIndex) {
  const otherSlot = modelSlots[slotIndex === 0 ? 1 : 0];
  const nextFormat = getSupportedModelFormat(file);

  if (!nextFormat) {
    setStatus('Unsupported file type. Please choose a .gguf or .onnx file.', true);
    resetFileInput();
    return;
  }

  if (slotIndex === 1 && !modelSlots[0]) {
    setStatus('Choose a first model before adding a comparison model.', true);
    resetFileInput();
    return;
  }

  if (otherSlot && getSupportedModelFormat(otherSlot.file) !== nextFormat) {
    setStatus('Comparison requires two models of the same format: two GGUF files or two ONNX files.', true);
    resetFileInput();
    return;
  }

  const fileToken = activeFileToken + 1;
  activeFileToken = fileToken;
  terminateHashWorker();
  dropzoneHash.classList.add('hidden');
  hashCancelButton.classList.add('hidden');

  if (slotIndex === 0) {
    dropzoneFile.textContent = file.name;
    dropzoneSelection.classList.remove('hidden');
  } else {
    compareDropzoneFile.textContent = file.name;
    compareDropzoneSelection.classList.remove('hidden');
  }

  setCompareDropzoneVisible(true);
  setStatus(`Reading ${file.name}...`);

  try {
    const result = await parseModelFile(file);
    if (fileToken !== activeFileToken) {
      return;
    }

    if (otherSlot && otherSlot.result.kind !== result.kind) {
      throw new Error('Comparison requires two models of the same parsed format.');
    }

    setUploadSlot(slotIndex, file, result);
    renderSlotSelections(true);
    resetPanels();

    if (modelSlots[0] && modelSlots[1]) {
      latestResult = null;
      latestFile = null;
      renderComparison(modelSlots[0].result, modelSlots[0].file, modelSlots[1].result, modelSlots[1].file);
      setStatus(`Compared ${modelSlots[0].file.name} with ${modelSlots[1].file.name}.`);
      return;
    }

    latestResult = result;
    latestFile = file;
    renderResult(result, file);

    if (result.kind === 'gguf') {
      setStatus(`Parsed ${result.header.metadataCount} metadata entries from ${file.name}.`);
    } else {
      setStatus(
        `Parsed ${result.header.nodeCount} graph nodes and ${result.header.metadataCount} metadata entries from ${file.name}.`
      );
    }
  } catch (error) {
    if (fileToken !== activeFileToken) {
      return;
    }

    renderSlotSelections(true);
    setStatus(toUserFacingError(error, file).message, true);
  } finally {
    resetFileInput();
  }
}

async function handleFiles(files, mode = 'replace') {
  const selectedFiles = Array.from(files).filter(Boolean);

  if (selectedFiles.length === 0) {
    resetFileInput();
    return;
  }

  if (mode === 'replace-left' || mode === 'replace-right') {
    if (selectedFiles.length !== 1) {
      setStatus('Choose one model for this pane.', true);
      resetFileInput();
      return;
    }

    await handleSlotReplacement(selectedFiles[0], mode === 'replace-left' ? 0 : 1);
    return;
  }

  if (selectedFiles.length > 2) {
    resetActiveModelState();
    terminateHashWorker();
    resetUploadSelection();
    resetPanels();
    setStatus('Please choose one model to inspect or two models to compare.', true);
    resetFileInput();
    return;
  }

  const formats = selectedFiles.map(getSupportedModelFormat);
  if (formats.some((format) => !format)) {
    resetActiveModelState();
    terminateHashWorker();
    resetUploadSelection();
    resetPanels();
    setStatus('Unsupported file type. Please choose .gguf or .onnx files.', true);
    resetFileInput();
    return;
  }

  if (new Set(formats).size > 1) {
    resetActiveModelState();
    terminateHashWorker();
    resetUploadSelection();
    resetPanels();
    setStatus('Comparison requires two models of the same format: two GGUF files or two ONNX files.', true);
    resetFileInput();
    return;
  }

  const fileToken = activeFileToken + 1;
  activeFileToken = fileToken;
  terminateHashWorker();
  latestFile = selectedFiles.length === 1 ? selectedFiles[0] : null;
  renderUploadSelection(selectedFiles, { phase: 'ready' });
  setStatus(
    selectedFiles.length === 1
      ? `Reading ${selectedFiles[0].name}...`
      : `Reading ${selectedFiles[0].name} and ${selectedFiles[1].name}...`
  );

  try {
    const results = await Promise.all(selectedFiles.map((file) => parseModelFile(file)));
    if (fileToken !== activeFileToken) {
      return;
    }

    resetPanels();

    if (results.length === 1) {
      const [result] = results;
      const [file] = selectedFiles;
      latestResult = result;
      latestFile = file;
      setUploadSlot(0, file, result);
      setUploadSlot(1, null, null);
      renderResult(result, file);
      renderSlotSelections(true);

      if (result.kind === 'gguf') {
        setStatus(`Parsed ${result.header.metadataCount} metadata entries from ${file.name}.`);
      } else {
        setStatus(
          `Parsed ${result.header.nodeCount} graph nodes and ${result.header.metadataCount} metadata entries from ${file.name}.`
        );
      }

      return;
    }

    const [leftResult, rightResult] = results;
    if (leftResult.kind !== rightResult.kind) {
      throw new Error('Comparison requires two models of the same parsed format.');
    }

    latestResult = null;
    latestFile = null;
    setUploadSlot(0, selectedFiles[0], leftResult);
    setUploadSlot(1, selectedFiles[1], rightResult);
    renderSlotSelections(true);
    renderComparison(leftResult, selectedFiles[0], rightResult, selectedFiles[1]);
    setStatus(`Compared ${selectedFiles[0].name} with ${selectedFiles[1].name}.`);
  } catch (error) {
    if (fileToken !== activeFileToken) {
      return;
    }
    resetActiveModelState();
    resetUploadSelection();
    resetPanels();
    setStatus(toUserFacingError(error, selectedFiles[0]).message, true);
  } finally {
    resetFileInput();
  }
}

fileInput.addEventListener('click', (event) => {
  event.stopPropagation();
});

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files, pendingUploadMode);
});

compareFileInput.addEventListener('click', (event) => {
  event.stopPropagation();
});

compareFileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files, 'replace-right');
});

dropzoneRemoveButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  removeUploadSlot(0);
});

compareDropzoneRemoveButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  removeUploadSlot(1);
});

metadataFilter.addEventListener('input', () => {
  if (latestResult) {
    renderMetadata(latestResult.metadataEntries);
  }
});

traceForwardButton.addEventListener('click', () => {
  setTraceMode('forward');
});

traceBackwardButton.addEventListener('click', () => {
  setTraceMode('backward');
});

function maybeStartHashCalculation() {
  if (!latestFile || !latestResult || hashWorker || latestResult.fileHash) {
    return;
  }

  startHashing(latestFile, activeFileToken, latestResult);
}

dropzoneHashValue.addEventListener('click', (event) => {
  event.preventDefault();
  maybeStartHashCalculation();
});

dropzoneHashValue.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  maybeStartHashCalculation();
});

hashCancelButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();

  if (!latestFile || !hashWorker) {
    return;
  }

  terminateHashWorker();
  renderUploadSelection(latestFile, { phase: 'ready' });
});

downloadJsonButton.addEventListener('click', () => {
  if (!latestResult) {
    return;
  }

  const blob = new Blob([JSON.stringify(latestResult, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = latestResult.kind === 'onnx' ? 'onnx-metadata.json' : 'gguf-metadata.json';
  link.click();
  URL.revokeObjectURL(url);
});

['dragenter', 'dragover'].forEach((eventName) => {
  [dropzone, compareDropzone].forEach((zone) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add('dragging');
    });
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  [dropzone, compareDropzone].forEach((zone) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
    });
  });
});

dropzone.addEventListener('click', () => {
  const isSplit = uploadDropzones.classList.contains('has-compare-dropzone');
  pendingUploadMode = isSplit ? 'replace-left' : 'replace';
  fileInput.multiple = !isSplit;
});

dropzone.addEventListener('drop', (event) => {
  const isSplit = uploadDropzones.classList.contains('has-compare-dropzone');
  pendingUploadMode = isSplit ? 'replace-left' : 'replace';
  fileInput.multiple = !isSplit;
  handleFiles(event.dataTransfer.files, pendingUploadMode);
});

compareDropzone.addEventListener('drop', (event) => {
  handleFiles(event.dataTransfer.files, 'replace-right');
});

collapsiblePanels.forEach((panel) => {
  const toggleButton = panel.querySelector('[data-panel-toggle]');
  if (!toggleButton) {
    return;
  }

  toggleButton.addEventListener('click', () => {
    const collapsed = panel.dataset.collapsed === 'true';
    setPanelCollapsed(panel, !collapsed);
  });
});

const graphBackgroundController = setupDynamicGraphBackground(graphBackground);
setupThemeToggle(themeToggle);

if (motionToggle && graphBackgroundController) {
  motionToggle.addEventListener('click', () => {
    const frozen = graphBackgroundController.toggleFrozen();
    motionToggle.setAttribute('aria-pressed', frozen ? 'true' : 'false');
    motionToggle.setAttribute(
      'aria-label',
      frozen ? 'Resume background motion' : 'Freeze background motion'
    );
    motionToggle.title = frozen ? 'Resume background motion' : 'Freeze background motion';
  });
}
