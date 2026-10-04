"""
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
