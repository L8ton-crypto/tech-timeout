import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const sql = await ensureDb();
    const { familyId, action, sessionId, notes } = await req.json();

    if (action === "start") {
      const active = await sql`
        SELECT id FROM tt_sessions
        WHERE family_id = ${familyId} AND ended_at IS NULL
      `;
      if (active.length > 0) {
        return NextResponse.json({ error: "Session already active" }, { status: 400 });
      }

      const sessions = await sql`
        INSERT INTO tt_sessions (family_id)
        VALUES (${familyId})
        RETURNING id, started_at
      `;
      return NextResponse.json({ session: sessions[0] });
    }

    if (action === "stop") {
      const sessions = await sql`
        UPDATE tt_sessions
        SET ended_at = NOW(),
            duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60,
            notes = ${notes || null}
        WHERE id = ${sessionId} AND family_id = ${familyId} AND ended_at IS NULL
        RETURNING id, started_at, ended_at, duration_minutes, notes
      `;
      if (sessions.length === 0) {
        return NextResponse.json({ error: "No active session" }, { status: 404 });
      }

      const session = sessions[0];
      const durationMins = Math.round(Number(session.duration_minutes));

      const today = new Date().toISOString().split("T")[0];
      const streaks = await sql`
        SELECT * FROM tt_streaks WHERE family_id = ${familyId}
      `;

      if (streaks.length > 0) {
        const streak = streaks[0];
        const lastDate = streak.last_session_date
          ? new Date(streak.last_session_date).toISOString().split("T")[0]
          : null;

        let newStreak = streak.current_streak;
        if (lastDate === today) {
          // Already logged today
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split("T")[0];

          if (lastDate === yesterdayStr) {
            newStreak = streak.current_streak + 1;
          } else {
            newStreak = 1;
          }
        }

        const newLongest = Math.max(newStreak, streak.longest_streak);
        const newTotal = streak.total_minutes + durationMins;

        await sql`
          UPDATE tt_streaks
          SET current_streak = ${newStreak},
              longest_streak = ${newLongest},
              total_minutes = ${newTotal},
              last_session_date = ${today},
              updated_at = NOW()
          WHERE family_id = ${familyId}
        `;
      }

      return NextResponse.json({ session: { ...session, duration_minutes: durationMins } });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Session API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sql = await ensureDb();
    const familyId = req.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Missing familyId" }, { status: 400 });
    }

    const active = await sql`
      SELECT id, started_at FROM tt_sessions
      WHERE family_id = ${familyId} AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1
    `;

    const recent = await sql`
      SELECT id, started_at, ended_at, duration_minutes, notes
      FROM tt_sessions
      WHERE family_id = ${familyId} AND ended_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 20
    `;

    return NextResponse.json({
      active: active[0] || null,
      recent,
    });
  } catch (err) {
    console.error("Session GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
