import { z } from "zod";

const CommitSchema = z.object({
  messageHeadline: z.string(),
  oid: z.string(),
  committedDate: z.string(),
  url: z.string(),
  additions: z.number(),
  deletions: z.number(),
  author: z.object({
    user: z.object({
      login: z.string(),
    }).nullable(),
  }),
});

export interface EnrichedCommit {
  messageHeadline: string;
  oid: string;
  committedDate: string;
  url: string;
  additions: number;
  deletions: number;
  author: {
    user: {
      login: string;
    } | null;
  };
  repository: {
    name: string;
    nameWithOwner: string;
  };
  branch: string;
}

const CommitHistorySchema = z.object({
  nodes: z.array(CommitSchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
  }),
});

const BranchSchema = z.object({
  name: z.string(),
  isDefault: z.boolean(),
  target: z.object({
    history: CommitHistorySchema,
  }),
});

// Schema for the initial repository list query
const ContributedRepoSchema = z.object({
  repository: z.object({
    name: z.string(),
    nameWithOwner: z.string(),
    defaultBranchRef: z.object({
      name: z.string(),
    }),
  }),
});

const UserContributionsResponseSchema = z.object({
  data: z.object({
    user: z.object({
      contributionsCollection: z.object({
        commitContributionsByRepository: z.array(ContributedRepoSchema),
      }),
    }),
  }),
});

// Schema for the detailed repository commits query
const RepoCommitsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      name: z.string(),
      nameWithOwner: z.string(),
      defaultBranchRef: z.object({
        name: z.string(),
      }),
      refs: z.object({
        nodes: z.array(z.object({
          name: z.string(),
          target: z.object({
            history: CommitHistorySchema,
          }),
        })),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().nullable(),
        }),
      }),
    }),
  }),
});

export type UserContributionsResponse = z.infer<typeof UserContributionsResponseSchema>;
export type RepoCommitsResponse = z.infer<typeof RepoCommitsResponseSchema>;

const FETCH_REPO_COMMITS_QUERY = `
  query RepoCommits(
    $owner: String!
    $repo: String!
    $since: GitTimestamp!
    $branchCursor: String
    $commitCursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      name
      nameWithOwner
      defaultBranchRef {
        name
      }
      refs(first: 100, refPrefix: "refs/heads/", after: $branchCursor) {
        nodes {
          name
          target {
            ... on Commit {
              history(first: 100, since: $since, after: $commitCursor) {
                nodes {
                  messageHeadline
                  oid
                  committedDate
                  url
                  additions
                  deletions
                  author {
                    user {
                      login
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;


export async function fetchRepoCommits(
  repoWithOwner: string,
  token: string,
  fromDate: Date,
  branchCursor?: string,
  commitCursor?: string
): Promise<RepoCommitsResponse> {
  const [owner, repo] = repoWithOwner.split('/');
  const variables = {
    owner,
    repo,
    since: fromDate.toISOString().split('.')[0]+"Z",
    branchCursor,
    commitCursor,
  };
  console.log("hello", token);
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: FETCH_REPO_COMMITS_QUERY,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'GraphQL Error');
  }

  return RepoCommitsResponseSchema.parse(data);
} 