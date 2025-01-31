import { Anthropic } from '@anthropic-ai/sdk';
import { EnrichedCommit } from '../../../lib/github';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const runtime = 'edge';

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new NextResponse('Anthropic API key not configured', { status: 500 });
  }

  try {
    const { commits, issuesAndPRs, username } = await req.json() as { 
      commits: EnrichedCommit[],
      issuesAndPRs: {
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
      }[];
      username: string;
    };

    if (!commits || !Array.isArray(commits) || !issuesAndPRs || !Array.isArray(issuesAndPRs) || !username) {
      return new NextResponse('Invalid request body', { status: 400 });
    }

    const commitsText = commits.map(commit => {
      return `Repository: ${commit.repository.nameWithOwner}
Message: ${commit.messageHeadline}`;
    }).join('\n---\n');

    const issuesAndPRsText = issuesAndPRs.map(item => {
      return `Type: ${item.type.toUpperCase()}
Repository: ${item.repository.nameWithOwner}
Title: ${item.title}
State: ${item.state}
Number: #${item.number}`;
    }).join('\n---\n');

    const system_prompt = `You are an expert software engineer analyzing GitHub activity to provide concise, technical summaries of developers' contributions. Your goal is to extract the essence of a user's work, focusing on the main features and significant fixes.

You will be given the GitHub activity for a user to analyze this activity and provide a brief, technical summary of their contributions. Organize the most important and active repositories first.

Break down the information inside <contribution_breakdown> tags. Here are some guidelines:
1. Summarize the overall focus of the user's work based on this breakdown
2. Keep it short and concise
3. Use hyperlinks to commits, repositories, issues, and pull requests for clarity
4. Focus on technical details of main features and fixes
5. Use bullet points for clarity
6. Do NOT mention the number of commits
7. Do NOT use bullet points inside list items

Format your summary in markdown. An example structure would be:

<contribution_breakdown>
### [\`username/repository_name\`](link)
- [Fixed bug](link to bug) related to XYZ in [repository](link to repository)
- Added XYZ feature to [repository](link)
- [Reported bug](link to issue) related to XYZ
</contribution_breakdown>`

    const prompt = `Here is the GitHub activity for ${username}:

<commits>
${commitsText}
</commits>

<issues_and_prs>
${issuesAndPRsText}
</issues_and_prs>

Remember to keep your summary technical, concise, and focused on the most significant contributions. Avoid verbosity and ensure each point provides valuable insight into the user's work.`;

    const encoder = new TextEncoder();

    const stream = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      system: system_prompt,
      temperature: 0.8,
      messages: [
        {
          role: 'user',
          content: prompt
        },
        {
          role: 'assistant',
          content: '<contribution_breakdown>'
        }
      ],
      stream: true,
    });

    const customStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = (chunk as any).delta?.text;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.enqueue(encoder.encode('[DONE]'));
        controller.close();
      },
    });

    return new NextResponse(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to generate summary' }), 
      { status: 500 }
    );
  }
} 