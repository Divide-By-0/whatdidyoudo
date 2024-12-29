"use client";

import { useState } from "react";
import { EnrichedCommit } from "../lib/github";

interface Branch {
  name: string;
  sha: string;
}

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [timeframe, setTimeframe] = useState("week");
  const [customDays, setCustomDays] = useState("1");
  const [commits, setCommits] = useState<{
    defaultBranch: EnrichedCommit[];
    otherBranches: EnrichedCommit[];
  }>({ defaultBranch: [], otherBranches: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showNonDefaultBranches, setShowNonDefaultBranches] = useState(false);

  async function fetchUserRepos(username: string, since: string): Promise<string[]> {
    // First try the events API to get recent activity
    const eventsResponse = await fetch(
      `https://api.github.com/users/${username}/events/public`
    );
    
    if (!eventsResponse.ok) {
      throw new Error(`GitHub API error: ${eventsResponse.statusText}`);
    }

    const events = await eventsResponse.json();
    const repoSet = new Set<string>();

    // Get repos from push events
    events.forEach((event: any) => {
      if (event.repo) {
        repoSet.add(event.repo.name);
      }
    });

    // Also fetch user's repositories to catch any that might not be in recent events
    const reposResponse = await fetch(
      `https://api.github.com/users/${username}/repos?sort=pushed&direction=desc`
    );

    if (reposResponse.ok) {
      const repos = await reposResponse.json();
      repos.forEach((repo: any) => {
        if (new Date(repo.pushed_at) >= new Date(since)) {
          repoSet.add(repo.full_name);
        }
      });
    }

    // Get repositories the user has contributed to
    const contributedReposResponse = await fetch(
      `https://api.github.com/search/commits?q=author:${username}+committer-date:>${since}&sort=committer-date&order=desc&per_page=100`,
      {
        headers: {
          'Accept': 'application/vnd.github.cloak-preview'
        }
      }
    );

    if (contributedReposResponse.ok) {
      const contributedData = await contributedReposResponse.json();
      contributedData.items?.forEach((item: any) => {
        if (item.repository) {
          repoSet.add(item.repository.full_name);
        }
      });
    }

    return Array.from(repoSet);
  }

  async function fetchCommits() {
    if (!username) {
      setError("Please enter a GitHub username");
      return;
    }

    if (timeframe === "custom" && (isNaN(Number(customDays)) || Number(customDays) < 1)) {
      setError("Please enter a valid number of days (minimum 1)");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      // Calculate the from date based on timeframe
      const now = new Date();
      let fromDate = new Date();

      switch (timeframe) {
        case "24h":
          fromDate.setHours(now.getHours() - 24);
          break;
        case "week":
          fromDate.setDate(now.getDate() - 7);
          break;
        case "month":
          fromDate.setMonth(now.getMonth() - 1);
          break;
        case "year":
          fromDate.setFullYear(now.getFullYear() - 1);
          break;
        case "custom":
          fromDate.setDate(now.getDate() - Number(customDays));
          break;
      }

      // First get the list of repositories from GitHub's REST API
      const repos = await fetchUserRepos(username, fromDate.toISOString());
      
      // Then fetch detailed commit information from our server
      const response = await fetch(
        `/api/github/commits?username=${encodeURIComponent(username)}&from=${fromDate.toISOString()}&repos=${encodeURIComponent(JSON.stringify(repos))}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch commits');
      }

      const data = await response.json();
      setCommits(data);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      setCommits({ defaultBranch: [], otherBranches: [] });
    } finally {
      setLoading(false);
    }
  }

  const displayedCommits = showNonDefaultBranches ? commits.otherBranches : commits.defaultBranch;

  return (
    <main className="flex min-h-screen flex-col items-center bg-black p-8 text-white">
      <div className="w-full max-w-4xl">
        <h1 className="mb-8 text-center text-4xl font-bold">
          {username ? (
            <>What did <span className="font-bold text-blue-400">{username}</span> do in the last {timeframe === "custom" ? `${customDays} day${Number(customDays) > 1 ? 's' : ''}` : timeframe}?</>
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
              setCommits({ defaultBranch: [], otherBranches: [] });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchCommits();
              }
            }}
            placeholder="GitHub username"
            className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder:text-white/50"
          />
          
          <select
            value={timeframe}
            onChange={(e) => {
              setTimeframe(e.target.value);
              setCommits({ defaultBranch: [], otherBranches: [] });
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
                setCommits({ defaultBranch: [], otherBranches: [] });
              }}
              min="1"
              placeholder="Number of days"
              className="w-24 rounded-lg bg-white/10 px-4 py-2 text-white"
            />
          )}

          <button
            onClick={() => fetchCommits()}
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

        {(commits.defaultBranch.length > 0 || commits.otherBranches.length > 0) && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNonDefaultBranches(false)}
                  className={`rounded-lg px-4 py-2 ${!showNonDefaultBranches ? 'bg-blue-500' : 'bg-white/10'}`}
                >
                  Default Branch ({commits.defaultBranch.length})
                </button>
                <button
                  onClick={() => setShowNonDefaultBranches(true)}
                  className={`rounded-lg px-4 py-2 ${showNonDefaultBranches ? 'bg-blue-500' : 'bg-white/10'}`}
                >
                  Other Branches ({commits.otherBranches.length})
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {displayedCommits.map((commit, index) => (
                <div key={`${commit.oid}-${index}`} className="rounded-lg bg-white/10 p-4">
                  <div className="font-semibold">{commit.repository.nameWithOwner}</div>
                  <div className="text-sm text-white/80">{commit.messageHeadline}</div>
                  <div className="mt-2 text-xs text-white/60">
                    <span className="text-green-400">+{commit.additions}</span>
                    {" / "}
                    <span className="text-red-400">-{commit.deletions}</span>
                    {" lines"}
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{new Date(commit.committedDate).toLocaleDateString()}</span>
                    <span>
                      by {commit.author.user?.login || 'Unknown'} on {commit.branch}
                    </span>
                  </div>
                  <a 
                    href={commit.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-2 inline-block text-xs text-blue-400 hover:underline"
                  >
                    View on GitHub
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
