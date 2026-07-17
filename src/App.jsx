import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutGrid, ListChecks, Plus, LogOut, User, X, Trash2, AlertTriangle, Calendar, Users, UserPlus,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const STATUS_COLOR = { "Not Started": "#6B7280", "In Progress": "#F2B705", Completed: "#3DA35D" };

function statusOf(progress) {
  if (progress >= 100) return "Completed";
  if (progress > 0) return "In Progress";
  return "Not Started";
}
function addDays(dateStr, days) {
  if (!dateStr || !days) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [tasks, setTasks] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-job-tasks");
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [users, setUsers] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-users");
      const parsed = cached ? JSON.parse(cached) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) { }
    return [
      { username: "Lakshan", role: "management", password: "RPM1234" },
      { username: "Vishwa", role: "management", password: "RPM1234" },
      { username: "Normal", role: "normal", password: "RPM5678" }
    ];
  });
  const [view, setView] = useState("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [filterProject, setFilterProject] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [err, setErr] = useState("");

  // Fetch tasks from Supabase
  async function fetchTasks() {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("createdAt", { ascending: false });
      if (error) throw error;
      const parsed = data || [];
      try {
        localStorage.setItem("cached-job-tasks", JSON.stringify(parsed));
      } catch (e) { }
      setTasks(parsed);
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    }
  }

  // Fetch users from Supabase (seeds defaults on first run if table is empty)
  async function fetchUsers() {
    try {
      const { data, error } = await supabase.from("users").select("*").order("username");
      if (error) throw error;
      if (data && data.length > 0) {
        setUsers(data);
        try {
          localStorage.setItem("cached-users", JSON.stringify(data));
        } catch (e) { }
      } else {
        const defaults = [
          { username: "Lakshan", role: "management", password: "RPM1234" },
          { username: "Vishwa", role: "management", password: "RPM1234" },
          { username: "Normal", role: "normal", password: "RPM5678" },
        ];
        setUsers(defaults);
        await supabase.from("users").upsert(defaults, { onConflict: "username" });
      }
    } catch (e) {
      console.error("Failed to fetch users", e);
    }
  }

  // Initial load: session from localStorage (per-device, not shared), users from Supabase
  useEffect(() => {
    (async () => {
      try {
        const s = localStorage.getItem("session");
        if (s) setSession(JSON.parse(s));
      } catch (e) { }

      await fetchUsers();
      setLoadingSession(false);
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchTasks();
  }, [session]);

  // Realtime subscriptions: any insert/update/delete on tasks or users
  // is pushed instantly by Supabase, so we just refetch on change.
  useEffect(() => {
    const usersChannel = supabase
      .channel("users-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          console.log("[realtime] users change received:", payload);
          fetchUsers();
        }
      )
      .subscribe((status) => {
        console.log("[realtime] users channel status:", status);
      });

    return () => {
      supabase.removeChannel(usersChannel);
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const tasksChannel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          console.log("[realtime] tasks change received:", payload);
          fetchTasks();
        }
      )
      .subscribe((status) => {
        console.log("[realtime] tasks channel status:", status);
      });

    return () => {
      supabase.removeChannel(tasksChannel);
    };
  }, [session]);

  async function saveTasks(next) {
    setTasks(next);
    try {
      localStorage.setItem("cached-job-tasks", JSON.stringify(next));
    } catch (e) { }
    try {
      const nextIds = new Set(next.map((t) => t.id));
      const toDelete = tasks.filter((t) => !nextIds.has(t.id));

      // Strip client-only fields that don't exist as columns in the tasks table
      const dbRows = next.map(({ endDateOverride, ...row }) => row);

      if (toDelete.length) {
        const { error } = await supabase
          .from("tasks")
          .delete()
          .in("id", toDelete.map((t) => t.id));
        if (error) throw error;
      }
      if (dbRows.length) {
        const { error } = await supabase.from("tasks").upsert(dbRows, { onConflict: "id" });
        if (error) throw error;
      }
      setErr("");
    } catch (e) {
      console.error(e);
      setErr("Couldn't save — try again.");
    }
  }

  async function saveUsers(next) {
    setUsers(next);
    try {
      localStorage.setItem("cached-users", JSON.stringify(next));
    } catch (e) { }
    try {
      const nextUsernames = new Set(next.map((u) => u.username));
      const toDelete = users.filter((u) => !nextUsernames.has(u.username));

      if (toDelete.length) {
        const { error } = await supabase
          .from("users")
          .delete()
          .in("username", toDelete.map((u) => u.username));
        if (error) throw error;
      }
      if (next.length) {
        const { error } = await supabase
          .from("users")
          .upsert(next, { onConflict: "username" });
        if (error) throw error;
      }
      setErr("");
    } catch (e) {
      console.error(e);
      setErr("Couldn't save users — try again.");
    }
  }

  async function handleLogin(name, role) {
    const s = { name: name.trim(), role };
    setSession(s);
    setView("dashboard");
    try {
      localStorage.setItem("session", JSON.stringify(s));
    } catch (e) { }
  }
  async function handleLogout() {
    setSession(null);
    setView("dashboard");
    try {
      localStorage.removeItem("session");
    } catch (e) { }
  }

  function nextId() {
    const nums = tasks.map((t) => parseInt(String(t.id).replace("T-", ""), 10)).filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return `T-${max + 1}`;
  }

  async function upsertTask(data, id) {
    const now = new Date().toISOString();
    const endDate = data.endDateOverride || addDays(data.startDate, data.daysRequired);
    const nextList = id
      ? tasks.map((t) => (t.id === id ? { ...t, ...data, endDate, updatedAt: now } : t))
      : [
        {
          id: nextId(),
          ...data,
          endDate,
          createdBy: session.name,
          createdAt: now,
          updatedAt: now,
        },
        ...tasks,
      ];

    const finalTasks = nextList.map((t) =>
      t.project && t.project.trim().toLowerCase() === data.project.trim().toLowerCase()
        ? { ...t, projectToken: data.projectToken }
        : t
    );

    await saveTasks(finalTasks);
    setShowForm(false);
    setEditTask(null);
  }

  async function deleteTask(id) {
    await saveTasks(tasks.filter((t) => t.id !== id));
    setEditTask(null);
  }

  async function quickProgress(id, progress) {
    const now = new Date().toISOString();
    const next = tasks.map((t) => (t.id === id ? { ...t, progress, updatedAt: now } : t));
    await saveTasks(next);
  }

  const projectNames = useMemo(() => Array.from(new Set(tasks.map((t) => t.project).filter(Boolean))), [tasks]);
  const assigneeNames = useMemo(() => Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))), [tasks]);

  const totals = useMemo(() => {
    const c = { "Not Started": 0, "In Progress": 0, Completed: 0 };
    let daysScope = 0;
    tasks.forEach((t) => {
      const progressVal = Number(t.progress) || 0;
      c[statusOf(progressVal)]++;
      const daysVal = Number(t.daysRequired);
      daysScope += isNaN(daysVal) ? 0 : daysVal;
    });
    return {
      totalProjects: projectNames.length,
      totalTasks: tasks.length,
      daysScope,
      statusCounts: c,
    };
  }, [tasks, projectNames]);

  const byProject = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = t.project || "Unassigned project";
      if (!map[key]) map[key] = { project: key, token: t.projectToken || "", tasks: 0, days: 0, progressSum: 0 };

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress);

      map[key].tasks++;
      map[key].days += isNaN(daysVal) ? 0 : daysVal;
      map[key].progressSum += isNaN(progVal) ? 0 : progVal;
      if (t.projectToken) {
        map[key].token = t.projectToken;
      }
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg,
        displayName: p.token ? `${p.project} (${p.token})` : p.project
      };
    });
  }, [tasks]);

  const byAssignee = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = t.assignee || "Unassigned";
      if (!map[key]) map[key] = { assignee: key, tasks: 0, days: 0, progressSum: 0 };

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress);

      map[key].tasks++;
      map[key].days += isNaN(daysVal) ? 0 : daysVal;
      map[key].progressSum += isNaN(progVal) ? 0 : progVal;
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [tasks]);

  const overdue = useMemo(() => {
    const today = todayStr();
    return tasks.filter((t) => t.endDate && t.endDate < today && Number(t.progress) < 100);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterProject !== "All") list = list.filter((t) => t.project === filterProject);
    if (filterStatus !== "All") list = list.filter((t) => statusOf(t.progress) === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((t) =>
        (t.projectToken && t.projectToken.toLowerCase().includes(q)) ||
        (t.project && t.project.toLowerCase().includes(q)) ||
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.assignee && t.assignee.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [tasks, filterProject, filterStatus, searchQuery]);

  if (loadingSession) {
    return (
      <div className="jd-app jd-loading">
        <style>{CSS}</style>
        Loading dashboard…
      </div>
    );
  }
  if (!session) {
    return (
      <Login
        users={users}
        onLogin={handleLogin}
        onResetPassword={async (username, newPassword) => {
          const next = users.map((u) =>
            u.username.trim().toLowerCase() === username.trim().toLowerCase()
              ? { ...u, password: newPassword }
              : u
          );
          await saveUsers(next);
        }}
      />
    );
  }

  return (
    <div className="jd-app">
      <style>{CSS}</style>
      <header className="jd-header">
        <div className="jd-brand">
          <LayoutGrid size={20} />
          <div>
            <div className="jd-brand-title">RMP PROJECT MANAGEMENT SYSTEM</div>
            <div className="jd-brand-sub">Job &amp; Task Dashboard</div>
          </div>
        </div>
        <div className="jd-user">
          <span className="jd-user-name">
            <User size={14} /> {session.name}
          </span>
          <button className="jd-icon-btn" onClick={handleLogout} title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {err && <div className="jd-error-bar">{err}</div>}

      <nav className="jd-tabs">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
          <LayoutGrid size={14} /> Dashboard
        </button>
        <button className={view === "tasks" ? "active" : ""} onClick={() => setView("tasks")}>
          <ListChecks size={14} /> Tasks
        </button>
        {session.role === "management" && (
          <button className={view === "users" ? "active" : ""} onClick={() => setView("users")}>
            <Users size={14} /> Users
          </button>
        )}
        {session.role === "management" && (
          <button className="jd-primary-btn jd-tabs-add" onClick={() => { setEditTask(null); setShowForm(true); }}>
            <Plus size={15} /> Add task
          </button>
        )}
      </nav>

      {view === "dashboard" && (
        <main className="jd-main">
          <div className="jd-stats">
            <StatCard label="Projects" value={totals.totalProjects} />
            <StatCard label="Total tasks" value={totals.totalTasks} />
            <StatCard label="Days scope" value={totals.daysScope} />
            <StatCard label="Not started" value={totals.statusCounts["Not Started"]} color={STATUS_COLOR["Not Started"]} />
            <StatCard label="In progress" value={totals.statusCounts["In Progress"]} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={totals.statusCounts.Completed} color={STATUS_COLOR.Completed} />
          </div>

          <div className="jd-charts">
            <div className="jd-panel">
              <h4>Task status</h4>
              <div style={{ position: "relative", width: "100%", height: "210px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Not Started", value: totals.statusCounts["Not Started"] },
                        { name: "In Progress", value: totals.statusCounts["In Progress"] },
                        { name: "Completed", value: totals.statusCounts.Completed },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {["Not Started", "In Progress", "Completed"].map((s) => (
                        <Cell key={s} fill={STATUS_COLOR[s]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1E2126", border: "1px solid #343941", borderRadius: 8, color: "#ECEAE5" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="jd-panel jd-panel-wide">
              <h4>Average progress by project</h4>
              <div style={{ position: "relative", width: "100%", height: "210px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byProject} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#343941" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#9BA1AA", fontSize: 11 }} />
                    <YAxis type="category" dataKey="displayName" width={150} tick={{ fill: "#ECEAE5", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1E2126", border: "1px solid #343941", borderRadius: 8, color: "#ECEAE5" }} />
                    <Bar dataKey="avgProgress" fill="#F26430" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="jd-panel">
            <h4><AlertTriangle size={14} /> Overdue tasks ({overdue.length})</h4>
            {overdue.length === 0 ? (
              <p className="jd-empty-note">Nothing overdue right now.</p>
            ) : (
              <table className="jd-table">
                <thead>
                  <tr><th>Project</th><th>Task</th><th>Assignee</th><th>End date</th><th>Progress</th></tr>
                </thead>
                <tbody>
                  {overdue.map((t) => (
                    <tr key={t.id} onClick={() => setEditTask(t)}>
                      <td>{t.project} {t.projectToken && <span className="jd-mono" style={{ color: "var(--text-dim)", fontSize: "11px" }}>({t.projectToken})</span>}</td>
                      <td>{t.task}</td>
                      <td>{t.assignee || "—"}</td>
                      <td className="jd-mono">{fmt(t.endDate)}</td>
                      <td>{t.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="jd-two-col">
            <div className="jd-panel">
              <h4>By project</h4>
              <table className="jd-table">
                <thead><tr><th>Project</th><th>Token</th><th>Tasks</th><th>Days</th><th>Avg progress</th></tr></thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.project}>
                      <td>{p.project}</td>
                      <td className="jd-mono">{p.token || "—"}</td>
                      <td>{p.tasks}</td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="jd-panel">
              <h4>By assignee</h4>
              <table className="jd-table">
                <thead><tr><th>Assignee</th><th>Tasks</th><th>Days engaged</th><th>Avg progress</th></tr></thead>
                <tbody>
                  {byAssignee.map((p) => (
                    <tr key={p.assignee}>
                      <td>{p.assignee}</td>
                      <td>{p.tasks}</td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {view === "tasks" && (
        <main className="jd-main">
          <div className="jd-filters">
            <input
              type="text"
              className="jd-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by token, project, task..."
              style={{ flex: "2", minWidth: "180px" }}
            />
            <select className="jd-input" value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ flex: "1", minWidth: "120px" }}>
              <option value="All">All projects</option>
              {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="jd-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ flex: "1", minWidth: "120px" }}>
              <option value="All">All statuses</option>
              <option>Not Started</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </div>

          <div className="jd-panel">
            {filteredTasks.length === 0 ? (
              <p className="jd-empty-note">No tasks yet — add one with "Add task".</p>
            ) : (
              <table className="jd-table jd-table-click">
                <thead>
                  <tr>
                    <th>Project</th><th>Token</th><th>Task</th><th>Assignee</th><th>Start</th><th>Days</th><th>End</th><th>Progress</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t) => {
                    const overdueRow = t.endDate && t.endDate < todayStr() && t.progress < 100;
                    return (
                      <tr key={t.id} onClick={() => setEditTask(t)} className={overdueRow ? "jd-row-overdue" : ""}>
                        <td>{t.project}</td>
                        <td className="jd-mono">{t.projectToken || "—"}</td>
                        <td>{t.task}</td>
                        <td>{t.assignee || "—"}</td>
                        <td className="jd-mono">{fmt(t.startDate)}</td>
                        <td>{t.daysRequired || "—"}</td>
                        <td className="jd-mono">{fmt(t.endDate)}</td>
                        <td><ProgressBar value={t.progress} /></td>
                        <td>
                          <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress)] }}>
                            {statusOf(t.progress)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      )}

      {view === "users" && session.role === "management" && (
        <UserManagementPanel users={users} session={session} onSaveUsers={saveUsers} />
      )}

      {(showForm || editTask) && (
        <TaskFormModal
          initial={editTask}
          tasks={tasks}
          projectNames={projectNames}
          assigneeNames={assigneeNames}
          readOnly={session.role !== "management"}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          onSave={upsertTask}
          onDelete={editTask && session.role === "management" ? () => deleteTask(editTask.id) : null}
          onQuickProgress={editTask && session.role === "management" ? (p) => quickProgress(editTask.id, p) : null}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="jd-stat" style={color ? { "--stat-color": color } : {}}>
      <div className="jd-stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="jd-stat-label">{label}</div>
    </div>
  );
}

function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 100 ? STATUS_COLOR.Completed : v > 0 ? STATUS_COLOR["In Progress"] : STATUS_COLOR["Not Started"];
  return (
    <div className="jd-progress-wrap">
      <div className="jd-progress-track">
        <div className="jd-progress-fill" style={{ width: `${v}%`, background: color }} />
      </div>
      <span className="jd-progress-label">{v}%</span>
    </div>
  );
}

function Login({ users, onLogin, onResetPassword }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("management");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleSubmit() {
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }

    const userMatch = users.find(
      (u) => u.username.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (!userMatch) {
      setError("Username does not exist. Please check your spelling.");
      return;
    }

    if (userMatch.role !== role) {
      setError(`This user is registered as a ${userMatch.role === "management" ? "Management User" : "Normal User"}. Select the correct tab.`);
      return;
    }

    if (userMatch.password === password) {
      onLogin(userMatch.username, userMatch.role);
    } else {
      setError("Incorrect password. Please try again.");
    }
  }

  function handleReset(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const trimmedName = name.trim();
    const newPass = password.trim();
    if (!trimmedName || !newPass) {
      setError("Please fill in both fields.");
      return;
    }

    const match = users.find(u => u.username.trim().toLowerCase() === trimmedName.toLowerCase());
    if (!match) {
      setError("Username not found in system.");
      return;
    }

    onResetPassword(match.username, newPass);
    setSuccess(`Password successfully reset for ${match.username}! You can log in now.`);
    setName("");
    setPassword("");
    setTimeout(() => {
      setMode("login");
      setSuccess("");
    }, 2500);
  }

  function handleRoleChange(newRole) {
    setRole(newRole);
    setName("");
    setPassword("");
    setError("");
    setSuccess("");
  }

  if (mode === "forgot") {
    return (
      <div className="jd-app jd-login-screen">
        <style>{CSS}</style>
        <form className="jd-login-card" onSubmit={handleReset}>
          <div className="jd-brand jd-login-brand">
            <LayoutGrid size={26} />
            <div>
              <div className="jd-brand-title">RMP PROJECT MANAGEMENT SYSTEM</div>
              <div className="jd-brand-sub">Reset Password</div>
            </div>
          </div>

          <p className="jd-login-copy">Enter your registered username and set a new password.</p>

          <label className="jd-field-label">Username</label>
          <input className="jd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lakshan" />

          <label className="jd-field-label">New Password</label>
          <input type="password" className="jd-input" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="e.g. RPM1234" />

          {error && <div style={{ color: "#ff6b6b", fontSize: "12.5px", marginTop: "10px", textAlign: "center" }}>{error}</div>}
          {success && <div style={{ color: "#3da35d", fontSize: "12.5px", marginTop: "10px", textAlign: "center" }}>{success}</div>}

          <button type="submit" className="jd-primary-btn jd-full" style={{ marginTop: "18px" }} disabled={!name.trim() || !password.trim()}>
            Reset Password
          </button>

          <div style={{ textAlign: "center", marginTop: "16px" }}>
            <button type="button" className="jd-link-btn" onClick={() => { setMode("login"); setName(""); setPassword(""); setError(""); setSuccess(""); }}>
              Back to Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="jd-app jd-login-screen">
      <style>{CSS}</style>
      <form className="jd-login-card" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="jd-brand jd-login-brand">
          <LayoutGrid size={26} />
          <div>
            <div className="jd-brand-title">RMP PROJECT MANAGEMENT SYSTEM</div>
            <div className="jd-brand-sub">Job &amp; Task Dashboard</div>
          </div>
        </div>

        <div className="jd-login-tabs">
          <button
            type="button"
            className={role === "management" ? "active" : ""}
            onClick={() => handleRoleChange("management")}
          >
            Management Login
          </button>
          <button
            type="button"
            className={role === "normal" ? "active" : ""}
            onClick={() => handleRoleChange("normal")}
          >
            Normal User Login
          </button>
        </div>
        <label className="jd-field-label">Name</label>
        <input className="jd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="" />

        <label className="jd-field-label">Password</label>
        <input type="password" className="jd-input" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="" />

        {error && <div style={{ color: "#ff6b6b", fontSize: "12.5px", marginTop: "10px", textAlign: "center" }}>{error}</div>}

        <button type="submit" className="jd-primary-btn jd-full" style={{ marginTop: "18px" }} disabled={!name.trim() || !password.trim()}>
          Enter the dashboard
        </button>

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <button type="button" className="jd-link-btn" onClick={() => { setMode("forgot"); setName(""); setPassword(""); setError(""); setSuccess(""); }}>
            Forgot Password?
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskFormModal({ initial, tasks, projectNames, assigneeNames, readOnly, onClose, onSave, onDelete, onQuickProgress }) {
  const [project, setProject] = useState(initial?.project || "");
  const [projectToken, setProjectToken] = useState(initial?.projectToken || "");
  const [task, setTask] = useState(initial?.task || "");
  const [assignee, setAssignee] = useState(initial?.assignee || "");
  const [startDate, setStartDate] = useState(initial?.startDate || todayStr());
  const [daysRequired, setDaysRequired] = useState(initial?.daysRequired || "");
  const [endDateOverride, setEndDateOverride] = useState(initial?.endDate || "");
  const [progress, setProgress] = useState(initial?.progress ?? 0);

  const computedEnd = endDateOverride || addDays(startDate, daysRequired);

  useEffect(() => {
    if (!initial && project.trim() && tasks) {
      const match = tasks.find(
        (t) => t.project && t.project.trim().toLowerCase() === project.trim().toLowerCase() && t.projectToken
      );
      if (match) {
        setProjectToken(match.projectToken);
      }
    }
  }, [project, tasks, initial]);

  function submit() {
    if (readOnly) return;
    if (!project.trim() || !task.trim()) return;
    onSave(
      { project: project.trim(), projectToken: projectToken.trim(), task: task.trim(), assignee: assignee.trim(), startDate, daysRequired: Number(daysRequired) || 0, endDateOverride, progress: Number(progress) },
      initial?.id
    );
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>{initial ? (readOnly ? `View ${initial.id}` : `Edit ${initial.id}`) : "Add task"}</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="jd-field-label">Project</label>
        <input className="jd-input" list="jd-projects" value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. New Oil Mill Cutter" disabled={readOnly} />
        <datalist id="jd-projects">{projectNames.map((p) => <option key={p} value={p} />)}</datalist>

        <label className="jd-field-label">Project Token</label>
        <input className="jd-input" value={projectToken} onChange={(e) => setProjectToken(e.target.value)} placeholder="e.g. PRJ-2026-X" disabled={readOnly} />

        <label className="jd-field-label">Task</label>
        <input className="jd-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Cutter Fabrication" disabled={readOnly} />

        <label className="jd-field-label">Assignee</label>
        <input className="jd-input" list="jd-assignees" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. Asela / Engineering" disabled={readOnly} />
        <datalist id="jd-assignees">{assigneeNames.map((a) => <option key={a} value={a} />)}</datalist>

        <div className="jd-form-row">
          <div>
            <label className="jd-field-label"><Calendar size={12} /> Start date</label>
            <input type="date" className="jd-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <label className="jd-field-label">Days required</label>
            <input type="number" min="0" className="jd-input" value={daysRequired} onChange={(e) => { setDaysRequired(e.target.value); setEndDateOverride(""); }} placeholder="e.g. 6" disabled={readOnly} />
          </div>
        </div>

        <label className="jd-field-label">End date {daysRequired && !endDateOverride ? "(auto — edit to override)" : ""}</label>
        <input type="date" className="jd-input" value={computedEnd} onChange={(e) => setEndDateOverride(e.target.value)} disabled={readOnly} />

        <label className="jd-field-label">Progress: {progress}%</label>
        <input type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(e.target.value)} className="jd-slider" disabled={readOnly} />
        {!readOnly && onQuickProgress && (
          <div className="jd-quick-row">
            {[0, 25, 50, 75, 100].map((p) => (
              <button type="button" key={p} className="jd-chip-btn" onClick={() => { setProgress(p); onQuickProgress(p); }}>{p}%</button>
            ))}
          </div>
        )}

        <div className="jd-modal-actions">
          {readOnly ? (
            <button type="button" className="jd-primary-btn jd-full" onClick={onClose}>Close view</button>
          ) : (
            <>
              {onDelete && (
                <button type="button" className="jd-danger-btn" onClick={onDelete}><Trash2 size={14} /> Delete</button>
              )}
              <button type="submit" className="jd-primary-btn">{initial ? "Save changes" : "Add task"}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function UserManagementPanel({ users, session, onSaveUsers }) {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("normal");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleRegister(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const name = newUsername.trim();
    const pass = newPassword.trim();
    if (!name || !pass) {
      setError("Please fill in both username and password fields.");
      return;
    }
    const exists = users.some(u => u.username.toLowerCase() === name.toLowerCase());
    if (exists) {
      setError("Username already exists in the system.");
      return;
    }
    const nextUsers = [...users, { username: name, role: newRole, password: pass }];
    onSaveUsers(nextUsers);
    setNewUsername("");
    setNewPassword("");
    setNewRole("normal");
    setSuccess(`User account "${name}" successfully registered!`);
  }

  function handleDelete(username) {
    if (username.toLowerCase() === session.name.toLowerCase()) {
      alert("You cannot delete your own logged-in account!");
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user account "${username}"?`)) {
      return;
    }
    const nextUsers = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    onSaveUsers(nextUsers);
  }

  return (
    <main className="jd-main">
      <div className="jd-user-management-grid">
        <div className="jd-panel jd-users-list-card">
          <h4>Registered Users</h4>
          <table className="jd-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Password</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username}>
                  <td><strong>{u.username}</strong></td>
                  <td>
                    <span className="jd-status-pill" style={{ "--c": u.role === "management" ? "#f2b705" : "#6b7280" }}>
                      {u.role === "management" ? "Management" : "Normal User"}
                    </span>
                  </td>
                  <td className="jd-mono">•••••••• (Raw: {u.password})</td>
                  <td>
                    <button
                      type="button"
                      className="jd-danger-btn jd-btn-small"
                      onClick={() => handleDelete(u.username)}
                      disabled={u.username.toLowerCase() === session.name.toLowerCase()}
                      style={{ padding: "4px 8px", fontSize: "11px" }}
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="jd-panel jd-user-register-card" onSubmit={handleRegister}>
          <h4>Register New User</h4>

          <label className="jd-field-label">Username</label>
          <input
            type="text"
            className="jd-input"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="e.g. Ruwan"
          />

          <label className="jd-field-label">Password</label>
          <input
            type="password"
            className="jd-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Set password"
          />

          <label className="jd-field-label">Role</label>
          <select className="jd-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="normal">Normal User (View-only)</option>
            <option value="management">Management User (Full-access)</option>
          </select>

          {error && <div style={{ color: "#ff6b6b", fontSize: "12.5px", marginTop: "10px" }}>{error}</div>}
          {success && <div style={{ color: "#3da35d", fontSize: "12.5px", marginTop: "10px" }}>{success}</div>}

          <button type="submit" className="jd-primary-btn jd-full" style={{ marginTop: "18px" }}>
            <UserPlus size={14} /> Register User
          </button>
        </form>
      </div>
    </main>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');

html, body {
  margin: 0;
  padding: 0;
  background-color: #15171B;
}

.jd-app { --bg:#15171B; --panel:#1E2126; --panel-2:#262A31; --border:#343941; --text:#ECEAE5; --text-dim:#9BA1AA; --accent:#F26430;
  font-family:'Inter', sans-serif; background:var(--bg); color:var(--text); min-height:100vh; width:100%; box-sizing:border-box; }
.jd-app * { box-sizing:border-box; }
.jd-loading { display:flex; align-items:center; justify-content:center; height:100vh; color:var(--text-dim); font-family:'JetBrains Mono', monospace; }

.jd-header { display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-bottom:1px solid var(--border); background:var(--panel); }
.jd-brand { display:flex; align-items:center; gap:10px; color:var(--accent); }
.jd-brand-title { font-family:'Oswald', sans-serif; font-size:16px; font-weight:700; letter-spacing:0.06em; color:var(--text); }
.jd-brand-sub { font-size:11px; color:var(--text-dim); margin-top:2px; }
.jd-user { display:flex; align-items:center; gap:12px; }
.jd-user-name { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--text-dim); }
.jd-icon-btn { background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:6px; cursor:pointer; display:flex; }
.jd-icon-btn:hover { color:var(--text); border-color:var(--text-dim); }
.jd-error-bar { background:#3a1f1f; color:#f2a3a3; font-size:13px; padding:8px 22px; border-bottom:1px solid #5c2b2b; }

.jd-tabs { display:flex; align-items:center; gap:8px; padding:12px 22px; border-bottom:1px solid var(--border); }
.jd-tabs button { display:flex; align-items:center; gap:6px; background:transparent; border:1px solid var(--border); color:var(--text-dim); padding:8px 14px; border-radius:7px; cursor:pointer; font-size:13px; }
.jd-tabs button.active { background:var(--panel-2); color:var(--text); border-color:var(--text-dim); }
.jd-tabs-add { margin-left:auto; }

.jd-primary-btn { display:flex; align-items:center; gap:6px; background:var(--accent); color:#191008; border:none; font-weight:600; font-size:13.5px; padding:9px 16px; border-radius:8px; cursor:pointer; white-space:nowrap; }
.jd-primary-btn:hover { background:#ff7940; }
.jd-primary-btn:disabled { background:var(--panel-2); color:var(--text-dim); cursor:not-allowed; }
.jd-danger-btn { display:flex; align-items:center; gap:6px; background:transparent; border:1px solid #5c2b2b; color:#f2a3a3; padding:9px 14px; border-radius:8px; cursor:pointer; font-size:13px; }
.jd-full { width:100%; justify-content:center; }

.jd-main { padding:20px 22px 40px; display:flex; flex-direction:column; gap:18px; }
.jd-stats { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
.jd-stat { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px; text-align:center; }
.jd-stat-value { font-family:'Oswald', sans-serif; font-size:26px; font-weight:600; }
.jd-stat-label { font-size:10.5px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-top:2px; }

.jd-charts { display:grid; grid-template-columns:1fr 2fr; gap:14px; }
.jd-panel { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; max-width:100%; overflow-x:auto; }
.jd-panel h4 { display:flex; align-items:center; gap:6px; font-family:'Oswald', sans-serif; font-size:14px; font-weight:600; margin:0 0 10px; color:var(--text); }
.jd-panel-wide { min-width:0; }
.jd-empty-note { color:var(--text-dim); font-size:13px; }

.jd-two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.jd-table { width:100%; border-collapse:collapse; font-size:13px; }
.jd-table th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-dim); padding:6px 8px; border-bottom:1px solid var(--border); }
.jd-table td { padding:8px; border-bottom:1px solid var(--border); }
.jd-table-click tr { cursor:pointer; }
.jd-table-click tr:hover { background:var(--panel-2); }
.jd-row-overdue td:first-child { box-shadow:inset 3px 0 0 #E5484D; }
.jd-mono { font-family:'JetBrains Mono', monospace; font-size:12px; color:var(--text-dim); }

.jd-progress-wrap { display:flex; align-items:center; gap:8px; min-width:100px; }
.jd-progress-track { flex:1; height:6px; background:var(--panel-2); border-radius:4px; overflow:hidden; }
.jd-progress-fill { height:100%; border-radius:4px; }
.jd-progress-label { font-size:11px; color:var(--text-dim); width:32px; }

.jd-status-pill { font-size:10.5px; font-weight:600; text-transform:uppercase; padding:3px 8px; border-radius:4px; color:var(--c); background:color-mix(in srgb, var(--c) 16%, transparent); border:1px solid color-mix(in srgb, var(--c) 45%, transparent); }

.jd-filters { display:flex; gap:10px; }
.jd-input, select.jd-input { width:100%; background:var(--panel-2); border:1px solid var(--border); color:var(--text); border-radius:7px; padding:9px 10px; font-size:13.5px; font-family:inherit; outline:none; }
.jd-input:focus { border-color:var(--accent); }

.jd-modal-overlay { position:fixed; inset:0; background:rgba(10,11,13,0.72); display:flex; align-items:center; justify-content:center; padding:20px; z-index:50; }
.jd-modal { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:22px; width:100%; max-width:440px; max-height:88vh; overflow-y:auto; }
.jd-modal-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px; }
.jd-modal-head h3 { font-family:'Oswald', sans-serif; font-size:17px; margin:0; font-weight:600; }
.jd-field-label { display:flex; align-items:center; gap:5px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin:12px 0 5px; }
.jd-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.jd-slider { width:100%; accent-color:var(--accent); }
.jd-quick-row { display:flex; gap:6px; margin-top:8px; }
.jd-chip-btn { flex:1; background:var(--panel-2); border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:6px 0; cursor:pointer; font-size:12px; }
.jd-chip-btn:hover { color:var(--text); border-color:var(--accent); }
.jd-modal-actions { display:flex; justify-content:space-between; align-items:center; margin-top:18px; gap:10px; }

.jd-login-screen { display:flex; align-items:center; justify-content:center; min-height:100vh; }
.jd-login-card { background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:28px; width:100%; max-width:380px; }
.jd-login-brand { justify-content:center; margin-bottom:14px; }
.jd-login-copy { font-size:13px; color:var(--text-dim); line-height:1.5; margin:0 0 6px; }
.jd-login-tabs { display:flex; gap:8px; margin:16px 0; }
.jd-login-tabs button { flex:1; background:var(--panel-2); border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:8px 0; cursor:pointer; font-size:12px; font-weight:500; }
.jd-login-tabs button.active { background:var(--accent); color:#191008; border-color:var(--accent); font-weight:600; }

.jd-user-management-grid { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
.jd-users-list-card { flex:2; min-width:320px; }
.jd-user-register-card { flex:1; min-width:280px; }
.jd-link-btn { background:none; border:none; color:var(--accent); cursor:pointer; font-size:12.5px; text-decoration:underline; font-family:inherit; padding:0; }
.jd-link-btn:hover { color:#fff; }

@media (max-width: 768px) {
  .jd-stats { grid-template-columns: repeat(3, 1fr); }
  .jd-charts { grid-template-columns: 1fr; }
  .jd-two-col { grid-template-columns: 1fr; }
  .jd-header { padding: 12px 16px; flex-direction: column; gap: 10px; align-items: flex-start; }
  .jd-user { width: 100%; justify-content: space-between; }
  .jd-tabs { padding: 12px 16px; flex-wrap: wrap; }
  .jd-tabs-add { margin-left: 0; width: 100%; justify-content: center; }
  .jd-main { padding: 16px 16px 30px; gap: 14px; }
  .jd-filters { flex-direction: column; gap: 8px; }
}

@media (max-width: 480px) {
  .jd-stats { grid-template-columns: repeat(2, 1fr); }
}
`;
