const HF_ORIGIN = 'https://huggingface.co';
const HF_API_ORIGIN = 'https://huggingface.co/api/models';
const DEFAULT_REVISION = 'main';
const THEME_STORAGE_KEY = 'ami-theme';
const GRAPH_PARTICLE_COUNT = 72;
const GRAPH_CONNECTION_DISTANCE = 145;
const GRAPH_FRAME_INTERVAL = 1000 / 45;

export function parseHuggingFaceModelUrl(rawValue) {
  const value = rawValue.trim();

  if (!value) {
    throw new Error('Paste a Hugging Face model URL.');
  }

  let url;

  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error('Enter a valid Hugging Face model URL.');
  }

  if (url.hostname.replace(/^www\./, '').toLowerCase() !== 'huggingface.co') {
    throw new Error('Use a URL from huggingface.co.');
  }

  let segments = url.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] === 'models') {
    segments = segments.slice(1);
  }

  const markerIndex = segments.findIndex((segment) =>
    ['tree', 'blob', 'resolve'].includes(segment)
  );
  const repoSegments = markerIndex >= 0
    ? segments.slice(0, markerIndex)
    : segments.slice(0, Math.min(segments.length, 2));

  if (repoSegments.length === 0) {
    throw new Error('The URL does not include a model repository name.');
  }

  if (repoSegments.some((segment) => ['api', 'datasets', 'spaces'].includes(segment))) {
    throw new Error('Only Hugging Face model repository URLs are supported.');
  }

  const revisionFromPath = markerIndex >= 0 ? segments[markerIndex + 1] : '';
  const revision = revisionFromPath || url.searchParams.get('revision') || DEFAULT_REVISION;

  return {
    repoId: repoSegments.join('/'),
    revision,
  };
}

