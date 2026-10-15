"""Flask application factory.  Run locally with:  python app.py"""
import os

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from config import Config
from extensions import db


def create_app(config_class=Config):
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_class)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    db.init_app(app)

    from routes.auth_routes import bp as auth_bp
    from routes.professor import bp as professor_bp
    from routes.student import bp as student_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(student_bp)
    app.register_blueprint(professor_bp)

    with app.app_context():
        db.create_all()
        if app.config["SEED_DEMO_DATA"]:
            from seed import seed
            seed(samples=app.config.get("SEED_SAMPLE_LEARNERS", True))

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.errorhandler(HTTPException)
    def http_error(e):
        if e.code == 404 and not _is_api():
            return _spa()
        return jsonify(error=e.description), e.code

    @app.errorhandler(Exception)
    def server_error(e):
        app.logger.exception(e)
        db.session.rollback()
        return jsonify(error="Something went wrong on the server."), 500

    # Serve the built React app (frontend/dist) so one process can host everything
    def _is_api():
        from flask import request
        return request.path.startswith("/api/")

    def _spa(path="index.html"):
        dist = os.path.abspath(app.config["FRONTEND_DIST"])
        if os.path.isfile(os.path.join(dist, path)):
            return send_from_directory(dist, path)
        if os.path.isfile(os.path.join(dist, "index.html")):
            return send_from_directory(dist, "index.html")
        return jsonify(message="API is running. Start the React app with `npm run dev` in /frontend."), 200

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path.startswith("api/"):
            from flask import abort
            abort(404, description="API endpoint not found.")
        return _spa(path)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
