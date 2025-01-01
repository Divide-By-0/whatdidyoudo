import { Metadata } from 'next';
import { prisma } from '../../../lib/db';
import { SharePageClient } from './client';
import { EnrichedCommit } from '../../../lib/github';

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

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const activity = await prisma.activitySession.findUnique({
    where: { id: resolvedParams.slug },
  }) as ActivitySession | null;

  if (!activity) {
    return {
      title: 'Activity Not Found',
    };
  }

  const startDate = new Date(activity.startTime).toLocaleDateString();
  const endDate = new Date(activity.endTime).toLocaleDateString();
  const uniqueRepos = new Set([
    ...activity.commits.map(commit => commit.repository.nameWithOwner),
    ...activity.issues.map(issue => issue.repository.nameWithOwner),
    ...activity.pullRequests.map(pr => pr.repository.nameWithOwner)
  ]).size;

  const ogImageUrl = new URL('/api/og', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  ogImageUrl.searchParams.set('username', activity.username);
  ogImageUrl.searchParams.set('commits', activity.commits.length.toString());
  ogImageUrl.searchParams.set('issues', activity.issues.length.toString());
  ogImageUrl.searchParams.set('prs', activity.pullRequests.length.toString());
  ogImageUrl.searchParams.set('repos', uniqueRepos.toString());
  ogImageUrl.searchParams.set('startDate', startDate);
  ogImageUrl.searchParams.set('endDate', endDate);

  const start = new Date(activity.startTime);
  const end = new Date(activity.endTime);
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  let timeframe = '';
  if (diffDays === 1) {
    timeframe = 'in the last 24 hours';
  } else if (diffDays === 7) {
    timeframe = 'this week';
  } else if (diffDays === 31) {
    timeframe = 'this month';  
  } else if (diffDays === 365) {
    timeframe = 'this year';
  } else {
    timeframe = `the last ${diffDays} days`;
  }

  return {
    title: `What did ${activity.username} do?`,
    description: `What did ${activity.username} get done ${timeframe}?`,
    openGraph: {
      title: `What did ${activity.username} do?`,
      description: `What did ${activity.username} get done ${timeframe}?`,
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: `What did ${activity.username} do?`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image', 
      title: `What did ${activity.username} do?`,
      description: `What did ${activity.username} get done ${timeframe}?`,
      images: [ogImageUrl.toString()],
    },
  };
}

export default async function SharePage({ params }: Props) {
  return <SharePageClient params={params} />;
}
