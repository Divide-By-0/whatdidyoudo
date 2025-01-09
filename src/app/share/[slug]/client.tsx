"use client";

import { useEffect, useState, useMemo } from "react";
import { EnrichedCommit } from "../../../lib/github";
import ReactMarkdown from 'react-markdown';
import Link from "next/link";

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

interface ActivitySession {
  id: string;
  username: string;
  startTime: string;
  endTime: string;
  summary: string;
  commits: EnrichedCommit[];
  issues: IssueOrPR[];
  pullRequests: IssueOrPR[];
  createdAt: string;
  updatedAt: string;
}

export function SharePageClient({ params }: { params: Promise<{ slug: string }> }) {
  const [activity, setActivity] = useState<ActivitySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTypes, setSelectedTypes] = useState<('commit' | 'issue' | 'pr')[]>(['commit', 'issue', 'pr']);
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [isOrganization, setIsOrganization] = useState<boolean | null>(null);
  const itemsPerPage = 20;

  async function checkIfOrganization(name: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.github.com/orgs/${name}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    async function fetchActivity() {
      try {
        const { slug } = await params;
        const response = await fetch(`/api/activity?id=${slug}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch activity');
        }
        setActivity(data);
        
        const isOrg = await checkIfOrganization(data.username);
        setIsOrganization(isOrg);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch activity');
      } finally {
        setLoading(false);
      }
    }

    fetchActivity();
  }, [params]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const repositories = useMemo(() => {
    if (!activity) return [];
    
    const repoSet = new Set([
      ...(activity.commits || []).map(commit => commit.repository.nameWithOwner),
      ...(activity.issues || []).map(issue => issue.repository.nameWithOwner),
      ...(activity.pullRequests || []).map(pr => pr.repository.nameWithOwner)
    ]);
    
    return ['all', ...Array.from(repoSet)].sort();
  }, [activity]);

  const paginatedItems = useMemo(() => {
    if (!activity) return [];
    
    const allItems = [
      ...(selectedTypes.includes('commit') ? activity.commits || [] : []),
      ...(selectedTypes.includes('issue') ? activity.issues || [] : []),
      ...(selectedTypes.includes('pr') ? activity.pullRequests || [] : [])
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
  }, [activity, currentPage, selectedTypes, selectedRepo]);

  const totalPages = useMemo(() => {
    if (!activity) return 0;
    
    const filteredCount = [
      ...(selectedTypes.includes('commit') ? activity.commits || [] : []),
      ...(selectedTypes.includes('issue') ? activity.issues || [] : []),
      ...(selectedTypes.includes('pr') ? activity.pullRequests || [] : [])
    ]
    .filter(item => selectedRepo === 'all' || item.repository.nameWithOwner === selectedRepo)
      .length;
    
    return Math.ceil(filteredCount / itemsPerPage);
  }, [activity, selectedTypes, selectedRepo]);

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

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center bg-black p-8 text-white">
        <div className="w-full max-w-4xl text-center">
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading activity...
          </div>
        </div>
      </main>
    );
  }

  if (error || !activity) {
    return (
      <main className="flex min-h-screen flex-col items-center bg-black p-8 text-white">
        <div className="w-full max-w-4xl">
          <div className="rounded-lg bg-red-500/20 p-4 text-red-200 mb-4">
            {error || 'Activity not found'}
          </div>
          <div className="flex justify-center">
            <Link 
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const startDate = new Date(activity.startTime);
  const endDate = new Date(activity.endTime);
  const uniqueRepos = new Set([
    ...(activity.commits || []).map(commit => commit.repository.nameWithOwner),
    ...(activity.issues || []).map(issue => issue.repository.nameWithOwner),
    ...(activity.pullRequests || []).map(pr => pr.repository.nameWithOwner)
  ]).size;

  return (
    <main className="flex min-h-screen flex-col items-center bg-black p-8 text-white">
      <div className="w-full max-w-4xl">
        <h1 className="mb-4 text-center text-4xl font-bold">
          {isOrganization ? (
            <>What happened in <span className="font-bold text-blue-400">{activity.username}</span>?</>
          ) : (
            <>What did <span className="font-bold text-blue-400">{activity.username}</span> get done?</>
          )}
        </h1>

        <div className="mb-8 text-center text-lg text-white/80">
          From {startDate.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' })} to {endDate.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg bg-white/5 p-4 text-center">
            <p className="text-lg text-white/90">
              {activity.commits?.length > 0 && (
                <><span className="font-bold text-blue-400">{activity.commits.length}</span> commits{(activity.issues?.length > 0 || activity.pullRequests?.length > 0) && ','}{' '}</>
              )}
              {activity.issues?.length > 0 && (
                <><span className="font-bold text-blue-400">{activity.issues.length}</span> issues{activity.pullRequests?.length > 0 && ','}{' '}</>
              )}
              {activity.pullRequests?.length > 0 && (
                <><span className="font-bold text-blue-400">{activity.pullRequests.length}</span> pull requests{' '}</>
              )}
              across{' '}<span className="font-bold text-blue-400">{uniqueRepos}</span> repositories
            </p>
          </div>

          {activity.summary && (
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
                  {activity.summary}
                </ReactMarkdown>
              </div>
            </div>
          )}

          <div className="mb-6 space-y-4">
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
                  Commits ({activity.commits?.length || 0})
                </button>
                <button
                  onClick={() => handleTypeToggle('issue')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedTypes.includes('issue')
                      ? 'bg-green-500/20 text-green-200'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  Issues ({activity.issues?.length || 0})
                </button>
                <button
                  onClick={() => handleTypeToggle('pr')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedTypes.includes('pr')
                      ? 'bg-purple-500/20 text-purple-200'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  Pull Requests ({activity.pullRequests?.length || 0})
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
                      <div key={item.oid} className="rounded-lg bg-white/10 p-4">
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
                      <div key={`${item.type}-${item.id}`} className="rounded-lg bg-white/10 p-4">
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
        </div>
      </div>
      <Link
        href="/"
        className="hidden md:block fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-2 text-sm text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20 hover:border-blue-500/30"
      >
        Generate your own →
      </Link>
    </main>
  );
} 