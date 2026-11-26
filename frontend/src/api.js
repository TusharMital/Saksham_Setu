const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || data.message || "Request failed");
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  recommend: (body) => request("/recommend/", { method: "POST", body: JSON.stringify(body) }),
  schemes: () => request("/schemes/"),
  schemeDetail: (code, amount) => {
    const q = amount ? `?amount=${encodeURIComponent(amount)}` : "";
    return request(`/schemes/${encodeURIComponent(code)}/${q}`);
  },
  branches: (params) => {
    const q = new URLSearchParams(params).toString();
    return request(`/branches/?${q}`);
  },
  liveBanksSearch: (params) => {
    const clean = Object.fromEntries(
      Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );
    const q = new URLSearchParams(clean).toString();
    return request(`/banks/live-search/?${q}`);
  },
  emi: (body) => request("/emi/", { method: "POST", body: JSON.stringify(body) }),
  application: (ref) => request(`/applications/${encodeURIComponent(ref)}/`),
  createApplication: (body) => request("/applications/", { method: "POST", body: JSON.stringify(body) }),
  pdfUrl: (ref) => `${BASE}/applications/${encodeURIComponent(ref)}/pdf/`,
  chat: (body) => request("/chat/", { method: "POST", body: JSON.stringify(body) }),
  pin: (pin) => request(`/pin-lookup/?pin=${encodeURIComponent(pin)}`),
  pinLookup: (pin) => request(`/pin-lookup/${encodeURIComponent(pin)}/`),
  districts: () => request("/locations/districts/"),
  verifyCategory: (body) => request("/verify-category/", { method: "POST", body: JSON.stringify(body) }),
  languages: () => request("/i18n/languages/"),
  i18nBundle: (code) => request(`/i18n/${encodeURIComponent(code)}/`),
};
