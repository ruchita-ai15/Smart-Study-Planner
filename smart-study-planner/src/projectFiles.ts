/**
 * Full file contents for Smart Study Planner project exporter & code viewer.
 * Contains all 23 required files.
 */

export interface ProjectFile {
  path: string;
  category: 'backend' | 'models' | 'templates' | 'static' | 'docker' | 'config' | 'docs';
  language: string;
  content: string;
  description: string;
}

export const PROJECT_FILES: ProjectFile[] = [
  {
    path: 'app/__init__.py',
    category: 'backend',
    language: 'python',
    description: 'Flask Application Factory and SQLite Database initialization',
    content: `"""
Smart Study Planner - Application Factory
Initializes Flask app, database extension, and registers blueprints.
"""
import os
from flask import Flask
from app.models import db


def create_app(test_config=None):
    """
    Application factory pattern for Flask.
    Creates and configures the Flask application.
    """
    app = Flask(__name__, instance_relative_config=True)

    # Ensure the instance folder exists for SQLite database storage
    os.makedirs(app.instance_path, exist_ok=True)

    # Default configuration
    default_db_path = os.path.join(app.instance_path, 'study_planner.db')
    app.config.from_mapping(
        SECRET_KEY=os.environ.get('SECRET_KEY', 'smart-study-planner-secret-key-2026'),
        SQLALCHEMY_DATABASE_URI=os.environ.get('DATABASE_URL', f'sqlite:///{default_db_path}'),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    if test_config:
        app.config.from_mapping(test_config)

    # Initialize SQLAlchemy with app
    db.init_app(app)

    # Register routes blueprint
    from app.routes import main_bp
    app.register_blueprint(main_bp)

    # Create database tables automatically if they do not exist
    with app.app_context():
        db.create_all()

    return app
`
  },
  {
    path: 'app/models.py',
    category: 'models',
    language: 'python',
    description: 'SQLAlchemy models: Subject, Topic, and StudyPlan with relationships',
    content: `"""
Database models for Smart Study Planner using Flask-SQLAlchemy.
Defines Subject, Topic, and StudyPlan entities with relationships and helper methods.
"""
from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Subject(db.Model):
    """
    Represents an academic course or subject.
    Contains exam date, description, and related topics.
    """
    __tablename__ = 'subjects'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    exam_date = db.Column(db.Date, nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationship to Topics (cascades on delete so orphan topics are removed)
    topics = db.relationship('Topic', backref='subject', lazy=True, cascade='all, delete-orphan')

    @property
    def total_topics(self):
        """Returns the total number of topics for this subject."""
        return len(self.topics)

    @property
    def completed_topics(self):
        """Returns the count of completed topics."""
        return sum(1 for topic in self.topics if topic.completed)

    @property
    def pending_topics(self):
        """Returns the count of pending (uncompleted) topics."""
        return sum(1 for topic in self.topics if not topic.completed)

    @property
    def progress_percent(self):
        """Calculates completion percentage (0 - 100)."""
        if not self.topics:
            return 0
        return int(round((self.completed_topics / len(self.topics)) * 100))

    @property
    def days_until_exam(self):
        """Calculates days remaining until the exam date."""
        today = date.today()
        return (self.exam_date - today).days

    def __repr__(self):
        return f'<Subject {self.name}>'


class Topic(db.Model):
    """
    Represents an individual topic or chapter under a Subject.
    Tracks difficulty, estimated study hours, and completion status.
    """
    __tablename__ = 'topics'

    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False, default='Medium')  # Easy, Medium, Hard
    estimated_hours = db.Column(db.Float, nullable=False, default=1.0)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationship to StudyPlan entries
    study_plans = db.relationship('StudyPlan', backref='topic', lazy=True, cascade='all, delete-orphan')

    @property
    def difficulty_weight(self):
        """
        Translates difficulty to a numerical priority weight.
        Easy = 1, Medium = 2, Hard = 3.
        """
        weights = {'Easy': 1, 'Medium': 2, 'Hard': 3}
        return weights.get(self.difficulty, 2)

    def __repr__(self):
        return f'<Topic {self.name} ({self.difficulty})>'


class StudyPlan(db.Model):
    """
    Represents an assigned study session for a topic on a specific calendar date.
    Generated by the scheduling algorithm.
    """
    __tablename__ = 'study_plans'

    id = db.Column(db.Integer, primary_key=True)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False)
    study_date = db.Column(db.Date, nullable=False)
    planned_hours = db.Column(db.Float, nullable=False, default=1.0)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f'<StudyPlan Topic:{self.topic_id} Date:{self.study_date} Hours:{self.planned_hours}>'
`
  },
  {
    path: 'app/planner.py',
    category: 'backend',
    language: 'python',
    description: 'Rule-based scheduling algorithm with difficulty & exam urgency heuristic',
    content: `"""
Rule-Based Study Plan Generation Algorithm.

This module schedules pending topics across available calendar days using
a priority-scoring heuristic based on:
1. Topic Difficulty (Hard > Medium > Easy)
2. Exam Urgency (Closer exam dates receive higher priority)
3. Available Study Hours per day
4. Target Exam Dates (flags warnings if topics cannot fit before exam)
"""
from datetime import date, timedelta
from app.models import db, Topic, StudyPlan


def calculate_topic_priority(topic, start_date):
    """
    Computes a numerical priority score for a topic.
    Higher score = scheduled sooner.

    Formula:
        priority_score = (difficulty_weight * 10) + exam_urgency

    Where:
        - difficulty_weight: Easy = 1, Medium = 2, Hard = 3
        - exam_urgency:
            days_left = (exam_date - start_date).days
            urgency = max(0, 30 - days_left)
            (If exam is within 5 days, urgency is 25+; if 30+ days, urgency is 0)
    """
    difficulty_weight = topic.difficulty_weight  # 1, 2, or 3
    exam_date = topic.subject.exam_date
    days_left = (exam_date - start_date).days

    if days_left <= 0:
        # Exam is today or overdue: maximum urgency
        exam_urgency = 40
    else:
        # Scale urgency inversely with days remaining (capped at 30 days window)
        exam_urgency = max(0, 30 - min(days_left, 30))

    # Higher difficulty gives major boost; earlier exam gives urgent boost
    total_priority = (difficulty_weight * 10) + exam_urgency
    return total_priority, days_left


def generate_study_plan(daily_hours=3.0, start_date=None):
    """
    Generates a personalized day-by-day study schedule.

    Parameters:
        daily_hours (float): Maximum study hours available per day (e.g. 3.0)
        start_date (date): Calendar start date (defaults to today)

    Returns:
        tuple: (created_plans_count, warnings_list)
    """
    if start_date is None:
        start_date = date.today()

    # Rule 6: Fetch only pending topics (completed == False)
    pending_topics = Topic.query.filter_by(completed=False).all()
    if not pending_topics:
        return 0, ["No pending topics found to schedule. Add some topics or unmark completed ones!"]

    # Calculate priority score for each pending topic
    topics_with_priority = []
    for topic in pending_topics:
        score, days_left = calculate_topic_priority(topic, start_date)
        topics_with_priority.append({
            'topic': topic,
            'score': score,
            'days_left': days_left,
            'remaining_hours': float(topic.estimated_hours),
            'exam_date': topic.subject.exam_date,
        })

    # Rule 1 & 2: Sort topics descending by priority score
    # Primary key: priority score (descending)
    # Secondary key: exam date (ascending / earlier first)
    topics_with_priority.sort(
        key=lambda item: (-item['score'], item['exam_date'])
    )

    # Delete existing uncompleted study plan entries to generate a clean new schedule
    StudyPlan.query.filter_by(completed=False).delete()

    created_plans = []
    warnings = []
    current_date = start_date
    current_day_used_hours = 0.0

    # Schedule topics across days
    for item in topics_with_priority:
        topic = item['topic']
        hours_needed = item['remaining_hours']
        exam_date = item['exam_date']

        # Rule 7: Check if scheduling starts after or on exam date
        if current_date > exam_date:
            warnings.append(
                f"Warning: Topic '{topic.name}' ({topic.subject.name}) is scheduled for {current_date.strftime('%b %d')}, "
                f"which is after its exam date ({exam_date.strftime('%b %d')}). Increase your daily hours!"
            )

        # Allocate hours into calendar days
        while hours_needed > 0.001:
            remaining_today = daily_hours - current_day_used_hours

            # If today has no room left, advance to tomorrow
            if remaining_today <= 0.001:
                current_date += timedelta(days=1)
                current_day_used_hours = 0.0
                remaining_today = daily_hours

                # Check if newly advanced day is past exam date
                if current_date > exam_date:
                    msg = (
                        f"Warning: Topic '{topic.name}' ({topic.subject.name}) extends to {current_date.strftime('%b %d')}, "
                        f"after its exam date ({exam_date.strftime('%b %d')})."
                    )
                    if msg not in warnings:
                        warnings.append(msg)

            # Determine how many hours to assign on current_date
            alloc_hours = min(hours_needed, remaining_today)
            alloc_hours = round(alloc_hours, 1)

            # Rule 9: Avoid duplicate scheduling of the same topic on the same date
            existing_entry = next(
                (p for p in created_plans if p.topic_id == topic.id and p.study_date == current_date),
                None
            )

            if existing_entry:
                existing_entry.planned_hours += alloc_hours
            else:
                plan_entry = StudyPlan(
                    topic_id=topic.id,
                    study_date=current_date,
                    planned_hours=alloc_hours,
                    completed=False
                )
                created_plans.append(plan_entry)
                db.session.add(plan_entry)

            hours_needed -= alloc_hours
            current_day_used_hours += alloc_hours

    # Commit all generated plan records to database
    db.session.commit()

    return len(created_plans), warnings
`
  },
  {
    path: 'app/routes.py',
    category: 'backend',
    language: 'python',
    description: 'Flask routes: Dashboard, Subjects CRUD, Topics CRUD, Plan scheduling, Sample seeder',
    content: `"""
Flask Routes for Smart Study Planner.
Handles dashboard metrics, subject CRUD, topic CRUD, study plan generation,
and task completion toggles.
"""
from datetime import datetime, date, timedelta
from collections import defaultdict
from flask import Blueprint, render_template, request, redirect, url_for, flash
from app.models import db, Subject, Topic, StudyPlan
from app.planner import generate_study_plan

main_bp = Blueprint('main', __name__)


# ==========================================
# DASHBOARD
# ==========================================
@main_bp.route('/')
def dashboard():
    """
    Renders main dashboard with dynamic statistics:
    - Total subjects, topics, completed, pending, progress %
    - Today's assigned study tasks
    - Upcoming exams sorted chronologically
    - Subject-wise progress summary
    """
    today = date.today()
    subjects = Subject.query.order_by(Subject.exam_date.asc()).all()
    all_topics = Topic.query.all()

    total_subjects = len(subjects)
    total_topics = len(all_topics)
    completed_topics = sum(1 for t in all_topics if t.completed)
    pending_topics = total_topics - completed_topics

    overall_progress = int(round((completed_topics / total_topics * 100))) if total_topics > 0 else 0

    # Today's study plan tasks
    today_tasks = (
        StudyPlan.query
        .join(Topic)
        .join(Subject)
        .filter(StudyPlan.study_date == today)
        .order_by(StudyPlan.completed.asc(), Topic.difficulty.desc())
        .all()
    )

    # Upcoming exams (today or future)
    upcoming_exams = [s for s in subjects if s.exam_date >= today]

    return render_template(
        'dashboard.html',
        total_subjects=total_subjects,
        total_topics=total_topics,
        completed_topics=completed_topics,
        pending_topics=pending_topics,
        overall_progress=overall_progress,
        today_tasks=today_tasks,
        upcoming_exams=upcoming_exams,
        subjects=subjects,
        today=today
    )


# ==========================================
# SUBJECTS
# ==========================================
@main_bp.route('/subjects')
def subjects_list():
    """Displays all subjects with their topic counts and progress."""
    subjects = Subject.query.order_by(Subject.exam_date.asc()).all()
    return render_template('subjects.html', subjects=subjects, today=date.today())


@main_bp.route('/subjects/add', methods=['GET', 'POST'])
def add_subject():
    """Handles adding a new subject with validation."""
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        exam_date_str = request.form.get('exam_date', '').strip()
        description = request.form.get('description', '').strip()

        # Validation
        if not name:
            flash('Subject name cannot be empty.', 'danger')
            return render_template('add_subject.html', name=name, exam_date=exam_date_str, description=description)

        if not exam_date_str:
            flash('Exam date is required.', 'danger')
            return render_template('add_subject.html', name=name, exam_date=exam_date_str, description=description)

        try:
            exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d').date()
        except ValueError:
            flash('Invalid date format. Please use YYYY-MM-DD.', 'danger')
            return render_template('add_subject.html', name=name, exam_date=exam_date_str, description=description)

        # Create new subject
        new_subject = Subject(
            name=name,
            exam_date=exam_date,
            description=description or None
        )
        db.session.add(new_subject)
        db.session.commit()

        flash(f"Subject '{name}' added successfully!", 'success')
        return redirect(url_for('main.subjects_list'))

    default_date = (date.today() + timedelta(days=30)).strftime('%Y-%m-%d')
    return render_template('add_subject.html', default_date=default_date)


@main_bp.route('/subjects/<int:subject_id>/edit', methods=['GET', 'POST'])
def edit_subject(subject_id):
    """Edits an existing subject."""
    subject = Subject.query.get_or_404(subject_id)

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        exam_date_str = request.form.get('exam_date', '').strip()
        description = request.form.get('description', '').strip()

        if not name:
            flash('Subject name cannot be empty.', 'danger')
            return render_template('edit_subject.html', subject=subject)

        if not exam_date_str:
            flash('Exam date is required.', 'danger')
            return render_template('edit_subject.html', subject=subject)

        try:
            exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d').date()
        except ValueError:
            flash('Invalid date format.', 'danger')
            return render_template('edit_subject.html', subject=subject)

        subject.name = name
        subject.exam_date = exam_date
        subject.description = description or None
        db.session.commit()

        flash(f"Subject '{subject.name}' updated successfully!", 'success')
        return redirect(url_for('main.subjects_list'))

    return render_template('edit_subject.html', subject=subject)


@main_bp.route('/subjects/<int:subject_id>/delete', methods=['POST'])
def delete_subject(subject_id):
    """Deletes a subject and its associated topics & plan entries."""
    subject = Subject.query.get_or_404(subject_id)
    subject_name = subject.name
    db.session.delete(subject)
    db.session.commit()

    flash(f"Subject '{subject_name}' deleted.", 'info')
    return redirect(url_for('main.subjects_list'))


# ==========================================
# TOPICS
# ==========================================
@main_bp.route('/subjects/<int:subject_id>/topics')
def topics_list(subject_id):
    """Displays topics under a specific subject."""
    subject = Subject.query.get_or_404(subject_id)
    return render_template('topics.html', subject=subject, topics=subject.topics)


@main_bp.route('/topics/add', methods=['GET', 'POST'])
def add_topic():
    """Adds a new topic under a chosen subject."""
    subjects = Subject.query.order_by(Subject.name.asc()).all()
    selected_subject_id = request.args.get('subject_id', type=int)

    if not subjects:
        flash('Please create at least one Subject first before adding topics.', 'warning')
        return redirect(url_for('main.add_subject'))

    if request.method == 'POST':
        subject_id = request.form.get('subject_id', type=int)
        name = request.form.get('name', '').strip()
        difficulty = request.form.get('difficulty', 'Medium')
        hours_str = request.form.get('estimated_hours', '1.0').strip()

        if not name:
            flash('Topic name cannot be empty.', 'danger')
            return render_template('add_topic.html', subjects=subjects, selected_subject_id=subject_id)

        try:
            estimated_hours = float(hours_str)
            if estimated_hours <= 0:
                raise ValueError
        except ValueError:
            flash('Estimated study hours must be a positive number greater than 0.', 'danger')
            return render_template('add_topic.html', subjects=subjects, selected_subject_id=subject_id)

        if difficulty not in ['Easy', 'Medium', 'Hard']:
            difficulty = 'Medium'

        subject = Subject.query.get(subject_id)
        if not subject:
            flash('Selected subject does not exist.', 'danger')
            return render_template('add_topic.html', subjects=subjects)

        new_topic = Topic(
            subject_id=subject_id,
            name=name,
            difficulty=difficulty,
            estimated_hours=estimated_hours,
            completed=False
        )
        db.session.add(new_topic)
        db.session.commit()

        flash(f"Topic '{name}' added to {subject.name}!", 'success')
        return redirect(url_for('main.topics_list', subject_id=subject_id))

    return render_template('add_topic.html', subjects=subjects, selected_subject_id=selected_subject_id)


@main_bp.route('/topics/<int:topic_id>/edit', methods=['GET', 'POST'])
def edit_topic(topic_id):
    """Edits an existing topic."""
    topic = Topic.query.get_or_404(topic_id)
    subjects = Subject.query.order_by(Subject.name.asc()).all()

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        subject_id = request.form.get('subject_id', type=int)
        difficulty = request.form.get('difficulty', 'Medium')
        hours_str = request.form.get('estimated_hours', '1.0').strip()
        completed = request.form.get('completed') == 'on'

        if not name:
            flash('Topic name cannot be empty.', 'danger')
            return render_template('edit_topic.html', topic=topic, subjects=subjects)

        try:
            estimated_hours = float(hours_str)
            if estimated_hours <= 0:
                raise ValueError
        except ValueError:
            flash('Estimated hours must be greater than 0.', 'danger')
            return render_template('edit_topic.html', topic=topic, subjects=subjects)

        topic.name = name
        topic.subject_id = subject_id
        topic.difficulty = difficulty
        topic.estimated_hours = estimated_hours
        topic.completed = completed
        db.session.commit()

        flash(f"Topic '{topic.name}' updated successfully!", 'success')
        return redirect(url_for('main.topics_list', subject_id=topic.subject_id))

    return render_template('edit_topic.html', topic=topic, subjects=subjects)


@main_bp.route('/topics/<int:topic_id>/delete', methods=['POST'])
def delete_topic(topic_id):
    """Deletes a topic and returns to its subject's topic list."""
    topic = Topic.query.get_or_404(topic_id)
    subject_id = topic.subject_id
    topic_name = topic.name
    db.session.delete(topic)
    db.session.commit()

    flash(f"Topic '{topic_name}' deleted.", 'info')
    return redirect(url_for('main.topics_list', subject_id=subject_id))


@main_bp.route('/topics/<int:topic_id>/toggle', methods=['POST'])
def toggle_topic(topic_id):
    """Toggles completion status for a topic."""
    topic = Topic.query.get_or_404(topic_id)
    topic.completed = not topic.completed

    if topic.completed:
        for plan in topic.study_plans:
            plan.completed = True

    db.session.commit()

    status_str = "completed" if topic.completed else "pending"
    flash(f"Marked '{topic.name}' as {status_str}.", 'success')
    return redirect(request.referrer or url_for('main.topics_list', subject_id=topic.subject_id))


# ==========================================
# STUDY PLAN
# ==========================================
@main_bp.route('/study-plan')
def study_plan():
    """
    Displays the generated study plan grouped by date.
    Shows day of week, total planned hours per day, and task checkboxes.
    """
    plans = (
        StudyPlan.query
        .join(Topic)
        .join(Subject)
        .order_by(StudyPlan.study_date.asc(), Topic.difficulty.desc())
        .all()
    )

    # Group plans by study_date
    grouped_plan = defaultdict(list)
    day_totals = defaultdict(float)

    for p in plans:
        grouped_plan[p.study_date].append(p)
        day_totals[p.study_date] += p.planned_hours

    sorted_grouped_plan = [
        {
            'date': d,
            'tasks': grouped_plan[d],
            'total_hours': round(day_totals[d], 1),
            'is_today': (d == date.today()),
            'is_past': (d < date.today())
        }
        for d in sorted(grouped_plan.keys())
    ]

    total_planned_hours = sum(p.planned_hours for p in plans)
    completed_planned_hours = sum(p.planned_hours for p in plans if p.completed)

    return render_template(
        'study_plan.html',
        grouped_plan=sorted_grouped_plan,
        total_tasks=len(plans),
        total_planned_hours=round(total_planned_hours, 1),
        completed_planned_hours=round(completed_planned_hours, 1),
        today=date.today()
    )


@main_bp.route('/study-plan/<int:plan_id>/toggle', methods=['POST'])
def toggle_plan_task(plan_id):
    """Toggles completion status for an individual study plan task."""
    plan = StudyPlan.query.get_or_404(plan_id)
    plan.completed = not plan.completed

    topic = plan.topic
    if topic and all(p.completed for p in topic.study_plans):
        topic.completed = True
    elif topic and not plan.completed:
        topic.completed = False

    db.session.commit()
    flash(f"Task '{topic.name}' updated.", 'success')
    return redirect(request.referrer or url_for('main.study_plan'))


@main_bp.route('/generate-plan', methods=['GET', 'POST'])
def generate_plan():
    """
    Renders generate plan form and executes rule-based scheduling algorithm.
    """
    if request.method == 'POST':
        hours_str = request.form.get('daily_hours', '3.0').strip()
        start_date_str = request.form.get('start_date', '').strip()

        try:
            daily_hours = float(hours_str)
            if daily_hours <= 0:
                raise ValueError
        except ValueError:
            flash('Available study hours must be a number greater than 0.', 'danger')
            return render_template('generate_plan.html', default_date=date.today().strftime('%Y-%m-%d'))

        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            except ValueError:
                flash('Invalid date format.', 'danger')
                return render_template('generate_plan.html', default_date=date.today().strftime('%Y-%m-%d'))
        else:
            start_date = date.today()

        count, warnings = generate_study_plan(daily_hours=daily_hours, start_date=start_date)

        if count == 0:
            flash(warnings[0] if warnings else 'No pending topics found to schedule.', 'warning')
            return redirect(url_for('main.subjects_list'))

        for warn in warnings:
            flash(warn, 'warning')

        flash(f"Successfully generated study plan with {count} scheduled sessions across your study days!", 'success')
        return redirect(url_for('main.study_plan'))

    return render_template('generate_plan.html', default_date=date.today().strftime('%Y-%m-%d'))


# ==========================================
# SAMPLE DATA SEEDER
# ==========================================
@main_bp.route('/load-sample-data', methods=['POST'])
def load_sample_data():
    """
    Seeds beginner-friendly sample subjects and topics:
    - Data Structures
    - Database Management
    - Computer Networks
    """
    today = date.today()

    existing_count = Subject.query.count()
    if existing_count > 0:
        flash('Data already exists in the database. You can manage existing subjects or clear them first.', 'info')
        return redirect(url_for('main.dashboard'))

    sub1 = Subject(
        name='Data Structures',
        exam_date=today + timedelta(days=20),
        description='Fundamental data organization, linear and tree hierarchies, algorithm analysis.'
    )
    db.session.add(sub1)
    db.session.flush()

    topics1 = [
        Topic(subject_id=sub1.id, name='Arrays', difficulty='Easy', estimated_hours=1.0, completed=True),
        Topic(subject_id=sub1.id, name='Linked List', difficulty='Medium', estimated_hours=2.0, completed=False),
        Topic(subject_id=sub1.id, name='Stack', difficulty='Easy', estimated_hours=1.0, completed=False),
        Topic(subject_id=sub1.id, name='Queue', difficulty='Medium', estimated_hours=1.5, completed=False),
        Topic(subject_id=sub1.id, name='Trees', difficulty='Hard', estimated_hours=3.0, completed=False),
    ]
    db.session.add_all(topics1)

    sub2 = Subject(
        name='Database Management',
        exam_date=today + timedelta(days=25),
        description='Relational model, SQL queries, normalization, ACID transactions and indexing.'
    )
    db.session.add(sub2)
    db.session.flush()

    topics2 = [
        Topic(subject_id=sub2.id, name='SQL Basics & Queries', difficulty='Easy', estimated_hours=1.5, completed=True),
        Topic(subject_id=sub2.id, name='Normalization (1NF, 2NF, 3NF, BCNF)', difficulty='Hard', estimated_hours=3.0, completed=False),
        Topic(subject_id=sub2.id, name='Transactions & ACID Properties', difficulty='Medium', estimated_hours=2.0, completed=False),
    ]
    db.session.add_all(topics2)

    sub3 = Subject(
        name='Computer Networks',
        exam_date=today + timedelta(days=32),
        description='Network layers, protocols, addressing, routing, and transport services.'
    )
    db.session.add(sub3)
    db.session.flush()

    topics3 = [
        Topic(subject_id=sub3.id, name='OSI Model & Layers', difficulty='Medium', estimated_hours=2.0, completed=False),
        Topic(subject_id=sub3.id, name='TCP/IP Protocol Suite & Handshakes', difficulty='Hard', estimated_hours=2.5, completed=False),
    ]
    db.session.add_all(topics3)

    db.session.commit()
    generate_study_plan(daily_hours=3.0, start_date=today)

    flash('Sample subjects, topics, and initial study plan loaded successfully!', 'success')
    return redirect(url_for('main.dashboard'))
`
  },
  {
    path: 'app/templates/base.html',
    category: 'templates',
    language: 'html',
    description: 'Master Jinja2 layout with Bootstrap 5 navbar, alerts container, and footer',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Smart Study Planner - Plan Smart. Study Better.{% endblock %}</title>

    <!-- Google Fonts: Plus Jakarta Sans -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">

    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    
    <!-- Custom Application CSS -->
    <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
</head>
<body class="bg-light d-flex flex-column min-vh-100">

    <!-- Top Navigation Bar -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark sticky-top shadow-sm py-2">
        <div class="container">
            <a class="navbar-brand d-flex items-center gap-2 fw-bold text-white fs-5" href="{{ url_for('main.dashboard') }}">
                <span class="brand-badge"><i class="bi bi-mortarboard-fill"></i></span>
                <span>Smart Study Planner</span>
            </a>
            
            <button class="navbar-toggler border-0 shadow-none" type="button" data-bs-toggle="collapse" data-bs-target="#navContent" aria-controls="navContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navContent">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-3 gap-lg-1">
                    <li class="nav-item">
                        <a class="nav-link px-3 {% if request.endpoint == 'main.dashboard' %}active text-white fw-semibold{% endif %}" href="{{ url_for('main.dashboard') }}">
                            <i class="bi bi-grid-1x2 me-1"></i> Dashboard
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link px-3 {% if 'subjects' in request.endpoint or 'topic' in request.endpoint %}active text-white fw-semibold{% endif %}" href="{{ url_for('main.subjects_list') }}">
                            <i class="bi bi-journal-bookmark me-1"></i> Subjects
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link px-3 {% if request.endpoint == 'main.study_plan' %}active text-white fw-semibold{% endif %}" href="{{ url_for('main.study_plan') }}">
                            <i class="bi bi-calendar2-check me-1"></i> Study Plan
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link px-3 {% if request.endpoint == 'main.generate_plan' %}active text-white fw-semibold{% endif %}" href="{{ url_for('main.generate_plan') }}">
                            <i class="bi bi-lightning-charge me-1"></i> Generate Plan
                        </a>
                    </li>
                </ul>

                <div class="d-flex align-items-center gap-2">
                    <form action="{{ url_for('main.load_sample_data') }}" method="POST" class="d-inline">
                        <button type="submit" class="btn btn-outline-light btn-sm text-nowrap rounded-3" title="Load sample subjects & topics">
                            <i class="bi bi-stars me-1 text-warning"></i> Load Sample Data
                        </button>
                    </form>
                    <a href="{{ url_for('main.add_subject') }}" class="btn btn-primary btn-sm text-nowrap rounded-3 fw-medium">
                        <i class="bi bi-plus-circle me-1"></i> Add Subject
                    </a>
                </div>
            </div>
        </div>
    </nav>

    <!-- Flash Messages Container -->
    <div class="container my-3">
        {% with messages = get_flashed_messages(with_categories=true) %}
            {% if messages %}
                {% for category, message in messages %}
                    <div class="alert alert-{{ category if category != 'error' else 'danger' }} alert-dismissible fade show shadow-sm rounded-3 d-flex align-items-center" role="alert">
                        <i class="bi {% if category == 'success' %}bi-check-circle-fill text-success{% elif category == 'danger' %}bi-exclamation-triangle-fill text-danger{% elif category == 'warning' %}bi-exclamation-circle-fill text-warning{% else %}bi-info-circle-fill text-info{% endif %} me-2 fs-5"></i>
                        <div>{{ message }}</div>
                        <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                {% endfor %}
            {% endif %}
        {% endwith %}
    </div>

    <!-- Main Content Block -->
    <main class="container pb-5 flex-grow-1">
        {% block content %}{% endblock %}
    </main>

    <!-- Footer -->
    <footer class="bg-white border-top py-3 mt-auto text-secondary text-center small">
        <div class="container d-flex flex-column flex-md-row justify-content-between align-items-center gap-2">
            <div>
                <strong>Smart Study Planner</strong> &middot; Rule-based academic scheduling engine for students.
            </div>
            <div class="text-muted">
                Built with Python, Flask, SQLite & Bootstrap 5
            </div>
        </div>
    </footer>

    <!-- Bootstrap 5 Bundle JS -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="{{ url_for('static', filename='js/script.js') }}"></script>
</body>
</html>`
  },
  {
    path: 'app/templates/dashboard.html',
    category: 'templates',
    language: 'html',
    description: 'Dashboard page template with metric cards, today tasks, and upcoming exams',
    content: `{% extends "base.html" %}

{% block title %}Dashboard - Smart Study Planner{% endblock %}

{% block content %}
<!-- Dashboard Header -->
<div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 my-4">
    <div>
        <h1 class="h3 fw-bold text-dark mb-1">SMART STUDY PLANNER</h1>
        <p class="text-muted mb-0">Plan Smart. Study Better. Keep track of your topics, exams, and daily schedule.</p>
    </div>
    <div class="d-flex flex-wrap gap-2">
        <a href="{{ url_for('main.add_subject') }}" class="btn btn-outline-primary btn-sm rounded-3">
            <i class="bi bi-journal-plus me-1"></i> Add Subject
        </a>
        <a href="{{ url_for('main.add_topic') }}" class="btn btn-outline-secondary btn-sm rounded-3">
            <i class="bi bi-list-plus me-1"></i> Add Topic
        </a>
        <a href="{{ url_for('main.generate_plan') }}" class="btn btn-primary btn-sm rounded-3">
            <i class="bi bi-lightning-charge-fill me-1"></i> Generate Plan
        </a>
    </div>
</div>

<!-- Overview Stats Cards -->
<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-4 stat-card bg-white p-3 h-100">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="text-muted small fw-medium text-uppercase">Subjects</span>
                <span class="stat-icon-wrapper bg-primary-subtle text-primary">
                    <i class="bi bi-journal-bookmark-fill"></i>
                </span>
            </div>
            <div class="h2 fw-bold text-dark mb-0">{{ total_subjects }}</div>
            <div class="text-muted small mt-1">Enrolled courses</div>
        </div>
    </div>
    
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-4 stat-card bg-white p-3 h-100">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="text-muted small fw-medium text-uppercase">Total Topics</span>
                <span class="stat-icon-wrapper bg-info-subtle text-info">
                    <i class="bi bi-list-check"></i>
                </span>
            </div>
            <div class="h2 fw-bold text-dark mb-0">{{ total_topics }}</div>
            <div class="text-muted small mt-1">{{ pending_topics }} pending</div>
        </div>
    </div>

    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-4 stat-card bg-white p-3 h-100">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="text-muted small fw-medium text-uppercase">Completed</span>
                <span class="stat-icon-wrapper bg-success-subtle text-success">
                    <i class="bi bi-check2-circle"></i>
                </span>
            </div>
            <div class="h2 fw-bold text-success mb-0">{{ completed_topics }}</div>
            <div class="text-muted small mt-1">Topics mastered</div>
        </div>
    </div>

    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-4 stat-card bg-white p-3 h-100">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="text-muted small fw-medium text-uppercase">Overall Progress</span>
                <span class="stat-icon-wrapper bg-purple-subtle text-purple">
                    <i class="bi bi-speedometer2"></i>
                </span>
            </div>
            <div class="h2 fw-bold text-primary mb-0">{{ overall_progress }}%</div>
            <div class="progress mt-2" style="height: 6px;">
                <div class="progress-bar bg-primary" role="progressbar" style="width: {{ overall_progress }}%;"></div>
            </div>
        </div>
    </div>
</div>

<!-- Two-Column Section: Today's Tasks & Upcoming Exams -->
<div class="row g-4 mb-4">
    <!-- Today's Tasks -->
    <div class="col-lg-7">
        <div class="card border-0 shadow-sm rounded-4 bg-white h-100">
            <div class="card-header bg-transparent border-0 pt-4 px-4 pb-2 d-flex justify-content-between align-items-center">
                <div>
                    <h5 class="fw-bold mb-0 text-dark">
                        <i class="bi bi-calendar2-day text-primary me-2"></i> Today's Study Tasks
                    </h5>
                    <span class="text-muted small">{{ today.strftime('%A, %B %d, %Y') }}</span>
                </div>
                <a href="{{ url_for('main.study_plan') }}" class="btn btn-sm btn-link text-decoration-none">View Full Plan &rarr;</a>
            </div>

            <div class="card-body px-4 pb-4">
                {% if today_tasks %}
                    <div class="list-group list-group-flush gap-2">
                        {% for task in today_tasks %}
                            <div class="list-group-item border rounded-3 p-3 d-flex align-items-center justify-content-between {% if task.completed %}bg-light opacity-75{% endif %}">
                                <div class="d-flex align-items-center gap-3">
                                    <form action="{{ url_for('main.toggle_plan_task', plan_id=task.id) }}" method="POST" class="m-0">
                                        <button type="submit" class="btn btn-sm p-0 text-decoration-none border-0 bg-transparent" title="Toggle status">
                                            {% if task.completed %}
                                                <i class="bi bi-check-square-fill fs-4 text-success"></i>
                                            {% else %}
                                                <i class="bi bi-square fs-4 text-secondary"></i>
                                            {% endif %}
                                        </button>
                                    </form>
                                    <div>
                                        <div class="fw-semibold {% if task.completed %}text-decoration-line-through text-muted{% else %}text-dark{% endif %}">
                                            {{ task.topic.name }}
                                        </div>
                                        <div class="small text-muted d-flex align-items-center gap-2 mt-1">
                                            <span>{{ task.topic.subject.name }}</span>
                                            <span>&middot;</span>
                                            <span>{{ task.planned_hours }} hr{% if task.planned_hours != 1 %}s{% endif %}</span>
                                            <span>&middot;</span>
                                            <span class="badge {% if task.topic.difficulty == 'Hard' %}bg-danger-subtle text-danger{% elif task.topic.difficulty == 'Medium' %}bg-warning-subtle text-warning-emphasis{% else %}bg-success-subtle text-success{% endif %} rounded-pill px-2 py-0.5">
                                                {{ task.topic.difficulty }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <span class="badge {% if task.completed %}bg-success text-white{% else %}bg-light text-secondary border{% endif %}">
                                    {% if task.completed %}Done{% else %}Pending{% endif %}
                                </span>
                            </div>
                        {% endfor %}
                    </div>
                {% else %}
                    <div class="text-center py-5">
                        <div class="display-6 text-muted mb-2"><i class="bi bi-cup-hot"></i></div>
                        <h6 class="fw-semibold text-dark">No tasks scheduled for today!</h6>
                        <p class="text-muted small mb-3">You're all caught up or haven't generated your study plan yet.</p>
                        <a href="{{ url_for('main.generate_plan') }}" class="btn btn-sm btn-primary rounded-3">
                            <i class="bi bi-lightning-charge me-1"></i> Generate Plan Now
                        </a>
                    </div>
                {% endif %}
            </div>
        </div>
    </div>

    <!-- Upcoming Exams -->
    <div class="col-lg-5">
        <div class="card border-0 shadow-sm rounded-4 bg-white h-100">
            <div class="card-header bg-transparent border-0 pt-4 px-4 pb-2 d-flex justify-content-between align-items-center">
                <div>
                    <h5 class="fw-bold mb-0 text-dark">
                        <i class="bi bi-clock-history text-danger me-2"></i> Upcoming Exams
                    </h5>
                    <span class="text-muted small">Stay ahead of your target deadlines</span>
                </div>
                <a href="{{ url_for('main.subjects_list') }}" class="btn btn-sm btn-link text-decoration-none">Manage &rarr;</a>
            </div>

            <div class="card-body px-4 pb-4">
                {% if upcoming_exams %}
                    <div class="d-flex flex-column gap-3">
                        {% for subj in upcoming_exams %}
                            {% set days_left = subj.days_until_exam %}
                            <div class="p-3 border rounded-3 d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="fw-bold text-dark mb-1">{{ subj.name }}</h6>
                                    <div class="small text-muted">
                                        <i class="bi bi-calendar-event me-1"></i> {{ subj.exam_date.strftime('%b %d, %Y') }}
                                        &middot; {{ subj.total_topics }} topics
                                    </div>
                                </div>
                                <div class="text-end">
                                    {% if days_left == 0 %}
                                        <span class="badge bg-danger text-white px-2 py-1">TODAY!</span>
                                    {% elif days_left < 7 %}
                                        <span class="badge bg-danger-subtle text-danger px-2 py-1 fw-bold">{{ days_left }} days left</span>
                                    {% elif days_left < 15 %}
                                        <span class="badge bg-warning-subtle text-warning-emphasis px-2 py-1">{{ days_left }} days left</span>
                                    {% else %}
                                        <span class="badge bg-info-subtle text-info-emphasis px-2 py-1">{{ days_left }} days left</span>
                                    {% endif %}
                                </div>
                            </div>
                        {% endfor %}
                    </div>
                {% else %}
                    <div class="text-center py-5">
                        <div class="display-6 text-muted mb-2"><i class="bi bi-calendar-plus"></i></div>
                        <h6 class="fw-semibold text-dark">No upcoming exams</h6>
                        <p class="text-muted small mb-3">Add your subjects and their exam dates to get countdowns.</p>
                        <a href="{{ url_for('main.add_subject') }}" class="btn btn-sm btn-outline-primary rounded-3">
                            <i class="bi bi-plus-circle me-1"></i> Add Subject
                        </a>
                    </div>
                {% endif %}
            </div>
        </div>
    </div>
</div>

<!-- Subject-Wise Progress Section -->
<div class="card border-0 shadow-sm rounded-4 bg-white p-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold text-dark mb-0">
            <i class="bi bi-bar-chart-line text-purple me-2"></i> Subject-Wise Progress
        </h5>
        <a href="{{ url_for('main.subjects_list') }}" class="btn btn-sm btn-outline-secondary rounded-3">
            View All Subjects
        </a>
    </div>

    {% if subjects %}
        <div class="row g-3">
            {% for subj in subjects %}
                <div class="col-md-4">
                    <div class="border rounded-3 p-3 h-100 bg-body-tertiary">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold text-dark mb-0 text-truncate" title="{{ subj.name }}">{{ subj.name }}</h6>
                            <span class="small fw-semibold text-primary">{{ subj.progress_percent }}%</span>
                        </div>
                        <div class="progress mb-2" style="height: 6px;">
                            <div class="progress-bar {% if subj.progress_percent == 100 %}bg-success{% else %}bg-primary{% endif %}" role="progressbar" style="width: {{ subj.progress_percent }}%;"></div>
                        </div>
                        <div class="d-flex justify-content-between text-muted small">
                            <span>{{ subj.completed_topics }}/{{ subj.total_topics }} topics</span>
                            <a href="{{ url_for('main.topics_list', subject_id=subj.id) }}" class="text-decoration-none">Topics &rarr;</a>
                        </div>
                    </div>
                </div>
            {% endfor %}
        </div>
    {% else %}
        <p class="text-muted small mb-0">No subjects created yet. Click "Load Sample Data" in the top bar to get started immediately!</p>
    {% endif %}
</div>
{% endblock %}
`
  },
  {
    path: 'app/templates/subjects.html',
    category: 'templates',
    language: 'html',
    description: 'Subjects list page with topic count, progress, and actions',
    content: `{% extends "base.html" %}

{% block title %}Subjects - Smart Study Planner{% endblock %}

{% block content %}
<div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 my-4">
    <div>
        <h1 class="h3 fw-bold text-dark mb-1">Subjects</h1>
        <p class="text-muted mb-0">Manage your enrolled courses, target exam deadlines, and study modules.</p>
    </div>
    <a href="{{ url_for('main.add_subject') }}" class="btn btn-primary rounded-3">
        <i class="bi bi-plus-lg me-1"></i> Add Subject
    </a>
</div>

{% if subjects %}
    <div class="row g-4">
        {% for subject in subjects %}
            <div class="col-md-6 col-lg-4">
                <div class="card border-0 shadow-sm rounded-4 h-100 bg-white d-flex flex-column">
                    <div class="card-body p-4 flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                            <h5 class="fw-bold text-dark mb-0">{{ subject.name }}</h5>
                            {% set days_left = subject.days_until_exam %}
                            {% if days_left < 0 %}
                                <span class="badge bg-secondary">Passed</span>
                            {% elif days_left == 0 %}
                                <span class="badge bg-danger">Exam Today</span>
                            {% elif days_left < 7 %}
                                <span class="badge bg-danger-subtle text-danger fw-bold">{{ days_left }}d left</span>
                            {% else %}
                                <span class="badge bg-primary-subtle text-primary">{{ days_left }}d left</span>
                            {% endif %}
                        </div>

                        <div class="text-muted small mb-3">
                            <i class="bi bi-calendar3 me-1"></i> Exam: {{ subject.exam_date.strftime('%B %d, %Y') }}
                        </div>

                        {% if subject.description %}
                            <p class="text-secondary small mb-3 text-truncate-2">{{ subject.description }}</p>
                        {% endif %}

                        <!-- Progress Bar -->
                        <div class="mb-2">
                            <div class="d-flex justify-content-between align-items-center small mb-1">
                                <span class="text-muted">Mastery Progress</span>
                                <span class="fw-bold text-dark">{{ subject.progress_percent }}%</span>
                            </div>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar {% if subject.progress_percent == 100 %}bg-success{% else %}bg-primary{% endif %}" role="progressbar" style="width: {{ subject.progress_percent }}%;"></div>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between text-muted small mt-2">
                            <span><i class="bi bi-collection me-1"></i> {{ subject.total_topics }} topics</span>
                            <span><i class="bi bi-check2-circle text-success me-1"></i> {{ subject.completed_topics }} completed</span>
                        </div>
                    </div>

                    <!-- Card Footer Actions -->
                    <div class="card-footer bg-light border-0 px-4 py-3 rounded-bottom-4 d-flex justify-content-between align-items-center">
                        <a href="{{ url_for('main.topics_list', subject_id=subject.id) }}" class="btn btn-sm btn-outline-primary rounded-3 fw-medium">
                            <i class="bi bi-list-ul me-1"></i> View Topics
                        </a>
                        
                        <div class="d-flex gap-2">
                            <a href="{{ url_for('main.edit_subject', subject_id=subject.id) }}" class="btn btn-sm btn-light border rounded-3" title="Edit subject">
                                <i class="bi bi-pencil"></i>
                            </a>
                            <form action="{{ url_for('main.delete_subject', subject_id=subject.id) }}" method="POST" onsubmit="return confirm('Are you sure you want to delete this subject and all its topics?');" class="d-inline">
                                <button type="submit" class="btn btn-sm btn-outline-danger rounded-3" title="Delete subject">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        {% endfor %}
    </div>
{% else %}
    <div class="card border-0 shadow-sm rounded-4 p-5 text-center bg-white my-4">
        <div class="display-5 text-muted mb-3"><i class="bi bi-journal-x"></i></div>
        <h4 class="fw-bold text-dark mb-2">No subjects added yet</h4>
        <p class="text-muted mb-4 max-w-md mx-auto">Start by creating your first subject or course, or click "Load Sample Data" to load CS coursework.</p>
        <div class="d-flex justify-content-center gap-2">
            <a href="{{ url_for('main.add_subject') }}" class="btn btn-primary rounded-3 px-4">
                <i class="bi bi-plus-lg me-1"></i> Add Your First Subject
            </a>
        </div>
    </div>
{% endif %}
{% endblock %}
`
  },
  {
    path: 'app/templates/add_subject.html',
    category: 'templates',
    language: 'html',
    description: 'Add Subject creation form with validation',
    content: `{% extends "base.html" %}

{% block title %}Add Subject - Smart Study Planner{% endblock %}

{% block content %}
<div class="row justify-content-center my-4">
    <div class="col-md-8 col-lg-6">
        <nav aria-label="breadcrumb" class="mb-3">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="{{ url_for('main.subjects_list') }}">Subjects</a></li>
                <li class="breadcrumb-item active" aria-current="page">Add Subject</li>
            </ol>
        </nav>

        <div class="card border-0 shadow-sm rounded-4 bg-white p-4">
            <h2 class="h4 fw-bold text-dark mb-1">Add New Subject</h2>
            <p class="text-muted small mb-4">Define a new academic subject and set the target exam deadline.</p>

            <form action="{{ url_for('main.add_subject') }}" method="POST">
                <div class="mb-3">
                    <label for="name" class="form-label fw-semibold text-dark">Subject Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control rounded-3" id="name" name="name" placeholder="e.g. Data Structures & Algorithms" value="{{ name or '' }}" required autofocus>
                    <div class="form-text">Choose a descriptive title for this course.</div>
                </div>

                <div class="mb-3">
                    <label for="exam_date" class="form-label fw-semibold text-dark">Exam Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control rounded-3" id="exam_date" name="exam_date" value="{{ exam_date or default_date }}" required>
                    <div class="form-text">The planner will prioritize topics and schedule them before this date.</div>
                </div>

                <div class="mb-4">
                    <label for="description" class="form-label fw-semibold text-dark">Description (Optional)</label>
                    <textarea class="form-control rounded-3" id="description" name="description" rows="3" placeholder="Syllabus notes, instructor info, or key goals...">{{ description or '' }}</textarea>
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <a href="{{ url_for('main.subjects_list') }}" class="btn btn-outline-secondary rounded-3 px-3">Cancel</a>
                    <button type="submit" class="btn btn-primary rounded-3 px-4 fw-medium">
                        <i class="bi bi-check-lg me-1"></i> Save Subject
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{% endblock %}
`
  },
  {
    path: 'app/templates/edit_subject.html',
    category: 'templates',
    language: 'html',
    description: 'Edit Subject form template',
    content: `{% extends "base.html" %}

{% block title %}Edit Subject - Smart Study Planner{% endblock %}

{% block content %}
<div class="row justify-content-center my-4">
    <div class="col-md-8 col-lg-6">
        <nav aria-label="breadcrumb" class="mb-3">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="{{ url_for('main.subjects_list') }}">Subjects</a></li>
                <li class="breadcrumb-item active" aria-current="page">Edit {{ subject.name }}</li>
            </ol>
        </nav>

        <div class="card border-0 shadow-sm rounded-4 bg-white p-4">
            <h2 class="h4 fw-bold text-dark mb-1">Edit Subject</h2>
            <p class="text-muted small mb-4">Modify the subject name, scheduled exam date, or notes.</p>

            <form action="{{ url_for('main.edit_subject', subject_id=subject.id) }}" method="POST">
                <div class="mb-3">
                    <label for="name" class="form-label fw-semibold text-dark">Subject Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control rounded-3" id="name" name="name" value="{{ subject.name }}" required autofocus>
                </div>

                <div class="mb-3">
                    <label for="exam_date" class="form-label fw-semibold text-dark">Exam Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control rounded-3" id="exam_date" name="exam_date" value="{{ subject.exam_date.strftime('%Y-%m-%d') }}" required>
                </div>

                <div class="mb-4">
                    <label for="description" class="form-label fw-semibold text-dark">Description (Optional)</label>
                    <textarea class="form-control rounded-3" id="description" name="description" rows="3">{{ subject.description or '' }}</textarea>
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <a href="{{ url_for('main.subjects_list') }}" class="btn btn-outline-secondary rounded-3 px-3">Cancel</a>
                    <button type="submit" class="btn btn-primary rounded-3 px-4 fw-medium">
                        <i class="bi bi-check-lg me-1"></i> Update Subject
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{% endblock %}
`
  },
  {
    path: 'app/templates/topics.html',
    category: 'templates',
    language: 'html',
    description: 'Subject topics management table with difficulty, hours, and status toggle',
    content: `{% extends "base.html" %}

{% block title %}{{ subject.name }} Topics - Smart Study Planner{% endblock %}

{% block content %}
<div class="my-4">
    <nav aria-label="breadcrumb" class="mb-3">
        <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="{{ url_for('main.subjects_list') }}">Subjects</a></li>
            <li class="breadcrumb-item active" aria-current="page">{{ subject.name }}</li>
        </ol>
    </nav>

    <!-- Header & Action Row -->
    <div class="card border-0 shadow-sm rounded-4 bg-white p-4 mb-4">
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                    <h1 class="h3 fw-bold text-dark mb-0">{{ subject.name }}</h1>
                    <span class="badge bg-primary-subtle text-primary">{{ subject.exam_date.strftime('%b %d, %Y') }}</span>
                </div>
                <p class="text-muted mb-0 small">
                    {{ subject.description or 'No description provided.' }}
                </p>
            </div>
            
            <div class="d-flex gap-2">
                <a href="{{ url_for('main.add_topic', subject_id=subject.id) }}" class="btn btn-primary rounded-3 text-nowrap">
                    <i class="bi bi-plus-lg me-1"></i> Add Topic
                </a>
                <a href="{{ url_for('main.edit_subject', subject_id=subject.id) }}" class="btn btn-outline-secondary rounded-3" title="Edit Subject Details">
                    <i class="bi bi-gear"></i>
                </a>
            </div>
        </div>

        <!-- Subject Progress Bar -->
        <div class="mt-4 pt-3 border-top">
            <div class="d-flex justify-content-between small text-muted mb-1">
                <span>Progress ({{ subject.completed_topics }} of {{ subject.total_topics }} topics completed)</span>
                <span class="fw-bold text-dark">{{ subject.progress_percent }}%</span>
            </div>
            <div class="progress" style="height: 8px;">
                <div class="progress-bar {% if subject.progress_percent == 100 %}bg-success{% else %}bg-primary{% endif %}" role="progressbar" style="width: {{ subject.progress_percent }}%;"></div>
            </div>
        </div>
    </div>

    <!-- Topics Table / List -->
    <div class="card border-0 shadow-sm rounded-4 bg-white overflow-hidden">
        <div class="card-header bg-white border-0 pt-4 px-4 pb-2 d-flex justify-content-between align-items-center">
            <h5 class="fw-bold text-dark mb-0">Topics List</h5>
            <span class="text-muted small">{{ subject.total_topics }} topics registered</span>
        </div>

        <div class="card-body p-0">
            {% if topics %}
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light text-muted small text-uppercase">
                            <tr>
                                <th class="ps-4" style="width: 50px;">Status</th>
                                <th>Topic Name</th>
                                <th>Difficulty</th>
                                <th>Est. Hours</th>
                                <th class="text-end pe-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for topic in topics %}
                                <tr class="{% if topic.completed %}table-light opacity-75{% endif %}">
                                    <td class="ps-4">
                                        <form action="{{ url_for('main.toggle_topic', topic_id=topic.id) }}" method="POST" class="m-0">
                                            <button type="submit" class="btn btn-sm p-0 border-0 bg-transparent" title="Click to toggle status">
                                                {% if topic.completed %}
                                                    <i class="bi bi-check-circle-fill text-success fs-5"></i>
                                                {% else %}
                                                    <i class="bi bi-circle text-muted fs-5"></i>
                                                {% endif %}
                                            </button>
                                        </form>
                                    </td>
                                    <td>
                                        <div class="fw-semibold {% if topic.completed %}text-decoration-line-through text-muted{% else %}text-dark{% endif %}">
                                            {{ topic.name }}
                                        </div>
                                    </td>
                                    <td>
                                        {% if topic.difficulty == 'Hard' %}
                                            <span class="badge bg-danger-subtle text-danger px-2.5 py-1">Hard (Priority 3)</span>
                                        {% elif topic.difficulty == 'Medium' %}
                                            <span class="badge bg-warning-subtle text-warning-emphasis px-2.5 py-1">Medium (Priority 2)</span>
                                        {% else %}
                                            <span class="badge bg-success-subtle text-success px-2.5 py-1">Easy (Priority 1)</span>
                                        {% endif %}
                                    </td>
                                    <td>
                                        <span class="text-secondary fw-medium">{{ topic.estimated_hours }} hr{% if topic.estimated_hours != 1 %}s{% endif %}</span>
                                    </td>
                                    <td class="text-end pe-4">
                                        <div class="d-inline-flex gap-1">
                                            <form action="{{ url_for('main.toggle_topic', topic_id=topic.id) }}" method="POST" class="d-inline">
                                                <button type="submit" class="btn btn-sm {% if topic.completed %}btn-outline-secondary{% else %}btn-outline-success{% endif %} rounded-3">
                                                    {% if topic.completed %}
                                                        <i class="bi bi-arrow-counterclockwise"></i> Redo
                                                    {% else %}
                                                        <i class="bi bi-check-lg"></i> Complete
                                                    {% endif %}
                                                </button>
                                            </form>
                                            <a href="{{ url_for('main.edit_topic', topic_id=topic.id) }}" class="btn btn-sm btn-light border rounded-3" title="Edit Topic">
                                                <i class="bi bi-pencil"></i>
                                            </a>
                                            <form action="{{ url_for('main.delete_topic', topic_id=topic.id) }}" method="POST" onsubmit="return confirm('Delete topic \'{{ topic.name }}\'?');" class="d-inline">
                                                <button type="submit" class="btn btn-sm btn-outline-danger rounded-3" title="Delete Topic">
                                                    <i class="bi bi-trash"></i>
                                                </button>
                                            </form>
                                        </div>
                                    </td>
                                </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
            {% else %}
                <div class="text-center py-5">
                    <div class="display-6 text-muted mb-2"><i class="bi bi-journal-plus"></i></div>
                    <h5 class="fw-bold text-dark mb-1">No topics under {{ subject.name }}</h5>
                    <p class="text-muted small mb-3">Add topics to start building your customized study timeline.</p>
                    <a href="{{ url_for('main.add_topic', subject_id=subject.id) }}" class="btn btn-primary rounded-3 px-3">
                        <i class="bi bi-plus-lg me-1"></i> Add First Topic
                    </a>
                </div>
            {% endif %}
        </div>
    </div>
</div>
{% endblock %}
`
  },
  {
    path: 'app/templates/add_topic.html',
    category: 'templates',
    language: 'html',
    description: 'Add Topic creation form with difficulty and study hours input',
    content: `{% extends "base.html" %}

{% block title %}Add Topic - Smart Study Planner{% endblock %}

{% block content %}
<div class="row justify-content-center my-4">
    <div class="col-md-8 col-lg-6">
        <nav aria-label="breadcrumb" class="mb-3">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="{{ url_for('main.subjects_list') }}">Subjects</a></li>
                <li class="breadcrumb-item active" aria-current="page">Add Topic</li>
            </ol>
        </nav>

        <div class="card border-0 shadow-sm rounded-4 bg-white p-4">
            <h2 class="h4 fw-bold text-dark mb-1">Add New Topic</h2>
            <p class="text-muted small mb-4">Add a syllabus module or concept. Higher difficulty gets higher scheduling priority.</p>

            <form action="{{ url_for('main.add_topic') }}" method="POST">
                <div class="mb-3">
                    <label for="subject_id" class="form-label fw-semibold text-dark">Subject <span class="text-danger">*</span></label>
                    <select class="form-select rounded-3" id="subject_id" name="subject_id" required>
                        {% for subj in subjects %}
                            <option value="{{ subj.id }}" {% if selected_subject_id == subj.id %}selected{% endif %}>
                                {{ subj.name }} (Exam: {{ subj.exam_date.strftime('%b %d') }})
                            </option>
                        {% endfor %}
                    </select>
                </div>

                <div class="mb-3">
                    <label for="name" class="form-label fw-semibold text-dark">Topic Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control rounded-3" id="name" name="name" placeholder="e.g. Dynamic Programming, Normalization, Binary Trees" required autofocus>
                </div>

                <div class="row g-3 mb-4">
                    <div class="col-md-6">
                        <label for="difficulty" class="form-label fw-semibold text-dark">Difficulty Level</label>
                        <select class="form-select rounded-3" id="difficulty" name="difficulty" required>
                            <option value="Easy">Easy (Priority 1)</option>
                            <option value="Medium" selected>Medium (Priority 2)</option>
                            <option value="Hard">Hard (Priority 3 - Early Scheduling)</option>
                        </select>
                        <div class="form-text small">Harder topics receive higher scheduling priority.</div>
                    </div>

                    <div class="col-md-6">
                        <label for="estimated_hours" class="form-label fw-semibold text-dark">Estimated Study Hours <span class="text-danger">*</span></label>
                        <input type="number" step="0.5" min="0.5" max="40" class="form-control rounded-3" id="estimated_hours" name="estimated_hours" value="1.5" required>
                        <div class="form-text small">Expected hours to understand & practice.</div>
                    </div>
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <a href="{{ url_for('main.subjects_list') }}" class="btn btn-outline-secondary rounded-3 px-3">Cancel</a>
                    <button type="submit" class="btn btn-primary rounded-3 px-4 fw-medium">
                        <i class="bi bi-check-lg me-1"></i> Save Topic
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{% endblock %}
`
  },
  {
    path: 'app/templates/edit_topic.html',
    category: 'templates',
    language: 'html',
    description: 'Edit Topic form template',
    content: `{% extends "base.html" %}

{% block title %}Edit Topic - Smart Study Planner{% endblock %}

{% block content %}
<div class="row justify-content-center my-4">
    <div class="col-md-8 col-lg-6">
        <nav aria-label="breadcrumb" class="mb-3">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="{{ url_for('main.subjects_list') }}">Subjects</a></li>
                <li class="breadcrumb-item"><a href="{{ url_for('main.topics_list', subject_id=topic.subject_id) }}">{{ topic.subject.name }}</a></li>
                <li class="breadcrumb-item active" aria-current="page">Edit {{ topic.name }}</li>
            </ol>
        </nav>

        <div class="card border-0 shadow-sm rounded-4 bg-white p-4">
            <h2 class="h4 fw-bold text-dark mb-1">Edit Topic</h2>
            <p class="text-muted small mb-4">Update topic details, estimated study hours, or mastery status.</p>

            <form action="{{ url_for('main.edit_topic', topic_id=topic.id) }}" method="POST">
                <div class="mb-3">
                    <label for="subject_id" class="form-label fw-semibold text-dark">Subject <span class="text-danger">*</span></label>
                    <select class="form-select rounded-3" id="subject_id" name="subject_id" required>
                        {% for subj in subjects %}
                            <option value="{{ subj.id }}" {% if topic.subject_id == subj.id %}selected{% endif %}>
                                {{ subj.name }} (Exam: {{ subj.exam_date.strftime('%b %d') }})
                            </option>
                        {% endfor %}
                    </select>
                </div>

                <div class="mb-3">
                    <label for="name" class="form-label fw-semibold text-dark">Topic Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control rounded-3" id="name" name="name" value="{{ topic.name }}" required autofocus>
                </div>

                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <label for="difficulty" class="form-label fw-semibold text-dark">Difficulty Level</label>
                        <select class="form-select rounded-3" id="difficulty" name="difficulty" required>
                            <option value="Easy" {% if topic.difficulty == 'Easy' %}selected{% endif %}>Easy (Priority 1)</option>
                            <option value="Medium" {% if topic.difficulty == 'Medium' %}selected{% endif %}>Medium (Priority 2)</option>
                            <option value="Hard" {% if topic.difficulty == 'Hard' %}selected{% endif %}>Hard (Priority 3 - Early Scheduling)</option>
                        </select>
                    </div>

                    <div class="col-md-6">
                        <label for="estimated_hours" class="form-label fw-semibold text-dark">Estimated Hours <span class="text-danger">*</span></label>
                        <input type="number" step="0.5" min="0.5" max="40" class="form-control rounded-3" id="estimated_hours" name="estimated_hours" value="{{ topic.estimated_hours }}" required>
                    </div>
                </div>

                <div class="mb-4 form-check">
                    <input type="checkbox" class="form-check-input" id="completed" name="completed" {% if topic.completed %}checked{% endif %}>
                    <label class="form-check-label text-dark fw-medium" for="completed">
                        Mark as Completed (Mastered)
                    </label>
                    <div class="form-text small">Completed topics will not be scheduled in newly generated study plans.</div>
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <a href="{{ url_for('main.topics_list', subject_id=topic.subject_id) }}" class="btn btn-outline-secondary rounded-3 px-3">Cancel</a>
                    <button type="submit" class="btn btn-primary rounded-3 px-4 fw-medium">
                        <i class="bi bi-check-lg me-1"></i> Update Topic
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{% endblock %}
`
  },
  {
    path: 'app/templates/study_plan.html',
    category: 'templates',
    language: 'html',
    description: 'Day-by-day scheduled study plan timeline grouped by date',
    content: `{% extends "base.html" %}

{% block title %}Study Plan - Smart Study Planner{% endblock %}

{% block content %}
<div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 my-4">
    <div>
        <h1 class="h3 fw-bold text-dark mb-1">Your Personalized Study Plan</h1>
        <p class="text-muted mb-0">Rule-based schedule distributed evenly before your target exam deadlines.</p>
    </div>
    <div class="d-flex gap-2">
        <a href="{{ url_for('main.generate_plan') }}" class="btn btn-primary rounded-3 text-nowrap">
            <i class="bi bi-arrow-repeat me-1"></i> Regenerate Plan
        </a>
    </div>
</div>

{% if grouped_plan %}
    <!-- Summary Cards -->
    <div class="row g-3 mb-4">
        <div class="col-6 col-md-4">
            <div class="card border-0 shadow-sm rounded-4 bg-white p-3">
                <span class="text-muted small text-uppercase fw-medium">Scheduled Sessions</span>
                <div class="h3 fw-bold text-dark mb-0 mt-1">{{ total_tasks }}</div>
            </div>
        </div>
        <div class="col-6 col-md-4">
            <div class="card border-0 shadow-sm rounded-4 bg-white p-3">
                <span class="text-muted small text-uppercase fw-medium">Total Planned Hours</span>
                <div class="h3 fw-bold text-primary mb-0 mt-1">{{ total_planned_hours }} hrs</div>
            </div>
        </div>
        <div class="col-12 col-md-4">
            <div class="card border-0 shadow-sm rounded-4 bg-white p-3">
                <span class="text-muted small text-uppercase fw-medium">Completed Hours</span>
                <div class="h3 fw-bold text-success mb-0 mt-1">{{ completed_planned_hours }} hrs</div>
            </div>
        </div>
    </div>

    <!-- Day by Day Timeline Cards -->
    <div class="d-flex flex-column gap-4">
        {% for day_group in grouped_plan %}
            {% set day_date = day_group.date %}
            <div class="card border-0 shadow-sm rounded-4 bg-white overflow-hidden {% if day_group.is_today %}border-2 border-primary{% endif %}">
                <div class="card-header bg-white border-0 pt-4 px-4 pb-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="day-badge {% if day_group.is_today %}bg-primary text-white{% else %}bg-light text-dark border{% endif %} fw-bold px-3 py-1.5 rounded-3">
                            {{ day_date.strftime('%A').upper() }}
                        </span>
                        <div>
                            <h5 class="fw-bold mb-0 text-dark">{{ day_date.strftime('%B %d, %Y') }}</h5>
                            {% if day_group.is_today %}
                                <span class="badge bg-primary text-white small">TODAY</span>
                            {% elif day_group.is_past %}
                                <span class="badge bg-secondary-subtle text-secondary small">PAST</span>
                            {% endif %}
                        </div>
                    </div>

                    <div class="text-muted small">
                        <i class="bi bi-clock me-1"></i> <strong>{{ day_group.total_hours }}</strong> planned hours
                    </div>
                </div>

                <div class="card-body px-4 pb-4 pt-2">
                    <div class="list-group list-group-flush gap-2">
                        {% for task in day_group.tasks %}
                            <div class="list-group-item border rounded-3 p-3 d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between gap-3 {% if task.completed %}bg-light opacity-75{% endif %}">
                                <div class="d-flex align-items-center gap-3">
                                    <form action="{{ url_for('main.toggle_plan_task', plan_id=task.id) }}" method="POST" class="m-0">
                                        <button type="submit" class="btn btn-sm p-0 text-decoration-none border-0 bg-transparent" title="Toggle status">
                                            {% if task.completed %}
                                                <i class="bi bi-check-square-fill fs-4 text-success"></i>
                                            {% else %}
                                                <i class="bi bi-square fs-4 text-secondary"></i>
                                            {% endif %}
                                        </button>
                                    </form>

                                    <div>
                                        <div class="fw-bold {% if task.completed %}text-decoration-line-through text-muted{% else %}text-dark{% endif %}">
                                            {{ task.topic.name }}
                                        </div>
                                        <div class="small text-muted d-flex flex-wrap align-items-center gap-2 mt-1">
                                            <span class="fw-medium text-dark"><i class="bi bi-journal-text me-1"></i>{{ task.topic.subject.name }}</span>
                                            <span>&middot;</span>
                                            <span>Exam: {{ task.topic.subject.exam_date.strftime('%b %d') }}</span>
                                            <span>&middot;</span>
                                            <span class="badge {% if task.topic.difficulty == 'Hard' %}bg-danger-subtle text-danger{% elif task.topic.difficulty == 'Medium' %}bg-warning-subtle text-warning-emphasis{% else %}bg-success-subtle text-success{% endif %} rounded-pill px-2 py-0.5">
                                                {{ task.topic.difficulty }}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="d-flex align-items-center gap-3 align-self-end align-self-sm-center">
                                    <span class="badge bg-light text-dark border px-2.5 py-1.5">
                                        <i class="bi bi-hourglass-split text-primary me-1"></i> {{ task.planned_hours }} hr{% if task.planned_hours != 1 %}s{% endif %}
                                    </span>
                                    <span class="badge {% if task.completed %}bg-success text-white{% else %}bg-light text-secondary border{% endif %}">
                                        {% if task.completed %}Completed{% else %}Pending{% endif %}
                                    </span>
                                </div>
                            </div>
                        {% endfor %}
                    </div>
                </div>
            </div>
        {% endfor %}
    </div>
{% else %}
    <div class="card border-0 shadow-sm rounded-4 p-5 text-center bg-white my-4">
        <div class="display-5 text-muted mb-3"><i class="bi bi-calendar2-range"></i></div>
        <h4 class="fw-bold text-dark mb-2">No active study plan generated</h4>
        <p class="text-muted mb-4 max-w-md mx-auto">
            Set your daily study hours and starting date to automatically generate a prioritized schedule across all pending topics!
        </p>
        <div class="d-flex justify-content-center gap-2">
            <a href="{{ url_for('main.generate_plan') }}" class="btn btn-primary rounded-3 px-4">
                <i class="bi bi-lightning-charge me-1"></i> Generate Study Plan
            </a>
        </div>
    </div>
{% endif %}
{% endblock %}
`
  },
  {
    path: 'app/templates/generate_plan.html',
    category: 'templates',
    language: 'html',
    description: 'Plan generation input form with daily hours, start date, and algorithm breakdown',
    content: `{% extends "base.html" %}

{% block title %}Generate Plan - Smart Study Planner{% endblock %}

{% block content %}
<div class="row justify-content-center my-4">
    <div class="col-md-8 col-lg-6">
        <div class="card border-0 shadow-sm rounded-4 bg-white p-4 mb-4">
            <div class="d-flex align-items-center gap-3 mb-3">
                <div class="stat-icon-wrapper bg-primary text-white fs-4 p-2 rounded-3">
                    <i class="bi bi-cpu-fill"></i>
                </div>
                <div>
                    <h2 class="h4 fw-bold text-dark mb-0">Generate Study Plan</h2>
                    <p class="text-muted small mb-0">Automated rule-based scheduling for pending topics.</p>
                </div>
            </div>

            <form action="{{ url_for('main.generate_plan') }}" method="POST">
                <div class="mb-3">
                    <label for="daily_hours" class="form-label fw-semibold text-dark">
                        Available Study Hours Per Day <span class="text-danger">*</span>
                    </label>
                    <div class="input-group">
                        <input type="number" step="0.5" min="0.5" max="16" class="form-control rounded-start-3" id="daily_hours" name="daily_hours" value="3.0" required autofocus>
                        <span class="input-group-text rounded-end-3 bg-light text-muted">hours / day</span>
                    </div>
                    <div class="form-text small">How many hours can you realistically commit each day?</div>
                </div>

                <div class="mb-4">
                    <label for="start_date" class="form-label fw-semibold text-dark">
                        Start Date <span class="text-danger">*</span>
                    </label>
                    <input type="date" class="form-control rounded-3" id="start_date" name="start_date" value="{{ default_date }}" required>
                    <div class="form-text small">Date from which sessions should start being assigned.</div>
                </div>

                <div class="d-grid gap-2">
                    <button type="submit" class="btn btn-primary rounded-3 py-2 fw-semibold">
                        <i class="bi bi-lightning-charge-fill me-1"></i> Generate My Study Schedule
                    </button>
                    <a href="{{ url_for('main.study_plan') }}" class="btn btn-outline-secondary rounded-3">Cancel</a>
                </div>
            </form>
        </div>

        <!-- How the Algorithm Works Card -->
        <div class="card border-0 shadow-sm rounded-4 bg-white p-4">
            <h6 class="fw-bold text-dark mb-3">
                <i class="bi bi-info-circle text-primary me-2"></i> How the Scheduling Algorithm Works
            </h6>
            <ul class="text-muted small ps-3 mb-0 d-flex flex-column gap-2">
                <li>
                    <strong>Difficulty Weighting:</strong> Hard topics (weight 3) are scheduled earlier than Medium (2) and Easy (1) to tackle complex concepts first.
                </li>
                <li>
                    <strong>Exam Urgency:</strong> Topics belonging to subjects with upcoming target exam dates receive higher priority.
                </li>
                <li>
                    <strong>Workload Balancing:</strong> Daily hours are strictly capped at your available hours to prevent burnout.
                </li>
                <li>
                    <strong>Deadline Protection:</strong> Topics are scheduled before their subject's exam date; warnings are displayed if additional daily study time is needed.
                </li>
                <li>
                    <strong>Completed Topics Excluded:</strong> Any topic already marked completed is automatically omitted from new schedules.
                </li>
            </ul>
        </div>
    </div>
</div>
{% endblock %}
`
  },
  {
    path: 'app/static/css/style.css',
    category: 'static',
    language: 'css',
    description: 'Custom styling sheet augmenting Bootstrap 5 with clean fonts and badges',
    content: `/*
 * Smart Study Planner - Custom Styles
 * Complements Bootstrap 5 with modern aesthetics, subtle shadows, and soft rounded radii.
 */

:root {
    --primary-color: #2563eb;
    --primary-hover: #1d4ed8;
    --purple-color: #7c3aed;
    --purple-light: #ede9fe;
    --body-bg: #f8fafc;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --border-color: #e2e8f0;
}

body {
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    background-color: var(--body-bg);
    color: var(--text-main);
    -webkit-font-smoothing: antialiased;
}

.brand-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
    color: #ffffff;
    font-size: 1rem;
}

.stat-icon-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    font-size: 1.15rem;
}

.bg-purple-subtle {
    background-color: #f3e8ff !important;
}

.text-purple {
    color: #7e22ce !important;
}

.rounded-4 {
    border-radius: 1rem !important;
}

.stat-card {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -4px rgba(0, 0, 0, 0.05) !important;
}

.text-truncate-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.day-badge {
    letter-spacing: 0.05em;
    font-size: 0.8rem;
}

.btn-primary {
    background-color: var(--primary-color);
    border-color: var(--primary-color);
}

.btn-primary:hover {
    background-color: var(--primary-hover);
    border-color: var(--primary-hover);
}

.form-control:focus, .form-select:focus {
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.25rem rgba(37, 99, 235, 0.15);
}

.table th {
    font-weight: 600;
    letter-spacing: 0.025em;
}

@media (max-width: 576px) {
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
}
`
  },
  {
    path: 'app/static/js/script.js',
    category: 'static',
    language: 'javascript',
    description: 'Vanilla JavaScript for alert dismissal and form feedback',
    content: `/**
 * Smart Study Planner - Client-side JavaScript
 * Handles alert auto-dismissal, tooltips, and interactive form aids.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Automatically fade out success alerts after 4 seconds
    const alerts = document.querySelectorAll('.alert-success');
    alerts.forEach((alert) => {
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 4000);
    });

    // Initialize all Bootstrap tooltips if any are present
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map((tooltipTriggerEl) => {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Provide visual feedback when a user submits the "Generate Plan" form
    const generatePlanForm = document.querySelector('form[action*="generate-plan"]');
    if (generatePlanForm) {
        generatePlanForm.addEventListener('submit', (e) => {
            const submitBtn = generatePlanForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Computing Schedule...';
            }
        });
    }
});
`
  },
  {
    path: 'run.py',
    category: 'backend',
    language: 'python',
    description: 'Main Python entry point running Flask on 0.0.0.0:5000',
    content: `"""
Smart Study Planner - Application Entry Point
Executes the Flask development server on 0.0.0.0:5000.
"""
import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ['true', '1', 't']
    app.run(host='0.0.0.0', port=port, debug=debug)
`
  },
  {
    path: 'requirements.txt',
    category: 'config',
    language: 'text',
    description: 'Python package dependencies (Flask, SQLAlchemy, Gunicorn)',
    content: `Flask==3.1.0
Flask-SQLAlchemy==3.1.1
Werkzeug==3.1.3
gunicorn==23.0.0
python-dotenv==1.0.1
`
  },
  {
    path: 'Dockerfile',
    category: 'docker',
    language: 'dockerfile',
    description: 'Docker container configuration using python:3.12-slim and port 5000',
    content: `# Use official Python 3.12 slim base image
FROM python:3.12-slim

# Set working directory inside container
WORKDIR /app

# Set environment variables:
# - PYTHONDONTWRITEBYTECODE prevents Python from writing .pyc files
# - PYTHONUNBUFFERED ensures logs appear immediately without buffering
ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PORT=5000

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project codebase into the container
COPY . .

# Ensure instance directory exists for SQLite database storage
RUN mkdir -p instance

# Expose port 5000
EXPOSE 5000

# Run Flask application with entrypoint run.py
CMD ["python", "run.py"]
`
  },
  {
    path: 'docker-compose.yml',
    category: 'docker',
    language: 'yaml',
    description: 'Docker Compose definition with port mapping and volume persistence for SQLite',
    content: `services:
  web:
    build: .
    container_name: smart_study_planner
    ports:
      - "5000:5000"
    volumes:
      # Persist SQLite database file across container restarts
      - ./instance:/app/instance
    environment:
      - FLASK_ENV=production
      - FLASK_DEBUG=False
      - SECRET_KEY=smart-study-planner-secret-key-prod
      - PORT=5000
    restart: unless-stopped
`
  },
  {
    path: '.dockerignore',
    category: 'docker',
    language: 'text',
    description: 'Files excluded from Docker image builds',
    content: `__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
ENV/
env/
.git/
.gitignore
instance/*.db
.DS_Store
*.log
.env
`
  },
  {
    path: '.gitignore',
    category: 'config',
    language: 'text',
    description: 'Files excluded from Git and GitHub commits',
    content: `# Python byte code
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
venv/
.venv/
ENV/
env/

# Environment variables & secrets
.env
.env.local

# SQLite local database files (do not commit runtime database)
instance/*.db
*.sqlite3
*.db

# macOS & OS artifacts
.DS_Store
Thumbs.db

# Logs
*.log
`
  },
  {
    path: 'README.md',
    category: 'docs',
    language: 'markdown',
    description: 'Comprehensive project README with setup guides for Windows, Linux, Docker, Git',
    content: `# Smart Study Planner

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

- **Backend**: Python 3.12+, Flask, Flask-SQLAlchemy, SQLite, Gunicorn
- **Frontend**: HTML5, CSS3, Bootstrap 5.3, Bootstrap Icons, Vanilla JavaScript
- **Containerization**: Docker, Docker Compose
- **Version Control**: Git, GitHub

---

## How to Run Without Docker

### Windows (Command Prompt / PowerShell)
\`\`\`cmd
cd smart-study-planner
python -m venv venv
venv\\Scripts\\activate
pip install -r requirements.txt
python run.py
\`\`\`

### macOS / Linux (Terminal)
\`\`\`bash
cd smart-study-planner
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
\`\`\`

---

## How to Run With Docker

\`\`\`bash
docker build -t smart-study-planner .
docker run -p 5000:5000 smart-study-planner
\`\`\`

### Docker Compose
\`\`\`bash
docker compose up --build
\`\`\`

Open **http://localhost:5000** in your browser.

---

## GitHub Upload Guide

\`\`\`bash
git init
git add .
git commit -m "Initial commit: Smart Study Planner"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
\`\`\`
`
  }
];
