import json
import uuid
from http import HTTPStatus
from typing import cast

from celery.result import AsyncResult
from dogpile.cache.api import NO_VALUE
from flask import Blueprint, Response, abort, session
from redis import Redis

from backend.autocomplete_utils import get_channel_id
from backend.cache import generic_cache_region
from backend.config import Config
from backend.extensions import celery_app
from backend.routes.runs import format_sse

event_stream_bp = Blueprint("event_stream", __name__)


def get_session_channel_id_checked() -> str:
    channel_id = session.get("channel_id")

    if not channel_id:
        abort(HTTPStatus.NOT_FOUND, description="No Channel Id could be found")

    return channel_id


def connect_to_pubsub():
    redis = Redis.from_url(Config.REDIS_URI)

    p = redis.pubsub(ignore_subscribe_messages=True)

    channel_id = get_channel_id(get_session_channel_id_checked())

    p.subscribe(channel_id)

    return p


def handle_new_autocomplete_option(message: dict):
    if "data" not in message:
        return

    task_id = cast("bytes", message["data"])
    task_id = task_id.decode("utf-8")

    result = AsyncResult(task_id, app=celery_app).get()

    if result is None:
        return

    cached = generic_cache_region.get(result["cache_key"])

    if cached is NO_VALUE:
        return

    data = {
        "task_id": task_id,
        "autocomplete_options": cached["autocomplete_options"],
        "status": result["state"],
    }

    return format_sse("autocomplete-options", json.dumps(data))


@event_stream_bp.route("/api/stream", methods=["GET"])
def get_stream():
    """
    Connect to a Server Sent Events Stream for real-time server notifications.
    """

    p = connect_to_pubsub()

    def stream():
        event_handlers = {
            "autocomplete-options": handle_new_autocomplete_option,
        }

        for message in p.listen():
            if "channel" not in message:
                continue

            channel_id = cast(bytes, message["channel"]).decode("utf-8")
            topic = channel_id.rsplit(":", 1)[1]

            event_handler = event_handlers[topic]
            yield event_handler(message)

    return Response(stream(), mimetype="text/event-stream")  # type: ignore


@event_stream_bp.before_app_request
def assign_channel_id():

    if "channel_id" not in session:
        session["channel_id"] = str(uuid.uuid4())
