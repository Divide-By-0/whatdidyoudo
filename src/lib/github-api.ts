import { EnrichedCommit } from './github';

export interface IssueOrPR {
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

export interface Progress {
  stage: 'checking-type' | 'finding-repos' | 'fetching-commits' | 'fetching-issues';
  reposFound?: number;
  reposProcessed?: number;
  totalRepos?: number;
  message?: string;
}

export async function checkIfOrganization(name: string, accessToken?: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/orgs/${name}`, {
      headers: {
        ...(accessToken && {
          Authorization: `Bearer ${accessToken}`,
        }),
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchOrganizationRepos(orgName: string, since: string, accessToken?: string): Promise<string[]> {
  const repoSet = new Set<string>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://api.github.com/orgs/${orgName}/repos?type=all&sort=pushed&direction=desc&per_page=100&page=${page}`,
      {
        headers: {
          ...(accessToken && {
            Authorization: `Bearer ${accessToken}`,
          }),
        },
      }
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
      }
    });

    page++;
  }

  return Array.from(repoSet);
}

export async function fetchUserRepos(username: string, since: string, accessToken?: string): Promise<string[]> {
  const repoSet = new Set<string>();

  // First try the events API to get recent activity
  const eventsResponse = await fetch(
    `https://api.github.com/users/${username}/events/public`,
    {
      headers: {
        ...(accessToken && {
          Authorization: `Bearer ${accessToken}`,
        }),
      },
    }
  );

  if (!eventsResponse.ok) {
    throw new Error(`GitHub API error: ${eventsResponse.statusText}`);
  }

  const events = await eventsResponse.json();

  // Get repos from push events
  events.forEach((event: any) => {
    if (event.repo) {
      repoSet.add(event.repo.name);
    }
  });

  // Also fetch user's repositories to catch any that might not be in recent events
  const reposResponse = await fetch(
    `https://api.github.com/users/${username}/repos?sort=pushed&direction=desc`,
    {
      headers: {
        ...(accessToken && {
          Authorization: `Bearer ${accessToken}`,
        }),
      },
    }
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
        'Accept': 'application/vnd.github.cloak-preview',
        ...(accessToken && {
          Authorization: `Bearer ${accessToken}`,
        }),
      },
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

export async function fetchIssuesAndPRs(
  username: string,
  fromDate: Date,
  isOrg: boolean,
  accessToken?: string
): Promise<IssueOrPR[]> {
  try {
    if (isOrg) {
      const query = `org:${username} updated:>=${fromDate.toISOString().split('T')[0]}`;
      let allItems: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          `https://api.github.com/search/issues?${new URLSearchParams({
            q: query,
            sort: 'updated',
            order: 'desc',
            per_page: '100',
            page: page.toString()
          })}`,
          {
            headers: {
              ...(accessToken && {
                Authorization: `Bearer ${accessToken}`,
              }),
            },
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const data = await response.json();
        allItems = [...allItems, ...(data.items || [])];
        
        hasMore = data.items?.length === 100;
        page++;
      }

      return transformIssuesData(allItems);
    }

    let allItems: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.github.com/search/issues?${new URLSearchParams({
          q: `author:${username} created:>=${fromDate.toISOString().split('T')[0]}`,
          sort: 'created',
          order: 'desc',
          per_page: '100',
          page: page.toString()
        })}`,
        {
          headers: {
            ...(accessToken && {
              Authorization: `Bearer ${accessToken}`,
            }),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      allItems = [...allItems, ...data.items];
      
      hasMore = data.items?.length === 100;
      page++;
    }

    return transformIssuesData(allItems);
  } catch (error) {
    console.error('Error fetching issues and PRs:', error);
    return [];
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

export async function verifyUserExists(username: string, accessToken?: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        ...(accessToken && {
          Authorization: `Bearer ${accessToken}`,
        }),
      },
    });
    return response.ok;
  } catch {
    return false;
  }
} 