export function initHuggingFaceDownloader(app) {
  document.title = 'Hugging Face Downloader | AI Model Inspector';
  updateMetaDescription(
    'Download selected files and folders from public Hugging Face model repositories directly in Chrome or Edge, without a backend or CLI.'
  );

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
    </div>
    <main class="shell downloader-shell">
      <section class="hero downloader-hero">
        <p class="eyebrow">Hugging Face downloader</p>
        <h1>Download model repo files directly to a local folder.</h1>
        <p class="hero-summary">
          Paste a public Hugging Face model URL, choose files or folders, and save them locally while keeping the repository folder structure.
        </p>
        <p class="source-link">
          Runs entirely in your browser using Hugging Face resolve URLs and the File System Access API.
          <a href="/">Back to AI Model Inspector</a>.
        </p>
      </section>

      <section class="panel downloader-panel" aria-labelledby="downloader-title">
        <div class="panel-head downloader-panel-head">
          <div>
            <h2 id="downloader-title">Repository</h2>
            <p>Public model repositories are supported. Private or gated files require browser access that this static page cannot provide.</p>
          </div>
        </div>
        <div class="downloader-body">
          <form class="repo-form" id="repo-form">
            <label class="repo-url-label" for="repo-url">
              Hugging Face model URL
              <input
                id="repo-url"
                type="url"
                inputmode="url"
                placeholder="https://huggingface.co/owner/model-name"
                autocomplete="url"
              />
            </label>
            <button id="fetch-tree" type="submit">Fetch files</button>
          </form>

          <div class="browser-warning hidden" id="browser-warning" role="status">
            Folder downloads need the File System Access API. Open this page in Chrome or Edge on desktop to choose a local destination folder.
          </div>

          <div class="status downloader-status" id="downloader-status">Waiting for a Hugging Face model URL.</div>

          <div class="summary-grid downloader-summary" id="downloader-summary"></div>

          <div class="download-controls">
            <button id="choose-folder" type="button">Choose destination folder</button>
            <p class="destination-copy mono" id="destination-copy">No destination selected.</p>
            <button id="download-selected" type="button" disabled>Download selected</button>
          </div>
        </div>
      </section>

      <section class="panel file-tree-panel hidden" id="file-tree-panel" aria-labelledby="file-tree-title">
        <div class="panel-head">
          <div>
            <h2 id="file-tree-title">Repository Files</h2>
            <p id="file-tree-subtitle">Select files and folders to download.</p>
          </div>
          <div class="panel-actions tree-actions">
            <button id="select-all-files" type="button">Select all</button>
            <button id="clear-selection" type="button">Clear</button>
          </div>
        </div>
        <div class="file-tree-wrap">
          <ul class="file-tree" id="file-tree"></ul>
        </div>
      </section>

      <section class="panel progress-panel hidden" id="progress-panel" aria-labelledby="progress-title">
        <div class="panel-head">
          <div>
            <h2 id="progress-title">Download Progress</h2>
            <p id="progress-subtitle">Preparing selected files.</p>
          </div>
        </div>
        <div class="progress-body">
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <div class="progress-copy">
            <span id="progress-count">0 of 0 files</span>
            <span id="progress-bytes">0 B</span>
          </div>
          <p class="mono progress-current" id="progress-current"></p>
        </div>
      </section>

      <p class="app-disclaimer">
        Large model files can take time and disk space. Keep the browser tab open until the download finishes.
      </p>
    </main>
  `;

  const browserSupportsDirectoryPicker = 'showDirectoryPicker' in window;
  const graphBackground = document.querySelector('#graph-background');
  const themeToggle = document.querySelector('#theme-toggle');
  const repoForm = document.querySelector('#repo-form');
  const repoUrlInput = document.querySelector('#repo-url');
  const fetchTreeButton = document.querySelector('#fetch-tree');
  const browserWarning = document.querySelector('#browser-warning');
  const status = document.querySelector('#downloader-status');
  const summary = document.querySelector('#downloader-summary');
  const chooseFolderButton = document.querySelector('#choose-folder');
  const destinationCopy = document.querySelector('#destination-copy');
  const downloadButton = document.querySelector('#download-selected');
  const fileTreePanel = document.querySelector('#file-tree-panel');
  const fileTreeSubtitle = document.querySelector('#file-tree-subtitle');
  const fileTree = document.querySelector('#file-tree');
  const selectAllButton = document.querySelector('#select-all-files');
  const clearSelectionButton = document.querySelector('#clear-selection');
  const progressPanel = document.querySelector('#progress-panel');
  const progressSubtitle = document.querySelector('#progress-subtitle');
  const progressFill = document.querySelector('#progress-fill');
  const progressCount = document.querySelector('#progress-count');
  const progressBytes = document.querySelector('#progress-bytes');
  const progressCurrent = document.querySelector('#progress-current');

  const graphController = setupDownloaderGraphBackground(graphBackground);
  setupThemeToggle(themeToggle, graphController);

  if (!browserSupportsDirectoryPicker) {
    browserWarning.classList.remove('hidden');
    chooseFolderButton.disabled = true;
  }

  let activeFetchController = null;
  let repository = null;
  let rootNode = null;
  let flatFiles = [];
  let selectedFiles = new Set();
  let destinationHandle = null;
  let isDownloading = false;

  renderSummary(summary, null, selectedFiles);
  updateDownloadState();

  repoForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (isDownloading) {
      return;
    }

    activeFetchController?.abort();
    activeFetchController = new AbortController();
    destinationHandle = null;
    destinationCopy.textContent = 'No destination selected.';
    selectedFiles = new Set();
    rootNode = null;
    flatFiles = [];
    repository = null;
    fileTree.innerHTML = '';
    fileTreePanel.classList.add('hidden');
    progressPanel.classList.add('hidden');
    renderSummary(summary, null, selectedFiles);
    updateDownloadState();

    let parsedUrl;

    try {
      parsedUrl = parseHuggingFaceModelUrl(repoUrlInput.value);
    } catch (error) {
      setStatus(status, error.message, true);
      return;
    }

    repository = parsedUrl;
    setStatus(status, `Fetching ${repository.repoId} file tree...`);
    fetchTreeButton.disabled = true;

    try {
      const entries = await fetchRepositoryTree(repository, activeFetchController.signal);
      rootNode = buildFileTree(entries, repository.repoId);
      flatFiles = flattenFiles(rootNode);
      selectedFiles = new Set(flatFiles.map((file) => file.path));
      renderFileTree(fileTree, rootNode, selectedFiles, handleTreeToggle);
      renderSummary(summary, flatFiles, selectedFiles);
      updateTreeCheckboxes(fileTree, rootNode, selectedFiles);
      updateDownloadState();

      fileTreePanel.classList.remove('hidden');
      fileTreeSubtitle.textContent =
        `${repository.repoId} at ${repository.revision} contains ${flatFiles.length.toLocaleString()} files.`;
      setStatus(status, `Fetched ${flatFiles.length.toLocaleString()} files from ${repository.repoId}.`);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setStatus(status, toTreeFetchMessage(error, repository), true);
      }
    } finally {
      fetchTreeButton.disabled = false;
    }
  });

  chooseFolderButton.addEventListener('click', async () => {
    if (!browserSupportsDirectoryPicker || isDownloading) {
      return;
    }

    try {
      destinationHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const hasPermission = await verifyDirectoryPermission(destinationHandle);

      if (!hasPermission) {
        destinationHandle = null;
        destinationCopy.textContent = 'Folder permission was not granted.';
        setStatus(status, 'Allow folder write access to download selected files.', true);
        updateDownloadState();
        return;
      }

      destinationCopy.textContent = destinationHandle.name || 'Destination folder selected.';
      setStatus(status, 'Destination folder ready.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        setStatus(status, 'Could not choose a destination folder.', true);
      }
    } finally {
      updateDownloadState();
    }
  });

  downloadButton.addEventListener('click', async () => {
    if (!repository || !destinationHandle || isDownloading) {
      updateDownloadState();
      return;
    }

    const filesToDownload = flatFiles.filter((file) => selectedFiles.has(file.path));

    if (filesToDownload.length === 0) {
      setStatus(status, 'Select at least one file to download.', true);
      return;
    }

    isDownloading = true;
    progressPanel.classList.remove('hidden');
    updateDownloadState();

    try {
      await downloadFiles({
        repository,
        destinationHandle,
        files: filesToDownload,
        onProgress: (progress) => {
          renderProgress({
            progress,
            progressSubtitle,
            progressFill,
            progressCount,
            progressBytes,
            progressCurrent,
          });
        },
      });

      setStatus(
        status,
        `Downloaded ${filesToDownload.length.toLocaleString()} files to ${destinationHandle.name}.`
      );
    } catch (error) {
      setStatus(status, toDownloadMessage(error), true);
    } finally {
      isDownloading = false;
      updateDownloadState();
    }
  });

  selectAllButton.addEventListener('click', () => {
    selectedFiles = new Set(flatFiles.map((file) => file.path));
    updateTreeCheckboxes(fileTree, rootNode, selectedFiles);
    renderSummary(summary, flatFiles, selectedFiles);
    updateDownloadState();
  });

  clearSelectionButton.addEventListener('click', () => {
    selectedFiles = new Set();
    updateTreeCheckboxes(fileTree, rootNode, selectedFiles);
    renderSummary(summary, flatFiles, selectedFiles);
    updateDownloadState();
  });

  function handleTreeToggle(node, checked) {
    if (node.type === 'file') {
      if (checked) {
        selectedFiles.add(node.path);
      } else {
        selectedFiles.delete(node.path);
      }
    } else {
      for (const file of flattenFiles(node)) {
        if (checked) {
          selectedFiles.add(file.path);
        } else {
          selectedFiles.delete(file.path);
        }
      }
    }

    updateTreeCheckboxes(fileTree, rootNode, selectedFiles);
    renderSummary(summary, flatFiles, selectedFiles);
    updateDownloadState();
  }

  function updateDownloadState() {
    const hasSelection = selectedFiles.size > 0;
    const hasDestination = Boolean(destinationHandle);
    downloadButton.disabled =
      !browserSupportsDirectoryPicker || !hasSelection || !hasDestination || isDownloading;
    chooseFolderButton.disabled = !browserSupportsDirectoryPicker || isDownloading;
    repoUrlInput.disabled = isDownloading;
    fetchTreeButton.disabled = isDownloading;
  }
}

async function fetchRepositoryTree(repository, signal) {
  const url = new URL(
    `${HF_API_ORIGIN}/${encodeRepoId(repository.repoId)}/tree/${encodeURIComponent(repository.revision)}`
  );
  url.searchParams.set('recursive', '1');
  url.searchParams.set('expand', '1');

  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error(`Hugging Face returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const entries = await response.json();

  if (!Array.isArray(entries)) {
    throw new Error('Hugging Face returned an unexpected file tree response.');
  }

  return entries
    .filter((entry) => entry && (entry.type === 'file' || entry.type === 'directory'))
    .map((entry) => ({
      path: normalizeRepoPath(entry.path),
      type: entry.type,
      size: getEntrySize(entry),
    }))
    .filter((entry) => entry.path);
}

