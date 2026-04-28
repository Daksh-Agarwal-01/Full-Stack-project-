// server.js — Enhanced Express + MongoDB Atlas Backend
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

const subjectMarksSchema = new mongoose.Schema({
  subject:  { type: String, required: true },
  marks:    { type: Number, required: true, min: 0, max: 100 },
  maxMarks: { type: Number, default: 100 },
});

const studentSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, trim: true, lowercase: true },
    rollNumber:   { type: String, required: true, trim: true, unique: true, index: true },
    branch:       { type: String, required: true },
    semester:     { type: Number, min: 1, max: 8 },
    subjectMarks: { type: [subjectMarksSchema], default: [] },
    phone:        { type: String, trim: true },
    gender:       { type: String, enum: ["Male", "Female", "Other", ""] },
    dob:          { type: String },
    cgpa:         { type: Number, min: 0, max: 10 },
    attendance:   { type: Number, min: 0, max: 100 },
    status:       { type: String, enum: ["Active", "Inactive", "Alumni"], default: "Active" },
  },
  { timestamps: true }
);

studentSchema.virtual("averageMarks").get(function () {
  if (!this.subjectMarks.length) return null;
  return Math.round(this.subjectMarks.reduce((a, s) => a + s.marks, 0) / this.subjectMarks.length);
});

studentSchema.virtual("grade").get(function () {
  const avg = this.averageMarks;
  if (avg === null) return "N/A";
  if (avg >= 90) return "A+";
  if (avg >= 80) return "A";
  if (avg >= 70) return "B+";
  if (avg >= 60) return "B";
  if (avg >= 50) return "C";
  if (avg >= 40) return "D";
  return "F";
});

studentSchema.set("toJSON", { virtuals: true });
studentSchema.set("toObject", { virtuals: true });

const Student = mongoose.model("Student", studentSchema);

const handleValidationOrDuplicateError = (err, res) => {
  if (err.code === 11000 && err.keyValue && err.keyValue.rollNumber) {
    return res.status(409).json({ error: "Roll number already exists" });
  }
  return res.status(400).json({ error: err.message });
};

// GET /api/students
app.get("/api/students", async (req, res) => {
  try {
    const { search, branch, semester, status, sort = "createdAt", order = "desc" } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { rollNumber: { $regex: search, $options: "i" } },
      ];
    }
    if (branch)   filter.branch   = branch;
    if (semester) filter.semester = Number(semester);
    if (status)   filter.status   = status;
    const sortDir = order === "asc" ? 1 : -1;
    const students = await Student.find(filter).sort({ [sort]: sortDir });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/students/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/students", async (req, res) => {
  try {
    const student = new Student(req.body);
    const saved = await student.save();
    res.status(201).json(saved);
  } catch (err) {
    handleValidationOrDuplicateError(err, res);
  }
});

app.put("/api/students/:id", async (req, res) => {
  try {
    const updated = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: "Student not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/students/:id/marks", async (req, res) => {
  try {
    const { subject, marks, maxMarks } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });
    const existing = student.subjectMarks.find((s) => s.subject === subject);
    if (existing) {
      existing.marks = marks;
      if (maxMarks !== undefined) existing.maxMarks = maxMarks;
    } else {
      student.subjectMarks.push({ subject, marks, maxMarks: maxMarks || 100 });
    }
    await student.save();
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/students/:id", async (req, res) => {
  try {
    const deleted = await Student.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Student deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const total    = await Student.countDocuments();
    const active   = await Student.countDocuments({ status: "Active" });
    const inactive = await Student.countDocuments({ status: "Inactive" });
    const alumni   = await Student.countDocuments({ status: "Alumni" });
    const byBranch   = await Student.aggregate([{ $group: { _id: "$branch", count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
    const bySemester = await Student.aggregate([{ $match: { semester: { $exists: true, $ne: null } } }, { $group: { _id: "$semester", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
    const recent = await Student.find().sort({ createdAt: -1 }).limit(5).select("name branch createdAt status");
    res.json({ total, active, inactive, alumni, byBranch, bySemester, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/export/csv", async (req, res) => {
  try {
    const students = await Student.find().lean();
    const headers = ["Name","Email","Roll Number","Branch","Semester","Phone","Gender","Status","CGPA","Attendance","Avg Marks","Grade"];
    const getGrade = (avg) => {
      if (!avg && avg !== 0) return "";
      if (avg >= 90) return "A+"; if (avg >= 80) return "A"; if (avg >= 70) return "B+";
      if (avg >= 60) return "B"; if (avg >= 50) return "C"; if (avg >= 40) return "D"; return "F";
    };
    const rows = students.map((s) => {
      const avg = s.subjectMarks && s.subjectMarks.length
        ? Math.round(s.subjectMarks.reduce((a, b) => a + b.marks, 0) / s.subjectMarks.length) : "";
      return [s.name, s.email, s.rollNumber||"", s.branch, s.semester||"", s.phone||"", s.gender||"", s.status, s.cgpa||"", s.attendance||"", avg, getGrade(avg)]
        .map((v) => `"${String(v).replace(/"/g,'""')}"`)
        .join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=students.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
