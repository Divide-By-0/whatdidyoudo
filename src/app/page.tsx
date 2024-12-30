"use client";

import { useState, useMemo, useEffect } from "react";
import { EnrichedCommit } from "../lib/github";
import ReactMarkdown from 'react-markdown';

interface Progress {
  stage: 'checking-type' | 'finding-repos' | 'fetching-commits' | 'fetching-issues';
  reposFound?: number;
  reposProcessed?: number;
  totalRepos?: number;
  message?: string;
}

interface IssueOrPR {
  id: number;
  title: string;
  number: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  repository: {
    nameWithOwner: string;
  };
  type: 'issue' | 'pr';
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
  const [isOrganization, setIsOrganization] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [issuesAndPRs, setIssuesAndPRs] = useState<IssueOrPR[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const allCommits = useMemo(() => {
    const commitMap = new Map<string, EnrichedCommit>();
    
    [...commits.defaultBranch, ...commits.otherBranches].forEach(commit => {
      if (!commitMap.has(commit.oid)) {
        commitMap.set(commit.oid, commit);
      }
    });
    
    return Array.from(commitMap.values())
      .sort((a, b) => new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime());
  }, [commits.defaultBranch, commits.otherBranches]);

  const uniqueRepos = useMemo(() => new Set(allCommits.map(commit => commit.repository.nameWithOwner)).size, [allCommits]);
  const uniqueBranches = useMemo(() => new Set(allCommits.map(commit => `${commit.repository.nameWithOwner}:${commit.branch}`)).size, [allCommits]);

  const paginatedItems = useMemo(() => {
    const allItems = [...allCommits, ...issuesAndPRs].sort((a, b) => {
      const dateA = new Date('committedDate' in a ? a.committedDate : a.updatedAt).getTime();
      const dateB = new Date('committedDate' in b ? b.committedDate : b.updatedAt).getTime();
      return dateB - dateA;
    });

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return allItems.slice(startIndex, endIndex);
  }, [allCommits, issuesAndPRs, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil((allCommits.length + issuesAndPRs.length) / itemsPerPage);
  }, [allCommits.length, issuesAndPRs.length]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [username, timeframe, customDays]);

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

  async function fetchIssuesAndPRs(fromDate: Date) {
    setIssuesAndPRs([]);
    setProgress(prev => ({ ...prev, stage: 'fetching-issues', message: 'Fetching issues and pull requests...' }));

    try {
      // Build different queries for users vs organizations
      const query = isOrganization 
        ? `org:${username} updated:>=${fromDate.toISOString().split('T')[0]}`  // Search in all org repos
        : `involves:${username} updated:>=${fromDate.toISOString().split('T')[0]}`; // Search for user involvement

      const response = await fetch(
        `https://api.github.com/search/issues?${new URLSearchParams({
          q: query,
          sort: 'updated',
          order: 'desc',
          per_page: '100'
        })}`
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform the data into our format
      const transformedData: IssueOrPR[] = data.items.map((item: any) => ({
        id: item.id,
        title: item.title,
        number: item.number,
        state: item.state,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        url: item.html_url,
        repository: {
          nameWithOwner: item.repository_url.replace('https://api.github.com/repos/', '')
        },
        type: item.pull_request ? 'pr' : 'issue'
      }));

      setIssuesAndPRs(transformedData);
    } finally {
      setProgress(prev => prev?.stage === 'fetching-issues' ? null : prev);
    }
  }

  async function fetchCommits(overrideTimeframe?: string) {
    if (!username) {
      setError("Please enter a GitHub username or organization");
      return;
    }

    const effectiveTimeframe = overrideTimeframe || timeframe;

    if (effectiveTimeframe === "custom" && (isNaN(Number(customDays)) || Number(customDays) < 1)) {
      setError("Please enter a valid number of days (minimum 1)");
      return;
    }

    setSummary("");
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

      switch (effectiveTimeframe) {
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
        `/api/commits?${new URLSearchParams({
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

      // Fetch issues and PRs in parallel with commits
      fetchIssuesAndPRs(fromDate).catch(console.error);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      setCommits({ defaultBranch: [], otherBranches: [] });
      setIsOrganization(null);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  async function generateSummary(commits: EnrichedCommit[]) {
    setSummaryLoading(true);
    setSummaryError("");
    setSummary("");

    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commits, issuesAndPRs }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to generate summary');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]?.trim() || '';
          if (line === '[DONE]') {
            break;
          }
          setSummary(prev => prev + line + '\n');
        }
        
        buffer = lines[lines.length - 1] || '';
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setSummaryLoading(false);
    }
  }

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
              const newTimeframe = e.target.value;
              setTimeframe(newTimeframe);
              setCommits({ defaultBranch: [], otherBranches: [] });
              if (hasSearched) {
                fetchCommits(newTimeframe);
              }
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

        <div className="my-8">
          <button
            onClick={() => generateSummary(allCommits)}
            disabled={summaryLoading || allCommits.length === 0}
            className="mb-4 rounded-lg bg-blue-500 px-6 py-2 font-semibold hover:bg-blue-600 disabled:opacity-50"
          >
            {summaryLoading ? "Generating Summary..." : "Generate AI Summary"}
          </button>

          {summaryError && (
            <div className="mb-4 rounded-lg bg-red-500/20 p-4 text-red-200">
              {summaryError}
            </div>
          )}

          {summary && (
            <div className="rounded-lg bg-white/10 p-4">
              <div className="prose prose-invert max-w-none
                prose-p:text-white/80
                prose-ul:text-white/80 prose-ul:list-disc prose-ul:ml-4
                prose-li:my-0 prose-li:marker:text-blue-400
                prose-headings:text-white prose-headings:font-semibold
                prose-h2:text-2xl prose-h2:mb-4
                prose-h3:text-xl prose-h3:mb-3
                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-white prose-strong:font-semibold
                prose-code:text-yellow-200 prose-code:bg-white/5 prose-code:px-1 prose-code:rounded
                prose-hr:border-white/10">
                <ReactMarkdown>
                  {summary}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {hasSearched && !loading && !error && allCommits.length === 0 && issuesAndPRs.length === 0 && username && (
          <div className="mb-4 rounded-lg bg-yellow-500/20 p-4 text-yellow-200">
            No activity found in the selected time period. Try:
            <ul className="mt-2 list-disc pl-6">
              <li>Extending the time range</li>
              <li>Checking the username spelling</li>
              <li>Making sure the repositories are public</li>
            </ul>
          </div>
        )}

        {(allCommits.length > 0 || issuesAndPRs.length > 0) && (
          <>
            <div className="mb-6 rounded-lg bg-white/5 p-4 text-center">
              <p className="text-lg text-white/90">
                <span className="font-bold text-blue-400">{allCommits.length}</span> commits,{' '}
                <span className="font-bold text-blue-400">{issuesAndPRs.filter(item => item.type === 'issue').length}</span> issues, and{' '}
                <span className="font-bold text-blue-400">{issuesAndPRs.filter(item => item.type === 'pr').length}</span> pull requests across{' '}
                <span className="font-bold text-blue-400">{uniqueRepos}</span> repositories on{' '}
                <span className="font-bold text-blue-400">{uniqueBranches}</span> branches
              </p>
            </div>

            <div className="space-y-4">
              {paginatedItems.map((item) => {
                if ('committedDate' in item) {
                  // This is a commit
                  return (
                    <div key={`commit-${item.oid}`} className="rounded-lg bg-white/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-block px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-200">
                          Commit
                        </span>
                      </div>
                      <div className="font-semibold">{item.repository.nameWithOwner}</div>
                      <div className="text-sm text-white/80">{item.messageHeadline}</div>
                      <div className="mt-2 text-xs text-white/60">
                        <span className="text-green-400">+{item.additions}</span>
                        {" / "}
                        <span className="text-red-400">-{item.deletions}</span>
                        {" lines"}
                      </div>
                      <div className="flex justify-between text-xs text-white/60">
                        <span>{new Date(item.committedDate).toLocaleDateString()}</span>
                        <span>
                          by {item.author.user?.login || 'Unknown'} on {item.branch}
                        </span>
                      </div>
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mt-2 inline-block text-xs text-blue-400 hover:underline"
                      >
                        View on GitHub
                      </a>
                    </div>
                  );
                } else {
                  // This is an issue or PR
                  return (
                    <div key={`issue-${item.id}`} className="rounded-lg bg-white/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-2 py-1 text-xs rounded ${
                          item.type === 'pr' ? 'bg-purple-500/20 text-purple-200' : 'bg-green-500/20 text-green-200'
                        }`}>
                          {item.type === 'pr' ? 'PR' : 'Issue'}
                        </span>
                        <span className={`inline-block px-2 py-1 text-xs rounded ${
                          item.state === 'open' ? 'bg-blue-500/20 text-blue-200' : 'bg-gray-500/20 text-gray-200'
                        }`}>
                          {item.state}
                        </span>
                      </div>
                      <div className="font-semibold">{item.repository.nameWithOwner}</div>
                      <div className="text-sm text-white/80">{item.title}</div>
                      <div className="mt-2 text-xs text-white/60">
                        #{item.number} • Updated {new Date(item.updatedAt).toLocaleDateString()}
                      </div>
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mt-2 inline-block text-xs text-blue-400 hover:underline"
                      >
                        View on GitHub
                      </a>
                    </div>
                  );
                }
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-white/20"
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    className={`h-8 w-8 rounded-lg ${
                      currentPage === 1
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    1
                  </button>
                  {currentPage > 3 && <span className="px-1">...</span>}
                  {Array.from({ length: Math.min(3, totalPages - 2) }, (_, i) => {
                    const pageNumber = currentPage <= 3 ? i + 2 : currentPage - 1 + i;
                    if (pageNumber < totalPages) {
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => handlePageChange(pageNumber)}
                          className={`h-8 w-8 rounded-lg ${
                            currentPage === pageNumber
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/10 hover:bg-white/20'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    }
                    return null;
                  })}
                  {currentPage < totalPages - 2 && <span className="px-1">...</span>}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    className={`h-8 w-8 rounded-lg ${
                      currentPage === totalPages
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {totalPages}
                  </button>
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-white/20"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
