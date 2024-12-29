"use client";

import { useState } from "react";
import { EnrichedCommit } from "../lib/github";

interface Branch {
  name: string;
  sha: string;
}

interface Progress {
  stage: 'checking-type' | 'finding-repos' | 'fetching-commits';
  reposFound?: number;
  reposProcessed?: number;
  totalRepos?: number;
  message?: string;
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
  const [isOrganization, setIsOrganization] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function checkIfOrganization(name: string): Promise<boolean> {
    setProgress({ stage: 'checking-type' });
    try {
      const response = await fetch(`https://api.github.com/orgs/${name}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async function fetchOrganizationRepos(orgName: string, since: string): Promise<string[]> {
    const repoSet = new Set<string>();
    let page = 1;
    let hasMore = true;

    setProgress({ stage: 'finding-repos', reposFound: 0 });

    while (hasMore) {
      const response = await fetch(
        `https://api.github.com/orgs/${orgName}/repos?type=all&sort=pushed&direction=desc&per_page=100&page=${page}`
      );

      if (!response.ok) {
        break;
      }

      const repos = await response.json();
      if (repos.length === 0) {
        hasMore = false;
        break;
      }

      repos.forEach((repo: any) => {
        if (new Date(repo.pushed_at) >= new Date(since)) {
          repoSet.add(repo.full_name);
          setProgress(prev => prev?.stage === 'finding-repos' 
            ? { ...prev, reposFound: repoSet.size }
            : prev
          );
        }
      });

      page++;
    }

    return Array.from(repoSet);
  }

  async function fetchUserRepos(username: string, since: string): Promise<string[]> {
    const repoSet = new Set<string>();
    setProgress({ stage: 'finding-repos', reposFound: 0 });

    // First try the events API to get recent activity
    const eventsResponse = await fetch(
      `https://api.github.com/users/${username}/events/public`
    );
    
    if (!eventsResponse.ok) {
      throw new Error(`GitHub API error: ${eventsResponse.statusText}`);
    }

    const events = await eventsResponse.json();

    // Get repos from push events
    events.forEach((event: any) => {
      if (event.repo) {
        repoSet.add(event.repo.name);
        setProgress(prev => prev?.stage === 'finding-repos' 
          ? { ...prev, reposFound: repoSet.size }
          : prev
        );
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
          setProgress(prev => prev?.stage === 'finding-repos' 
            ? { ...prev, reposFound: repoSet.size }
            : prev
          );
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
          setProgress(prev => prev?.stage === 'finding-repos' 
            ? { ...prev, reposFound: repoSet.size }
            : prev
          );
        }
      });
    }

    return Array.from(repoSet);
  }

  async function fetchCommits() {
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
    setProgress(null);
    setCommits({ defaultBranch: [], otherBranches: [] });
    setHasSearched(true);
    
    try {
      // First check if this is an organization
      const isOrg = await checkIfOrganization(username);
      setIsOrganization(isOrg);

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

      // Get repositories based on whether this is a user or organization
      const repos = isOrg 
        ? await fetchOrganizationRepos(username, fromDate.toISOString())
        : await fetchUserRepos(username, fromDate.toISOString());

      if (repos.length === 0) {
        setError(`No repositories with recent activity found for ${isOrg ? 'organization' : 'user'} "${username}"`);
        return;
      }

      setProgress({ 
        stage: 'fetching-commits', 
        reposProcessed: 0, 
        totalRepos: repos.length,
        message: 'Starting to process repositories...'
      });
      
      // Then fetch detailed commit information from our server
      const response = await fetch(
        `/api/github/commits?${new URLSearchParams({
          username,
          from: fromDate.toISOString(),
          repos: JSON.stringify(repos),
          isOrg: isOrg.toString()
        })}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch commits');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value as Uint8Array, { stream: true });
        const lines = buffer.split('\n');
        
        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]?.trim();
          if (line?.startsWith('data: ')) {
            const data = line.slice(6);
            if (typeof data === 'string' && data.includes('repositories processed')) {
              // This is a progress update
              const matches = data.match(/(\d+) of (\d+)/);
              if (matches) {
                const [, processed, total] = matches;
                setProgress(prev => prev?.stage === 'fetching-commits'
                  ? { 
                      ...prev, 
                      reposProcessed: parseInt(processed ?? "0", 10),
                      message: data
                    }
                  : prev
                );
              }
            } else if (typeof data === 'string') {
              try {
                // This should be the final data
                const commitData = JSON.parse(data);
                setCommits(commitData);
              } catch (e) {
                console.error('Failed to parse commit data:', e);
              }
            }
          }
        }
        
        // Keep the last incomplete line in the buffer
        buffer = lines[lines.length - 1] ?? "";
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      setCommits({ defaultBranch: [], otherBranches: [] });
      setIsOrganization(null);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const displayedCommits = showNonDefaultBranches ? commits.otherBranches : commits.defaultBranch;

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
              setCommits({ defaultBranch: [], otherBranches: [] });
              setIsOrganization(null);
              setProgress(null);
              setHasSearched(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchCommits();
              }
            }}
            placeholder="GitHub username or organization"
            className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder:text-white/50"
          />
          
          <select
            value={timeframe}
            onChange={(e) => {
              setTimeframe(e.target.value);
              setCommits({ defaultBranch: [], otherBranches: [] });
              if (hasSearched) fetchCommits();
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

        {progress && (
          <div className="mb-4 rounded-lg bg-blue-500/20 p-4 text-blue-200">
            {progress.stage === 'checking-type' && (
              <p>Checking if {username} is a user or organization...</p>
            )}
            {progress.stage === 'finding-repos' && (
              <p>Found {progress.reposFound} repositories with recent activity...</p>
            )}
            {progress.stage === 'fetching-commits' && (
              <div>
                <p>{progress.message}</p>
                {progress.reposProcessed !== undefined && progress.totalRepos && (
                  <div className="mt-2 h-2 w-full rounded-full bg-blue-900">
                    <div 
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ 
                        width: `${(progress.reposProcessed / progress.totalRepos) * 100}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {hasSearched && !loading && !error && commits.defaultBranch.length === 0 && commits.otherBranches.length === 0 && username && (
          <div className="mb-4 rounded-lg bg-yellow-500/20 p-4 text-yellow-200">
            No commits found in the selected time period. Try:
            <ul className="mt-2 list-disc pl-6">
              <li>Extending the time range</li>
              <li>Checking the username spelling</li>
              <li>Making sure the repositories are public</li>
            </ul>
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
