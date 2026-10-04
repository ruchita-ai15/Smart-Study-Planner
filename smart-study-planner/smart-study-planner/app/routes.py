"""
Flask Routes for Smart Study Planner.
Handles dashboard metrics, subject CRUD, topic CRUD, study plan generation,
and task completion toggles.
"""
from datetime import datetime, date, timedelta
from collections import defaultdict
from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
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

    # Default to 30 days from today for convenience
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

    # Also mark associated study plan tasks completed if topic is marked completed
    if topic.completed:
        for plan in topic.study_plans:
            plan.completed = True

    db.session.commit()

    status_str = "completed" if topic.completed else "pending"
    flash(f"Marked '{topic.name}' as {status_str}.", 'success')

    # Return to referrer or topics list
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

    # Convert to sorted list of (date, items, total_hours)
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

    # If all study plan sessions for this topic are completed, mark topic completed as well
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

        # Validate daily study hours
        try:
            daily_hours = float(hours_str)
            if daily_hours <= 0:
                raise ValueError
        except ValueError:
            flash('Available study hours must be a number greater than 0.', 'danger')
            return render_template('generate_plan.html', default_date=date.today().strftime('%Y-%m-%d'))

        # Validate start date
        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            except ValueError:
                flash('Invalid date format.', 'danger')
                return render_template('generate_plan.html', default_date=date.today().strftime('%Y-%m-%d'))
        else:
            start_date = date.today()

        # Execute rule-based algorithm
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

    # Check if sample data already exists to avoid redundant duplication
    existing_count = Subject.query.count()
    if existing_count > 0:
        flash('Data already exists in the database. You can manage existing subjects or clear them first.', 'info')
        return redirect(url_for('main.dashboard'))

    # Subject 1: Data Structures
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

    # Subject 2: Database Management
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

    # Subject 3: Computer Networks
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

    # Automatically generate an initial study plan for the sample topics
    generate_study_plan(daily_hours=3.0, start_date=today)

    flash('Sample subjects, topics, and initial study plan loaded successfully!', 'success')
    return redirect(url_for('main.dashboard'))


# ==========================================
# ERROR HANDLERS
# ==========================================
@main_bp.app_errorhandler(404)
def not_found_error(error):
    return render_template('base.html', error_code=404, error_message="Page Not Found - The requested page does not exist."), 404


@main_bp.app_errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('base.html', error_code=500, error_message="Internal Server Error - Something went wrong on our end."), 500
