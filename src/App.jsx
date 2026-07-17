import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import logo from "./logo.jpg";
import loginBanner from "./login-banner.png";
import {
  LayoutGrid, ListChecks, Plus, LogOut, User, X, Trash2, AlertTriangle, Calendar, Users, UserPlus, Menu
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const STATUS_COLOR = { "Not Started": "#6B7280", "In Progress": "#F2B705", Completed: "#3DA35D" };

const CHART_COLORS = [
  "#3DA35D", // Green
  "#F26430", // Orange
  "#007BFF", // Blue
  "#8E44AD", // Purple
  "#E74C3C", // Red
  "#16A085", // Teal
  "#F39C12", // Amber
  "#34495E", // Navy
  "#D35400", // Dark Orange
  "#2C3E50", // Dark Blue
  "#27AE60", // Medium Green
  "#2980B9", // Medium Blue
];

const DEFAULT_NAMES = [
  "WASTE WATER/CANTEEN/OTHERS",
  "MILK SECTION",
  "DC/LOW FAT SECTION",
  "YARA",
  "NEW OIL MILL",
  "YARD A B C",
  "WET A B C",
  "Washrooms",
  "Living Quarters",
  "Creamed Coconut Plant",
  "Mill Garden"
];

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
  const [view, setView] = useState("m-dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [formType, setFormType] = useState("maintenance");
  const [mSearch, setMSearch] = useState("");
  const [pSearch, setPSearch] = useState("");
  const [tSearch, setTSearch] = useState("");
  const [mStatusFilter, setMStatusFilter] = useState("All");
  const [pStatusFilter, setPStatusFilter] = useState("All");
  const [tStatusFilter, setTStatusFilter] = useState("All");
  const [mCreatorFilter, setMCreatorFilter] = useState("All");
  const [pCreatorFilter, setPCreatorFilter] = useState("All");
  const [tCreatorFilter, setTCreatorFilter] = useState("All");
  const [err, setErr] = useState("");

  // Fetch tasks from Supabase
  async function fetchTasks() {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("createdAt", { ascending: false });
      if (error) throw error;
      const parsed = (data || []).map((t) => {
        let location = "";
        let assigneeName = "";
        if (t.assignee && t.assignee.includes(" ||| ")) {
          const parts = t.assignee.split(" ||| ");
          location = parts[0];
          assigneeName = parts[1];
        } else {
          location = t.assignee || "";
          assigneeName = "";
        }
        return {
          ...t,
          location,
          assigneeName,
        };
      });
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

      // Combine location and assigneeName into assignee column, strip other client-only fields
      const dbRows = next.map(({ endDateOverride, location, assigneeName, ...row }) => {
        return {
          ...row,
          assignee: `${location || ""} ||| ${assigneeName || ""}`
        };
      });

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
    setView("m-dashboard");
    try {
      localStorage.setItem("session", JSON.stringify(s));
    } catch (e) { }
  }
  async function handleLogout() {
    setSession(null);
    setView("m-dashboard");
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

    await saveTasks(nextList);
    setShowForm(false);
    setEditTask(null);
  }

  async function handleCreateProject(name) {
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();

    const exists = tasks.some(
      (t) => t.projectToken !== "maintenance" && t.project && t.project.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      alert("Project already exists!");
      return;
    }

    const placeholder = {
      id: "P-" + Date.now(),
      project: trimmedName,
      projectToken: "project",
      task: "__init__",
      assignee: "",
      progress: 0,
      startDate: todayStr(),
      daysRequired: 0,
      endDate: todayStr(),
      createdBy: session.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveTasks([placeholder, ...tasks]);
    setSelectedProject(trimmedName);
  }

  function handleEditTaskSelect(t) {
    setFormType(t.projectToken === "maintenance" ? "maintenance" : "project");
    setEditTask(t);
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

  const maintenanceTasks = useMemo(() => tasks.filter(t => t.projectToken === "maintenance" && t.task !== "__init__"), [tasks]);
  const projectTasks = useMemo(() => tasks.filter(t => t.projectToken !== "maintenance" && t.task !== "__init__"), [tasks]);
  const projectsList = useMemo(() => Array.from(new Set(tasks.filter(t => t.projectToken !== "maintenance" && t.project).map(t => t.project))), [tasks]);
  const assigneeNames = useMemo(() => Array.from(new Set(tasks.map((t) => t.location).filter(Boolean))), [tasks]);
  const creatorNames = useMemo(() => Array.from(new Set(tasks.map((t) => t.createdBy).filter(Boolean))), [tasks]);

  const mTotals = useMemo(() => {
    const c = { "Not Started": 0, "In Progress": 0, Completed: 0 };
    let daysScope = 0;
    let count = 0;
    maintenanceTasks.forEach((t) => {
      count++;
      const progressVal = Number(t.progress) || 0;
      c[statusOf(progressVal)]++;
      const daysVal = Number(t.daysRequired);
      daysScope += isNaN(daysVal) ? 0 : daysVal;
    });
    return {
      totalTasks: count,
      daysScope,
      statusCounts: c,
    };
  }, [maintenanceTasks]);

  const mOverdue = useMemo(() => {
    const today = todayStr();
    return maintenanceTasks.filter((t) => t.endDate && t.endDate < today && Number(t.progress) < 100);
  }, [maintenanceTasks]);

  const mByAssignee = useMemo(() => {
    const today = todayStr();
    const map = {};
    maintenanceTasks.forEach((t) => {
      const key = t.assigneeName || "Unassigned";
      if (!map[key]) {
        map[key] = {
          assignee: key,
          tasks: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0,
          overdue: 0,
          days: 0,
          progressSum: 0
        };
      }

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress) || 0;

      map[key].tasks++;
      map[key].days += isNaN(daysVal) ? 0 : daysVal;
      map[key].progressSum += isNaN(progVal) ? 0 : progVal;

      if (progVal === 100) {
        map[key].completed++;
      } else if (progVal > 0) {
        map[key].inProgress++;
      } else {
        map[key].notStarted++;
      }

      if (t.endDate && t.endDate < today && progVal < 100) {
        map[key].overdue++;
      }
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [maintenanceTasks]);

  const mByTaskName = useMemo(() => {
    const map = {};
    maintenanceTasks.forEach((t) => {
      if (!t.project) return;
      const key = t.project;
      if (!map[key]) map[key] = { displayName: key, tasks: 0, days: 0, progressSum: 0 };

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
  }, [maintenanceTasks]);

  const mByCreator = useMemo(() => {
    const map = {};
    maintenanceTasks.forEach((t) => {
      if (!t.createdBy) return;
      const key = t.createdBy;
      if (!map[key]) map[key] = { creator: key, tasks: 0, days: 0, progressSum: 0 };

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
  }, [maintenanceTasks]);

  const pTotals = useMemo(() => {
    const c = { "Not Started": 0, "In Progress": 0, Completed: 0 };
    let daysScope = 0;
    let count = 0;
    projectTasks.forEach((t) => {
      count++;
      const progressVal = Number(t.progress) || 0;
      c[statusOf(progressVal)]++;
      const daysVal = Number(t.daysRequired);
      daysScope += isNaN(daysVal) ? 0 : daysVal;
    });
    return {
      totalProjects: projectsList.length,
      totalTasks: count,
      daysScope,
      statusCounts: c,
    };
  }, [projectTasks, projectsList]);

  const pOverdue = useMemo(() => {
    const today = todayStr();
    return projectTasks.filter((t) => t.endDate && t.endDate < today && Number(t.progress) < 100);
  }, [projectTasks]);

  const pByAssignee = useMemo(() => {
    const today = todayStr();
    const map = {};
    projectTasks.forEach((t) => {
      const key = t.assigneeName || "Unassigned";
      if (!map[key]) {
        map[key] = {
          assignee: key,
          tasks: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0,
          overdue: 0,
          days: 0,
          progressSum: 0
        };
      }

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress) || 0;

      map[key].tasks++;
      map[key].days += isNaN(daysVal) ? 0 : daysVal;
      map[key].progressSum += isNaN(progVal) ? 0 : progVal;

      if (progVal === 100) {
        map[key].completed++;
      } else if (progVal > 0) {
        map[key].inProgress++;
      } else {
        map[key].notStarted++;
      }

      if (t.endDate && t.endDate < today && progVal < 100) {
        map[key].overdue++;
      }
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [projectTasks]);

  const byProject = useMemo(() => {
    const map = {};
    projectTasks.forEach((t) => {
      if (!t.project) return;
      const key = t.project;
      if (!map[key]) {
        map[key] = {
          project: key,
          token: t.projectToken || "",
          tasks: 0,
          days: 0,
          progressSum: 0,
          statusCounts: { "Not Started": 0, "In Progress": 0, Completed: 0 }
        };
      }

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress);

      map[key].tasks++;
      map[key].days += isNaN(daysVal) ? 0 : daysVal;
      map[key].progressSum += isNaN(progVal) ? 0 : progVal;
      map[key].statusCounts[statusOf(progVal)]++;
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg,
        displayName: p.project
      };
    });
  }, [projectTasks]);

  const filteredMaintenanceTasks = useMemo(() => {
    let list = maintenanceTasks;
    if (mStatusFilter !== "All") {
      list = list.filter(t => statusOf(t.progress) === mStatusFilter);
    }
    if (mCreatorFilter !== "All") {
      list = list.filter(t => t.createdBy === mCreatorFilter);
    }
    if (mSearch.trim()) {
      const q = mSearch.toLowerCase().trim();
      list = list.filter(t => 
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.project && t.project.toLowerCase().includes(q)) ||
        (t.location && t.location.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [maintenanceTasks, mSearch, mStatusFilter, mCreatorFilter]);

  const filteredProjectsList = useMemo(() => {
    let list = projectsList;
    if (pStatusFilter !== "All") {
      list = list.filter(p => {
        const tasksInP = projectTasks.filter(t => t.project === p);
        const avg = tasksInP.length ? Math.round(tasksInP.reduce((acc, t) => acc + t.progress, 0) / tasksInP.length) : 0;
        const status = avg >= 100 ? "Completed" : avg > 0 ? "In Progress" : "Not Started";
        return status === pStatusFilter;
      });
    }
    if (pCreatorFilter !== "All") {
      list = list.filter(p => {
        const tasksInP = tasks.filter(t => t.project === p);
        return tasksInP.some(t => t.createdBy === pCreatorFilter);
      });
    }
    if (pSearch.trim()) {
      const q = pSearch.toLowerCase().trim();
      list = list.filter(p => p.toLowerCase().includes(q));
    }
    return list;
  }, [projectsList, pSearch, pStatusFilter, pCreatorFilter, projectTasks, tasks]);

  const filteredProjectTasks = useMemo(() => {
    let list = projectTasks.filter(t => t.project === selectedProject);
    if (tStatusFilter !== "All") {
      list = list.filter(t => statusOf(t.progress) === tStatusFilter);
    }
    if (tCreatorFilter !== "All") {
      list = list.filter(t => t.createdBy === tCreatorFilter);
    }
    if (tSearch.trim()) {
      const q = tSearch.toLowerCase().trim();
      list = list.filter(t => 
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.projectToken && t.projectToken.toLowerCase().includes(q)) ||
        (t.location && t.location.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [projectTasks, selectedProject, tSearch, tStatusFilter, tCreatorFilter]);

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
          <img src={logo} alt="RMP Logo" className="jd-header-logo" />
          <div>
            <div className="jd-brand-title">RMP ENGINEERING SYSTEM</div>
            <div className="jd-brand-sub">Maintainance &amp; Project Dashboard</div>
          </div>
        </div>
        <div className="jd-user">
          <span className="jd-user-name">
            <User size={14} /> {session.name}
          </span>
          <button className="jd-icon-btn jd-hamburger" onClick={() => setMenuOpen(!menuOpen)} title="Toggle menu">
            <Menu size={16} />
          </button>
          <button className="jd-icon-btn jd-logout-btn" onClick={handleLogout} title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {err && <div className="jd-error-bar">{err}</div>}

      <nav className="jd-tabs">
        <button className={view === "m-dashboard" ? "active" : ""} onClick={() => setView("m-dashboard")}>
          <LayoutGrid size={14} /> Maintenance Dashboard
        </button>
        <button className={view === "maintenance" ? "active" : ""} onClick={() => setView("maintenance")}>
          <ListChecks size={14} /> Maintenance Tasks
        </button>
        <button className={view === "p-dashboard" ? "active" : ""} onClick={() => setView("p-dashboard")}>
          <LayoutGrid size={14} /> Projects Dashboard
        </button>
        <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}>
          <ListChecks size={14} /> Projects List
        </button>
        {session.role === "management" && (
          <button className={view === "users" ? "active" : ""} onClick={() => setView("users")}>
            <Users size={14} /> Users
          </button>
        )}
      </nav>

      {/* Mobile Hamburger menu list */}
      {menuOpen && (
        <div className="jd-mobile-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="jd-mobile-menu" onClick={(e) => e.stopPropagation()}>
            <button className={view === "m-dashboard" ? "active" : ""} onClick={() => { setView("m-dashboard"); setMenuOpen(false); }}>
              <LayoutGrid size={14} /> Maintenance Dashboard
            </button>
            <button className={view === "maintenance" ? "active" : ""} onClick={() => { setView("maintenance"); setMenuOpen(false); }}>
              <ListChecks size={14} /> Maintenance Tasks
            </button>
            <button className={view === "p-dashboard" ? "active" : ""} onClick={() => { setView("p-dashboard"); setMenuOpen(false); }}>
              <LayoutGrid size={14} /> Projects Dashboard
            </button>
            <button className={view === "projects" ? "active" : ""} onClick={() => { setView("projects"); setMenuOpen(false); }}>
              <ListChecks size={14} /> Projects List
            </button>
            {session.role === "management" && (
              <button className={view === "users" ? "active" : ""} onClick={() => { setView("users"); setMenuOpen(false); }}>
                <Users size={14} /> Users Panel
              </button>
            )}
            <button className="jd-mobile-menu-logout" onClick={() => { handleLogout(); setMenuOpen(false); }}>
              <LogOut size={14} /> Log Out
            </button>
          </div>
        </div>
      )}

      {view === "m-dashboard" && (
        <main className="jd-main">
          <div className="jd-stats">
            <StatCard label="Total Maintenance Tasks" value={mTotals.totalTasks} />
            <StatCard label="Days Scope" value={mTotals.daysScope} />
            <StatCard label="Not started" value={mTotals.statusCounts["Not Started"]} color={STATUS_COLOR["Not Started"]} />
            <StatCard label="In progress" value={mTotals.statusCounts["In Progress"]} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={mTotals.statusCounts.Completed} color={STATUS_COLOR.Completed} />
          </div>

          <div className="jd-charts">
            <div className="jd-panel">
              <h4>Maintenance Tasks by Category</h4>
              <div style={{ position: "relative", width: "100%", height: "210px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mByTaskName}
                      dataKey="tasks"
                      nameKey="displayName"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {mByTaskName.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1E2126", border: "1px solid #343941", borderRadius: 8, color: "#ECEAE5" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="jd-panel jd-panel-wide">
              <h4>Average progress by task</h4>
              <div style={{ position: "relative", width: "100%", height: "210px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mByTaskName} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#343941" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#9BA1AA", fontSize: 11 }} />
                    <YAxis type="category" dataKey="displayName" width={150} tick={{ fill: "#ECEAE5", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1E2126", border: "1px solid #343941", borderRadius: 8, color: "#ECEAE5" }} />
                    <Bar dataKey="avgProgress" radius={[0, 4, 4, 0]}>
                      {mByTaskName.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="jd-panel">
            <h4><AlertTriangle size={14} /> Overdue Maintenance Tasks ({mOverdue.length})</h4>
            {mOverdue.length === 0 ? (
              <p className="jd-empty-note">Nothing overdue right now.</p>
            ) : (
              <table className="jd-table">
                <thead>
                  <tr><th>Task No</th><th>Name</th><th>Location</th><th>Assignee</th><th>End date</th><th>Progress</th></tr>
                </thead>
                <tbody>
                  {mOverdue.map((t) => (
                    <tr key={t.id} onClick={() => handleEditTaskSelect(t)}>
                      <td><strong>{t.task}</strong></td>
                      <td>{t.project || "—"}</td>
                      <td>{t.location || "—"}</td>
                      <td>{t.assigneeName || "—"}</td>
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
              <h4>By assignee</h4>
              <table className="jd-table">
                <thead>
                  <tr>
                    <th>Assignee</th>
                    <th>Tasks</th>
                    <th>Task Breakdown</th>
                    <th>Days engaged</th>
                    <th>Avg progress</th>
                  </tr>
                </thead>
                <tbody>
                  {mByAssignee.map((p) => (
                    <tr key={p.assignee}>
                      <td><strong>{p.assignee}</strong></td>
                      <td>{p.tasks}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <ProjectStatusCircle
                            notStarted={p.notStarted}
                            inProgress={p.inProgress}
                            completed={p.completed}
                          />
                          <span style={{ fontSize: "11.5px", color: "#9BA1AA" }}>
                            {p.completed} / {p.inProgress} / {p.notStarted}
                          </span>
                        </div>
                      </td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="jd-panel">
              <h4>By creator / engineer</h4>
              <table className="jd-table">
                <thead><tr><th>Creator / Engineer</th><th>Tasks</th><th>Days engaged</th><th>Avg progress</th></tr></thead>
                <tbody>
                  {mByCreator.map((p) => (
                    <tr key={p.creator}>
                      <td>{p.creator}</td>
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

      {view === "p-dashboard" && (
        <main className="jd-main">
          <div className="jd-stats">
            <StatCard label="Projects" value={pTotals.totalProjects} />
            <StatCard label="Total project tasks" value={pTotals.totalTasks} />
            <StatCard label="Days scope" value={pTotals.daysScope} />
            <StatCard label="Not started" value={pTotals.statusCounts["Not Started"]} color={STATUS_COLOR["Not Started"]} />
            <StatCard label="In progress" value={pTotals.statusCounts["In Progress"]} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={pTotals.statusCounts.Completed} color={STATUS_COLOR.Completed} />
          </div>

          <div className="jd-charts">
            <div className="jd-panel">
              <h4>Tasks by Project</h4>
              <div style={{ position: "relative", width: "100%", height: "210px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byProject}
                      dataKey="tasks"
                      nameKey="displayName"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {byProject.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
                    <Bar dataKey="avgProgress" radius={[0, 4, 4, 0]}>
                      {byProject.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="jd-panel">
            <h4><AlertTriangle size={14} /> Overdue Project Tasks ({pOverdue.length})</h4>
            {pOverdue.length === 0 ? (
              <p className="jd-empty-note">Nothing overdue right now.</p>
            ) : (
              <table className="jd-table">
                <thead>
                  <tr><th>Project</th><th>Task No</th><th>Location</th><th>Assignee</th><th>End date</th><th>Progress</th></tr>
                </thead>
                <tbody>
                  {pOverdue.map((t) => (
                    <tr key={t.id} onClick={() => handleEditTaskSelect(t)}>
                      <td>{t.project}</td>
                      <td><strong>{t.task}</strong></td>
                      <td>{t.location || "—"}</td>
                      <td>{t.assigneeName || "—"}</td>
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
                <thead><tr><th>Project</th><th>Tasks</th><th>Task Breakdown</th><th>Days</th><th>Avg progress</th></tr></thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.project}>
                      <td>{p.project}</td>
                      <td>{p.tasks}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <ProjectStatusCircle
                            notStarted={p.statusCounts["Not Started"]}
                            inProgress={p.statusCounts["In Progress"]}
                            completed={p.statusCounts.Completed}
                          />
                          <span style={{ fontSize: "11.5px", color: "#9BA1AA" }}>
                            {p.statusCounts.Completed} / {p.statusCounts["In Progress"]} / {p.statusCounts["Not Started"]}
                          </span>
                        </div>
                      </td>
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
                <thead>
                  <tr>
                    <th>Assignee</th>
                    <th>Tasks</th>
                    <th>Task Breakdown</th>
                    <th>Days engaged</th>
                    <th>Avg progress</th>
                  </tr>
                </thead>
                <tbody>
                  {pByAssignee.map((p) => (
                    <tr key={p.assignee}>
                      <td><strong>{p.assignee}</strong></td>
                      <td>{p.tasks}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <ProjectStatusCircle
                            notStarted={p.notStarted}
                            inProgress={p.inProgress}
                            completed={p.completed}
                          />
                          <span style={{ fontSize: "11.5px", color: "#9BA1AA" }}>
                            {p.completed} / {p.inProgress} / {p.notStarted}
                          </span>
                        </div>
                      </td>
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

      {view === "maintenance" && (
        <main className="jd-main">
          {/* Maintenance Stats */}
          <div className="jd-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <StatCard label="Total Maintenance Tasks" value={maintenanceTasks.length} />
            <StatCard label="In Progress" value={maintenanceTasks.filter(t => statusOf(t.progress) === "In Progress").length} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={maintenanceTasks.filter(t => statusOf(t.progress) === "Completed").length} color={STATUS_COLOR.Completed} />
          </div>

          <div className="jd-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
              <h4 style={{ margin: 0 }}>Maintenance Tasks</h4>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "640px" }}>
                <input
                  type="text"
                  className="jd-input"
                  value={mSearch}
                  onChange={(e) => setMSearch(e.target.value)}
                  placeholder="Search by Task No, Name, Location..."
                  style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                />
                <select
                  className="jd-input"
                  value={mStatusFilter}
                  onChange={(e) => setMStatusFilter(e.target.value)}
                  style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
                <select
                  className="jd-input"
                  value={mCreatorFilter}
                  onChange={(e) => setMCreatorFilter(e.target.value)}
                  style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                >
                  <option value="All">All Creators</option>
                  {creatorNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              {session.role === "management" && (
                <button className="jd-primary-btn" onClick={() => { setFormType("maintenance"); setEditTask(null); setShowForm(true); }}>
                  <Plus size={14} /> Add Maintenance Task
                </button>
              )}
            </div>

            {filteredMaintenanceTasks.length === 0 ? (
              <p className="jd-empty-note">No maintenance tasks found.</p>
            ) : (
              <table className="jd-table jd-table-click">
                <thead>
                  <tr>
                    <th>Task No</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Assignee</th>
                    <th>Start Date</th>
                    <th>Days</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Created By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaintenanceTasks.map((t) => {
                    const overdueRow = t.endDate && t.endDate < todayStr() && t.progress < 100;
                    return (
                      <tr key={t.id} onClick={() => handleEditTaskSelect(t)} className={overdueRow ? "jd-row-overdue" : ""}>
                        <td><strong>{t.task}</strong></td>
                        <td>{t.project || "—"}</td>
                        <td>{t.location || "—"}</td>
                        <td>{t.assigneeName || "—"}</td>
                        <td className="jd-mono">{fmt(t.startDate)}</td>
                        <td>{t.daysRequired || "—"}</td>
                        <td><ProgressBar value={t.progress} /></td>
                        <td>
                          <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress)] }}>
                            {statusOf(t.progress)}
                          </span>
                        </td>
                        <td>{t.createdBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      )}

      {view === "projects" && (
        <main className="jd-main">
          {!selectedProject ? (
            <>
              {/* Projects Overview Stats */}
              <div className="jd-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <StatCard label="Total Projects" value={projectsList.length} />
                <StatCard label="In Progress" value={projectsList.filter(p => {
                  const tasksInP = projectTasks.filter(t => t.project === p);
                  if (tasksInP.length === 0) return true;
                  const avg = Math.round(tasksInP.reduce((acc, t) => acc + t.progress, 0) / tasksInP.length);
                  return avg < 100;
                }).length} color={STATUS_COLOR["In Progress"]} />
                <StatCard label="Completed" value={projectsList.filter(p => {
                  const tasksInP = projectTasks.filter(t => t.project === p);
                  if (tasksInP.length === 0) return false;
                  const avg = Math.round(tasksInP.reduce((acc, t) => acc + t.progress, 0) / tasksInP.length);
                  return avg >= 100;
                }).length} color={STATUS_COLOR.Completed} />
              </div>

              <div className="jd-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                  <h4 style={{ margin: 0 }}>Projects</h4>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "640px" }}>
                    <input
                      type="text"
                      className="jd-input"
                      value={pSearch}
                      onChange={(e) => setPSearch(e.target.value)}
                      placeholder="Search projects..."
                      style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                    />
                    <select
                      className="jd-input"
                      value={pStatusFilter}
                      onChange={(e) => setPStatusFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <select
                      className="jd-input"
                      value={pCreatorFilter}
                      onChange={(e) => setPCreatorFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Creators</option>
                      {creatorNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  {session.role === "management" && (
                    <button className="jd-primary-btn" onClick={() => setShowProjectForm(true)}>
                      <Plus size={14} /> Create Project
                    </button>
                  )}
                </div>

                {filteredProjectsList.length === 0 ? (
                  <p className="jd-empty-note">No projects found.</p>
                ) : (
                  <table className="jd-table jd-table-click">
                    <thead>
                      <tr>
                        <th>Project Name</th>
                        <th>Tasks Count</th>
                        <th>Average Progress</th>
                        <th>Task Breakdown</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjectsList.map((p) => {
                        const tasksInP = projectTasks.filter(t => t.project === p);
                        const avg = tasksInP.length ? Math.round(tasksInP.reduce((acc, t) => acc + t.progress, 0) / tasksInP.length) : 0;
                        const status = avg >= 100 ? "Completed" : avg > 0 ? "In Progress" : "Not Started";

                        const nsCount = tasksInP.filter(t => statusOf(t.progress) === "Not Started").length;
                        const ipCount = tasksInP.filter(t => statusOf(t.progress) === "In Progress").length;
                        const cCount = tasksInP.filter(t => statusOf(t.progress) === "Completed").length;

                        return (
                          <tr key={p} onClick={() => setSelectedProject(p)}>
                            <td><strong>{p}</strong></td>
                            <td>{tasksInP.length} tasks</td>
                            <td><ProgressBar value={avg} /></td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <ProjectStatusCircle notStarted={nsCount} inProgress={ipCount} completed={cCount} />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  {cCount > 0 && (
                                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#3da35d", background: "rgba(61, 163, 93, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                      {cCount}
                                    </span>
                                  )}
                                  {ipCount > 0 && (
                                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#F26430", background: "rgba(242, 100, 48, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                      {ipCount}
                                    </span>
                                  )}
                                  {nsCount > 0 && (
                                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#ff6b6b", background: "rgba(255, 107, 107, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                      {nsCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[status] }}>
                                {status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                                <button className="jd-primary-btn" style={{ padding: "4px 8px", fontSize: "12px", gap: "4px" }} onClick={() => setSelectedProject(p)}>
                                  View Tasks
                                </button>
                                {session.role === "management" && (
                                  <button
                                    className="jd-danger-btn"
                                    style={{ padding: "4px 8px", fontSize: "12px", border: "1px solid #5c2b2b" }}
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to permanently delete project "${p}" and all its tasks?`)) {
                                        await saveTasks(tasks.filter(t => t.project !== p));
                                      }
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Back Nav and Stats */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <button className="jd-icon-btn" onClick={() => setSelectedProject("")} style={{ display: "flex", alignContent: "center", padding: "6px 12px", fontSize: "13px" }}>
                  ← Back to Projects
                </button>
                <h3 style={{ margin: 0, fontFamily: "'Oswald', sans-serif" }}>{selectedProject}</h3>
              </div>

              {/* Project Stats */}
              <div className="jd-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <StatCard label="Tasks" value={projectTasks.filter(t => t.project === selectedProject).length} />
                <StatCard label="In Progress" value={projectTasks.filter(t => t.project === selectedProject && statusOf(t.progress) === "In Progress").length} color={STATUS_COLOR["In Progress"]} />
                <StatCard label="Completed" value={projectTasks.filter(t => t.project === selectedProject && statusOf(t.progress) === "Completed").length} color={STATUS_COLOR.Completed} />
              </div>

              {/* Project Tasks Table */}
              <div className="jd-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                  <h4 style={{ margin: 0 }}>Project Tasks</h4>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "640px" }}>
                    <input
                      type="text"
                      className="jd-input"
                      value={tSearch}
                      onChange={(e) => setTSearch(e.target.value)}
                      placeholder="Search by Task No, Location..."
                      style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                    />
                    <select
                      className="jd-input"
                      value={tStatusFilter}
                      onChange={(e) => setTStatusFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <select
                      className="jd-input"
                      value={tCreatorFilter}
                      onChange={(e) => setTCreatorFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Creators</option>
                      {creatorNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  {session.role === "management" && (
                    <button className="jd-primary-btn" onClick={() => { setFormType("project"); setEditTask(null); setShowForm(true); }}>
                      <Plus size={14} /> Add Project Task
                    </button>
                  )}
                </div>

                {filteredProjectTasks.length === 0 ? (
                  <p className="jd-empty-note">No tasks found in this project.</p>
                ) : (
                  <table className="jd-table jd-table-click">
                    <thead>
                      <tr>
                        <th>Task No</th>
                        <th>Location</th>
                        <th>Assignee</th>
                        <th>Start Date</th>
                        <th>Days</th>
                        <th>Progress</th>
                        <th>Status</th>
                        <th>Created By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjectTasks.map((t) => {
                        const overdueRow = t.endDate && t.endDate < todayStr() && t.progress < 100;
                        return (
                          <tr key={t.id} onClick={() => handleEditTaskSelect(t)} className={overdueRow ? "jd-row-overdue" : ""}>
                            <td><strong>{t.task}</strong></td>
                            <td>{t.location || "—"}</td>
                            <td>{t.assigneeName || "—"}</td>
                            <td className="jd-mono">{fmt(t.startDate)}</td>
                            <td>{t.daysRequired || "—"}</td>
                            <td><ProgressBar value={t.progress} /></td>
                            <td>
                              <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress)] }}>
                                {statusOf(t.progress)}
                              </span>
                            </td>
                            <td>{t.createdBy}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      )}

      {view === "users" && session.role === "management" && (
        <UserManagementPanel users={users} session={session} onSaveUsers={saveUsers} />
      )}

      {(showForm || editTask) && (
        <TaskFormModal
          initial={editTask}
          defaultType={formType}
          defaultProject={selectedProject}
          assigneeNames={assigneeNames}
          userNames={users.map((u) => u.username)}
          readOnly={session.role !== "management"}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          onSave={upsertTask}
          onDelete={editTask && session.role === "management" ? () => deleteTask(editTask.id) : null}
          onQuickProgress={editTask && session.role === "management" ? (p) => quickProgress(editTask.id, p) : null}
        />
      )}

      {showProjectForm && (
        <ProjectFormModal
          onClose={() => setShowProjectForm(false)}
          assigneeNames={assigneeNames}
          userNames={users.map((u) => u.username)}
          tasks={tasks}
          onSave={async (taskData) => {
            const now = new Date().toISOString();
            const nextList = [
              {
                id: nextId(),
                ...taskData,
                createdBy: session.name,
                createdAt: now,
                updatedAt: now,
              },
              ...tasks,
            ];
            await saveTasks(nextList);
            setSelectedProject(taskData.project);
            setShowProjectForm(false);
          }}
        />
      )}
    </div>
  );
}

function ProjectStatusCircle({ notStarted = 0, inProgress = 0, completed = 0 }) {
  const total = notStarted + inProgress + completed;
  if (total === 0) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: "block" }}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="#343941" strokeWidth="4" />
      </svg>
    );
  }

  const r = 8;
  const cx = 12;
  const cy = 12;
  const circumference = 2 * Math.PI * r;

  const pctC = completed / total;
  const pctIP = inProgress / total;
  const pctNS = notStarted / total;

  const strokeC = circumference * pctC;
  const offsetC = 0;

  const strokeIP = circumference * pctIP;
  const offsetIP = strokeC;

  const strokeNS = circumference * pctNS;
  const offsetNS = strokeC + strokeIP;

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)", display: "block" }}>
      {pctC > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#3da35d"
          strokeWidth="5"
          strokeDasharray={`${strokeC} ${circumference}`}
          strokeDashoffset={-offsetC}
        />
      )}
      {pctIP > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#F26430"
          strokeWidth="5"
          strokeDasharray={`${strokeIP} ${circumference}`}
          strokeDashoffset={-offsetIP}
        />
      )}
      {pctNS > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#ff6b6b"
          strokeWidth="5"
          strokeDasharray={`${strokeNS} ${circumference}`}
          strokeDashoffset={-offsetNS}
        />
      )}
    </svg>
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
      <div className="jd-app jd-login-screen" style={{ backgroundImage: `url(${loginBanner})` }}>
        <style>{CSS}</style>
        <form className="jd-login-card" onSubmit={handleReset}>
          <div className="jd-brand jd-login-brand-col">
            <img src={logo} alt="RMP Logo" className="jd-login-logo" />
            <div style={{ textAlign: "center" }}>
              <div className="jd-brand-title" style={{ fontSize: "18px" }}>RMP ENGINEERING SYSTEM</div>
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
    <div className="jd-app jd-login-screen" style={{ backgroundImage: `url(${loginBanner})` }}>
      <style>{CSS}</style>
      <form className="jd-login-card" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="jd-brand jd-login-brand-col">
          <img src={logo} alt="RMP Logo" className="jd-login-logo" />
          <div style={{ textAlign: "center" }}>
            <div className="jd-brand-title" style={{ fontSize: "18px" }}>RMP ENGINEERING SYSTEM</div>
            <div className="jd-brand-sub">Maintainance &amp; Project Dashboard</div>
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

function TaskFormModal({ initial, defaultType, defaultProject, assigneeNames, userNames, readOnly, onClose, onSave, onDelete, onQuickProgress }) {
  const isMaintenance = initial ? (initial.projectToken === "maintenance") : (defaultType === "maintenance");

  const [selectedNameOption, setSelectedNameOption] = useState(() => {
    const val = initial?.project || "";
    if (DEFAULT_NAMES.includes(val)) {
      return val;
    }
    if (!val) {
      return DEFAULT_NAMES[0];
    }
    return "__custom__";
  });
  const [customNameInput, setCustomNameInput] = useState(() => {
    const val = initial?.project || "";
    return DEFAULT_NAMES.includes(val) ? "" : val;
  });

  const [task, setTask] = useState(initial?.task || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [assigneeName, setAssigneeName] = useState(initial?.assigneeName || "");
  const [startDate, setStartDate] = useState(initial?.startDate || todayStr());
  const [daysRequired, setDaysRequired] = useState(initial?.daysRequired || "");
  const [endDateOverride, setEndDateOverride] = useState(initial?.endDate || "");
  const [progress, setProgress] = useState(initial?.progress ?? 0);

  const computedEnd = endDateOverride || addDays(startDate, daysRequired);

  function submit() {
    if (readOnly) return;
    if (!task.trim()) {
      alert("Please enter a Task No.");
      return;
    }
    const finalProject = isMaintenance
      ? (selectedNameOption === "__custom__" ? customNameInput.trim() : selectedNameOption)
      : (initial?.project || defaultProject || "");
    if (!finalProject) {
      alert("Please select or enter a name.");
      return;
    }
    onSave(
      {
        project: finalProject,
        projectToken: isMaintenance ? "maintenance" : "project",
        task: task.trim(),
        location: location.trim(),
        assigneeName: assigneeName.trim(),
        startDate,
        daysRequired: Number(daysRequired) || 0,
        endDateOverride,
        progress: Number(progress)
      },
      initial?.id
    );
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>{initial ? (readOnly ? `View Task` : `Edit Task`) : (isMaintenance ? "Add Maintenance Task" : `Add Task under ${defaultProject}`)}</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {isMaintenance ? (
          <>
            <label className="jd-field-label">Name</label>
            {readOnly ? (
              <input className="jd-input" value={initial?.project || ""} disabled={true} />
            ) : (
              <>
                <select
                  className="jd-input"
                  value={selectedNameOption}
                  onChange={(e) => setSelectedNameOption(e.target.value)}
                >
                  {DEFAULT_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                  <option value="__custom__">Custom Name...</option>
                </select>
                {selectedNameOption === "__custom__" && (
                  <input
                    type="text"
                    className="jd-input"
                    value={customNameInput}
                    onChange={(e) => setCustomNameInput(e.target.value)}
                    placeholder="Enter custom maintenance name"
                    style={{ marginTop: "8px" }}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <>
            <label className="jd-field-label">Project</label>
            <input className="jd-input" value={initial?.project || defaultProject} disabled={true} />
          </>
        )}

        <label className="jd-field-label">Task No</label>
        <input className="jd-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. T-1001" disabled={readOnly} />

        <label className="jd-field-label">Location</label>
        <input className="jd-input" list="jd-locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Factory Floor A" disabled={readOnly} />
        <datalist id="jd-locations">{assigneeNames.map((a) => <option key={a} value={a} />)}</datalist>

        <label className="jd-field-label">Assignee</label>
        <input className="jd-input" list="jd-assignees" value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)} placeholder="e.g. Lakshan" disabled={readOnly} />
        <datalist id="jd-assignees">{userNames.map((u) => <option key={u} value={u} />)}</datalist>

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

function ProjectFormModal({ onClose, onSave, assigneeNames, userNames, tasks }) {
  const [selectedNameOption, setSelectedNameOption] = useState(DEFAULT_NAMES[0]);
  const [customNameInput, setCustomNameInput] = useState("");
  const [task, setTask] = useState("");
  const [location, setLocation] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [daysRequired, setDaysRequired] = useState("");
  const [endDateOverride, setEndDateOverride] = useState("");
  const [progress, setProgress] = useState(0);

  const computedEnd = endDateOverride || addDays(startDate, daysRequired);

  function submit() {
    const finalName = selectedNameOption === "__custom__" ? customNameInput.trim() : selectedNameOption;
    if (!finalName) {
      alert("Please select or enter a project name.");
      return;
    }
    const exists = tasks.some(
      (t) => t.projectToken !== "maintenance" && t.project && t.project.toLowerCase() === finalName.toLowerCase()
    );
    if (exists) {
      alert("Project already exists! If you want to add a task to it, please select the project and click 'Add Project Task'.");
      return;
    }
    if (!task.trim()) {
      alert("Please enter a Task No.");
      return;
    }

    onSave({
      project: finalName,
      projectToken: "project",
      task: task.trim(),
      location: location.trim(),
      assigneeName: assigneeName.trim(),
      startDate,
      daysRequired: Number(daysRequired) || 0,
      endDateOverride,
      progress: Number(progress)
    });
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>Create New Project</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="jd-field-label">Project Name</label>
        <select
          className="jd-input"
          value={selectedNameOption}
          onChange={(e) => setSelectedNameOption(e.target.value)}
        >
          {DEFAULT_NAMES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value="__custom__">Custom Name...</option>
        </select>

        {selectedNameOption === "__custom__" && (
          <input
            type="text"
            className="jd-input"
            value={customNameInput}
            onChange={(e) => setCustomNameInput(e.target.value)}
            placeholder="Enter custom project name"
            style={{ marginTop: "8px" }}
            autoFocus
          />
        )}

        <label className="jd-field-label">Task No (First Task)</label>
        <input className="jd-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. T-1001" />

        <label className="jd-field-label">Location</label>
        <input className="jd-input" list="jd-proj-locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Factory Floor A" />
        <datalist id="jd-proj-locations">{assigneeNames.map((a) => <option key={a} value={a} />)}</datalist>

        <label className="jd-field-label">Assignee</label>
        <input className="jd-input" list="jd-proj-assignees" value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)} placeholder="e.g. Lakshan" />
        <datalist id="jd-proj-assignees">{userNames.map((u) => <option key={u} value={u} />)}</datalist>

        <div className="jd-form-row">
          <div>
            <label className="jd-field-label"><Calendar size={12} /> Start date</label>
            <input type="date" className="jd-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="jd-field-label">Days required</label>
            <input type="number" min="0" className="jd-input" value={daysRequired} onChange={(e) => { setDaysRequired(e.target.value); setEndDateOverride(""); }} placeholder="e.g. 6" />
          </div>
        </div>

        <label className="jd-field-label">End date {daysRequired && !endDateOverride ? "(auto — edit to override)" : ""}</label>
        <input type="date" className="jd-input" value={computedEnd} onChange={(e) => setEndDateOverride(e.target.value)} />

        <label className="jd-field-label">Progress: {progress}%</label>
        <input type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(e.target.value)} className="jd-slider" />
        <div className="jd-quick-row">
          {[0, 25, 50, 75, 100].map((p) => (
            <button type="button" key={p} className="jd-chip-btn" onClick={() => setProgress(p)}>{p}%</button>
          ))}
        </div>

        <div className="jd-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="jd-danger-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-primary-btn">Create Project</button>
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
.jd-brand { display:flex; align-items:center; gap:12px; color:var(--accent); }
.jd-header-logo { height: 32px; border-radius: 4px; object-fit: contain; }
.jd-login-logo { height: 60px; border-radius: 8px; object-fit: contain; margin-bottom: 4px; }
.jd-login-brand-col { display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--accent); justify-content: center; margin-bottom: 14px; }
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
.jd-hamburger { display: none; }
.jd-mobile-menu-overlay { display: none; }

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

.jd-projects-layout { display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: start; }
.jd-project-btn { width: 100%; text-align: left; padding: 10px 12px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease; margin-bottom: 2px; }
.jd-project-btn:hover { border-color: var(--text-dim); }
.jd-project-btn.active { background: var(--accent); color: #191008; border-color: var(--accent); font-weight: 600; }
.jd-login-screen { display:flex; align-items:center; justify-content:center; min-height:100vh; background-size:cover; background-position:center; background-repeat:no-repeat; padding:20px; position:relative; }
.jd-login-screen::before { content:""; position:absolute; inset:0; background:rgba(0, 0, 0, 0.15); z-index:1; }
.jd-login-card { background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:28px; width:100%; max-width:380px; box-shadow:0 15px 35px rgba(0,0,0,0.6); z-index:2; }
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
  .jd-tabs { display: none !important; }
  .jd-hamburger { display: flex; }
  .jd-logout-btn { display: none !important; }
  .jd-user-name { display: none !important; }
  .jd-mobile-menu-overlay { display: block; position: fixed; inset: 0; top: 57px; background: rgba(10, 11, 13, 0.72); z-index: 45; }
  .jd-mobile-menu { background: var(--panel); border-bottom: 1px solid var(--border); padding: 14px 20px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .jd-mobile-menu button { display: flex; align-items: center; gap: 8px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); padding: 10px 14px; border-radius: 8px; cursor: pointer; text-align: left; font-size: 14px; font-weight: 500; width: 100%; }
  .jd-mobile-menu button.active { background: var(--accent); color: #191008; border-color: var(--accent); font-weight: 600; }
  .jd-mobile-menu-logout { border-color: #5c2b2b !important; color: #f2a3a3 !important; }

  .jd-projects-layout { grid-template-columns: 1fr; }
  .jd-stats { grid-template-columns: repeat(3, 1fr); }
  .jd-charts { grid-template-columns: 1fr; }
  .jd-two-col { grid-template-columns: 1fr; }
  .jd-header { padding: 12px 16px; flex-direction: row; gap: 10px; align-items: center; justify-content: space-between; }
  .jd-user { justify-content: flex-end; }
  .jd-main { padding: 16px 16px 30px; gap: 14px; }
  .jd-filters { flex-direction: column; gap: 8px; }
}

@media (max-width: 480px) {
  .jd-stats { grid-template-columns: repeat(2, 1fr); }
}
`;
