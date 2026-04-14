"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { REWARDS, getUnlockedRewards, getNextReward } from "@/lib/rewards";

interface Family {
  id: number;
  name: string;
  join_code: string;
}

interface Member {
  id: number;
  name: string;
  avatar: string;
}

interface Session {
  id: number;
  started_at: string;
  ended_at?: string;
  duration_minutes?: number;
  notes?: string;
}

interface Stats {
  streak: {
    current_streak: number;
    longest_streak: number;
    total_minutes: number;
    last_session_date: string | null;
  };
  totalSessions: number;
  weekly: Array<{ day: string; minutes: number; sessions: number }>;
}

type View = "setup" | "home" | "timer" | "history" | "rewards";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  return m + ":" + String(s).padStart(2, "0");
}

function formatMinutes(mins: number): string {
  if (mins < 60) return mins + "m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? h + "h " + m + "m" : h + "h";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TechTimeout() {
  const [view, setView] = useState<View>("setup");
  const [family, setFamily] = useState<Family | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newReward, setNewReward] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [setupMode, setSetupMode] = useState<"create" | "join">("create");
  const [familyName, setFamilyName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage?.getItem("tt_session") : null;
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setFamily(data.family);
        setMember(data.member);
        setView("home");
      } catch {
        // ignore
      }
    }
  }, []);

  const saveSession = useCallback((f: Family, m: Member) => {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem("tt_session", JSON.stringify({ family: f, member: m }));
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!family) return;
    try {
      const [sessRes, statsRes, famRes] = await Promise.all([
        fetch("/api/session?familyId=" + family.id),
        fetch("/api/stats?familyId=" + family.id),
        fetch("/api/family?familyId=" + family.id),
      ]);
      const sessData = await sessRes.json();
      const statsData = await statsRes.json();
      const famData = await famRes.json();

      setActiveSession(sessData.active);
      setRecentSessions(sessData.recent || []);
      setStats(statsData);
      setMembers(famData.members || []);

      if (sessData.active) {
        const startTime = new Date(sessData.active.started_at).getTime();
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
        setView("timer");
      }
    } catch {
      // silent
    }
  }, [family]);

  useEffect(() => {
    if (family && view !== "setup") {
      fetchData();
    }
  }, [family, view, fetchData]);

  useEffect(() => {
    if (activeSession && view === "timer") {
      timerRef.current = setInterval(() => {
        const startTime = new Date(activeSession.started_at).getTime();
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [activeSession, view]);

  const handleSetup = async () => {
    setLoading(true);
    setError("");
    try {
      const body =
        setupMode === "create"
          ? { name: familyName, memberName }
          : { action: "join", joinCode, memberName };
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFamily(data.family);
      setMember(data.member);
      saveSession(data.family, data.member);
      setView("home");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const startTimeout = async () => {
    if (!family) return;
    setLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: family.id, action: "start" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setActiveSession(data.session);
      setElapsed(0);
      setView("timer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  };

  const stopTimeout = async (notes?: string) => {
    if (!family || !activeSession) return;
    setLoading(true);
    try {
      const prevUnlocked = stats
        ? getUnlockedRewards(stats.streak.current_streak, stats.streak.total_minutes).length
        : 0;

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          action: "stop",
          sessionId: activeSession.id,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setActiveSession(null);
      if (timerRef.current) clearInterval(timerRef.current);

      await fetchData();
      const newStats = stats;
      if (newStats) {
        const nowUnlocked = getUnlockedRewards(
          newStats.streak.current_streak,
          newStats.streak.total_minutes
        ).length;
        if (nowUnlocked > prevUnlocked) {
          const latest = getUnlockedRewards(
            newStats.streak.current_streak,
            newStats.streak.total_minutes
          );
          setNewReward(latest[latest.length - 1]?.title || null);
          setTimeout(() => setNewReward(null), 4000);
        }
      }

      setView("home");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      window.localStorage?.removeItem("tt_session");
    }
    setFamily(null);
    setMember(null);
    setView("setup");
  };

  // ==================== RENDER ====================

  if (view === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="text-6xl mb-4">📵</div>
            <h1 className="text-3xl font-bold text-white">Tech Timeout</h1>
            <p className="text-gray-400 mt-2">
              Track screen-free family time. Build streaks, earn rewards.
            </p>
          </div>

          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            <button
              onClick={() => setSetupMode("create")}
              className={"flex-1 py-3 text-sm font-medium transition-colors " +
                (setupMode === "create"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-white")}
            >
              Create Family
            </button>
            <button
              onClick={() => setSetupMode("join")}
              className={"flex-1 py-3 text-sm font-medium transition-colors " +
                (setupMode === "join"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-white")}
            >
              Join Family
            </button>
          </div>

          <div className="space-y-4">
            {setupMode === "create" ? (
              <input
                type="text"
                placeholder="Family name (e.g. The Smiths)"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            ) : (
              <input
                type="text"
                placeholder="Join code (e.g. ABC123)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 uppercase tracking-widest text-center text-xl"
              />
            )}
            <input
              type="text"
              placeholder="Your name"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button
              onClick={handleSetup}
              disabled={
                loading ||
                !memberName.trim() ||
                (setupMode === "create" ? !familyName.trim() : joinCode.length < 4)
              }
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "..." : setupMode === "create" ? "Start Tracking" : "Join Family"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "timer" && activeSession) {
    const progress = Math.min((elapsed / 3600) * 100, 100);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
        <div
          className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 to-gray-950 transition-all duration-1000"
          style={{ opacity: 0.5 + (Math.sin(elapsed / 4) + 1) * 0.15 }}
        />

        <div className="relative z-10 text-center space-y-8">
          <div className="text-5xl animate-pulse">📵</div>
          <div>
            <p className="text-emerald-400 text-sm font-medium uppercase tracking-wider mb-2">
              Tech-free time
            </p>
            <div className="text-7xl font-mono font-bold text-white tracking-tight">
              {formatDuration(elapsed)}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full transition-all duration-1000"
                style={{ width: progress + "%" }}
              />
            </div>
          </div>
          <p className="text-gray-500 text-xs">Progress to 1 hour</p>

          <div className="space-y-3 pt-4">
            <p className="text-gray-400 text-sm">
              Enjoy your time together. The timer keeps going.
            </p>
            <button
              onClick={() => stopTimeout()}
              disabled={loading}
              className="px-8 py-4 bg-red-600/80 hover:bg-red-600 text-white font-medium rounded-xl transition-colors text-lg"
            >
              {loading ? "Saving..." : "End Timeout"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const streak = stats?.streak;
  const unlocked = streak
    ? getUnlockedRewards(streak.current_streak, streak.total_minutes)
    : [];
  const nextReward = streak
    ? getNextReward(streak.current_streak, streak.total_minutes)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      {newReward && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg animate-bounce">
          New reward unlocked: {newReward}!
        </div>
      )}

      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              📵 Tech Timeout
            </h1>
            {family && (
              <p className="text-xs text-gray-500">
                {family.name} - Code: {family.join_code}
              </p>
            )}
          </div>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-300">
            Leave
          </button>
        </div>
      </header>

      <nav className="border-b border-gray-800">
        <div className="max-w-lg mx-auto flex">
          {(["home", "history", "rewards"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={"flex-1 py-3 text-sm font-medium capitalize transition-colors " +
                (view === v
                  ? "text-emerald-400 border-b-2 border-emerald-400"
                  : "text-gray-500 hover:text-gray-300")}
            >
              {v}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 p-4">
        <div className="max-w-lg mx-auto space-y-6">
          {view === "home" && (
            <>
              <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-3xl font-bold text-emerald-400">
                      {streak?.current_streak || 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Day Streak</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-white">
                      {formatMinutes(streak?.total_minutes || 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Total Time</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-amber-400">
                      {stats?.totalSessions || 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Sessions</div>
                  </div>
                </div>
              </div>

              {nextReward && (
                <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 flex items-center gap-4">
                  <div className="text-3xl opacity-40">{nextReward.icon}</div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-400">Next reward</p>
                    <p className="text-white font-medium">{nextReward.title}</p>
                    <p className="text-xs text-gray-500">{nextReward.description}</p>
                  </div>
                </div>
              )}

              {stats && stats.weekly.length > 0 && (
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                  <h3 className="text-sm font-medium text-gray-400 mb-4">This Week</h3>
                  <div className="flex items-end gap-2 h-24">
                    {(() => {
                      const days = [];
                      for (let i = 6; i >= 0; i--) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const key = d.toISOString().split("T")[0];
                        const dayData = stats.weekly.find((w) => w.day === key);
                        days.push({
                          label: d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2),
                          minutes: dayData ? Number(dayData.minutes) : 0,
                        });
                      }
                      const maxMins = Math.max(...days.map((d) => d.minutes), 1);
                      return days.map((d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={"w-full rounded-t transition-all " +
                              (d.minutes > 0 ? "bg-emerald-500" : "bg-gray-800")}
                            style={{
                              height: Math.max((d.minutes / maxMins) * 80, 4) + "px",
                            }}
                          />
                          <span className="text-[10px] text-gray-500">{d.label}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <button
                onClick={startTimeout}
                disabled={loading}
                className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all text-xl shadow-lg shadow-emerald-900/30 active:scale-95"
              >
                {loading ? "Starting..." : "Start Tech Timeout"}
              </button>

              {members.length > 0 && (
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-xs text-gray-500">Family:</span>
                  {members.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-300"
                    >
                      {m.avatar} {m.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {view === "history" && (
            <>
              <h2 className="text-lg font-bold text-white">Session History</h2>
              {recentSessions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📱</div>
                  <p className="text-gray-500">No sessions yet. Start your first tech timeout!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map((s) => (
                    <div
                      key={s.id}
                      className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-white">
                          {formatMinutes(Number(s.duration_minutes || 0))} screen-free
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(s.started_at)}</p>
                        {s.notes && (
                          <p className="text-xs text-gray-400 mt-1 italic">{s.notes}</p>
                        )}
                      </div>
                      <div className="text-emerald-400 text-lg">
                        {Number(s.duration_minutes || 0) >= 60 ? "🌟" : "✓"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {view === "rewards" && (
            <>
              <h2 className="text-lg font-bold text-white">Rewards</h2>
              <p className="text-sm text-gray-400">
                {unlocked.length} of {REWARDS.length} unlocked
              </p>
              <div className="space-y-3">
                {REWARDS.map((r) => {
                  const isUnlocked = unlocked.some((u) => u.id === r.id);
                  return (
                    <div
                      key={r.id}
                      className={"rounded-xl p-4 border flex items-center gap-4 transition-all " +
                        (isUnlocked
                          ? "bg-gray-900 border-emerald-800/50"
                          : "bg-gray-900/30 border-gray-800 opacity-50")}
                    >
                      <div className={"text-3xl " + (isUnlocked ? "" : "grayscale")}>
                        {r.icon}
                      </div>
                      <div className="flex-1">
                        <p className={"font-medium " + (isUnlocked ? "text-white" : "text-gray-500")}>
                          {r.title}
                        </p>
                        <p className="text-xs text-gray-500">{r.description}</p>
                      </div>
                      {isUnlocked && (
                        <span className="text-emerald-400 text-xs font-medium">Unlocked</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
        }
