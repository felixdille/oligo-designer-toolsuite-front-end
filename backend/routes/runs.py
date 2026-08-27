"""
Pipeline Management Endpoints

This module handles all pipeline run CRUD operations, including initialization, deletion,
listing runs and files, and secure download of output files. Endpoints enforce user or session-level
authorization to protect user data.

Features:
    - Run initialization (database entry)
    - Run deletion with file system cleanup
    - Listing of all runs for authenticated or session users
    - Listing of output files for a given run
    - Secure file download with mimetype detection and subdirectory support

:requires: Flask, Flask-Login, MongoDB (via extensions.mongo), OS, datetime, traceback
"""

import json
from http import HTTPStatus
from typing import Any, cast

from bson import ObjectId
from celery.result import AsyncResult
from flask import Blueprint, Response, abort, current_app, jsonify, send_file, session
from flask_login import current_user
from redis import Redis

from backend.config import Config
from backend.extensions import celery_app, db
from backend.routes.route_helpers import (
    get_channel_id,
    get_run_or_404,
    get_user_context,
)
from backend.types import RunStatus
from backend.utilities.pipeline import delete_pipeline_run_files_and_db
from backend.utilities.typed_values import (
    deserialize_path,
    safe_join_under,
    timestamp_to_iso,
)
from backend.utils import get_channel_name

runs_bp = Blueprint("runs", __name__)


