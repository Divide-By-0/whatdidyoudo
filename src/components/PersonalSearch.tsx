'use client';

interface PersonalSearchProps {
  username: string;
  timeframe: string;
  setTimeframe: (timeframe: string) => void;
  customDays: string;
  setCustomDays: (days: string) => void;
  loading: boolean;
  includePrivate: boolean;
  setIncludePrivate: (include: boolean) => void;
  onSearch: () => void;
  resetState: () => void;
}

export default function PersonalSearch({
  username,
  timeframe,
  setTimeframe,
  customDays,
  setCustomDays,
  loading,
  includePrivate,
  setIncludePrivate,
  onSearch,
  resetState,
}: PersonalSearchProps) {
  const handleTimeframeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTimeframe = e.target.value;
    setTimeframe(newTimeframe);
    resetState();
    window.history.pushState(null, '', '/');
  };

  const handleCustomDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value || (Number(value) >= 1 && Number(value) <= 1000)) {
      setCustomDays(value);
      resetState();
      window.history.pushState(null, '', '/');
    }
  };

  const handleSearch = () => {
    window.history.pushState(null, '', '/');
    onSearch();
  };

  return (
    <div className="mb-8 rounded-lg border border-white/10 bg-white/5 p-6 shadow-lg">
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-white/90">
          Search your activity
        </label>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={username}
            disabled
            className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-white/50 cursor-not-allowed"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-white/90">
          Timeframe
        </label>
        <div className="flex flex-wrap gap-2">
          {["24h", "week", "month", "year", "custom"].map((option) => (
            <button
              key={option}
              onClick={() => setTimeframe(option)}
              className={`rounded-md px-3 py-1 text-sm ${
                timeframe === option
                  ? "bg-blue-500 text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {option === "24h"
                ? "24 hours"
                : option === "custom"
                ? "Custom"
                : option}
            </button>
          ))}
        </div>
      </div>

      {timeframe === "custom" && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-white/90">
            Number of days
          </label>
          <input
            type="number"
            min="1"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="mb-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(e) => setIncludePrivate(e.target.checked)}
            className="h-4 w-4 rounded border-white/10 bg-white/10 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-white/90">
            Include private repositories
          </span>
        </label>
      </div>

      <div className="flex justify-end space-x-2">
        <button
          onClick={resetState}
          className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/20"
        >
          New Search
        </button>
        <button
          onClick={onSearch}
          disabled={loading}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
    </div>
  );
} 