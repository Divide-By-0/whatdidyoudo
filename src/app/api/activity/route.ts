import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, username, startTime, endTime, summary, commits, issues, pullRequests } = body;

    if (!id || !username || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const activity = await prisma.activitySession.upsert({
      where: { id },
      create: {
        id,
        username,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        summary: summary || "",
        commits: commits || null,
        issues: issues || null,
        pullRequests: pullRequests || null,
      },
      update: {
        username,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        summary: summary || "",
        commits: commits || null,
        issues: issues || null,
        pullRequests: pullRequests || null,
      }
    });

    return NextResponse.json(activity);
  } catch (error: any) {
    console.log("Error saving activity:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");
    const id = searchParams.get("id");
    
    if (id) {
      const activity = await prisma.activitySession.findUnique({
        where: { id }
      });
      return NextResponse.json(activity);
    }

    if (username) {
      const activities = await prisma.activitySession.findMany({
        where: { username },
        orderBy: { startTime: 'desc' },
        take: 10
      });
      return NextResponse.json(activities);
    }

    const activities = await prisma.activitySession.findMany({
      orderBy: { startTime: 'desc' },
      take: 10
    });
    return NextResponse.json(activities);
  } catch (error: any) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
} 