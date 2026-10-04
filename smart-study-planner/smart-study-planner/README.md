# Smart Study Planner

A clean, modern, beginner-friendly web application designed to help students organize academic subjects, set exam deadlines, track topic difficulty, and automatically generate balanced daily study schedules.

---

## Project Description

Students frequently struggle with balancing multiple courses, prioritizing difficult topics, and allocating appropriate revision time prior to exams. **Smart Study Planner** provides a structured, stress-free system to:
1. Catalog subjects and upcoming exam target dates.
2. Break down each subject into bite-sized topics with custom difficulty ratings (Easy, Medium, Hard).
3. Specify daily study capacity (e.g., 3 hours/day).
4. Run a transparent, **rule-based algorithm** that distributes pending topics across calendar days, scheduling complex topics earlier while strictly respecting upcoming exam deadlines.
5. Track real-time mastery with interactive checklists and dashboard metrics.

---

## Features

- **Dynamic Student Dashboard**:
  - High-level metric cards: Total Subjects, Total Topics, Completed Topics, and Overall Completion %.
  - **Today's Study Tasks**: Immediate checklist of assignments scheduled for the current day.
  - **Upcoming Exams**: Countdown tracker showing days remaining until each subject's exam date.
  - **Subject-Wise Progress**: Visual progress bars measuring curriculum completion per course.

- **Subject Management**:
  - Full CRUD (Create, Read, Update, Delete) with automatic cascading deletion of associated topics and schedules.
  - Exam date target setting with countdown badges.

- **Topic Management**:
  - Assign difficulty levels:
    - **Easy**: Priority Weight 1
    - **Medium**: Priority Weight 2
    - **Hard**: Priority Weight 3 (Scheduled with highest priority)
  - Estimated study hours per topic.
  - Instant one-click completion toggle.

- **Automated Rule-Based Study Plan Generator**:
  - Solves the scheduling problem without expensive or opaque AI APIs.
  - Prioritizes higher-difficulty topics first to conquer difficult concepts early.
  - Urgency weighting factors in days remaining until the subject's exam date.
  - Capped strictly at your available daily study hours.
  - Emits friendly warnings if topics cannot realistically fit prior to the exam date.

- **Day-by-Day Timeline View**:
  - Organizes study sessions grouped by day of the week and date.
  - Track session completion and total planned hours per day.

- **One-Click Sample Data**:
  - Instant pre-population of realistic Computer Science coursework (Data Structures, Database Management, Computer Networks) with topics and an initial schedule.

---

## Technology Stack

- **Backend**:
  - **Python 3.12+**
  - **Flask**: Micro web framework with Application Factory pattern
  - **Flask-SQLAlchemy**: Object-Relational Mapping (ORM)
  - **SQLite**: Self-contained, zero-configuration relational database
  - **Gunicorn**: Production WSGI server (optional/containerized)
- **Frontend**:
  - **HTML5 & CSS3**
  - **Bootstrap 5.3**: Responsive grid, clean cards, and layout
  - **Bootstrap Icons**: Lightweight SVG icons
  - **Vanilla JavaScript**: Asynchronous interactions and alert handling
- **DevOps & Containerization**:
  - **Docker**: Container runtime
  - **Docker Compose**: Orchestration and persistent volume management
- **Version Control**:
  - **Git & GitHub**

---

## Project Structure

