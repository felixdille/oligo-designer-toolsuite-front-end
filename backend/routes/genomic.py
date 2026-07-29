"""
Genomic endpoints for region generation and processing.

Cascaded endpoints (under `/api/genomic/cascaded/`) are designed to be used as intermediate steps in pipeline workflows:
they generate genomic regions and pass the locations of created files/directories to downstream processes.
Other endpoints are standalone: they run the full pipeline and return the output directly to the user.
"""

from dataclasses import asdict
from http import HTTPStatus

from celery.result import AsyncResult
from flask import Blueprint, abort, jsonify, request
from pydantic import ValidationError

from backend.extensions import celery_app
from backend.genomic_databases import (
    GenomicEntity,
    NCBIGenomicDatabase,
    fetch_dropdown_options,
)
from backend.worker.models import GenomicRegionGeneratorAdapter
from backend.worker.task_index import Tasks

genomic_bp = Blueprint("genomic", __name__)


@genomic_bp.route("/api/genomic/dropdown", methods=["GET"])
def genomic_dropdown_dict():
    dropdown_options: dict[str, dict[str, list[str]]] = fetch_dropdown_options()
    return dropdown_options


@genomic_bp.route("/api/genomic/releases/<taxon>/<species>", methods=["GET"])
def genomic_get_releases(taxon: str, species: str):
    # TODO: validate that taxon and species are in our dropdown options
    dirs = NCBIGenomicDatabase().fetch_annotations_releases(taxon, species)

    if dirs is None:
        abort(
            HTTPStatus.NOT_FOUND,
            description=f'Could not fetch releases for taxon: "{taxon}" and species: "{species}"',
        )

    return jsonify(dirs), 200


@genomic_bp.route("/api/genomic/autocomplete-region", methods=["POST"])
def genomic_build_autocomplete_for_region():
    region_form = request.get_json()

    try:
        GenomicRegionGeneratorAdapter.validate_python(region_form)
    except ValidationError:
        abort(
            HTTPStatus.BAD_REQUEST,
            "Could not validate the Genomic Region Generator Form",
        )

    try:
        genomic_entity = GenomicEntity.from_region_form(region_form)
    except ValueError:
        abort(HTTPStatus.BAD_REQUEST, "Could not parse Genomic Region Generator Form")

    result = celery_app.send_task(
        Tasks.GENERATE_AUTOCOMPLETE_OPTIONS, args=(region_form, asdict(genomic_entity))
    )

    return jsonify(result.id), 200


@genomic_bp.route("/api/genomic/autocomplete-options", methods=["POST"])
def genomic_get_autocomplete_for_region():
    region_form_ids = request.get_json()

    autoCompleteOptions = {}
    for region_form_id in region_form_ids:
        result = AsyncResult(region_form_id, app=celery_app)
        if result.state == "SUCCESS":
            autoCompleteOptions[region_form_id] = result.get()

    return jsonify(autoCompleteOptions), 200
