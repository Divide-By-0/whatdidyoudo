import { NextResponse } from "next/server";
import { fetchRepoCommits, EnrichedCommit } from "../../../lib/github";
import { env } from "../../../env.mjs"

const BATCH_SIZE = 3; // Number of repos to process in parallel
const RATE_LIMIT_DELAY = 1000; // 1 second delay between batches

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");
    const fromDate = searchParams.get("from");
    const reposParam = searchParams.get("repos");
    const isOrg = searchParams.get("isOrg") === "true";
    
    if (!username || !fromDate || !reposParam) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const startDate = new Date(fromDate);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    let repos: string[];
    try {
      repos = JSON.parse(reposParam);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid repos parameter" },
        { status: 400 }
      );
    }

    const allCommits: { 
      defaultBranch: EnrichedCommit[],
      otherBranches: EnrichedCommit[]
    } = {
      defaultBranch: [],
      otherBranches: []
    };

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for (let i = 0; i < repos.length; i += BATCH_SIZE) {
            const batch = repos.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map((repo: string) => 
              fetchRepoCommits(repo, env.GITHUB_TOKEN, startDate)
                .catch(error => {
                  console.error(`Error fetching commits for ${repo}:`, error);
                  return null;
                })
            );

            const batchResults = await Promise.all(batchPromises);

            batchResults.forEach((result) => {
              if (!result?.data?.repository) return;
              
              const repository = result.data.repository;
              const defaultBranchName = repository.defaultBranchRef?.name;
              if (!defaultBranchName) return;

              repository.refs.nodes.forEach((branch) => {
                if (!branch?.target?.history?.nodes) return;

                const commits = branch.target.history.nodes
                  .filter(commit => commit && (isOrg || commit.author?.user?.login?.toLowerCase() === username.toLowerCase()))
                  .map(commit => ({
                    ...commit,
                    repository: {
                      name: repository.name,
                      nameWithOwner: repository.nameWithOwner,
                    },
                    branch: branch.name,
                  }));

                if (branch.name === defaultBranchName) {
                  allCommits.defaultBranch.push(...commits);
                } else {
                  allCommits.otherBranches.push(...commits);
                }
              });
            });

            try {
              controller.enqueue(
                encoder.encode(`data: ${Math.min(i + BATCH_SIZE, repos.length)} of ${repos.length} repositories processed\n\n`)
              );
            } catch (error) {
              console.error('Error sending progress update:', error);
            }

            if (i + BATCH_SIZE < repos.length) {
              await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            }
          }

          allCommits.defaultBranch.sort((a, b) => 
            new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime()
          );
          allCommits.otherBranches.sort((a, b) => 
            new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime()
          );

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(allCommits)}\n\n`)
          );
        } catch (error) {
          console.error('Error processing commits:', error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("Error in commits endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
} 