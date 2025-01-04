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
  const [selectedTypes, setSelectedTypes] = useState<('commit' | 'issue' | 'pr')[]>(['commit', 'issue', 'pr']);
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const itemsPerPage = 20;
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [showNotification, setShowNotification] = useState(false);

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

  const uniqueRepos = useMemo(() => {
    const repoSet = new Set([
      ...allCommits.map(commit => commit.repository.nameWithOwner),
      ...issuesAndPRs.map(item => item.repository.nameWithOwner)
    ]);
    return repoSet.size;
  }, [allCommits, issuesAndPRs]);
  const uniqueBranches = useMemo(() => new Set(allCommits.map(commit => `${commit.repository.nameWithOwner}:${commit.branch}`)).size, [allCommits]);

  const repositories = useMemo(() => {
    const repoSet = new Set([
      ...allCommits.map(commit => commit.repository.nameWithOwner),
      ...issuesAndPRs.map(item => item.repository.nameWithOwner)
    ]);
    
    return ['all', ...Array.from(repoSet)].sort();
  }, [allCommits, issuesAndPRs]);

  const paginatedItems = useMemo(() => {
    const allItems = [
      ...(selectedTypes.includes('commit') ? allCommits : []),
      ...(selectedTypes.includes('issue') ? issuesAndPRs.filter(item => item.type === 'issue') : []),
      ...(selectedTypes.includes('pr') ? issuesAndPRs.filter(item => item.type === 'pr') : [])
    ]
    .filter(item => selectedRepo === 'all' || item.repository.nameWithOwner === selectedRepo)
    .sort((a, b) => {
      const dateA = new Date('committedDate' in a ? a.committedDate : a.updatedAt).getTime();
      const dateB = new Date('committedDate' in b ? b.committedDate : b.updatedAt).getTime();
      return dateB - dateA;
    });

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return allItems.slice(startIndex, endIndex);
  }, [allCommits, issuesAndPRs, currentPage, selectedTypes, selectedRepo]);

  const totalPages = useMemo(() => {
    const filteredCount = [
      ...(selectedTypes.includes('commit') ? allCommits : []),
      ...(selectedTypes.includes('issue') ? issuesAndPRs.filter(item => item.type === 'issue') : []),
      ...(selectedTypes.includes('pr') ? issuesAndPRs.filter(item => item.type === 'pr') : [])
    ]
    .filter(item => selectedRepo === 'all' || item.repository.nameWithOwner === selectedRepo)
      .length;
    
    return Math.ceil(filteredCount / itemsPerPage);
  }, [allCommits, issuesAndPRs, selectedTypes, selectedRepo]);

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

  async function fetchIssuesAndPRs(fromDate: Date, isOrg: boolean) {
    setIssuesAndPRs([]);
    setProgress(prev => ({ ...prev, stage: 'fetching-issues', message: 'Fetching issues and pull requests...' }));

    try {
      if (isOrg) {
        const query = `org:${username} updated:>=${fromDate.toISOString().split('T')[0]}`;
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
        setIssuesAndPRs(transformIssuesData(data.items || []));
        return;
      }
      const response = await fetch(
        `https://api.github.com/search/issues?${new URLSearchParams({
          q: `author:${username} created:>=${fromDate.toISOString().split('T')[0]}`,
          sort: 'created',
          order: 'desc',
          per_page: '100'
        })}`
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      setIssuesAndPRs(transformIssuesData(data.items));
    } finally {
      setProgress(prev => prev?.stage === 'fetching-issues' ? null : prev);
    }
  }


  function transformIssuesData(items: any[]): IssueOrPR[] {
    return items.map((item: any) => {
      let repoName = 'unknown';
      if (item.repository?.full_name) {
        repoName = item.repository.full_name;
      } else if (item.repository_url) {
        repoName = item.repository_url.replace('https://api.github.com/repos/', '');
      } else if (item.url) {
        const matches = item.url.match(/https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)/);
        if (matches) {
          repoName = matches[1];
        }
      }

      const isPR = Boolean(
        item.pull_request || 
        item.url?.includes('/pulls/') || 
        item.html_url?.includes('/pull/')
      );

      return {
        id: item.id,
        title: item.title,
        number: item.number,
        state: item.state,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        url: item.html_url,
        repository: {
          nameWithOwner: repoName
        },
        type: isPR ? 'pr' : 'issue'
      };
    });
  }

  async function fetchCommits(overrideTimeframe?: string) {
    if (!username) {
      setError("Please enter a GitHub username or organization");
      return;
    }

    try {
      const userResponse = await fetch(`https://api.github.com/users/${username}`);
      if (!userResponse.ok) {
        setError(`User or organization "${username}" does not exist on GitHub`);
        return;
      }
    } catch (err) {
      setError("Failed to verify username existence");
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
    setIssuesAndPRs([]);
    
    try {
      const isOrg = await checkIfOrganization(username);
      setIsOrganization(isOrg);

      const now = new Date();
      const fromDate = new Date();

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
      let latestCommitData: { defaultBranch: EnrichedCommit[]; otherBranches: EnrichedCommit[] } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value as Uint8Array, { stream: true });
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]?.trim();
          if (line?.startsWith('data: ')) {
            const data = line.slice(6);
            if (typeof data === 'string' && data.includes('repositories processed')) {
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
                const commitData = JSON.parse(data);
                setCommits(commitData);
                latestCommitData = commitData;
              } catch (e) {
                console.error('Failed to parse commit data:', e);
              }
            }
          }
        }
        
        buffer = lines[lines.length - 1] ?? "";
      }

      const allLatestCommits = [...(latestCommitData?.defaultBranch || []), ...(latestCommitData?.otherBranches || [])];
      
      setProgress({ 
        stage: 'fetching-issues',
        message: 'Fetching issues and pull requests...'
      });

      await fetchIssuesAndPRs(fromDate, isOrg)
        .then(() => {
          if (allLatestCommits.length > 0 || issuesAndPRs.length > 0) {
            setProgress(null);
            return generateSummary(allLatestCommits);
          }
        })
        .catch(console.error);

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
        body: JSON.stringify({ commits, issuesAndPRs, username }),
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
          setSummary(prev => prev + line.replace("</contribution_breakdown>", "") + '\n');
        }
        
        buffer = lines[lines.length - 1] || '';
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setSummaryLoading(false);
      setProgress(null);
    }
  }

  async function exportActivity(shouldRedirect = true) {
    if (!username || (!allCommits.length && !issuesAndPRs.length)) {
      return null;
    }

    setExportLoading(true);
    setExportError("");
    if (shouldRedirect) {
      setShareUrl("");
    }

    try {
      const now = new Date();
      const fromDate = new Date();

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

      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
      };

      const id = `${username}-${formatDate(fromDate)}-to-${formatDate(now)}`;
      
      const response = await fetch('/api/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          username,
          startTime: fromDate.toISOString(),
          endTime: now.toISOString(),
          summary,
          commits: allCommits,
          issues: issuesAndPRs.filter(item => item.type === 'issue'),
          pullRequests: issuesAndPRs.filter(item => item.type === 'pr'),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to export activity');
      }

      const data = await response.json();
      const newShareUrl = `${window.location.origin}/share/${data.id}`;
      setShareUrl(newShareUrl);
      
      if (shouldRedirect) {
        window.location.href = newShareUrl;
      }
      
      return newShareUrl;
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export activity');
      return null;
    } finally {
      setExportLoading(false);
    }
  }

  async function handleExport() {
    const url = await exportActivity(false);
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
      } catch (err) {
        setExportError('Failed to copy to clipboard');
      }
    }
  }

  async function handleTwitterShare() {
    const url = await exportActivity(false);
    if (url) {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my GitHub activity summary! ${url}`)}`,
        '_blank'
      );
    }
  }

  const handleTypeToggle = (type: 'commit' | 'issue' | 'pr') => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting if it's the last type selected
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
    setCurrentPage(1);
  };

  const handleRepoChange = (repo: string) => {
    setSelectedRepo(repo);
    setCurrentPage(1);
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
              setCommits({ defaultBranch: [], otherBranches: [] });
              setIssuesAndPRs([]);
              setIsOrganization(null);
              setProgress(null);
              setHasSearched(false);
              setSummary("");
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
              setIssuesAndPRs([]);
              setSummary("");
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
                setSummary("");
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

        {exportError && (
          <div className="mb-4 rounded-lg bg-red-500/20 p-4 text-red-200">
            {exportError}
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
            {progress.stage === 'fetching-issues' && (
              <p>{progress.message}</p>
            )}
          </div>
        )}

        {(allCommits.length === 0 && issuesAndPRs.length === 0) && hasSearched && !loading && !error && (
          <div className="mb-4 rounded-lg bg-yellow-500/20 p-4 text-yellow-200">
            No activity found for {isOrganization ? 'organization' : 'user'} in the selected time period. Try:
            <ul className="mt-2 list-disc pl-6">
              <li>Checking if the username is spelled correctly</li>
              <li>Extending the time period to look further back</li>
              <li>Confirming the account has public repositories</li>
            </ul>
          </div>
        )}

        {(allCommits.length > 0 || issuesAndPRs.length > 0) && (
          <>
            <div className="mb-6 space-y-4">
              <div className="rounded-lg bg-white/5 p-4 text-center">
                <p className="text-lg text-white/90">
                  {allCommits.length > 0 && (
                    <><span className="font-bold text-blue-400">{allCommits.length}</span> commits{(issuesAndPRs.filter(item => item.type === 'issue').length > 0 || issuesAndPRs.filter(item => item.type === 'pr').length > 0) && ','}{' '}</>
                  )}
                  {issuesAndPRs.filter(item => item.type === 'issue').length > 0 && (
                    <><span className="font-bold text-blue-400">{issuesAndPRs.filter(item => item.type === 'issue').length}</span> issues{issuesAndPRs.filter(item => item.type === 'pr').length > 0 && ','}{' '}</>
                  )}
                  {issuesAndPRs.filter(item => item.type === 'pr').length > 0 && (
                    <><span className="font-bold text-blue-400">{issuesAndPRs.filter(item => item.type === 'pr').length}</span> pull requests{' '}</>
                  )}
                  across{' '}<span className="font-bold text-blue-400">{uniqueRepos}</span> repositories
                </p>
                <div className="mt-4 flex justify-center gap-4">
                  {summaryLoading && (
                    <div className="text-blue-200">
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating Activity Summary...
                      </span>
                    </div>
                  )}
                  {!summaryLoading && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleExport}
                        disabled={exportLoading}
                        className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-50 flex items-center gap-2"
                      >
                        {exportLoading ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Generating...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                            Copy Share Link
                          </>
                        )}
                      </button>
                      {showNotification && (
                        <div className="fixed top-4 right-4 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg transition-opacity duration-300">
                          Share link copied to clipboard!
                        </div>
                      )}
                      {summary && (
                        <button
                          onClick={handleTwitterShare}
                          disabled={exportLoading}
                          className="rounded-lg bg-[#1DA1F2]/20 px-4 py-2 text-sm font-semibold text-[#1DA1F2] hover:bg-[#1DA1F2]/30 disabled:opacity-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                          </svg>
                          Share on Twitter
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {summaryError && (
                <div className="rounded-lg bg-red-500/20 p-4 text-red-200">
                  {summaryError}
                </div>
              )}

              {summary && (
                <div className="rounded-lg bg-white/10 p-6">
                  <div className="prose prose-invert max-w-none
                    prose-p:text-white/80
                    prose-ul:text-white/80 
                    prose-ul:list-disc 
                    prose-ul:ml-4
                    prose-ul:my-1
                    prose-ul:prose-ul:ml-4
                    prose-ul:prose-ul:my-0
                    prose-li:my-0.5
                    prose-li:marker:text-blue-400
                    prose-headings:text-white prose-headings:font-semibold
                    prose-h2:text-2xl prose-h2:mb-4
                    prose-h3:text-xl prose-h3:mb-3
                    prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-white prose-strong:font-semibold
                    prose-code:text-yellow-200 
                    prose-code:bg-transparent 
                    prose-code:px-1 
                    prose-code:rounded
                    prose-code:before:content-none
                    prose-code:after:content-none
                    prose-hr:border-white/10">
                    <ReactMarkdown>
                      {summary}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleTypeToggle('commit')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedTypes.includes('commit')
                        ? 'bg-yellow-500/20 text-yellow-200'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    Commits ({allCommits.length})
                  </button>
                  <button
                    onClick={() => handleTypeToggle('issue')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedTypes.includes('issue')
                        ? 'bg-green-500/20 text-green-200'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    Issues ({issuesAndPRs.filter(item => item.type === 'issue').length})
                  </button>
                  <button
                    onClick={() => handleTypeToggle('pr')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedTypes.includes('pr')
                        ? 'bg-purple-500/20 text-purple-200'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    Pull Requests ({issuesAndPRs.filter(item => item.type === 'pr').length})
                  </button>
                </div>

                <select
                  value={selectedRepo}
                  onChange={(e) => handleRepoChange(e.target.value)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white"
                >
                  {repositories.map(repo => (
                    <option key={repo} value={repo}>
                      {repo === 'all' ? 'All Repositories' : repo}
                    </option>
                  ))}
                </select>
              </div>

              {paginatedItems.length === 0 ? (
                <div className="rounded-lg bg-white/5 p-4 text-center text-white/60">
                  No items match the selected filters
                </div>
              ) : (
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
                            by <a href={`https://github.com/${item.author.user?.login}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{item.author.user?.login || 'Unknown'}</a> on <a href={`https://github.com/${item.repository.nameWithOwner}/tree/${item.branch}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{item.branch}</a>
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
              )}

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
            </div>
          </>
        )}
      </div>
    </main>
  );
}
