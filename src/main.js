import './style.css';
import { parseGguf } from './ggufParser.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Static GGUF Inspector</p>
      <h1>Parse GGUF metadata directly in your browser.</h1>
      <p class="lede">
        Drop a <code>.gguf</code> file to extract its header, key-value metadata, and tensor index
        without uploading anything to a server.
      </p>
      <p class="lede">Your model, your data.</p>
    </section>

    <section class="panel upload-panel">
      <label class="dropzone" for="file-input" id="dropzone">
        <input id="file-input" type="file" accept=".gguf,application/octet-stream" />
        <span class="dropzone-title">Choose a GGUF file</span>
        <span class="dropzone-copy">or drag and drop it here</span>
      </label>
      <div class="status" id="status">Waiting for a GGUF file.</div>
    </section>

    <section class="panel hidden" id="summary-panel">
      <div class="summary-grid" id="summary-grid"></div>
    </section>

    <section class="panel hidden" id="metadata-panel">
      <div class="panel-head">
        <div>
          <h2>Metadata</h2>
          <p>Search extracted key-value pairs.</p>
        </div>
        <div class="panel-actions">
          <input id="metadata-filter" type="search" placeholder="Filter by key or value" />
          <button id="download-json" type="button">Download JSON</button>
        </div>
      </div>
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
    </section>

    <section class="panel hidden" id="tensor-panel">
      <div class="panel-head">
        <div>
          <h2>Tensor Index</h2>
          <p>First 25 tensor descriptors from the file.</p>
        </div>
      </div>
      <div class="metadata-table-wrap">
        <table class="metadata-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Dimensions</th>
              <th>GGML Type</th>
              <th>Offset</th>
            </tr>
          </thead>
          <tbody id="tensor-body"></tbody>
        </table>
      </div>
    </section>
  </main>
`;

const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const status = document.querySelector('#status');
const summaryPanel = document.querySelector('#summary-panel');
const summaryGrid = document.querySelector('#summary-grid');
const metadataPanel = document.querySelector('#metadata-panel');
const metadataBody = document.querySelector('#metadata-body');
const metadataFilter = document.querySelector('#metadata-filter');
const tensorPanel = document.querySelector('#tensor-panel');
const tensorBody = document.querySelector('#tensor-body');
const downloadJsonButton = document.querySelector('#download-json');

let latestResult = null;
const COLLAPSIBLE_VALUE_LENGTH = 2000;
const COLLAPSIBLE_ARRAY_LENGTH = 40;
const COPY_RESET_DELAY_MS = 1500;

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

function renderSummary(result, file) {
  summaryGrid.innerHTML = '';

  const cards = [
    ['File', file.name],
    ['Version', String(result.header.version)],
    ['Metadata entries', String(result.header.metadataCount)],
    ['Tensor count', String(result.header.tensorCount)],
    ['Parsed bytes', result.header.bytesRead.toLocaleString()],
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

function renderTensors(tensors) {
  tensorBody.innerHTML = '';

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
    tensorBody.append(row);
  }

  tensorPanel.classList.remove('hidden');
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.state = isError ? 'error' : 'normal';
}

async function handleFile(file) {
  if (!file) {
    return;
  }

  setStatus(`Reading ${file.name}...`);

  try {
    const result = await parseGguf(file);

    latestResult = result;
    renderSummary(result, file);
    renderMetadata(result.metadataEntries);
    renderTensors(result.tensors);

    setStatus(`Parsed ${result.header.metadataCount} metadata entries from ${file.name}.`);
  } catch (error) {
    latestResult = null;
    summaryPanel.classList.add('hidden');
    metadataPanel.classList.add('hidden');
    tensorPanel.classList.add('hidden');
    setStatus(toUserFacingError(error, file).message, true);
  } finally {
    fileInput.value = '';
  }
}

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  handleFile(file);
});

metadataFilter.addEventListener('input', () => {
  if (latestResult) {
    renderMetadata(latestResult.metadataEntries);
  }
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
  link.download = 'gguf-metadata.json';
  link.click();
  URL.revokeObjectURL(url);
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
});

dropzone.addEventListener('drop', (event) => {
  const [file] = event.dataTransfer.files;
  handleFile(file);
});