function buildFileTree(entries, repoId) {
  const root = {
    name: repoId,
    path: '',
    type: 'directory',
    size: 0,
    children: [],
    childMap: new Map(),
  };

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      const isLeaf = index === parts.length - 1;
      const type = isLeaf ? entry.type : 'directory';
      let child = current.childMap.get(part);

      if (!child) {
        child = {
          name: part,
          path,
          type,
          size: type === 'file' ? entry.size : 0,
          children: [],
          childMap: new Map(),
        };
        current.childMap.set(part, child);
        current.children.push(child);
      }

      if (isLeaf) {
        child.type = entry.type;
        child.size = entry.type === 'file' ? entry.size : child.size;
      }

      current = child;
    });
  }

  sortTree(root);
  removeChildMaps(root);
  return root;
}

function sortTree(node) {
  node.children.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  node.children.forEach(sortTree);
}

function removeChildMaps(node) {
  delete node.childMap;
  node.children.forEach(removeChildMaps);
}

function renderFileTree(container, rootNode, selectedFiles, onToggle) {
  container.innerHTML = '';

  for (const child of rootNode.children) {
    container.append(renderFileTreeNode(child, selectedFiles, onToggle, 0));
  }
}

function renderFileTreeNode(node, selectedFiles, onToggle, depth) {
  const item = document.createElement('li');
  item.className = 'file-tree-item';
  item.dataset.type = node.type;

  const row = document.createElement('label');
  row.className = 'file-tree-row';
  row.style.setProperty('--tree-depth', depth);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.path = node.path;
  checkbox.dataset.type = node.type;
  checkbox.checked = node.type === 'file' && selectedFiles.has(node.path);
  checkbox.addEventListener('change', () => onToggle(node, checkbox.checked));

  const icon = document.createElement('span');
  icon.className = 'file-tree-icon';
  icon.textContent = node.type === 'directory' ? '+' : '-';
  icon.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className = 'file-tree-name';
  name.textContent = node.name;

  const meta = document.createElement('span');
  meta.className = 'file-tree-meta';
  meta.textContent = node.type === 'file' ? formatBytes(node.size) : 'Folder';

  row.append(checkbox, icon, name, meta);
  item.append(row);

  if (node.children.length > 0) {
    const list = document.createElement('ul');
    list.className = 'file-tree-children';

    for (const child of node.children) {
      list.append(renderFileTreeNode(child, selectedFiles, onToggle, depth + 1));
    }

    item.append(list);
  }

  return item;
}

