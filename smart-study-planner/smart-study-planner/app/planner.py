"""
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
    # Note: Completed study plan records can be preserved for historical tracking
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
            # Check if there is already an entry for this topic on this date
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
