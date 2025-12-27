import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import pako from 'pako';

const WAGE_LEVELS = {
  1: { label: 'Level 1', percentile: '17th', desc: 'Entry Level', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  2: { label: 'Level 2', percentile: '34th', desc: 'Qualified', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  3: { label: 'Level 3', percentile: '50th', desc: 'Experienced', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  4: { label: 'Level 4', percentile: '67th', desc: 'Fully Competent', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
};

export default function App() {
  const [manifest, setManifest] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [wageData, setWageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOccupation, setSelectedOccupation] = useState(null);
  const [salary, setSalary] = useState('');
  const [results, setResults] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Results UI state
  const [activeLevel, setActiveLevel] = useState(2);
  const [locationFilter, setLocationFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' or 'wage'
  const [isSearching, setIsSearching] = useState(false);

  // Refs
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load manifest on mount
  useEffect(() => {
    fetch('./data/manifest.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setManifest(data);
        if (data.years.length > 0) {
          const sorted = [...data.years].sort((a, b) => b.label.localeCompare(a.label));
          setSelectedYear(sorted[0].label);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(`Failed to load: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // Load wage data when year changes
  useEffect(() => {
    if (!selectedYear || !manifest) return;

    const yearData = manifest.years.find(y => y.label === selectedYear);
    if (!yearData) return;

    setLoadingData(true);
    setResults(null);
    setSelectedOccupation(null);
    setSearchQuery('');

    fetch(`./data/${yearData.file}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buffer => {
        const decompressed = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
        const data = JSON.parse(decompressed);
        setWageData(data);
        setLoadingData(false);
      })
      .catch(err => {
        setError(`Failed to load wage data: ${err.message}`);
        setLoadingData(false);
      });
  }, [selectedYear, manifest]);

  // Filter occupations based on search (searches title, SOC code, and O*NET code)
  const filteredOccupations = useMemo(() => {
    if (!wageData || !searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return wageData.occupations
      .filter(occ =>
        occ.c.toLowerCase().includes(query) ||
        occ.t.toLowerCase().includes(query) ||
        (occ.o && occ.o.toLowerCase().includes(query))
      )
      .slice(0, 50);
  }, [wageData, searchQuery]);

  // Calculate results
  const calculateResults = useCallback(() => {
    if (!selectedOccupation || !salary || !wageData) return;

    const salaryNum = parseFloat(salary.replace(/[$,]/g, ''));
    if (isNaN(salaryNum) || salaryNum <= 0) {
      setError('Please enter a valid salary');
      return;
    }

    setIsSearching(true);

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const occupationWages = wageData.wages.filter(w => w.s === selectedOccupation.c);
      const categorized = { 1: [], 2: [], 3: [], 4: [], 0: [] };

      // Categorize each location by the highest wage level the salary qualifies for
      occupationWages.forEach(w => {
        const areaName = wageData.areas[w.a];
        const location = { area: areaName, l1: w.l1, l2: w.l2, l3: w.l3, l4: w.l4 };

        if (salaryNum >= w.l4) categorized[4].push(location);
        else if (salaryNum >= w.l3) categorized[3].push(location);
        else if (salaryNum >= w.l2) categorized[2].push(location);
        else if (salaryNum >= w.l1) categorized[1].push(location);
        else categorized[0].push(location);
      });

      Object.keys(categorized).forEach(key => {
        categorized[key].sort((a, b) => a.area.localeCompare(b.area));
      });

      setResults({
        salary: salaryNum,
        occupation: selectedOccupation,
        total: occupationWages.length,
        levels: categorized,
      });
      setActiveLevel(2);
      setLocationFilter('');
      setError(null);
      setIsSearching(false);
    }, 10);
  }, [selectedOccupation, salary, wageData]);

  // Filter and sort displayed locations
  const displayedLocations = useMemo(() => {
    if (!results) return [];
    let locations = results.levels[activeLevel] || [];

    if (locationFilter) {
      const filter = locationFilter.toLowerCase();
      locations = locations.filter(loc => loc.area.toLowerCase().includes(filter));
    }

    if (sortBy === 'wage') {
      const levelKey = `l${activeLevel}`;
      locations = [...locations].sort((a, b) => a[levelKey] - b[levelKey]);
    }

    return locations;
  }, [results, activeLevel, locationFilter, sortBy]);

  const formatCurrency = (num) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatSalaryInput = (value) => {
    const num = value.replace(/[^0-9]/g, '');
    if (!num) return '';
    return new Intl.NumberFormat('en-US').format(parseInt(num));
  };

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loader"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Prevailing Wage Finder</h1>
        <p>Find where your salary qualifies as each DOL wage level</p>
      </header>

      <main>
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        <section className="search-section">
          <div className="search-row">
            <div className="field year-field">
              <label htmlFor="year-select">Year</label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={loadingData}
              >
                {manifest?.years && [...manifest.years].sort((a, b) => b.label.localeCompare(a.label)).map(y => (
                  <option key={y.label} value={y.label}>FY {y.label}</option>
                ))}
              </select>
            </div>

            <div className="field occupation-field" ref={dropdownRef}>
              <label htmlFor="occupation-search">Occupation</label>
              <div className="search-input-wrapper">
                <input
                  id="occupation-search"
                  ref={searchInputRef}
                  type="text"
                  placeholder={loadingData ? 'Loading...' : 'Search job title or SOC code'}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                    if (!e.target.value) setSelectedOccupation(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowDropdown(false);
                    if (e.key === 'ArrowDown' && filteredOccupations.length > 0) {
                      e.preventDefault();
                      const firstItem = dropdownRef.current?.querySelector('.dropdown-item');
                      firstItem?.focus();
                    }
                  }}
                  disabled={loadingData}
                  aria-label="Search for occupation"
                  autoComplete="off"
                />
                {selectedOccupation && (
                  <button
                    className="clear-btn"
                    onClick={() => {
                      setSelectedOccupation(null);
                      setSearchQuery('');
                      setResults(null);
                    }}
                    aria-label="Clear selection"
                  >&times;</button>
                )}
                {showDropdown && searchQuery && filteredOccupations.length > 0 && !selectedOccupation && (
                  <div className="dropdown" role="listbox">
                    {filteredOccupations.map((occ, idx) => (
                      <div
                        key={occ.c}
                        className="dropdown-item"
                        role="option"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedOccupation(occ);
                          setSearchQuery(occ.t);
                          setShowDropdown(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedOccupation(occ);
                            setSearchQuery(occ.t);
                            setShowDropdown(false);
                          }
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const next = e.target.nextElementSibling;
                            next?.focus();
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const prev = e.target.previousElementSibling;
                            if (prev) prev.focus();
                            else searchInputRef.current?.focus();
                          }
                          if (e.key === 'Escape') {
                            setShowDropdown(false);
                            searchInputRef.current?.focus();
                          }
                        }}
                      >
                        <span className="title">{occ.t}</span>
                        <span className="code">{occ.o || occ.c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="field salary-field">
              <label htmlFor="salary-input">Annual Salary</label>
              <div className="salary-input">
                <span>$</span>
                <input
                  id="salary-input"
                  type="text"
                  placeholder="120,000"
                  value={salary}
                  onChange={(e) => setSalary(formatSalaryInput(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && calculateResults()}
                  disabled={loadingData}
                />
              </div>
            </div>

            <button
              className="search-btn"
              onClick={calculateResults}
              disabled={!selectedOccupation || !salary || loadingData || isSearching}
              aria-label={isSearching ? 'Searching...' : 'Search locations'}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </section>

        {loadingData && (
          <div className="loading-card">
            <div className="loader"></div>
            <p>Loading FY {selectedYear} data...</p>
          </div>
        )}

        {results && (
          <section className="results-section">
            <div className="results-summary">
              <div className="summary-text">
                <h2>{results.occupation.t}</h2>
                <p>{formatCurrency(results.salary)} annual salary &bull; {results.total} locations analyzed</p>
              </div>
              <div className="level-tabs">
                {[1, 2, 3, 4].map(level => (
                  <button
                    key={level}
                    className={`level-tab ${activeLevel === level ? 'active' : ''}`}
                    style={{
                      '--tab-color': WAGE_LEVELS[level].color,
                      '--tab-bg': WAGE_LEVELS[level].bg
                    }}
                    onClick={() => setActiveLevel(level)}
                  >
                    <span className="tab-count">{results.levels[level].length}</span>
                    <span className="tab-label">{WAGE_LEVELS[level].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="results-content">
              <div className="results-toolbar">
                <div className="filter-input">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Filter locations..."
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                  />
                </div>
                <div className="sort-options">
                  <button
                    className={sortBy === 'name' ? 'active' : ''}
                    onClick={() => setSortBy('name')}
                  >A-Z</button>
                  <button
                    className={sortBy === 'wage' ? 'active' : ''}
                    onClick={() => setSortBy('wage')}
                  >By Wage</button>
                </div>
                <span className="results-count">
                  {displayedLocations.length} of {results.levels[activeLevel].length}
                </span>
              </div>

              {displayedLocations.length === 0 ? (
                <div className="no-results">
                  {results.levels[activeLevel].length === 0
                    ? `No locations qualify as ${WAGE_LEVELS[activeLevel].label}`
                    : 'No locations match your filter'}
                </div>
              ) : (
                <div className="locations-list">
                  {displayedLocations.map((loc, i) => (
                    <div key={i} className="location-row">
                      <span className="location-name">{loc.area}</span>
                      <span className="location-wages">
                        {activeLevel === 1 && `${formatCurrency(loc.l1)} – ${formatCurrency(loc.l2)}`}
                        {activeLevel === 2 && `${formatCurrency(loc.l2)} – ${formatCurrency(loc.l3)}`}
                        {activeLevel === 3 && `${formatCurrency(loc.l3)} – ${formatCurrency(loc.l4)}`}
                        {activeLevel === 4 && `${formatCurrency(loc.l4)}+`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {results.levels[0].length > 0 && (
              <div className="below-threshold">
                {results.levels[0].length} location(s) below Level 1 threshold
              </div>
            )}
          </section>
        )}

        {!results && !loadingData && wageData && (
          <section className="info-section">
            <h3>Wage Level Guide</h3>
            <div className="info-cards">
              {[1, 2, 3, 4].map(level => (
                <div
                  key={level}
                  className="info-card"
                  style={{ '--card-color': WAGE_LEVELS[level].color }}
                >
                  <div className="info-level">{WAGE_LEVELS[level].label}</div>
                  <div className="info-percentile">{WAGE_LEVELS[level].percentile} percentile</div>
                  <div className="info-desc">{WAGE_LEVELS[level].desc}</div>
                </div>
              ))}
            </div>
            <p className="info-source">
              Data: <a href="https://flag.dol.gov/wage-data" target="_blank" rel="noopener noreferrer">DOL OFLC</a> &bull; {wageData.occupations.length} occupations &bull; {wageData.areas.length} areas
            </p>
          </section>
        )}
      </main>

      <footer>
        <a href="https://flag.dol.gov/wage-data" target="_blank" rel="noopener noreferrer">DOL Data Source</a>
        <span>&bull;</span>
        <a href="https://github.com/Revanth-guduru-balaji/Wage-Finder" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