function updateTreeCheckboxes(container, rootNode, selectedFiles) {
  if (!rootNode) {
    return;
  }

  const nodeByPath = new Map();
  visitTree(rootNode, (node) => nodeByPath.set(node.path, node));

  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    const node = nodeByPath.get(checkbox.dataset.path);

    if (!node) {
      return;
    }

    if (node.type === 'file') {
      checkbox.checked = selectedFiles.has(node.path);
      checkbox.indeterminate = false;
      return;
    }

    const descendantFiles = flattenFiles(node);
    const selectedCount = descendantFiles.filter((file) => selectedFiles.has(file.path)).length;
    checkbox.checked = descendantFiles.length > 0 && selectedCount === descendantFiles.length;
    checkbox.indeterminate = selectedCount > 0 && selectedCount < descendantFiles.length;
  });
}

function visitTree(node, visitor) {
  visitor(node);
  node.children.forEach((child) => visitTree(child, visitor));
}

function flattenFiles(node) {
  const files = [];

  visitTree(node, (child) => {
    if (child.type === 'file') {
      files.push(child);
    }
  });

  return files;
}

function renderSummary(container, files, selectedFiles) {
  const totalFiles = files?.length || 0;
  const selected = files ? files.filter((file) => selectedFiles.has(file.path)) : [];
  const selectedBytes = selected.reduce((sum, file) => sum + (file.size || 0), 0);
  const knownBytes = files ? files.reduce((sum, file) => sum + (file.size || 0), 0) : 0;

  container.innerHTML = '';
  [
    ['Selected files', selected.length.toLocaleString()],
    ['Selected size', selected.length ? formatBytes(selectedBytes) : '0 B'],
    ['Repository files', totalFiles ? totalFiles.toLocaleString() : '-'],
    ['Known repo size', totalFiles ? formatBytes(knownBytes) : '-'],
  ].forEach(([label, value]) => {
    container.append(createSummaryCard(label, value));
  });
}

