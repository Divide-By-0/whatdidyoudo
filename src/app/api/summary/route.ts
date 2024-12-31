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
    const { commits, issuesAndPRs } = await req.json() as { 
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
    };

    if (!commits || !Array.isArray(commits) || !issuesAndPRs || !Array.isArray(issuesAndPRs)) {
      return new NextResponse('Invalid request body', { status: 400 });
    }

    const commitsText = commits.map(commit => {
      return `Repository: ${commit.repository.nameWithOwner}
Message: ${commit.messageHeadline}
Changes: +${commit.additions} -${commit.deletions} lines
Date: ${new Date(commit.committedDate).toLocaleDateString()}`;
    }).join('\n---\n');

    const issuesAndPRsText = issuesAndPRs.map(item => {
      return `Type: ${item.type.toUpperCase()}
Repository: ${item.repository.nameWithOwner}
Title: ${item.title}
State: ${item.state}
Number: #${item.number}
Updated: ${new Date(item.updatedAt).toLocaleDateString()}`;
    }).join('\n---\n');

    const prompt = `Please analyze the following GitHub activity and provide a clear, concise summary in markdown format. Focus on the most significant changes and patterns.

COMMITS:
${commitsText}

ISSUES AND PULL REQUESTS:
${issuesAndPRsText}

Please structure your response in markdown with:
1. A brief overview of total activity
2. Key highlights and patterns
3. Most significant changes or contributions
4. Notable repositories worked on

Keep the summary professional and focused on technical details. Use bullet points and sections to organize the information.`;

    const encoder = new TextEncoder();

    const stream = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      temperature: 0.5,
      messages: [
        {
          role: 'user',
          content: prompt
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