export const FALLBACK_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export const CHANNEL_LABELS = {
  pmsuraj: "PM-SURAJ",
  jansamarth: "JanSamarth",
  sca: "State SCA",
  bank: "Bank Branch",
  mfi: "NBFC-MFI",
  kviconline: "KVIC PMEGP",
  standupmitra: "Stand-Up Mitra",
  pmvishwakarma: "PM Vishwakarma",
  state_portal: "State Portal",
};

export function computeClientEmi(principal, annualRate, tenureMonths, moratoriumMonths = 0) {
  const p = Number(principal || 0);
  const nTotal = Math.max(1, Number(tenureMonths || 60));
  const m = Math.max(0, Math.min(Number(moratoriumMonths || 0), nTotal - 1));
  const n = Math.max(1, nTotal - m);
  const r = Number(annualRate || 0) / 12 / 100;
  if (p <= 0) return { monthlyEmi: 0, totalInterest: 0, totalPayable: 0 };
  const pAfterMoratorium = m > 0 ? p * Math.pow(1 + r, m) : p;
  const emi =
    r === 0
      ? pAfterMoratorium / n
      : (pAfterMoratorium * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  let balance = p;
  let totalInterest = 0;
  for (let month = 1; month <= nTotal; month++) {
    const interest = balance * r;
    totalInterest += interest;
    if (month <= m) {
      balance += interest;
    } else {
      const principalPaid = month === nTotal ? balance : Math.min(emi - interest, balance);
      balance = Math.max(0, balance - principalPaid);
    }
  }
  return {
    monthlyEmi: Math.round(emi),
    totalInterest: Math.round(totalInterest),
    totalPayable: Math.round(p + totalInterest),
  };
}

export function getSchemeDefaultPrincipal(scheme, userLoanAmount) {
  const req = Number(userLoanAmount || 0);
  const minLoan = Number(scheme?.min_loan || 0);
  const maxLoan =
    scheme?.max_loan !== null && scheme?.max_loan !== undefined ? Number(scheme.max_loan) : null;
  if (req > 0) {
    if (maxLoan && maxLoan > 0 && req > maxLoan) return maxLoan;
    if (req < minLoan) return Math.max(10000, minLoan);
    return req;
  }
  let base = 500000;
  if (maxLoan && maxLoan > 0) base = Math.min(base, maxLoan);
  if (minLoan > base) base = minLoan;
  return Math.max(10000, base);
}

export function formatMoney(val, noCapLabel = "No fixed cap") {
  if (val === null || val === undefined) return noCapLabel;
  const num = Number(val);
  if (Number.isNaN(num)) return "—";
  return `₹${num.toLocaleString("en-IN")}`;
}

export function formatCompactMoney(val, noCapLabel = "No Cap", units = {}) {
  if (val === null || val === undefined) return noCapLabel;
  const num = Number(val);
  if (Number.isNaN(num)) return "—";
  const cr = units.cr || "Cr";
  const l = units.l || "L";
  const k = units.k || "K";
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2).replace(/\.?0+$/, "")} ${cr}`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2).replace(/\.?0+$/, "")}${l}`;
  if (num >= 1000) return `₹${Math.round(num / 1000)}${k}`;
  return `₹${num.toLocaleString("en-IN")}`;
}

export function formatLoanRange(minLoan, maxLoan, noCapLabel = "No Cap", units = {}) {
  const minStr = minLoan !== null && minLoan !== undefined && Number(minLoan) > 0
    ? formatCompactMoney(minLoan, noCapLabel, units)
    : "₹0";
  const maxStr = maxLoan !== null && maxLoan !== undefined ? formatCompactMoney(maxLoan, noCapLabel, units) : noCapLabel;
  return `${minStr} – ${maxStr}`;
}

export function matchesSectorPurpose(scheme, sectorKey) {
  if (!sectorKey || sectorKey === "all") return true;
  const rawSectors = scheme.raw_sectors || scheme.sectors || [];
  const sectors = rawSectors.map((s) => String(s).toLowerCase());
  const rawChannels = scheme.raw_available_channels || scheme.available_channels || [];
  const channels = rawChannels.map((c) => String(c).toLowerCase());
  const text = [scheme.code, scheme.name, scheme.overview, scheme.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  switch (sectorKey) {
    case "business":
      return (
        sectors.some((s) => ["manufacturing", "trade", "service", "transport"].includes(s)) &&
        scheme.code !== "PMAY_U_ISS"
      );
    case "microfinance": {
      const maxLoan = scheme.max_loan != null ? Number(scheme.max_loan) : Infinity;
      return (
        maxLoan <= 300000 ||
        channels.includes("mfi") ||
        ["micro", "svanidhi", "street vendor", "shg", "mahila samriddhi", "aajeevika"].some((k) =>
          text.includes(k)
        )
      );
    }
    case "education":
      return sectors.includes("education");
    case "agriculture":
      return (
        sectors.includes("agriculture") ||
        ["solar", "surya", "kusum", "kisan", "livestock", "fisheries", "nrlm", "rural"].some((k) =>
          text.includes(k)
        )
      );
    case "housing":
      return ["pmay", "housing", "awas", "home"].some((k) => text.includes(k));
    case "sanitation":
      return [
        "sanitation",
        "namaste",
        "nskfdc",
        "artisan",
        "vishwakarma",
        "shilpi",
        "weaver",
        "handloom",
        "virasat",
      ].some((k) => text.includes(k));
    default:
      return sectors.includes(sectorKey.toLowerCase());
  }
}

export function matchesChannelFilter(scheme, channelKey) {
  if (!channelKey || channelKey === "all") return true;
  const rawChannels = scheme.raw_available_channels || scheme.available_channels || [];
  const channels = rawChannels.map((c) => String(c).toLowerCase());
  if (channelKey === "direct_portal") {
    return channels.some((c) =>
      ["state_portal", "kviconline", "standupmitra", "pmvishwakarma"].includes(c)
    );
  }
  return channels.includes(channelKey.toLowerCase());
}
