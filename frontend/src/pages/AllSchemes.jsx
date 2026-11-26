import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import SchemeCompareBarAndModal from "../components/SchemeCompareBarAndModal.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";
import {
  FALLBACK_STATES,
  formatCompactMoney,
  formatLoanRange,
  matchesChannelFilter,
  matchesSectorPurpose,
} from "../utils/schemeHelpers.js";

const LOAN_SLIDER_MAX = 10000000;
const RATE_SLIDER_MAX = 15;

const FEATURED_CODES_ORDER = [
  "PMMY",
  "PMEGP",
  "SUPI",
  "PMV",
  "PM_SVANIDHI",
  "GBS",
  "TL",
  "MSY",
  "MCF",
  "ELS",
  "NBCFDC_INDIVIDUAL",
  "NMDFC_SELF_EMPLOYMENT",
  "NSTFDC_TERM",
  "NSKFDC_NAMASTE",
  "PM_VIDYALAXMI",
  "PMAY_U_ISS",
  "PM_SURYA_GHAR_LOAN",
  "PM_KUSUM",
  "KCC",
  "BRUPY",
  "MLUPY",
  "CM_YUVA",
];

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export default function AllSchemes() {
  const { t } = useI18n();
  const { form, setScheme } = useAppState();
  const navigate = useNavigate();

  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stateOptions, setStateOptions] = useState(FALLBACK_STATES);

  // Filters & sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [levelFilter, setLevelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [onlyStateExclusive, setOnlyStateExclusive] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [womenOnly, setWomenOnly] = useState(false);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  // Custom range filters (Amazon-style paired slider + numeric text input)
  const [desiredLoanDraft, setDesiredLoanDraft] = useState("");
  const [desiredLoan, setDesiredLoan] = useState(null);
  const [maxRate, setMaxRate] = useState(RATE_SLIDER_MAX);
  const [maxRateDraft, setMaxRateDraft] = useState(String(RATE_SLIDER_MAX));
  const [incomeDraft, setIncomeDraft] = useState("");
  const [annualIncome, setAnnualIncome] = useState(null);

  // Mobile collapsible filter panel + compare state
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [compareCodes, setCompareCodes] = useState([]);
  const [compareNotice, setCompareNotice] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .schemes()
      .then((res) => {
        setSchemes(Array.isArray(res?.schemes) ? res.schemes : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || "Unable to load government schemes.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCatalog();
    api
      .districts()
      .then((res) => {
        if (res?.states && typeof res.states === "object") {
          const names = Object.keys(res.states).sort((a, b) => a.localeCompare(b));
          if (names.length > 0) setStateOptions(names);
        }
      })
      .catch(() => {});
  }, [loadCatalog]);

  const categoryChoices = useMemo(
    () => [
      { id: "SC", label: t("allSchemes.catSC") },
      { id: "ST", label: t("allSchemes.catST") },
      { id: "OBC", label: t("allSchemes.catOBC") },
      { id: "Minority", label: t("allSchemes.catMinority") },
      { id: "EWS_GENERAL", label: t("allSchemes.catEwsGeneral") },
    ],
    [t]
  );

  const sectorChoices = useMemo(
    () => [
      { id: "all", label: t("allSchemes.sectorAll") },
      { id: "business", label: t("allSchemes.sectorBusiness") },
      { id: "microfinance", label: t("allSchemes.sectorMicro") },
      { id: "education", label: t("allSchemes.sectorEducation") },
      { id: "agriculture", label: t("allSchemes.sectorAgri") },
      { id: "housing", label: t("allSchemes.sectorHousing") },
      { id: "sanitation", label: t("allSchemes.sectorSanitation") },
    ],
    [t]
  );

  const channelChoices = useMemo(
    () => [
      { id: "all", label: t("allSchemes.channelAll") },
      { id: "jansamarth", label: t("allSchemes.channelJanSamarth") },
      { id: "pmsuraj", label: t("allSchemes.channelPmSuraj") },
      { id: "bank", label: t("allSchemes.channelBank") },
      { id: "sca", label: t("allSchemes.channelSca") },
      { id: "direct_portal", label: t("allSchemes.channelDirect") },
    ],
    [t]
  );

  const sortChoices = useMemo(
    () => [
      { id: "default", label: t("allSchemes.sortDefault") },
      { id: "name_asc", label: t("allSchemes.sortNameAsc") },
      { id: "name_desc", label: t("allSchemes.sortNameDesc") },
      { id: "rate_desc", label: t("allSchemes.sortRateDesc") },
      { id: "rate_asc", label: t("allSchemes.sortRateAsc") },
      { id: "loan_desc", label: t("allSchemes.sortLoanDesc") },
      { id: "loan_asc", label: t("allSchemes.sortLoanAsc") },
      { id: "tenure_desc", label: t("allSchemes.sortTenureDesc") },
    ],
    [t]
  );

  const toggleCategory = (catId) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  // Paired Desired Loan Amount handlers
  const handleDesiredLoanSlider = (val) => {
    const num = clamp(Number(val), 0, LOAN_SLIDER_MAX);
    if (num <= 0) {
      setDesiredLoan(null);
      setDesiredLoanDraft("");
    } else {
      setDesiredLoan(num);
      setDesiredLoanDraft(String(num));
    }
  };

  const handleDesiredLoanText = (raw) => {
    setDesiredLoanDraft(raw);
    if (raw.trim() === "") {
      setDesiredLoan(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setDesiredLoan(parsed);
    } else if (parsed === 0) {
      setDesiredLoan(null);
    }
  };

  const handleDesiredLoanBlur = () => {
    if (desiredLoanDraft.trim() === "") {
      setDesiredLoan(null);
      return;
    }
    const parsed = Number(desiredLoanDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDesiredLoan(null);
      setDesiredLoanDraft("");
    } else {
      const clean = Math.round(parsed);
      setDesiredLoan(clean);
      setDesiredLoanDraft(String(clean));
    }
  };

  // Paired Max Interest Rate handlers
  const handleMaxRateSlider = (val) => {
    const num = clamp(Number(val), 0, RATE_SLIDER_MAX);
    setMaxRate(num);
    setMaxRateDraft(String(num));
  };

  const handleMaxRateText = (raw) => {
    setMaxRateDraft(raw);
    if (raw.trim() === "" || raw.endsWith(".")) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= RATE_SLIDER_MAX) {
      setMaxRate(parsed);
    }
  };

  const handleMaxRateBlur = () => {
    if (maxRateDraft.trim() === "") {
      setMaxRate(RATE_SLIDER_MAX);
      setMaxRateDraft(String(RATE_SLIDER_MAX));
      return;
    }
    const parsed = Number(maxRateDraft);
    const next = Number.isFinite(parsed)
      ? Number(clamp(parsed, 0, RATE_SLIDER_MAX).toFixed(2))
      : RATE_SLIDER_MAX;
    setMaxRate(next);
    setMaxRateDraft(String(next));
  };

  // Annual Family Income handler
  const handleIncomeText = (raw) => {
    setIncomeDraft(raw);
    if (raw.trim() === "") {
      setAnnualIncome(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setAnnualIncome(parsed);
    } else if (parsed === 0) {
      setAnnualIncome(null);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setSortBy("default");
    setLevelFilter("all");
    setStateFilter("ALL");
    setOnlyStateExclusive(false);
    setSelectedCategories([]);
    setWomenOnly(false);
    setSectorFilter("all");
    setChannelFilter("all");
    setDesiredLoan(null);
    setDesiredLoanDraft("");
    setMaxRate(RATE_SLIDER_MAX);
    setMaxRateDraft(String(RATE_SLIDER_MAX));
    setAnnualIncome(null);
    setIncomeDraft("");
  };

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (searchQuery.trim()) {
      chips.push({
        id: "search",
        label: `${t("allSchemes.chipSearch")}: "${searchQuery.trim()}"`,
        onRemove: () => setSearchQuery(""),
      });
    }
    if (levelFilter !== "all") {
      chips.push({
        id: "level",
        label:
          levelFilter === "central"
            ? t("allSchemes.levelCentral")
            : t("allSchemes.levelState"),
        onRemove: () => setLevelFilter("all"),
      });
    }
    if (stateFilter !== "ALL") {
      chips.push({
        id: "state",
        label: onlyStateExclusive
          ? `${stateFilter} (${t("allSchemes.exclusiveShort")})`
          : stateFilter,
        onRemove: () => {
          setStateFilter("ALL");
          setOnlyStateExclusive(false);
        },
      });
    }
    selectedCategories.forEach((catId) => {
      const catObj = categoryChoices.find((c) => c.id === catId);
      chips.push({
        id: `cat-${catId}`,
        label: catObj ? catObj.label : catId,
        onRemove: () => toggleCategory(catId),
      });
    });
    if (womenOnly) {
      chips.push({
        id: "women",
        label: t("allSchemes.catWomen"),
        onRemove: () => setWomenOnly(false),
      });
    }
    if (sectorFilter !== "all") {
      const secObj = sectorChoices.find((s) => s.id === sectorFilter);
      chips.push({
        id: "sector",
        label: secObj ? secObj.label : sectorFilter,
        onRemove: () => setSectorFilter("all"),
      });
    }
    if (channelFilter !== "all") {
      const chObj = channelChoices.find((c) => c.id === channelFilter);
      chips.push({
        id: "channel",
        label: chObj ? chObj.label : channelFilter,
        onRemove: () => setChannelFilter("all"),
      });
    }
    if (desiredLoan !== null && desiredLoan > 0) {
      chips.push({
        id: "loan",
        label: `${t("allSchemes.chipLoan")}: ₹${Number(desiredLoan).toLocaleString("en-IN")}`,
        onRemove: () => {
          setDesiredLoan(null);
          setDesiredLoanDraft("");
        },
      });
    }
    if (maxRate < RATE_SLIDER_MAX) {
      chips.push({
        id: "rate",
        label: `${t("allSchemes.chipRate")}: ≤ ${maxRate}%`,
        onRemove: () => {
          setMaxRate(RATE_SLIDER_MAX);
          setMaxRateDraft(String(RATE_SLIDER_MAX));
        },
      });
    }
    if (annualIncome !== null && annualIncome > 0) {
      chips.push({
        id: "income",
        label: `${t("allSchemes.chipIncome")}: ₹${Number(annualIncome).toLocaleString("en-IN")}`,
        onRemove: () => {
          setAnnualIncome(null);
          setIncomeDraft("");
        },
      });
    }
    return chips;
  }, [
    searchQuery,
    levelFilter,
    stateFilter,
    onlyStateExclusive,
    selectedCategories,
    womenOnly,
    sectorFilter,
    channelFilter,
    desiredLoan,
    maxRate,
    annualIncome,
    categoryChoices,
    sectorChoices,
    channelChoices,
    t,
  ]);

  const filteredSchemes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = schemes.filter((s) => {
      if (q) {
        const haystack = [
          s.code,
          s.name,
          s.agency,
          s.overview,
          s.description,
          s.subsidy_note,
          s.subsidy_margin_note,
          s.interest_rate_note,
          ...(s.applicable_states || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (levelFilter !== "all" && (s.level || "central").toLowerCase() !== levelFilter) {
        return false;
      }

      if (stateFilter !== "ALL") {
        const statesList = (s.applicable_states || []).map((st) => String(st));
        const hasAll = statesList.some((st) => st.toUpperCase() === "ALL");
        const hasTarget = statesList.some(
          (st) => st.toLowerCase() === stateFilter.toLowerCase()
        );
        if (onlyStateExclusive) {
          if (!hasTarget || hasAll) return false;
        } else {
          if (!hasAll && !hasTarget) return false;
        }
      }

      if (selectedCategories.length > 0) {
        const schemeCats = (s.eligible_categories || []).map((c) => String(c).toLowerCase());
        const wanted = new Set();
        selectedCategories.forEach((c) => {
          if (c === "EWS_GENERAL") {
            wanted.add("ews");
            wanted.add("general");
          } else {
            wanted.add(c.toLowerCase());
          }
        });
        if (!schemeCats.some((c) => wanted.has(c))) return false;
      }

      if (womenOnly && !s.women_only) return false;
      if (!matchesSectorPurpose(s, sectorFilter)) return false;
      if (!matchesChannelFilter(s, channelFilter)) return false;

      if (desiredLoan !== null && desiredLoan > 0) {
        const minL = s.min_loan !== null && s.min_loan !== undefined ? Number(s.min_loan) : 0;
        const maxL =
          s.max_loan !== null && s.max_loan !== undefined ? Number(s.max_loan) : Infinity;
        if (desiredLoan < minL || desiredLoan > maxL) return false;
      }

      if (maxRate < RATE_SLIDER_MAX) {
        if (Number(s.interest_rate ?? 0) > maxRate) return false;
      }

      if (annualIncome !== null && annualIncome > 0) {
        const cap =
          s.max_income !== null && s.max_income !== undefined ? Number(s.max_income) : 0;
        if (cap > 0 && cap < annualIncome) return false;
      }

      return true;
    });

    const sorted = [...matched];
    switch (sortBy) {
      case "name_asc":
        sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "name_desc":
        sorted.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
        break;
      case "rate_asc":
        sorted.sort(
          (a, b) =>
            Number(a.interest_rate ?? 0) - Number(b.interest_rate ?? 0) ||
            (a.name || "").localeCompare(b.name || "")
        );
        break;
      case "rate_desc":
        sorted.sort(
          (a, b) =>
            Number(b.interest_rate ?? 0) - Number(a.interest_rate ?? 0) ||
            (a.name || "").localeCompare(b.name || "")
        );
        break;
      case "loan_desc":
        sorted.sort((a, b) => {
          const maxA = a.max_loan != null ? Number(a.max_loan) : Number.MAX_SAFE_INTEGER;
          const maxB = b.max_loan != null ? Number(b.max_loan) : Number.MAX_SAFE_INTEGER;
          return maxB - maxA || (a.name || "").localeCompare(b.name || "");
        });
        break;
      case "loan_asc":
        sorted.sort((a, b) => {
          const maxA = a.max_loan != null ? Number(a.max_loan) : Number.MAX_SAFE_INTEGER;
          const maxB = b.max_loan != null ? Number(b.max_loan) : Number.MAX_SAFE_INTEGER;
          return maxA - maxB || (a.name || "").localeCompare(b.name || "");
        });
        break;
      case "tenure_desc":
        sorted.sort(
          (a, b) =>
            Number(b.tenure_months ?? 0) - Number(a.tenure_months ?? 0) ||
            (a.name || "").localeCompare(b.name || "")
        );
        break;
      default:
        sorted.sort((a, b) => {
          const idxA = FEATURED_CODES_ORDER.indexOf(a.code);
          const idxB = FEATURED_CODES_ORDER.indexOf(b.code);
          const rankA = idxA === -1 ? 999 : idxA;
          const rankB = idxB === -1 ? 999 : idxB;
          if (rankA !== rankB) return rankA - rankB;
          if ((a.level || "central") !== (b.level || "central")) {
            return (a.level || "central") === "central" ? -1 : 1;
          }
          return (a.code || "").localeCompare(b.code || "");
        });
        break;
    }
    return sorted;
  }, [
    schemes,
    searchQuery,
    levelFilter,
    stateFilter,
    onlyStateExclusive,
    selectedCategories,
    womenOnly,
    sectorFilter,
    channelFilter,
    desiredLoan,
    maxRate,
    annualIncome,
    sortBy,
  ]);

  const comparedSchemes = useMemo(
    () => compareCodes.map((code) => schemes.find((s) => s.code === code)).filter(Boolean),
    [compareCodes, schemes]
  );

  const toggleCompare = (code) => {
    setCompareNotice("");
    setCompareCodes((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 3) {
        setCompareNotice(t("results.compareMaxNotice"));
        return prev;
      }
      return [...prev, code];
    });
  };

  const hasActiveControls = activeFilterChips.length > 0 || sortBy !== "default";

  return (
    <div
      className="page-shell all-schemes-shell"
      style={{ paddingBottom: compareCodes.length > 0 ? "110px" : undefined }}
    >
      {/* Page Hero Title */}
      <div className="all-schemes-hero">
        <div className="page-title" style={{ marginBottom: 0 }}>
          <span className="eyebrow">{t("allSchemes.eyebrow")}</span>
          <h1>{t("allSchemes.title")}</h1>
          <p>{t("allSchemes.subtitle")}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate("/form")}
        >
          <Icon name="sparkles" size={17} />
          <span>{t("allSchemes.checkEligibilityCta")}</span>
        </button>
      </div>

      {/* Top Search & Sort Header Bar */}
      <section className="catalog-toolbar-card" aria-label={t("allSchemes.searchSortLabel")}>
        <div className="catalog-toolbar-row">
          <div className="catalog-search-box">
            <Icon name="search" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("allSchemes.searchPlaceholder")}
              aria-label={t("allSchemes.searchPlaceholder")}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label={t("allSchemes.clearSearch")}
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>

          <div className="catalog-sort-wrap">
            <label htmlFor="catalog-sort-select" className="catalog-sort-label">
              <Icon name="sort" size={16} />
              <span>{t("allSchemes.sortBy")}</span>
            </label>
            <select
              id="catalog-sort-select"
              className="catalog-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {sortChoices.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-outline catalog-mobile-filter-toggle"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            aria-expanded={mobileFiltersOpen}
          >
            <Icon name="filter" size={16} />
            <span>
              {t("allSchemes.filtersBtn")}
              {activeFilterChips.length > 0 ? ` (${activeFilterChips.length})` : ""}
            </span>
          </button>
        </div>

        {/* Live Count + Active Filter Chips + Reset All */}
        <div className="catalog-status-row">
          <div className="catalog-count-badge" role="status" aria-live="polite">
            <strong>
              {t("allSchemes.showingCount", {
                filtered: String(filteredSchemes.length),
                total: String(schemes.length),
              })}
            </strong>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="active-filter-chips" aria-label={t("allSchemes.activeFilters")}>
              {activeFilterChips.map((chip) => (
                <span key={chip.id} className="filter-chip-pill">
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove filter ${chip.label}`}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {hasActiveControls && (
            <button
              type="button"
              className="btn btn-ghost btn-sm catalog-reset-btn"
              onClick={resetAllFilters}
            >
              <Icon name="refresh" size={14} />
              <span>{t("allSchemes.resetAll")}</span>
            </button>
          )}
        </div>
      </section>

      {/* Main 2-Column Catalog Layout: Sidebar Filters + Scheme Grid */}
      <div className="catalog-layout">
        <aside
          className={`catalog-filter-sidebar ${mobileFiltersOpen ? "open" : ""}`}
          aria-label={t("allSchemes.customFilters")}
        >
          <div className="filter-sidebar-head">
            <div className="filter-head-title">
              <Icon name="filter" size={17} />
              <h2>{t("allSchemes.customFilters")}</h2>
            </div>
            {hasActiveControls && (
              <button
                type="button"
                className="filter-clear-link"
                onClick={resetAllFilters}
              >
                {t("allSchemes.resetAll")}
              </button>
            )}
          </div>

          {/* 1. Government Level */}
          <div className="filter-group">
            <label className="filter-group-label">{t("allSchemes.govLevel")}</label>
            <div className="filter-pill-row" role="group" aria-label={t("allSchemes.govLevel")}>
              {[
                { id: "all", label: t("allSchemes.levelAll") },
                { id: "central", label: t("allSchemes.levelCentral") },
                { id: "state", label: t("allSchemes.levelState") },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={levelFilter === opt.id}
                  className={`filter-pill-btn ${levelFilter === opt.id ? "active" : ""}`}
                  onClick={() => setLevelFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. State / UT Filter + Exclusive Toggle */}
          <div className="filter-group">
            <label className="filter-group-label" htmlFor="catalog-state-select">
              {t("allSchemes.stateLabel")}
            </label>
            <select
              id="catalog-state-select"
              className="filter-select"
              value={stateFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStateFilter(next);
                if (next === "ALL") setOnlyStateExclusive(false);
              }}
            >
              <option value="ALL">{t("allSchemes.allIndia")}</option>
              {stateOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <label
              className={`filter-checkbox-row ${stateFilter === "ALL" ? "disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={onlyStateExclusive}
                disabled={stateFilter === "ALL"}
                onChange={(e) => setOnlyStateExclusive(e.target.checked)}
              />
              <span>{t("allSchemes.exclusiveStateToggle")}</span>
            </label>
          </div>

          {/* 3. Target Category / Group */}
          <div className="filter-group">
            <label className="filter-group-label">{t("allSchemes.categoryLabel")}</label>
            <div className="filter-pill-row" role="group" aria-label={t("allSchemes.categoryLabel")}>
              <button
                type="button"
                aria-pressed={selectedCategories.length === 0 && !womenOnly}
                className={`filter-pill-btn ${
                  selectedCategories.length === 0 && !womenOnly ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedCategories([]);
                  setWomenOnly(false);
                }}
              >
                {t("allSchemes.allOption")}
              </button>
              {categoryChoices.map((cat) => {
                const active = selectedCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={active}
                    className={`filter-pill-btn ${active ? "active" : ""}`}
                    onClick={() => toggleCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={womenOnly}
                className={`filter-pill-btn women-pill ${womenOnly ? "active" : ""}`}
                onClick={() => setWomenOnly((prev) => !prev)}
              >
                {t("allSchemes.catWomen")}
              </button>
            </div>
          </div>

          {/* 4. Sector / Loan Purpose */}
          <div className="filter-group">
            <label className="filter-group-label" htmlFor="catalog-sector-select">
              {t("allSchemes.sectorLabel")}
            </label>
            <select
              id="catalog-sector-select"
              className="filter-select"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
            >
              {sectorChoices.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.label}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Application Channel */}
          <div className="filter-group">
            <label className="filter-group-label" htmlFor="catalog-channel-select">
              {t("allSchemes.channelLabel")}
            </label>
            <select
              id="catalog-channel-select"
              className="filter-select"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              {channelChoices.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.label}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Custom Range Filters (Amazon-style Paired Slider + Direct Typing Inputs) */}
          <div className="filter-group">
            <div className="dual-label-row" style={{ marginBottom: 6 }}>
              <label htmlFor="filter-loan-input">
                <strong style={{ fontSize: 13 }}>{t("allSchemes.desiredLoanLabel")}</strong>
              </label>
              {desiredLoan !== null && (
                <button
                  type="button"
                  className="filter-clear-link"
                  onClick={() => {
                    setDesiredLoan(null);
                    setDesiredLoanDraft("");
                  }}
                >
                  {t("allSchemes.anyLabel")}
                </button>
              )}
            </div>
            <div className="amazon-input-wrap filter-amazon-input">
              <span className="input-prefix">₹</span>
              <input
                id="filter-loan-input"
                type="number"
                min={0}
                step={10000}
                placeholder={t("allSchemes.loanPlaceholder")}
                value={desiredLoanDraft}
                onChange={(e) => handleDesiredLoanText(e.target.value)}
                onBlur={handleDesiredLoanBlur}
                aria-label={t("allSchemes.desiredLoanLabel")}
              />
            </div>
            <input
              type="range"
              className="filter-range-slider"
              min={0}
              max={LOAN_SLIDER_MAX}
              step={10000}
              value={desiredLoan ? clamp(desiredLoan, 0, LOAN_SLIDER_MAX) : 0}
              onChange={(e) => handleDesiredLoanSlider(e.target.value)}
              aria-label={`${t("allSchemes.desiredLoanLabel")} slider`}
            />
            <small className="slider-limits">
              <span>{t("allSchemes.anyLabel")}</span>
              <span className="limit-mid">
                {desiredLoan ? formatCompactMoney(desiredLoan) : "—"}
              </span>
              <span>₹1 Cr</span>
            </small>
          </div>

          <div className="filter-group">
            <div className="dual-label-row" style={{ marginBottom: 6 }}>
              <label htmlFor="filter-rate-input">
                <strong style={{ fontSize: 13 }}>{t("allSchemes.maxRateLabel")}</strong>
              </label>
              {maxRate < RATE_SLIDER_MAX && (
                <button
                  type="button"
                  className="filter-clear-link"
                  onClick={() => {
                    setMaxRate(RATE_SLIDER_MAX);
                    setMaxRateDraft(String(RATE_SLIDER_MAX));
                  }}
                >
                  {t("allSchemes.anyLabel")}
                </button>
              )}
            </div>
            <div className="amazon-input-wrap compact filter-amazon-input">
              <input
                id="filter-rate-input"
                type="number"
                min={0}
                max={RATE_SLIDER_MAX}
                step={0.25}
                value={maxRateDraft}
                onChange={(e) => handleMaxRateText(e.target.value)}
                onBlur={handleMaxRateBlur}
                aria-label={t("allSchemes.maxRateLabel")}
              />
              <span className="input-suffix">% p.a.</span>
            </div>
            <input
              type="range"
              className="filter-range-slider"
              min={0}
              max={RATE_SLIDER_MAX}
              step={0.25}
              value={clamp(maxRate, 0, RATE_SLIDER_MAX)}
              onChange={(e) => handleMaxRateSlider(e.target.value)}
              aria-label={`${t("allSchemes.maxRateLabel")} slider`}
            />
            <small className="slider-limits">
              <span>0%</span>
              <span className="limit-mid">≤ {maxRate}%</span>
              <span>15%</span>
            </small>
          </div>

          <div className="filter-group" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <div className="dual-label-row" style={{ marginBottom: 6 }}>
              <label htmlFor="filter-income-input">
                <strong style={{ fontSize: 13 }}>{t("allSchemes.incomeLabel")}</strong>
              </label>
              {annualIncome !== null && (
                <button
                  type="button"
                  className="filter-clear-link"
                  onClick={() => {
                    setAnnualIncome(null);
                    setIncomeDraft("");
                  }}
                >
                  {t("allSchemes.anyLabel")}
                </button>
              )}
            </div>
            <div className="amazon-input-wrap filter-amazon-input">
              <span className="input-prefix">₹</span>
              <input
                id="filter-income-input"
                type="number"
                min={0}
                step={10000}
                placeholder={t("allSchemes.incomePlaceholder")}
                value={incomeDraft}
                onChange={(e) => handleIncomeText(e.target.value)}
                aria-label={t("allSchemes.incomeLabel")}
              />
            </div>
            <small className="filter-helper-text">{t("allSchemes.incomeHint")}</small>
          </div>
        </aside>

        {/* Results Column */}
        <div className="catalog-results-col">
          {compareNotice && (
            <div className="compare-notice-banner" role="status">
              <Icon name="alert" size={16} />
              <span>{compareNotice}</span>
              <button
                type="button"
                onClick={() => setCompareNotice("")}
                aria-label="Dismiss notice"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="catalog-empty-state">
              <p>{t("allSchemes.loading")}</p>
            </div>
          ) : error ? (
            <div className="catalog-empty-state">
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={loadCatalog}>
                <Icon name="refresh" size={16} />
                <span>{t("allSchemes.retry")}</span>
              </button>
            </div>
          ) : filteredSchemes.length === 0 ? (
            <div className="catalog-empty-state">
              <h3>{t("allSchemes.noMatchesTitle")}</h3>
              <p>{t("allSchemes.noMatchesDesc")}</p>
              <button type="button" className="btn btn-primary" onClick={resetAllFilters}>
                <Icon name="refresh" size={16} />
                <span>{t("allSchemes.resetAll")}</span>
              </button>
            </div>
          ) : (
            <div className="catalog-scheme-grid">
              {filteredSchemes.map((s) => {
                const isState = s.level === "state";
                const isCompared = compareCodes.includes(s.code);
                const stateBadgeLabel = isState
                  ? (s.applicable_states || []).filter((st) => st !== "ALL").join(", ") ||
                    t("results.stateBadge")
                  : t("allSchemes.allIndia");
                const subsidyText = s.subsidy_note || s.subsidy_margin_note;
                const summaryText =
                  s.overview || s.description || "Government concessional credit scheme.";
                const categoriesText =
                  (s.eligible_categories || []).length === 6
                    ? t("allSchemes.allCategoriesShort")
                    : (s.eligible_categories || []).join(", ") || "All";

                return (
                  <article
                    key={s.code}
                    className={`scheme-card catalog-scheme-card ${isCompared ? "is-compared" : ""}`}
                  >
                    <div className={`scheme-top-bar ${isState ? "saffron" : "navy"}`}>
                      <span className="scheme-badge-code">{s.code}</span>
                      <div className="scheme-top-right">
                        {s.women_only && (
                          <span className="women-special-badge">
                            {t("allSchemes.womenSpecial")}
                          </span>
                        )}
                        <span className={`level-badge ${isState ? "state" : "central"}`}>
                          {isState ? t("results.stateBadge") : t("results.centralBadge")}
                        </span>
                      </div>
                    </div>

                    <div className="scheme-body">
                      <div className="scheme-logo">
                        <span className="logo-box">
                          <Icon name="bank" size={22} />
                        </span>
                        <div>
                          <h2>{s.name}</h2>
                          <small>{s.agency || "Government of India"}</small>
                        </div>
                      </div>

                      <div className="catalog-sub-badges">
                        <span className={`catalog-state-badge ${isState ? "state" : "central"}`}>
                          <Icon name="location" size={12} />
                          <span>{stateBadgeLabel}</span>
                        </span>
                        {subsidyText && (
                          <span className="catalog-subsidy-pill" title={subsidyText}>
                            <Icon name="award" size={12} />
                            <span>{subsidyText}</span>
                          </span>
                        )}
                      </div>

                      <p className="catalog-summary-clamp">{summaryText}</p>

                      <div className="catalog-metrics-grid">
                        <div className="catalog-metric-cell">
                          <small>{t("allSchemes.metricInterest")}</small>
                          <strong className="text-forest">
                            <bdi>{s.interest_rate}% p.a.</bdi>
                          </strong>
                        </div>
                        <div className="catalog-metric-cell">
                          <small>{t("allSchemes.metricLoanRange")}</small>
                          <strong>
                            <bdi>{formatLoanRange(s.min_loan, s.max_loan)}</bdi>
                          </strong>
                        </div>
                        <div className="catalog-metric-cell">
                          <small>{t("allSchemes.metricTenure")}</small>
                          <strong>
                            {s.tenure_months}m ({s.moratorium_months}m morat.)
                          </strong>
                        </div>
                        <div className="catalog-metric-cell">
                          <small>{t("allSchemes.metricCategories")}</small>
                          <strong>{categoriesText}</strong>
                        </div>
                      </div>

                      <div className="scheme-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary scheme-action-details"
                          onClick={() => {
                            setScheme(s);
                            navigate(`/scheme/${encodeURIComponent(s.code)}`);
                          }}
                        >
                          <span>{t("results.moreDetails")}</span>
                          <Icon name="arrow" size={16} />
                        </button>

                        <button
                          type="button"
                          className={`btn scheme-action-compare ${
                            isCompared ? "btn-compare-active" : "btn-outline"
                          }`}
                          onClick={() => toggleCompare(s.code)}
                          aria-pressed={isCompared}
                        >
                          {isCompared ? <Icon name="check" size={16} /> : null}
                          <span>{isCompared ? t("results.comparedAdded") : t("results.compare")}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SchemeCompareBarAndModal
        compareCodes={compareCodes}
        comparedSchemes={comparedSchemes}
        compareOpen={compareOpen}
        setCompareOpen={setCompareOpen}
        setCompareCodes={setCompareCodes}
        setCompareNotice={setCompareNotice}
        onToggleCompare={toggleCompare}
        loanAmountBasis={desiredLoan || form.loan_amount || 500000}
        profileSummary={
          stateFilter !== "ALL"
            ? stateFilter
            : form.state || t("allSchemes.allIndia")
        }
        setScheme={setScheme}
      />
    </div>
  );
}
