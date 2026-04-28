import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import "./App.css";

const API = "/api/students";

const BRANCHES = ["CSE", "ECE", "ME", "CE", "IT", "EEE", "CIVIL", "MBA"];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const SUBJECTS_BY_BRANCH = {
  CSE:   ["Data Structures", "Algorithms", "DBMS", "OS", "CN", "Machine Learning", "Web Dev", "Software Engineering"],
  ECE:   ["Signals & Systems", "Electronics", "Communication Systems", "VLSI", "Microprocessors", "EMT", "Digital Circuits"],
  ME:    ["Thermodynamics", "Fluid Mechanics", "Manufacturing", "CAD/CAM", "Heat Transfer", "Machine Design"],
  CE:    ["Structural Analysis", "Geotechnical Engg", "Highway Engg", "Hydraulics", "Concrete Technology"],
  IT:    ["Data Structures", "Web Technologies", "Cyber Security", "Cloud Computing", "AI/ML", "IoT"],
  EEE:   ["Power Systems", "Electrical Machines", "Control Systems", "Power Electronics", "Circuit Theory"],
  CIVIL: ["Surveying", "Construction Management", "Environmental Engg", "Transportation Engg"],
  MBA:   ["Management", "Marketing", "Finance", "HR", "Operations", "Business Analytics"],
};
const DEFAULT_SUBJECTS = ["Mathematics", "Physics", "Chemistry", "English", "Professional Ethics"];

const emptyForm = {
  name: "", email: "", rollNumber: "", branch: "", semester: "",
  phone: "", gender: "", dob: "", cgpa: "", attendance: "", status: "Active",
};

const COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#14b8a6"];
function getAvatarColor(name) { return COLORS[(name?.charCodeAt(0) || 0) % COLORS.length]; }
function getInitials(name) { return (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase(); }
function getGrade(avg) {
  if (avg == null) return "N/A";
  if (avg >= 90) return "A+"; if (avg >= 80) return "A"; if (avg >= 70) return "B+";
  if (avg >= 60) return "B";  if (avg >= 50) return "C"; if (avg >= 40) return "D";
  return "F";
}
function gradeColor(grade) {
  return { "A+":"#10b981","A":"#34d399","B+":"#3b82f6","B":"#60a5fa","C":"#f59e0b","D":"#fb923c","F":"#ef4444","N/A":"#94a3b8" }[grade] || "#94a3b8";
}

// ── Compute dashboard stats purely from allStudents array ──────────────────────
function computeStats(allStudents) {
  const total    = allStudents.length;
  const active   = allStudents.filter(s => s.status === "Active").length;
  const inactive = allStudents.filter(s => s.status === "Inactive").length;
  const alumni   = allStudents.filter(s => s.status === "Alumni").length;

  const branchMap = {};
  const semMap = {};
  for (const s of allStudents) {
    if (s.branch)   branchMap[s.branch] = (branchMap[s.branch] || 0) + 1;
    if (s.semester) semMap[s.semester]   = (semMap[s.semester]  || 0) + 1;
  }
  const byBranch   = Object.entries(branchMap).map(([_id, count]) => ({ _id, count })).sort((a,b) => b.count - a.count);
  const bySemester = Object.entries(semMap).map(([_id, count]) => ({ _id: Number(_id), count })).sort((a,b) => a._id - b._id);

  const recent = [...allStudents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  // Grade distribution
  const gradeDist = { "A+":0, "A":0, "B+":0, "B":0, "C":0, "D":0, "F":0, "N/A":0 };
  for (const s of allStudents) {
    const avg = s.averageMarks ?? (s.subjectMarks?.length ? Math.round(s.subjectMarks.reduce((a,b)=>a+b.marks,0)/s.subjectMarks.length) : null);
    gradeDist[getGrade(avg)]++;
  }

  // Attendance buckets
  const attGood = allStudents.filter(s => s.attendance != null && s.attendance >= 75).length;
  const attLow  = allStudents.filter(s => s.attendance != null && s.attendance < 75).length;
  const attNone = allStudents.filter(s => s.attendance == null).length;

  // Top scorers
  const topScorers = allStudents
    .map(s => {
      const avg = s.averageMarks ?? (s.subjectMarks?.length ? Math.round(s.subjectMarks.reduce((a,b)=>a+b.marks,0)/s.subjectMarks.length) : null);
      return { ...s, avg };
    })
    .filter(s => s.avg != null)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  return { total, active, inactive, alumni, byBranch, bySemester, recent, gradeDist, attGood, attLow, attNone, topScorers };
}

export default function App() {
  const [allStudents, setAllStudents] = useState([]);   // unfiltered, for dashboard
  const [students, setStudents]       = useState([]);   // filtered, for table
  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [dashLoading, setDashLoading] = useState(false);
  const [message, setMessage]   = useState({ text: "", type: "success" });
  const [search, setSearch]     = useState("");
  const [filterBranch, setFilterBranch]     = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [activeTab, setActiveTab]   = useState("students");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [marksModal, setMarksModal] = useState(null);
  const [marksForm, setMarksForm]   = useState({ subject: "", customSubject: "", marks: "" });
  const [showForm, setShowForm]     = useState(false);
  const [darkMode, setDarkMode]     = useState(false);
  const [viewMode, setViewMode]     = useState("table");

  useEffect(() => {
    document.body.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Fetch ALL students (no filters) for the dashboard stats
  const fetchAllStudents = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await axios.get(API);
      setAllStudents(res.data);
    } catch {}
    setDashLoading(false);
  }, []);

  // Fetch filtered students for the table
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)         params.search   = search;
      if (filterBranch)   params.branch   = filterBranch;
      if (filterSemester) params.semester = filterSemester;
      if (filterStatus)   params.status   = filterStatus;
      params.sort  = sortField;
      params.order = sortOrder;
      const res = await axios.get(API, { params });
      setStudents(res.data);
    } catch { showMsg("❌ Failed to load students", "error"); }
    setLoading(false);
  }, [search, filterBranch, filterSemester, filterStatus, sortField, sortOrder]);

  useEffect(() => { fetchAllStudents(); }, [fetchAllStudents]);
  useEffect(() => { fetchStudents(); },    [fetchStudents]);

  // Dashboard stats derived from allStudents — always up to date
  const stats = useMemo(() => computeStats(allStudents), [allStudents]);

  const refreshAll = () => { fetchStudents(); fetchAllStudents(); };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await axios.put(`${API}/${editId}`, form);
        showMsg("✅ Student updated!", "success");
      } else {
        await axios.post(API, form);
        showMsg("✅ Student added!", "success");
      }
      setForm(emptyForm); setEditId(null); setShowForm(false);
      refreshAll();
    } catch (err) {
      showMsg("❌ " + (err.response?.data?.error || "Something went wrong"), "error");
    }
  };

  const handleEdit = (student) => {
    setForm({
      name: student.name, email: student.email, rollNumber: student.rollNumber || "",
      branch: student.branch, semester: student.semester || "", phone: student.phone || "",
      gender: student.gender || "", dob: student.dob || "", cgpa: student.cgpa || "",
      attendance: student.attendance || "", status: student.status || "Active",
    });
    setEditId(student._id);
    setShowForm(true);
    setSelectedStudent(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this student? This cannot be undone.")) return;
    try {
      await axios.delete(`${API}/${id}`);
      showMsg("🗑️ Student deleted", "success");
      if (selectedStudent?._id === id) setSelectedStudent(null);
      refreshAll();
    } catch { showMsg("❌ Delete failed", "error"); }
  };

  const handleAddMarks = async () => {
    const subject = marksForm.subject === "__custom__" ? marksForm.customSubject : marksForm.subject;
    if (!subject || marksForm.marks === "") return showMsg("❌ Please fill all fields", "error");
    try {
      const res = await axios.patch(`${API}/${marksModal._id}/marks`, {
        subject, marks: Number(marksForm.marks),
      });
      showMsg("✅ Marks updated!", "success");
      setMarksModal(null);
      setMarksForm({ subject: "", customSubject: "", marks: "" });
      refreshAll();
      if (selectedStudent?._id === res.data._id) setSelectedStudent(res.data);
    } catch (err) {
      showMsg("❌ " + (err.response?.data?.error || "Failed"), "error");
    }
  };

  const showMsg = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "success" }), 3500);
  };

  const handleExport = () => { window.open("/api/export/csv", "_blank"); };

  const handleSort = (field) => {
    if (sortField === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
  };

  const clearFilters = () => {
    setSearch(""); setFilterBranch(""); setFilterSemester(""); setFilterStatus("");
  };

  const subjectsList = useMemo(() => {
    const branchSubs = SUBJECTS_BY_BRANCH[form.branch] || [];
    return [...new Set([...branchSubs, ...DEFAULT_SUBJECTS])];
  }, [form.branch]);

  const marksSubjectList = useMemo(() => {
    const branchSubs = SUBJECTS_BY_BRANCH[marksModal?.branch] || [];
    return [...new Set([...branchSubs, ...DEFAULT_SUBJECTS])];
  }, [marksModal]);

  const SortIcon = ({ field }) => (
    <span className={`sort-icon ${sortField === field ? "active" : ""}`}>
      {sortField === field ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  // ── Grade colours for pie-style display
  const GRADE_COLORS = { "A+":"#10b981","A":"#34d399","B+":"#3b82f6","B":"#60a5fa","C":"#f59e0b","D":"#fb923c","F":"#ef4444","N/A":"#cbd5e1" };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🎓</span>
            <div>
              <div className="logo-title">EduTrack</div>
              <div className="logo-sub">Student Management System</div>
            </div>
          </div>
          <nav className="nav-tabs">
            {[["students","👥 Students"],["dashboard","📊 Dashboard"]].map(([id, label]) => (
              <button key={id} className={`nav-tab ${activeTab===id?"active":""}`} onClick={() => setActiveTab(id)}>{label}</button>
            ))}
          </nav>
          <div className="header-actions">
            <button className="btn-icon" onClick={handleExport} title="Export CSV">⬇ Export</button>
            <button className="btn-icon" onClick={refreshAll} title="Refresh">↻</button>
            <button className="btn-icon" onClick={() => setDarkMode(d => !d)}>{darkMode ? "☀️" : "🌙"}</button>
          </div>
        </div>
      </header>

      {message.text && <div className={`toast toast-${message.type}`}>{message.text}</div>}

      <main className="main">

        {/* ═══ STUDENTS TAB ═══ */}
        {activeTab === "students" && (
          <>
            {/* Toolbar */}
            <div className="toolbar card">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input className="search-input" placeholder="Search by name, email or roll number…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button className="clear-search" onClick={() => setSearch("")}>✕</button>}
              </div>
              <div className="filters">
                <select value={filterBranch}   onChange={e => setFilterBranch(e.target.value)}>
                  <option value="">All Branches</option>
                  {BRANCHES.map(b => <option key={b}>{b}</option>)}
                </select>
                <select value={filterSemester} onChange={e => setFilterSemester(e.target.value)}>
                  <option value="">All Sems</option>
                  {SEMESTERS.map(s => <option key={s} value={s}>Sem {s}</option>)}
                </select>
                <select value={filterStatus}   onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Status</option>
                  <option>Active</option><option>Inactive</option><option>Alumni</option>
                </select>
                {(filterBranch || filterSemester || filterStatus || search) && (
                  <button className="btn-clear-filters" onClick={clearFilters}>Clear ✕</button>
                )}
              </div>
              <div className="toolbar-right">
                <div className="view-toggle">
                  <button className={viewMode==="table"?"active":""} onClick={() => setViewMode("table")}>☰</button>
                  <button className={viewMode==="cards"?"active":""} onClick={() => setViewMode("cards")}>⊞</button>
                </div>
                <button className="btn-primary" onClick={() => { setShowForm(f=>!f); setEditId(null); setForm(emptyForm); }}>
                  {showForm ? "✕ Close" : "＋ Add Student"}
                </button>
              </div>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
              <div className="card form-card">
                <h2 className="section-title">{editId ? "✏️ Edit Student" : "➕ Add New Student"}</h2>
                <form onSubmit={handleSubmit}>
                  <div className="form-section-label">Basic Info</div>
                  <div className="form-grid">
                    <input name="name"       placeholder="Full Name *"   value={form.name}       onChange={handleChange} required />
                    <input name="email"      type="email" placeholder="Email *" value={form.email} onChange={handleChange} required />
                    <input name="rollNumber" placeholder="Roll Number"   value={form.rollNumber} onChange={handleChange} />
                    <input name="phone"      placeholder="Phone Number"  value={form.phone}      onChange={handleChange} />
                    <select name="branch"   value={form.branch}   onChange={handleChange} required>
                      <option value="">Select Branch *</option>
                      {BRANCHES.map(b => <option key={b}>{b}</option>)}
                    </select>
                    <select name="semester" value={form.semester} onChange={handleChange}>
                      <option value="">Select Semester</option>
                      {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                    <select name="gender" value={form.gender} onChange={handleChange}>
                      <option value="">Gender</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                    <input name="dob" type="date" value={form.dob} onChange={handleChange} />
                  </div>
                  <div className="form-section-label" style={{marginTop:"1rem"}}>Academic Info</div>
                  <div className="form-grid">
                    <input name="cgpa"       type="number" placeholder="CGPA (0–10)"    value={form.cgpa}       onChange={handleChange} min="0" max="10"  step="0.01" />
                    <input name="attendance" type="number" placeholder="Attendance %"    value={form.attendance} onChange={handleChange} min="0" max="100" />
                    <select name="status" value={form.status} onChange={handleChange}>
                      <option>Active</option><option>Inactive</option><option>Alumni</option>
                    </select>
                  </div>
                  <div className="btn-row" style={{marginTop:"1.25rem"}}>
                    <button type="submit" className="btn-primary">{editId ? "Update Student" : "Add Student"}</button>
                    <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div className="result-meta">
              {loading ? "Loading…" : `${students.length} student${students.length !== 1 ? "s" : ""} found`}
            </div>

            {/* TABLE VIEW */}
            {viewMode === "table" && (
              <div className="card">
                {loading
                  ? <div className="empty-state">⏳ Loading…</div>
                  : students.length === 0
                    ? <div className="empty-state">😕 No students found. {(filterBranch||filterSemester||filterStatus||search) && <button className="link-btn" onClick={clearFilters}>Clear filters?</button>}</div>
                    : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th className="sortable" onClick={() => handleSort("name")}>Name <SortIcon field="name"/></th>
                          <th>Email</th>
                          <th className="sortable" onClick={() => handleSort("branch")}>Branch <SortIcon field="branch"/></th>
                          <th>Sem</th>
                          <th>Avg Marks</th>
                          <th>Grade</th>
                          <th>Attendance</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s, i) => {
                          const avg   = s.averageMarks ?? (s.subjectMarks?.length ? Math.round(s.subjectMarks.reduce((a,b)=>a+b.marks,0)/s.subjectMarks.length) : null);
                          const grade = getGrade(avg);
                          return (
                            <tr key={s._id} className="clickable-row" onClick={() => setSelectedStudent(s)}>
                              <td>{i + 1}</td>
                              <td>
                                <div className="name-cell">
                                  <div className="avatar-sm" style={{background:getAvatarColor(s.name)}}>{getInitials(s.name)}</div>
                                  <div>
                                    <div className="student-name">{s.name}</div>
                                    {s.rollNumber && <div className="roll-num">{s.rollNumber}</div>}
                                  </div>
                                </div>
                              </td>
                              <td className="email-cell">{s.email}</td>
                              <td><span className="badge">{s.branch}</span></td>
                              <td>{s.semester ? `S${s.semester}` : "—"}</td>
                              <td>
                                {avg != null ? (
                                  <div className="marks-bar-wrap">
                                    <span className="marks-num">{avg}</span>
                                    <div className="mini-bar"><div className="mini-bar-fill" style={{width:`${avg}%`,background:gradeColor(grade)}}></div></div>
                                  </div>
                                ) : "—"}
                              </td>
                              <td><span className="grade-badge" style={{background:gradeColor(grade)+"22",color:gradeColor(grade)}}>{grade}</span></td>
                              <td>
                                {s.attendance != null
                                  ? <span className={s.attendance >= 75 ? "att-good" : "att-bad"}>{s.attendance}%</span>
                                  : "—"}
                              </td>
                              <td><span className={`status-dot status-${s.status?.toLowerCase()}`}>{s.status}</span></td>
                              <td onClick={e => e.stopPropagation()}>
                                <div className="action-btns">
                                  <button className="btn-marks" onClick={() => setMarksModal(s)} title="Add Marks">📝</button>
                                  <button className="btn-edit"  onClick={() => handleEdit(s)}>Edit</button>
                                  <button className="btn-del"   onClick={() => handleDelete(s._id)}>Del</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* CARDS VIEW */}
            {viewMode === "cards" && (
              <div className="cards-grid">
                {loading
                  ? <div className="empty-state">⏳ Loading…</div>
                  : students.length === 0
                    ? <div className="empty-state">😕 No students found.</div>
                    : students.map(s => {
                        const avg   = s.averageMarks ?? (s.subjectMarks?.length ? Math.round(s.subjectMarks.reduce((a,b)=>a+b.marks,0)/s.subjectMarks.length) : null);
                        const grade = getGrade(avg);
                        return (
                          <div key={s._id} className="student-card" onClick={() => setSelectedStudent(s)}>
                            <div className="card-header-strip" style={{background:getAvatarColor(s.name)}}></div>
                            <div className="card-avatar" style={{background:getAvatarColor(s.name)}}>{getInitials(s.name)}</div>
                            <div className="card-name">{s.name}</div>
                            <div className="card-meta">{s.rollNumber || s.email}</div>
                            <div className="card-tags">
                              <span className="badge">{s.branch}</span>
                              {s.semester && <span className="badge badge-sem">S{s.semester}</span>}
                              <span className={`status-dot status-${s.status?.toLowerCase()}`}>{s.status}</span>
                            </div>
                            {avg != null && (
                              <div className="card-grade">
                                <span className="grade-badge" style={{background:gradeColor(grade)+"22",color:gradeColor(grade),fontSize:"1rem",padding:"4px 12px"}}>{grade}</span>
                                <span className="card-avg">{avg}/100</span>
                              </div>
                            )}
                            <div className="card-actions" onClick={e => e.stopPropagation()}>
                              <button className="btn-marks" onClick={() => setMarksModal(s)}>📝 Marks</button>
                              <button className="btn-edit"  onClick={() => handleEdit(s)}>Edit</button>
                              <button className="btn-del"   onClick={() => handleDelete(s._id)}>Del</button>
                            </div>
                          </div>
                        );
                      })}
              </div>
            )}
          </>
        )}

        {/* ═══ DASHBOARD TAB ═══ */}
        {activeTab === "dashboard" && (
          <>
            {dashLoading && allStudents.length === 0 ? (
              <div className="dash-loading">
                <div className="dash-spinner"></div>
                <p>Loading dashboard…</p>
              </div>
            ) : (
              <div>
                <div className="dash-header-row">
                  <h2 className="dash-title">📊 Dashboard Overview</h2>
                  <div className="dash-meta">
                    {allStudents.length} students total
                    <button className="btn-icon" onClick={refreshAll} style={{marginLeft:"0.5rem"}}>↻ Refresh</button>
                  </div>
                </div>

                {/* Stat Cards */}
                <div className="stats-grid">
                  {[
                    { label:"Total Students", value: stats.total,    icon:"👥", color:"#6366f1" },
                    { label:"Active",          value: stats.active,   icon:"✅", color:"#10b981" },
                    { label:"Inactive",        value: stats.inactive, icon:"⏸️", color:"#f59e0b" },
                    { label:"Alumni",          value: stats.alumni,   icon:"🎓", color:"#3b82f6" },
                  ].map(s => (
                    <div key={s.label} className="stat-card" style={{"--accent":s.color}}>
                      <div className="stat-icon">{s.icon}</div>
                      <div className="stat-value">{s.value}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Branch + Semester */}
                <div className="dash-two-col">
                  <div className="card">
                    <h3 className="card-heading">📂 Students by Branch</h3>
                    {stats.byBranch.length === 0
                      ? <p className="muted">No data yet. Add students first.</p>
                      : stats.byBranch.map(b => (
                        <div key={b._id} className="bar-row">
                          <span className="bar-label">{b._id}</span>
                          <div className="bar-track">
                            <div className="bar-fill" style={{width: stats.total ? `${(b.count/stats.total)*100}%` : "0%"}}></div>
                          </div>
                          <span className="bar-count">{b.count}</span>
                        </div>
                      ))
                    }
                  </div>
                  <div className="card">
                    <h3 className="card-heading">📅 Students by Semester</h3>
                    {stats.bySemester.length === 0
                      ? <p className="muted">No semester data yet. Set semester when adding students.</p>
                      : stats.bySemester.map(s => (
                        <div key={s._id} className="bar-row">
                          <span className="bar-label">Sem {s._id}</span>
                          <div className="bar-track">
                            <div className="bar-fill bar-fill-2" style={{width: stats.total ? `${(s.count/stats.total)*100}%` : "0%"}}></div>
                          </div>
                          <span className="bar-count">{s.count}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Grade Distribution + Attendance */}
                <div className="dash-two-col">
                  <div className="card">
                    <h3 className="card-heading">🏅 Grade Distribution</h3>
                    {stats.total === 0
                      ? <p className="muted">No students yet.</p>
                      : (
                        <div className="grade-dist">
                          {Object.entries(stats.gradeDist).filter(([,v]) => v > 0).map(([grade, count]) => (
                            <div key={grade} className="grade-dist-row">
                              <span className="grade-badge" style={{background:GRADE_COLORS[grade]+"22",color:GRADE_COLORS[grade],minWidth:36,textAlign:"center"}}>{grade}</span>
                              <div className="bar-track">
                                <div className="bar-fill" style={{width:`${(count/stats.total)*100}%`, background:GRADE_COLORS[grade]}}></div>
                              </div>
                              <span className="bar-count">{count}</span>
                            </div>
                          ))}
                          {Object.values(stats.gradeDist).every(v => v === 0 || (Object.keys(stats.gradeDist).find(k => stats.gradeDist[k] === v) === "N/A")) &&
                            <p className="muted">No marks entered yet. Add marks to students first.</p>
                          }
                        </div>
                      )
                    }
                  </div>
                  <div className="card">
                    <h3 className="card-heading">📋 Attendance Overview</h3>
                    {stats.total === 0
                      ? <p className="muted">No students yet.</p>
                      : (
                        <>
                          <div className="att-overview">
                            <div className="att-block att-block-good">
                              <div className="att-block-num">{stats.attGood}</div>
                              <div className="att-block-label">≥75% (Good)</div>
                            </div>
                            <div className="att-block att-block-low">
                              <div className="att-block-num">{stats.attLow}</div>
                              <div className="att-block-label">&lt;75% (Low)</div>
                            </div>
                            <div className="att-block att-block-none">
                              <div className="att-block-num">{stats.attNone}</div>
                              <div className="att-block-label">Not set</div>
                            </div>
                          </div>
                          {stats.total > 0 && (stats.attGood + stats.attLow) > 0 && (
                            <div style={{marginTop:"0.75rem"}}>
                              <div className="bar-label" style={{marginBottom:"0.3rem",fontSize:"0.75rem"}}>Attendance split</div>
                              <div className="att-bar">
                                <div style={{width:`${((stats.attGood)/stats.total)*100}%`, background:"#10b981"}}></div>
                                <div style={{width:`${((stats.attLow)/stats.total)*100}%`,  background:"#ef4444"}}></div>
                                <div style={{width:`${((stats.attNone)/stats.total)*100}%`, background:"#cbd5e1"}}></div>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    }
                  </div>
                </div>

                {/* Top Scorers + Recently Added */}
                <div className="dash-two-col">
                  <div className="card">
                    <h3 className="card-heading">🏆 Top Scorers</h3>
                    {stats.topScorers.length === 0
                      ? <p className="muted">No marks data yet. Add marks to see top scorers.</p>
                      : (
                        <div className="recent-list">
                          {stats.topScorers.map((s, i) => (
                            <div key={s._id} className="recent-item">
                              <div className="rank-num">#{i+1}</div>
                              <div className="avatar-sm" style={{background:getAvatarColor(s.name)}}>{getInitials(s.name)}</div>
                              <div className="recent-info">
                                <div className="recent-name">{s.name}</div>
                                <div className="recent-meta">{s.branch}{s.semester ? ` · Sem ${s.semester}` : ""}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                <span className="grade-badge" style={{background:gradeColor(getGrade(s.avg))+"22",color:gradeColor(getGrade(s.avg))}}>{getGrade(s.avg)}</span>
                                <div style={{fontSize:"0.75rem",color:"var(--text3)",marginTop:2}}>{s.avg}/100</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>
                  <div className="card">
                    <h3 className="card-heading">🕐 Recently Added</h3>
                    {stats.recent.length === 0
                      ? <p className="muted">No students added yet.</p>
                      : (
                        <div className="recent-list">
                          {stats.recent.map(s => (
                            <div key={s._id} className="recent-item">
                              <div className="avatar-sm" style={{background:getAvatarColor(s.name)}}>{getInitials(s.name)}</div>
                              <div className="recent-info">
                                <div className="recent-name">{s.name}</div>
                                <div className="recent-meta">{s.branch} · {new Date(s.createdAt).toLocaleDateString()}</div>
                              </div>
                              <span className={`status-dot status-${s.status?.toLowerCase()}`}>{s.status}</span>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>
                </div>

              </div>
            )}
          </>
        )}
      </main>

      {/* ═══ STUDENT DETAIL DRAWER ═══ */}
      {selectedStudent && (
        <div className="drawer-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            <button className="drawer-close" onClick={() => setSelectedStudent(null)}>✕</button>
            <div className="drawer-avatar" style={{background:getAvatarColor(selectedStudent.name)}}>{getInitials(selectedStudent.name)}</div>
            <h2 className="drawer-name">{selectedStudent.name}</h2>
            <p className="drawer-email">{selectedStudent.email}</p>
            <div className="drawer-tags">
              <span className="badge">{selectedStudent.branch}</span>
              {selectedStudent.semester && <span className="badge badge-sem">Sem {selectedStudent.semester}</span>}
              <span className={`status-dot status-${selectedStudent.status?.toLowerCase()}`}>{selectedStudent.status}</span>
            </div>
            <div className="drawer-info-grid">
              {selectedStudent.rollNumber && <div className="di-item"><span>Roll No</span><strong>{selectedStudent.rollNumber}</strong></div>}
              {selectedStudent.phone      && <div className="di-item"><span>Phone</span><strong>{selectedStudent.phone}</strong></div>}
              {selectedStudent.gender     && <div className="di-item"><span>Gender</span><strong>{selectedStudent.gender}</strong></div>}
              {selectedStudent.dob        && <div className="di-item"><span>DOB</span><strong>{selectedStudent.dob}</strong></div>}
              {selectedStudent.cgpa       && <div className="di-item"><span>CGPA</span><strong>{selectedStudent.cgpa}</strong></div>}
              {selectedStudent.attendance != null && <div className="di-item"><span>Attendance</span><strong className={selectedStudent.attendance>=75?"att-good":"att-bad"}>{selectedStudent.attendance}%</strong></div>}
            </div>
            {selectedStudent.subjectMarks?.length > 0 && (
              <div className="marks-section">
                <h3>📚 Subject Marks</h3>
                {selectedStudent.subjectMarks.map((sm, i) => {
                  const pct   = (sm.marks / (sm.maxMarks||100)) * 100;
                  const grade = getGrade(pct);
                  return (
                    <div key={i} className="subject-row">
                      <span className="subj-name">{sm.subject}</span>
                      <div className="subj-bar-wrap">
                        <div className="subj-bar"><div className="subj-bar-fill" style={{width:`${pct}%`,background:gradeColor(grade)}}></div></div>
                      </div>
                      <span className="subj-marks">{sm.marks}/{sm.maxMarks||100}</span>
                      <span className="grade-badge" style={{background:gradeColor(grade)+"22",color:gradeColor(grade)}}>{grade}</span>
                    </div>
                  );
                })}
                {(() => {
                  const avg = selectedStudent.averageMarks ?? (selectedStudent.subjectMarks?.length ? Math.round(selectedStudent.subjectMarks.reduce((a,b)=>a+b.marks,0)/selectedStudent.subjectMarks.length) : null);
                  return avg != null && (
                    <div className="avg-row">
                      Average: <strong>{avg}/100</strong> — Grade: <strong style={{color:gradeColor(getGrade(avg))}}>{getGrade(avg)}</strong>
                    </div>
                  );
                })()}
              </div>
            )}
            <div className="drawer-actions">
              <button className="btn-primary"   onClick={() => { setMarksModal(selectedStudent); setSelectedStudent(null); }}>📝 Add Marks</button>
              <button className="btn-secondary" onClick={() => handleEdit(selectedStudent)}>✏️ Edit</button>
              <button className="btn-danger"    onClick={() => handleDelete(selectedStudent._id)}>🗑️ Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MARKS MODAL ═══ */}
      {marksModal && (
        <div className="drawer-overlay" onClick={() => setMarksModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="drawer-close" onClick={() => setMarksModal(null)}>✕</button>
            <h2 className="modal-title">📝 Add / Update Marks</h2>
            <p className="modal-sub">for <strong>{marksModal.name}</strong> ({marksModal.branch})</p>
            <div className="marks-form">
              <label>Subject</label>
              <select value={marksForm.subject} onChange={e => setMarksForm({...marksForm, subject:e.target.value})}>
                <option value="">— Select a subject —</option>
                {marksSubjectList.map(s => <option key={s}>{s}</option>)}
                <option value="__custom__">+ Add Custom Subject</option>
              </select>
              {marksForm.subject === "__custom__" && (
                <input placeholder="Enter subject name" value={marksForm.customSubject}
                  onChange={e => setMarksForm({...marksForm, customSubject:e.target.value})}
                  style={{marginTop:"0.5rem"}} />
              )}
              <label style={{marginTop:"0.75rem"}}>Marks (0–100)</label>
              <input type="number" min="0" max="100" placeholder="Enter marks"
                value={marksForm.marks} onChange={e => setMarksForm({...marksForm, marks:e.target.value})} />
              {marksModal.subjectMarks?.length > 0 && (
                <div className="existing-marks">
                  <p className="existing-label">Existing marks</p>
                  {marksModal.subjectMarks.map((sm, i) => (
                    <div key={i} className="existing-row">
                      <span>{sm.subject}</span>
                      <strong>{sm.marks}/{sm.maxMarks||100}</strong>
                      <span className="grade-badge" style={{background:gradeColor(getGrade(sm.marks))+"22",color:gradeColor(getGrade(sm.marks))}}>{getGrade(sm.marks)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="btn-row" style={{marginTop:"1.25rem"}}>
                <button className="btn-primary"   onClick={handleAddMarks}>Save Marks</button>
                <button className="btn-secondary" onClick={() => setMarksModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
