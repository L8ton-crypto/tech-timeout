import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const sql = await ensureDb();
    const { name, memberName, action, joinCode } = await req.json();

    if (action === "join") {
      const families = await sql`
        SELECT id, name FROM tt_families WHERE join_code = ${joinCode.toUpperCase()}
      `;
      if (families.length === 0) {
        return NextResponse.json({ error: "Family not found" }, { status: 404 });
      }
      const family = families[0];
      const members = await sql`
        INSERT INTO tt_members (family_id, name)
        VALUES (${family.id}, ${memberName})
        RETURNING id, name, avatar
      `;
      return NextResponse.json({ family, member: members[0] });
    }

    const code = generateCode();
    const families = await sql`
      INSERT INTO tt_families (name, join_code)
      VALUES (${name}, ${code})
      RETURNING id, name, join_code
    `;
    const family = families[0];

    const members = await sql`
      INSERT INTO tt_members (family_id, name)
      VALUES (${family.id}, ${memberName})
      RETURNING id, name, avatar
    `;

    await sql`
      INSERT INTO tt_streaks (family_id)
      VALUES (${family.id})
    `;

    return NextResponse.json({ family, member: members[0] });
  } catch (err) {
    console.error("Family API error:", err);
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

    const families = await sql`
      SELECT id, name, join_code FROM tt_families WHERE id = ${familyId}
    `;
    if (families.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const members = await sql`
      SELECT id, name, avatar FROM tt_members WHERE family_id = ${familyId} ORDER BY created_at
    `;

    return NextResponse.json({ family: families[0], members });
  } catch (err) {
    console.error("Family GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
