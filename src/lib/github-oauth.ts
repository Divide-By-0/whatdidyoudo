import { EnrichedCommit } from './github';
import { IssueOrPR } from './github-api';

interface GitHubResponse<T> {
  data: T;
  error?: string;
}

export async function fetchUserProfile(accessToken: string): Promise<GitHubResponse<any>> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to fetch user profile' };
  }
}

export async function fetchUserRepos(accessToken: string, since: string, includePrivate: boolean = false): Promise<GitHubResponse<string[]>> {
  try {
    const repoSet = new Set<string>();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.github.com/user/repos?sort=pushed&direction=desc&per_page=100&page=${page}${includePrivate ? '' : '&visibility=public'}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const repos = await response.json();
      if (repos.length === 0) {
        hasMore = false;
        break;
      }

      repos.forEach((repo: any) => {
        if (new Date(repo.pushed_at) >= new Date(since)) {
          repoSet.add(repo.full_name);
        }
      });

      page++;
    }

    return { data: Array.from(repoSet) };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : 'Failed to fetch user repositories' };
  }
}

export async function fetchUserCommits(accessToken: string, since: string, includePrivate: boolean = false): Promise<GitHubResponse<EnrichedCommit[]>> {
  try {
    const commits: EnrichedCommit[] = [];
    let page = 1;
    let hasMore = true;

    // First get the user's login
    const profileResponse = await fetchUserProfile(accessToken);
    if (profileResponse.error) {
      throw new Error(profileResponse.error);
    }
    const username = profileResponse.data.login;

    // Get all repositories first
    const reposResponse = await fetchUserRepos(accessToken, since, includePrivate);
    if (reposResponse.error) {
      throw new Error(reposResponse.error);
    }

    // Search commits in each repository
    for (const repo of reposResponse.data) {
      while (hasMore) {
        const response = await fetch(
          `https://api.github.com/search/commits?q=author:${username}+repo:${repo}+committer-date:>${since}&sort=committer-date&order=desc&per_page=100&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.cloak-preview+json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
          hasMore = false;
          break;
        }

        commits.push(...data.items.map((item: any) => ({
          oid: item.sha,
          messageHeadline: item.commit.message.split('\n')[0],
          messageBody: item.commit.message,
          committedDate: item.commit.committer.date,
          additions: item.stats?.additions || 0,
          deletions: item.stats?.deletions || 0,
          repository: {
            nameWithOwner: item.repository.full_name,
          },
          branch: item.branch || 'main',
          author: {
            user: {
              login: item.author?.login || item.committer?.login,
            },
          },
          url: item.html_url,
        })));

        hasMore = data.items.length === 100;
        page++;
      }
      hasMore = true;
      page = 1;
    }

    return { data: commits };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : 'Failed to fetch user commits' };
  }
}

export async function fetchUserIssuesAndPRs(accessToken: string, since: string, includePrivate: boolean = false): Promise<GitHubResponse<IssueOrPR[]>> {
  try {
    const issues: IssueOrPR[] = [];
    let page = 1;
    let hasMore = true;

    // First get the user's login
    const profileResponse = await fetchUserProfile(accessToken);
    if (profileResponse.error) {
      throw new Error(profileResponse.error);
    }
    const username = profileResponse.data.login;

    // Get all repositories first
    const reposResponse = await fetchUserRepos(accessToken, since, includePrivate);
    if (reposResponse.error) {
      throw new Error(reposResponse.error);
    }

    // Search issues in each repository
    for (const repo of reposResponse.data) {
      while (hasMore) {
        const response = await fetch(
          `https://api.github.com/search/issues?q=author:${username}+repo:${repo}+created:>=${since}&sort=created&order=desc&per_page=100&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
          hasMore = false;
          break;
        }

        issues.push(...data.items.map((item: any) => ({
          id: item.id,
          title: item.title,
          number: item.number,
          state: item.state,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          url: item.html_url,
          repository: {
            nameWithOwner: item.repository.full_name,
          },
          type: item.pull_request ? 'pr' : 'issue',
        })));

        hasMore = data.items.length === 100;
        page++;
      }
      hasMore = true;
      page = 1;
    }

    return { data: issues };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : 'Failed to fetch user issues and PRs' };
  }
}

export async function fetchUserContributions(accessToken: string, since: string, includePrivate: boolean = false): Promise<GitHubResponse<{
  commits: EnrichedCommit[];
  issues: IssueOrPR[];
  repositories: string[];
}>> {
  try {
    // First get the user's login
    const profileResponse = await fetchUserProfile(accessToken);
    if (profileResponse.error) {
      throw new Error(profileResponse.error);
    }
    const username = profileResponse.data.login;

    // Check if we have the necessary scopes for private repos
    if (includePrivate) {
      const scopeResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      
      const scopes = scopeResponse.headers.get('x-oauth-scopes');
      if (!scopes?.includes('repo')) {
        throw new Error('Private repository access requires additional authorization. Please sign out and sign in again with the correct permissions.');
      }
    }

    const [reposResponse, commitsResponse, issuesResponse] = await Promise.all([
      fetchUserRepos(accessToken, since, includePrivate),
      fetchUserCommits(accessToken, since, includePrivate),
      fetchUserIssuesAndPRs(accessToken, since, includePrivate),
    ]);

    if (reposResponse.error) throw new Error(reposResponse.error);
    if (commitsResponse.error) throw new Error(commitsResponse.error);
    if (issuesResponse.error) throw new Error(issuesResponse.error);

    return {
      data: {
        commits: commitsResponse.data,
        issues: issuesResponse.data,
        repositories: reposResponse.data,
      },
    };
  } catch (error) {
    return {
      data: { commits: [], issues: [], repositories: [] },
      error: error instanceof Error ? error.message : 'Failed to fetch user contributions',
    };
  }
} 