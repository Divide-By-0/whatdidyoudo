import { OpenAI } from 'openai';
import { EnrichedCommit } from '../../../lib/github';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge';

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return new NextResponse('OpenAI API key not configured', { status: 500 });
  }

  try {
    const { commits } = await req.json() as { commits: EnrichedCommit[] };

    if (!commits || !Array.isArray(commits)) {
      return new NextResponse('Invalid request body', { status: 400 });
    }

    // Format commits into a readable format for the AI
    const commitsText = commits.map(commit => {
      return `Repository: ${commit.repository.nameWithOwner}
Message: ${commit.messageHeadline}
Changes: +${commit.additions} -${commit.deletions} lines
Date: ${new Date(commit.committedDate).toLocaleDateString()}`;
    }).join('\n---\n');

    const prompt = `Analyze these GitHub commits and create a concise summary in markdown format. Structure your response like this:

## Overview
Brief overview of the work done

## Key Changes
- **[Repository Name]**: Description of main changes
- **[Repository Name]**: Description of main changes

## Details
### 🚀 Features
- Feature 1
- Feature 2

### 🐛 Fixes
- Fix 1
- Fix 2

### 🔧 Improvements
- Improvement 1
- Improvement 2

Make sure to:
1. Keep it concise and focused
2. Use proper markdown formatting
3. Include repository links using [name](url) format
4. Group similar changes together
5. Use bullet points for better readability`;

    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are a technical writer who excels at creating clear, concise summaries in markdown format. Focus on the most important changes and use proper markdown syntax.'
        },
        { 
          role: 'user', 
          content: `${prompt}\n\nHere are the commits to summarize:\n\n${commitsText}` 
        }
      ],
      stream: true,
      temperature: 0.5,
      max_tokens: 1000,
    });

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content !== undefined) {
            console.log(content);
            controller.enqueue(encoder.encode(`${content}`));
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
    console.error('Error generating summary:', error);
    return new NextResponse(
      'Error generating summary',
      { status: 500 }
    );
  }
} 