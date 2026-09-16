"""
This module defines utilities shared between the Flask server and the celery worker,
therefore it intentionally imports only from the standard library so it can be
shared without introducing cross-boundary dependencies.
"""

from datetime import UTC, datetime
from typing import Any

from backend.genomic_databases import (
    NCBIGenomicDatabase,
    fetch_dropdown_options,
    get_genomic_database_by_region_form,
)


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(UTC)


def validate_genomic_region_form(genomic_region_form: dict[str, Any]):
    valid_option_dict = fetch_dropdown_options()

    database = get_genomic_database_by_region_form(genomic_region_form)

    source_params = genomic_region_form.get("source_params")

    if not source_params:
        return ("source_params", source_params)

    traversed_dict = valid_option_dict[database.name]

    if not traversed_dict:
        return ("source", database.name)

    fields = {"ncbi": ["taxon", "species"], "ensembl": ["species", "annotation_release"]}

    field_to_check = fields[database.name][0]

    traversed_list = traversed_dict.get(source_params[field_to_check])

    if traversed_list is None:
        return (field_to_check, source_params[field_to_check])

    field_to_check = fields[database.name][1]

    if source_params[field_to_check] not in traversed_list:
        return (field_to_check, source_params[field_to_check])

    if database.name == "ncbi":
        annotation_releases = NCBIGenomicDatabase().fetch_annotations_releases(
            source_params["taxon"], source_params["species"]
        )

        if annotation_releases is None:
            return ("taxon or species", f"{source_params['taxon']} or {source_params['species']}")

        if source_params["annotation_release"] not in annotation_releases:
            return ("annotation_release", source_params["annotation_release"])


def genomic_region_form_validation_error_message(result: tuple[str, str]):
    return f'Value "{result[1]}" for field {result[0]} is invalid'
