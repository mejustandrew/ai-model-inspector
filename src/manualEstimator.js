import { estimateManualLlmResources } from './resourceEstimator.js';

const form = document.querySelector('#memory-form');
const results = document.querySelector('#memory-results');
const status = document.querySelector('#estimate-status');
const custom = form.elements.bitsPerWeight;

function updateQuantization() {
  const enabled = form.elements.quantization.value === 'custom';
  custom.disabled = !enabled;
  custom.required = enabled;
  document.querySelector('#custom-bits').hidden = !enabled;
}

form.addEventListener('input', () => {
  results.hidden = true;
  status.textContent = 'Inputs changed. Calculate to update the estimate.';
  updateQuantization();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  results.hidden = true;
  const settings = Object.fromEntries(new FormData(form));
  settings.parameterCount = Number(settings.parametersBillions) * 1e9;
  // Decimal billions may acquire a tiny floating-point rounding error.
  if (Math.abs(settings.parameterCount - Math.round(settings.parameterCount)) < 0.001) {
    settings.parameterCount = Math.round(settings.parameterCount);
  }
  try {
    const estimate = estimateManualLlmResources(settings);
    const gib = bytes => (bytes / 1024 ** 3).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    const range = field => {
      const min = gib(estimate.minimum[field]);
      const max = gib(estimate.maximum[field]);
      return min === max ? `${min} GiB` : `${min}–${max} GiB`;
    };
    document.querySelector('#weight-result').textContent = range('weightsBytes');
    document.querySelector('#cache-result').textContent = `${gib(estimate.kvCacheBytes)} GiB`;
    document.querySelector('#overhead-result').textContent = range('runtimeOverheadBytes');
    document.querySelector('#ram-result').textContent = range('estimatedTotalBytes');
    document.querySelector('#vram-result').textContent = range('estimatedTotalBytes');
    results.hidden = false;
    status.textContent = `Estimate calculated using ${estimate.minBitsPerWeight}–${estimate.maxBitsPerWeight} effective bits per weight. Results are planning estimates, not measurements.`;
  } catch (error) {
    status.textContent = error.message;
  }
});

updateQuantization();