async function downloadFiles({ repository, destinationHandle, files, onProgress }) {
  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  let downloadedBytes = 0;

  onProgress({
    totalFiles: files.length,
    completedFiles: 0,
    totalBytes,
    downloadedBytes,
    currentPath: 'Starting download...',
  });

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];

    onProgress({
      totalFiles: files.length,
      completedFiles: index,
      totalBytes,
      downloadedBytes,
      currentPath: file.path,
    });

    const response = await fetch(getResolveUrl(repository, file.path));

    if (!response.ok) {
      const error = new Error(`Could not download ${file.path}.`);
      error.status = response.status;
      error.path = file.path;
      throw error;
    }

    await writeResponseToDestination({
      destinationHandle,
      file,
      response,
      onChunk: (bytes) => {
        downloadedBytes += bytes;
        onProgress({
          totalFiles: files.length,
          completedFiles: index,
          totalBytes,
          downloadedBytes,
          currentPath: file.path,
        });
      },
    });

    onProgress({
      totalFiles: files.length,
      completedFiles: index + 1,
      totalBytes,
      downloadedBytes,
      currentPath: file.path,
    });
  }
}

async function writeResponseToDestination({ destinationHandle, file, response, onChunk }) {
  const parts = getSafePathParts(file.path);
  const fileName = parts.pop();
  let directory = destinationHandle;

  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }

  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    if (response.body) {
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        await writable.write(value);
        onChunk(value.byteLength);
      }
    } else {
      const blob = await response.blob();
      await writable.write(blob);
      onChunk(blob.size);
    }

    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
}

function renderProgress({
  progress,
  progressSubtitle,
  progressFill,
  progressCount,
  progressBytes,
  progressCurrent,
}) {
  const filePercent = progress.totalFiles
    ? progress.completedFiles / progress.totalFiles
    : 0;
  const bytePercent = progress.totalBytes
    ? progress.downloadedBytes / progress.totalBytes
    : filePercent;
  const percent = Math.max(0, Math.min(100, bytePercent * 100));

  progressSubtitle.textContent = `${Math.floor(percent)}% complete.`;
  progressFill.style.width = `${percent}%`;
  progressCount.textContent =
    `${progress.completedFiles.toLocaleString()} of ${progress.totalFiles.toLocaleString()} files`;
  progressBytes.textContent = progress.totalBytes
    ? `${formatBytes(progress.downloadedBytes)} of ${formatBytes(progress.totalBytes)}`
    : formatBytes(progress.downloadedBytes);
  progressCurrent.textContent = progress.currentPath;
}

function createSummaryCard(label, value) {
  const card = document.createElement('article');
  card.className = 'summary-card';

  const labelElement = document.createElement('p');
  labelElement.className = 'summary-label';
  labelElement.textContent = label;

  const valueElement = document.createElement('p');
  valueElement.className = 'summary-value';
  valueElement.textContent = value;

  card.append(labelElement, valueElement);
  return card;
}

async function verifyDirectoryPermission(handle) {
  const options = { mode: 'readwrite' };

  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }

  return (await handle.requestPermission(options)) === 'granted';
}

function getResolveUrl(repository, path) {
  return `${HF_ORIGIN}/${encodeRepoId(repository.repoId)}/resolve/${encodeURIComponent(
    repository.revision
  )}/${encodePath(path)}?download=true`;
}

