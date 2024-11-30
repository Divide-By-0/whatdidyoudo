"use client";

import { useState } from "react";

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [timeframe, setTimeframe] = useState("week");
  const [commits, setCommits] = useState<Array<{ repo: string; message: string; date: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  async function fetchCommits(pageNum = 1) {
    if (!username) {
      setError("Please enter a GitHub username");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const now = new Date();
      let fromDate = new Date();
      switch (timeframe) {
        case "week":
          fromDate.setDate(now.getDate() - 8);
          break;
        case "month":
          fromDate.setMonth(now.getMonth() - 1);
          fromDate.setDate(fromDate.getDate() - 1);
          break;
        case "year":
          fromDate.setFullYear(now.getFullYear() - 1);
          fromDate.setDate(fromDate.getDate() - 1);
          break;
      }

      const dateString = `>${fromDate.toISOString().split('T')[0]}`;
      const query = `author:${username} committer-date:${dateString}`;
      
      const response = await fetch(
        `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&page=${pageNum}&per_page=30`,
        {
          headers: {
            Accept: "application/vnd.github.cloak-preview+json"
          }
        }
      );
      
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("API returned invalid response format");
      }
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      
      const formattedCommits = data.items.map((item: any) => ({
        repo: item.repository.full_name,
        message: item.commit.message,
        date: new Date(item.commit.author.date).toLocaleDateString()
      }));
      
      const linkHeader = response.headers.get("link");
      setHasMore(linkHeader?.includes('rel="next"') ?? false);
      
      if (pageNum === 1) {
        setCommits(formattedCommits);
      } else {
        setCommits(prev => [...prev, ...formattedCommits]);
      }
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      if (pageNum === 1) {
        setCommits([]);
      }
    } finally {
      setLoading(false);
    }
  }

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchCommits(page + 1);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-black p-8 text-white">
      <div className="w-full max-w-2xl">
        <h1 className="mb-8 text-center text-4xl font-bold">GitHub Activity Tracker</h1>
        
        <div className="mb-8 flex flex-col gap-4 sm:flex-row">
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPage(1);
              setCommits([]);
            }}
            placeholder="GitHub username"
            className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder:text-white/50"
          />
          
          <select
            value={timeframe}
            onChange={(e) => {
              setTimeframe(e.target.value);
              setPage(1);
              setCommits([]);
            }}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
            <option value="year">Past Year</option>
          </select>

          <button
            onClick={() => fetchCommits(1)}
            disabled={loading}
            className="rounded-lg bg-white/20 px-6 py-2 font-semibold hover:bg-white/30 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 p-4 text-red-200">
            {error}
          </div>
        )}

        {commits && commits.length > 0 && (
          <div className="space-y-4">
            {commits.map((commit, index) => (
              <div key={index} className="rounded-lg bg-white/10 p-4">
                <div className="font-semibold">{commit.repo}</div>
                <div className="text-sm text-white/80">{commit.message}</div>
                <div className="text-xs text-white/60">{commit.date}</div>
              </div>
            ))}
            
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="mt-4 w-full rounded-lg bg-white/20 px-6 py-2 font-semibold hover:bg-white/30 disabled:opacity-50"
              >
                {loading ? "Loading more..." : "Load More"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
