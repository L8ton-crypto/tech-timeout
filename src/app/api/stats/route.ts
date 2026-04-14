import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const sql = await ensureDb();
    const familyId = req.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Missing familyId" }, { status: 400 });
    }

    const streaks = await sql`
      SELECT current_streak, longest_streak, total_minutes, last_session_date
      FROM tt_streaks WHERE family_id = ${familyId}
    `;

    const sessionCount = await sql`
      SELECT COUNT(*) as count FROM tt_sessions
      WHERE family_id = ${familyId} AND ended_at IS NOT NULL
    `;

    const weekly = await sql`
      SELECT DATE(started_at) as day, SUM(duration_minutes) as minutes, COUNT(*) as sessions
      FROM tt_sessions
      WHERE family_id = ${familyId}
        AND ended_at IS NOT NULL
        AND started_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(started_at)
      ORDER BY day
    `;

    return NextResponse.json({
      streak: streaks[0] || { current_streak: 0, longest_streak: 0, total_minutes: 0 },
      totalSessions: Number(sessionCount[0]?.count || 0),
      weekly,
    });
  } catch (err) {
    console.error("Stats API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
