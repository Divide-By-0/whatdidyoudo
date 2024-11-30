"use client";

import { useState } from "react";

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [timeframe, setTimeframe] = useState("week");
  const [commits, setCommits] = useState<Array<{ repo: string; message: string; date: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchCommits() {
    if (!username) {
      setError("Please enter a GitHub username");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`https://api.github.com/users/${username}/events/public`);
      const contentType = response.headers.get("content-type");
      
      // Check if the response is JSON
      if (!contentType?.includes("application/json")) {
        console.log(response);
        throw new Error("API returned invalid response format");
      }
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setCommits(data.commits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      setCommits([]); // Clear any previous commits on error
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-[#2e026d] to-[#15162c] p-8 text-white">
      <div className="w-full max-w-2xl">
        <h1 className="mb-8 text-center text-4xl font-bold">GitHub Activity Tracker</h1>
        
        <div className="mb-8 flex flex-col gap-4 sm:flex-row">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="GitHub username"
            className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder:text-white/50"
          />
          
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
            <option value="year">Past Year</option>
          </select>

          <button
            onClick={fetchCommits}
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
          </div>
        )}
      </div>
    </main>
  );
}
