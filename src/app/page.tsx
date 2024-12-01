"use client";

import { useState } from "react";

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [timeframe, setTimeframe] = useState("week");
  const [customDays, setCustomDays] = useState("1");
  const [commits, setCommits] = useState<Array<{ repo: string; message: string; date: string; timestamp: number; author: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isOrganization, setIsOrganization] = useState<boolean | null>(null);

  async function fetchCommits(pageNum = 1) {
    if (!username) {
      setError("Please enter a GitHub username or organization");
      return;
    }

    if (timeframe === "custom" && (isNaN(Number(customDays)) || Number(customDays) < 1)) {
      setError("Please enter a valid number of days (minimum 1)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const now = new Date();
      let fromDate = new Date();
      switch (timeframe) {
        case "24h":
          fromDate.setHours(now.getHours() - 24);
          break;
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
        case "custom":
          fromDate.setDate(now.getDate() - Number(customDays));
          break;
      }
      // First check if it's an organization or user
      const checkResponse = await fetch(`https://api.github.com/users/${username}`, {
        headers: {
          Accept: "application/vnd.github+json"
        }
      });

      if (!checkResponse.ok) throw new Error("Invalid username or organization");
      
      const userData = await checkResponse.json();
      const isOrg = userData.type === "Organization";
      setIsOrganization(isOrg);

      const dateString = `>${fromDate.toISOString().split('T')[0]}`;
      const query = isOrg 
        ? `org:${username} committer-date:${dateString}`
        : `author:${username} committer-date:${dateString}`;

      const response = await fetch(
        `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&sort=committer-date&order=desc&page=${pageNum}&per_page=50`,
        {
          headers: {
            Accept: "application/vnd.github.cloak-preview+json"
          }
        }
      );

      if (!response.ok) throw new Error("Failed to fetch commits");
      return await processResponse(response, pageNum);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      if (pageNum === 1) {
        setCommits([]);
        setIsOrganization(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function processResponse(response: Response, pageNum: number) {
    const data = await response.json();
    
    const formattedCommits = data.items.map((item: any) => {
      const date = new Date(item.commit.author.date);
      return {
        repo: item.repository.full_name,
        message: item.commit.message,
        date: date.toLocaleDateString(),
        timestamp: date.getTime(),
        author: item.author?.login || item.commit.author.name
      };
    }).sort((a: { timestamp: number }, b: { timestamp: number }) => b.timestamp - a.timestamp);
    
    const linkHeader = response.headers.get("link");
    setHasMore(linkHeader?.includes('rel="next"') ?? false);
    
    if (pageNum === 1) {
      setCommits(formattedCommits);
    } else {
      setCommits(prev => [...prev, ...formattedCommits].sort((a, b) => b.timestamp - a.timestamp));
    }
    setPage(pageNum);
  }

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchCommits(page + 1);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-black p-8 text-white">
      <div className="w-full max-w-4xl">
        <h1 className="mb-8 text-center text-4xl font-bold">
          {username ? (
            <>What {isOrganization ? 'happened in' : 'did'} <span className="font-bold text-blue-400">{username}</span> {isOrganization ? 'in' : 'do in'} the last {timeframe === "custom" ? `${customDays} day${Number(customDays) > 1 ? 's' : ''}` : timeframe}?</>
          ) : (
            "What did you get done?"
          )}
        </h1>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row">
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPage(1);
              setCommits([]);
              setIsOrganization(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchCommits(1);
              }
            }}
            placeholder="GitHub username or organization"
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
            <option value="24h">Last 24 Hours</option>
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
            <option value="year">Past Year</option>
            <option value="custom">Custom Days</option>
          </select>

          {timeframe === "custom" && (
            <input
              type="number"
              value={customDays}
              onChange={(e) => {
                setCustomDays(e.target.value);
                setPage(1);
                setCommits([]);
              }}
              min="1"
              placeholder="Number of days"
              className="w-24 rounded-lg bg-white/10 px-4 py-2 text-white"
            />
          )}

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
                <div className="flex justify-between text-xs text-white/60">
                  <span>{commit.date}</span>
                  <span>by {commit.author}</span>
                </div>
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