```text
smart-study-planner/
│
├── app/
│   ├── __init__.py           # Flask application factory & database init
│   ├── models.py             # SQLAlchemy models: Subject, Topic, StudyPlan
│   ├── routes.py             # Route handlers & view logic
│   ├── planner.py            # Rule-based study plan scheduling algorithm
│   │
│   ├── templates/            # Jinja2 HTML templates
│   │   ├── base.html         # Base template with navigation, alerts & footer
│   │   ├── dashboard.html    # Main dashboard with statistics & today's tasks
│   │   ├── subjects.html     # Course listing & progress overview
│   │   ├── add_subject.html  # Subject creation form
│   │   ├── edit_subject.html # Subject edit form
│   │   ├── topics.html       # Topics list under a subject
│   │   ├── add_topic.html    # Topic creation form
│   │   ├── edit_topic.html   # Topic edit form
│   │   ├── study_plan.html   # Day-by-day scheduled study timeline
│   │   └── generate_plan.html# Plan generation input form & algorithm guide
│   │
│   └── static/
│       ├── css/
│       │   └── style.css     # Custom styles complementing Bootstrap
│       └── js/
│           └── script.js     # Client-side feedback & auto-dismiss alerts
│
├── instance/
│   └── study_planner.db      # Local SQLite database (created on first run)
│
├── run.py                    # Server startup script (0.0.0.0:5000)
├── requirements.txt          # Python project dependencies
├── Dockerfile                # Multi-stage container definition
├── docker-compose.yml        # Docker Compose configuration with volume mount
├── .dockerignore             # Docker build exclusion rules
├── .gitignore                # Git repository exclusion rules
└── README.md                 # Complete documentation
```

---

## How to Run Without Docker

### Prerequisites
- Python 3.10, 3.11, or 3.12 installed on your machine.
- `pip` package manager.

### Windows (Command Prompt / PowerShell)
```cmd
# 1. Navigate to project root
cd smart-study-planner

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# In Command Prompt:
venv\Scripts\activate.bat
# OR in PowerShell:
venv\Scripts\Activate.ps1

# 4. Install dependencies
pip install -r requirements.txt

# 5. Run the application
python run.py
```

### macOS / Linux (Terminal)
```bash
# 1. Navigate to project root
cd smart-study-planner

# 2. Create virtual environment
python3 -m venv venv

# 3. Activate virtual environment
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Run the application
python run.py
```

---

## How to Run With Docker

Ensure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is running.

```bash
# Build the Docker image
docker build -t smart-study-planner .

# Run container mapping port 5000
docker run -p 5000:5000 --name study_planner_app smart-study-planner
```

To run with data persistence mounted to your host machine:
```bash
docker run -p 5000:5000 -v $(pwd)/instance:/app/instance smart-study-planner
```

---

## Docker Compose (Recommended)

Docker Compose automatically builds the image and preserves your SQLite database in the `./instance` volume folder:

```bash
# Start container in foreground
docker compose up --build

# Or start in detached mode (background)
docker compose up -d --build

# To stop:
docker compose down
```

---

## Open Application

Open your browser and visit:
```text
http://localhost:5000
```

---

## GitHub Upload Guide

To upload this project to your GitHub account:

```bash
# 1. Initialize git in your local project folder
git init

# 2. Stage all project files (.gitignore ensures .venv and local DBs are omitted)
git add .

# 3. Create your initial commit
git commit -m "Initial commit: Smart Study Planner with Docker and rule-based scheduling"

# 4. Rename default branch to main
git branch -M main

# 5. Connect to your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/smart-study-planner.git

# 6. Push to GitHub
git push -u origin main
```

---

## Rule-Based Scheduling Algorithm

The scheduling engine (`app/planner.py`) operates deterministically without external API dependencies:

1. **Filtering**: Fetches all topics where `completed == False`.
2. **Priority Scoring**:
   $$\text{Priority Score} = (\text{Difficulty Weight} \times 10) + \text{Exam Urgency}$$
   - **Difficulty Weight**: `Easy = 1`, `Medium = 2`, `Hard = 3`.
   - **Exam Urgency**: Scaled from 0 to 40 based on days remaining until the subject's exam:
     $$\text{Urgency} = \max(0, 30 - \min(\text{Days Left}, 30))$$
3. **Sorting**: Sorts all pending topics in descending order of priority score.
4. **Day-by-Day Allocation**:
   - Commences on the chosen `start_date`.
   - Allots topics up to the user's specified `daily_hours` limit.
   - When a day's capacity is reached, advances to the subsequent calendar day.
   - If a topic is scheduled on or after its subject's exam date, a clear warning is generated for the student.

---

## License

This project is open-source under the MIT License. Feel free to modify and share!
