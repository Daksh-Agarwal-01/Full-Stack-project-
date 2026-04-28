# 🎓 EduTrack — Student Management System (Enhanced)

Full Stack MERN app: React + Express + MongoDB Atlas

## ✨ New Features Added

### 🔍 Search Bar
- Real-time search by name, email, or roll number
- Instant filtering with clear button

### 📝 Subject-wise Marks
- Subject dropdown auto-populated based on branch (CSE, ECE, ME, etc.)
- Add custom subjects beyond the preset list
- Visual mini progress bars per subject in detail drawer
- Overall average marks + letter grade (A+, A, B+, B, C, D, F)

### 📊 Dashboard
- Total / Active / Inactive / Alumni stats cards
- Students by Branch (horizontal bar chart)
- Students by Semester breakdown
- Recently added students list

### 🧑‍🎓 Richer Student Profile
- Roll Number, Phone, Gender, Date of Birth
- CGPA, Attendance %, Status (Active / Inactive / Alumni)
- Avatar with initials + color coding

### 🃏 Dual View Mode
- Table view (sortable columns)
- Cards grid view

### 🌙 Dark Mode
- One-click toggle in header

### ⬇️ CSV Export
- Download all students as a CSV file

### 🔎 Filters
- Filter by Branch, Semester, Status
- Combined with search

### 📋 Student Detail Drawer
- Slide-out panel with full profile + subject marks visualization

## 🚀 Running the App

### Backend
```bash
cd backend
npm install
# Edit .env: MONGO_URI=your_mongodb_atlas_uri
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## 🌐 New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/students?search=&branch=&semester=&status= | Search & filter |
| GET | /api/students/:id | Single student |
| POST | /api/students | Add student |
| PUT | /api/students/:id | Update student |
| PATCH | /api/students/:id/marks | Add/update marks for a subject |
| DELETE | /api/students/:id | Delete student |
| GET | /api/stats | Dashboard statistics |
| GET | /api/export/csv | Export all data as CSV |