function encodeRepoId(repoId) {
  return repoId.split('/').map(encodeURIComponent).join('/');
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function normalizeRepoPath(path) {
  return String(path || '').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function getEntrySize(entry) {
  const size = Number(entry.size ?? entry.lfs?.size ?? 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function getSafePathParts(path) {
  const parts = normalizeRepoPath(path)
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');

  if (parts.length === 0) {
    throw new Error(`Invalid repository path: ${path}`);
  }

  return parts;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toLocaleString(undefined, { maximumFractionDigits })} ${units[unitIndex]}`;
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.dataset.state = isError ? 'error' : 'normal';
}

function toTreeFetchMessage(error, repository) {
  if (error.status === 404) {
    return `Could not find ${repository.repoId} at revision ${repository.revision}.`;
  }

  if (error.status === 401 || error.status === 403) {
    return 'This repository or revision is private, gated, or unavailable from the browser.';
  }

  return error.message || 'Could not fetch the repository file tree.';
}

function toDownloadMessage(error) {
  if (error.status === 401 || error.status === 403) {
    return `Hugging Face blocked access to ${error.path || 'a selected file'}.`;
  }

  if (error.path) {
    return `Could not download ${error.path}.`;
  }

  return error.message || 'The download could not be completed.';
}

function updateMetaDescription(content) {
  let description = document.querySelector('meta[name="description"]');

  if (!description) {
    description = document.createElement('meta');
    description.name = 'description';
    document.head.append(description);
  }

  description.content = content;
}

function setupThemeToggle(button, graphController) {
  const systemLightQuery = window.matchMedia('(prefers-color-scheme: light)');
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  let activeTheme = savedTheme || (systemLightQuery.matches ? 'light' : 'dark');

  applyTheme(activeTheme, graphController);
  updateThemeToggle(button, activeTheme);

  if (!savedTheme) {
    systemLightQuery.addEventListener('change', (event) => {
      activeTheme = event.matches ? 'light' : 'dark';
      applyTheme(activeTheme, graphController);
      updateThemeToggle(button, activeTheme);
    });
  }

  button.addEventListener('click', () => {
    activeTheme = activeTheme === 'light' ? 'dark' : 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
    applyTheme(activeTheme, graphController);
    updateThemeToggle(button, activeTheme);
  });
}

function applyTheme(theme, graphController) {
  document.documentElement.dataset.theme = theme;
  graphController?.syncPalette();
}

function updateThemeToggle(button, theme) {
  const isLight = theme === 'light';
  button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  button.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  button.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
}

function setupDownloaderGraphBackground(canvas) {
  const context = canvas.getContext('2d');
  const particles = [];
  let width = 0;
  let height = 0;
  let animationFrameId = 0;
  let lastFrameTime = 0;
  let particleFillStyle = 'rgba(148, 193, 255, 0.8)';
  let lineColor = '111, 170, 255';

  function syncPalette() {
    const isLightTheme = document.documentElement.dataset.theme === 'light';
    particleFillStyle = isLightTheme ? 'rgba(134, 143, 153, 0.62)' : 'rgba(148, 193, 255, 0.8)';
    lineColor = isLightTheme ? '148, 156, 166' : '111, 170, 255';
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    while (particles.length < GRAPH_PARTICLE_COUNT) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.16;

      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.2 + Math.random() * 1.6,
      });
    }
  }

  function tick(timestamp) {
    animationFrameId = window.requestAnimationFrame(tick);

    if (timestamp - lastFrameTime < GRAPH_FRAME_INTERVAL) {
      return;
    }

    lastFrameTime = timestamp;
    context.clearRect(0, 0, width, height);

    particles.forEach((particle, index) => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < 0 || particle.x > width) {
        particle.vx *= -1;
      }

      if (particle.y < 0 || particle.y > height) {
        particle.vy *= -1;
      }

      context.beginPath();
      context.fillStyle = particleFillStyle;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();

      for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex += 1) {
        const other = particles[otherIndex];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);

        if (distance > GRAPH_CONNECTION_DISTANCE) {
          continue;
        }

        const alpha = 1 - distance / GRAPH_CONNECTION_DISTANCE;
        context.beginPath();
        context.strokeStyle = `rgba(${lineColor}, ${alpha * 0.24})`;
        context.lineWidth = 1;
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    });
  }

  syncPalette();
  resize();
  window.addEventListener('resize', resize);

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animationFrameId = window.requestAnimationFrame(tick);
  }

  return {
    syncPalette,
    destroy() {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    },
  };
}
