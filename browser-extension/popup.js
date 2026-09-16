const DEFAULT_API_BASE = "http://localhost:8000";

function sanitizeApiBase(value) {
  if (!value || typeof value !== "string") return DEFAULT_API_BASE;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return DEFAULT_API_BASE;
  return trimmed;
}

function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiBase"], (result) => {
      resolve(sanitizeApiBase(result.apiBase || DEFAULT_API_BASE));
    });
  });
}

function saveApiBase(value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ apiBase: sanitizeApiBase(value) }, resolve);
  });
}

function wireApiSettings() {
  const input = document.getElementById("apiBase");
  const saveBtn = document.getElementById("saveApiBase");

  if (!input || !saveBtn) return;

  getApiBase().then((apiBase) => {
    input.value = apiBase;
  });

  saveBtn.addEventListener("click", async () => {
    await saveApiBase(input.value);
    input.value = sanitizeApiBase(input.value);
  });
}

function triggerDownload(downloadUrl, statusEl) {
  if (!downloadUrl) return;

  statusEl.innerText = "Starting download...";
  if (chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({ url: downloadUrl }, (downloadId) => {
      if (chrome.runtime.lastError || !downloadId) {
        // Fallback for browser/version combinations where download API is restricted.
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
        statusEl.innerText = "Opened download in new tab.";
        return;
      }
      statusEl.innerText = `Download queued (#${downloadId})`;
    });
    return;
  }

  window.open(downloadUrl, "_blank", "noopener,noreferrer");
  statusEl.innerText = "Opened download in new tab.";
}

wireApiSettings();

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const API_BASE = await getApiBase();
  const tab = tabs[0];
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  if (!tab || !tab.url) {
    statusEl.innerText = "Cannot read tab URL";
    resultsEl.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url })
    });

    if (!res.ok) {
      let detail = "Could not parse media";
      try {
        const payload = await res.json();
        detail = payload.detail || detail;
      } catch (e) {
        // Keep default message.
      }
      throw new Error(detail);
    }
    const data = await res.json();

    statusEl.innerText = data.title ? `Ready: ${data.title.substring(0, 35)}...` : "Available Streams:";
    
    resultsEl.innerHTML = data.formats.slice(0, 5).map(fmt => `
      <div class="card">
        <div>
          <span class="quality">${fmt.quality}</span>
          <span class="badge">${fmt.ext.toUpperCase()}</span>
        </div>
        <button class="btn download-btn" data-download-url="${API_BASE}/api/download-stream?url=${encodeURIComponent(tab.url)}&format_id=${fmt.format_id}&download=true">Download</button>
      </div>
    `).join('');

    resultsEl.querySelectorAll(".download-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const downloadUrl = btn.getAttribute("data-download-url");
        triggerDownload(downloadUrl, statusEl);
      });
    });

  } catch (err) {
    statusEl.innerText = err?.message || "No downloadable video identified on this tab.";
    resultsEl.innerHTML = "";
  }
});
