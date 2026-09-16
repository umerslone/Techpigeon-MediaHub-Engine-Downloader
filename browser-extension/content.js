const DEFAULT_API_BASE = "http://localhost:8000";

function sanitizeApiBase(value) {
  if (!value) return DEFAULT_API_BASE;
  return value.replace(/\/+$/, "");
}

function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiBase"], (result) => {
      resolve(sanitizeApiBase(result.apiBase || DEFAULT_API_BASE));
    });
  });
}

function injectFloatingButton(video) {
  if (video.dataset.pwaInjected) return;
  video.dataset.pwaInjected = "true";

  const parent = video.parentElement;
  if (!parent) return;

  if (window.getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.className = 'pwa-floating-dl-btn';
  btn.innerHTML = '⚡ Download HD/4K';

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const currentUrl = window.location.href;
      const apiBase = await getApiBase();
      window.open(`${apiBase}/api/download-stream?url=${encodeURIComponent(currentUrl)}&download=true`, '_blank');
    } catch (err) {
      window.open(`${DEFAULT_API_BASE}/api/download-stream?url=${encodeURIComponent(window.location.href)}&download=true`, '_blank');
    }
  });

  parent.appendChild(btn);
}

// Observe DOM for dynamic video tags (YouTube SPA, Bilibili player loads)
const observer = new MutationObserver(() => {
  const videos = document.querySelectorAll('video');
  videos.forEach(v => {
    if (v.offsetWidth > 200 && v.offsetHeight > 150) {
      injectFloatingButton(v);
    }
  });
});

observer.observe(document.body, { childList: true, subtree: true });