def format_run_metrics(metrics: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return run metrics formatted for API responses."""
    if not isinstance(metrics, dict):
        return None

    formatted: dict[str, Any] = {}
    for field in ["queue_wait_seconds", "execution_seconds", "total_seconds"]:
        if field in metrics:
            formatted[field] = metrics[field]

    for field in ["started_at", "finished_at"]:
        if metrics.get(field) is not None:
            formatted[field] = timestamp_to_iso(metrics[field])

    return formatted or None


def format_run(run: dict[Any, Any]) -> dict[str, Any]:
    """Return run payload formatted for API responses."""
    formatted = {
        "_id": str(run["_id"]),
        "pipeline": run.get("pipeline", "unknown"),
        "run_name": run.get("run_name"),
        "status": run.get("status", "unknown"),
        "timestamp": timestamp_to_iso(run.get("timestamp")),
        "user_id": run.get("user_id", "unknown"),
        "priority": run.get("priority", "unknown"),
        "queue_position": run.get("queue_position", "unknown"),
    }

    if metrics := format_run_metrics(run.get("metrics")):
        formatted["metrics"] = metrics

    if run.get("status") in [
        RunStatus.FAILURE,
        RunStatus.TIMEOUT,
        RunStatus.EMPTY_RESULT,
        RunStatus.VALIDATION_FAILED,
    ] and run.get("error_message"):
        formatted["error_message"] = run.get("error_message")
    return formatted


@runs_bp.route("/api/runs/<ObjectId:run_id>", methods=["DELETE"])
def delete_run(run_id: ObjectId):
    """
    Delete a pipeline run and its associated output files.

    Only allows deletion if the run belongs to the current authenticated user.
    Removes output files/folders from disk and deletes the corresponding database entry.

    :param run_id: The ObjectId of the run to delete.
    :type run_id: ObjectId
    :returns: JSON message with success or error.
    :rtype: flask.Response

    Workflow:
        1. Verify ownership (user_id or session_id).
        2. Use shared helper to delete files and database entry.
    """
    # Check ownership first (users can only delete their own runs)
    get_run_or_404(run_id, require_ownership=True)

    # Delete files and DB entry (aborts with 404/500 on failure)
    delete_pipeline_run_files_and_db(db, run_id)

    return jsonify({"message": "Run deleted successfully"}), HTTPStatus.OK


@runs_bp.route("/api/runs", methods=["GET"])
def get_pipeline_runs():
    """
    List all pipeline runs for the current user or anonymous session.

    Authenticated users see their runs; anonymous users see runs for their session_id.

    :returns: List of run documents, formatted for the frontend.
    :rtype: flask.Response

    Workflow:
        1. Check if user is authenticated.
        2. Query DB for runs by user_id or session_id.
        3. Format and return run info for each run.
    """
    if current_user.is_authenticated:
        runs = list(db.runs.find({"user_id": str(current_user.id)}))
    else:
        session_id = session.get("session_id")
        runs = list(db.runs.find({"session_id": session_id})) if session_id else []

    formatted_runs = list(map(format_run, runs))
    return jsonify(formatted_runs), HTTPStatus.OK


@runs_bp.route("/api/runs/<ObjectId:run_id>", methods=["GET"])
def get_pipeline_run(run_id: ObjectId):
    """
    Retrieve details of a specific pipeline run.

    Checks user/session authorization for the run.

    :param run_id: The ObjectId of the run.
    :type run_id: ObjectId
    :returns: Run document or JSON error.
    :rtype: flask.Response

    Workflow:
        1. Fetch run for user/session.
        2. Return run details or error if not found.
    """
    # Auth or session check
    run = get_run_or_404(run_id, require_ownership=True)
    formatted_run = format_run(run)
    return jsonify(formatted_run), HTTPStatus.OK


@runs_bp.route("/api/runs/<ObjectId:run_id>/invalid-ids", methods=["GET"])
def get_invalid_region_ids_for_run(run_id: ObjectId):
    """Returns the invalid Region Ids for a pipeline run

    Arguments:
        run_id {ObjectId} -- The ObjectId of the run.

    Returns:
        list[str] -- A list of all Region Ids that could not be found in the database
    """
    # Auth or session check
    run = get_run_or_404(run_id, require_ownership=True)

    output_path = deserialize_path(run["output_path"])

    if output_path is None:
        abort(HTTPStatus.NOT_FOUND, description="Output Path could not be found")

    invalid_region_ids_file_path = output_path / "db_probes" / "not_existing_regions_for_db_probes.txt"

    with open(invalid_region_ids_file_path) as invalid_region_ids_file:
        invalid_regions_count = int(invalid_region_ids_file.readline())

        invalid_regions_ids = (
            invalid_region_ids_file.read().splitlines() if invalid_regions_count > 0 else None
        )

    return jsonify(
        invalid_regions_ids if invalid_regions_count > 0 else None,
    ), HTTPStatus.OK


@runs_bp.route("/api/runs/<ObjectId:run_id>/files/<path:filename>", methods=["GET"])
def get_run_file(run_id: ObjectId, filename: str):
    """
    Download a file for a specific pipeline run.

    Checks user/session authorization for the run. Supports nested files (e.g., annotation/ subdirectory).
    Detects mimetype for common bioinformatics file types.

    :param run_id: The ObjectId of the run.
    :type run_id: ObjectId
    :param filename: The (possibly nested) file path relative to the run's output directory.
    :type filename: str
    :returns: File stream or JSON error.
    :rtype: flask.Response

    Workflow:
        1. Fetch run for user/session.
        2. Resolve the requested file path (with subdir support).
        3. Serve file with correct mimetype, or return error.
    """
    ALLOWED_FILE_ENDINGS = (".yml", ".yaml", ".tsv", ".xlsx")

    # Auth or session check
    run = get_run_or_404(run_id, require_ownership=True)

    output_dir = deserialize_path(run.get("output_path"))
    if output_dir is None:
        current_app.logger.error(f"Output directory is missing for run {run_id}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Run output directory is missing")
    # Support subdirs (e.g. "annotation/example.fna"), but block path traversal.
    file_path = safe_join_under(output_dir, filename)
    if file_path is None:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid file path")

    if not file_path.exists():
        abort(HTTPStatus.NOT_FOUND, description="File not found")

    # Return correct mimetype
    if filename.endswith(ALLOWED_FILE_ENDINGS):
        return send_file(str(file_path), as_attachment=True)
    else:
        abort(HTTPStatus.BAD_REQUEST, description="Unsupported file type")


@runs_bp.route("/api/runs/<ObjectId:run_id>/config", methods=["GET"])
def get_run_config(run_id: ObjectId):
    """
    Return the stored UI config for a specific pipeline run.

    The config is a PipelineConfigExport JSON object saved when the run was started.
    Older runs that pre-date this feature will return 404.

    :param run_id: The ObjectId of the run.
    :type run_id: ObjectId
    :returns: PipelineConfigExport JSON or 404.
    :rtype: flask.Response
    """
    run = get_run_or_404(run_id, require_ownership=True)

    pipeline_run_config = run.get("pipeline_run_config")
    if pipeline_run_config is None:
        abort(HTTPStatus.NOT_FOUND, description="No saved config for this run.")

    return jsonify(pipeline_run_config), HTTPStatus.OK


@runs_bp.route("/api/runs/<ObjectId:run_id>/status", methods=["GET"])
def get_run_status(run_id: ObjectId):
    """
    Return status of a specific pipeline run.

    Queries the Celery result backend for the current state of the run.
    Unpacks results and updates the database if the state changed.

    :param run_id: The ObjectId of the run.
    :type run_id: ObjectId
    :returns: Run status or JSON error.
    :rtype: flask.Response
    """
    run = get_run_or_404(run_id)

    return jsonify({"state": run["status"]}), HTTPStatus.OK


def format_sse(event: str, data: str):
    event = f"event: {event}"
    data = f"data: {data}"

    sse_message = f"{event}\n{data}\n\n"

    return sse_message


@runs_bp.route("/api/stream", methods=["GET"])
def get_stream():
    """
    Connect to a Server Sent Events Stream for real-time server notifications.
    """

    channel_id = get_channel_id(*get_user_context())

    channel_name = get_channel_name(channel_id, "autocomplete-options")

    def stream(channel_name: str, logger):
        redis = Redis.from_url(Config.REDIS_URI)

        p = redis.pubsub(ignore_subscribe_messages=True)

        p.subscribe(channel_name)

        for message in p.listen():
            if "data" in message:
                task_id = cast("bytes", message["data"])
                task_id = task_id.decode("utf-8")

                autocomplete_options = AsyncResult(task_id, app=celery_app).get()

                data = {"task_id": task_id, "autocomplete_options": autocomplete_options}

                yield format_sse("autocomplete-options", json.dumps(data))

    return Response(stream(channel_name, current_app.logger), mimetype="text/event-stream")
