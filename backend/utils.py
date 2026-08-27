"""
This module defines utilities shared between the Flask server and the celery worker,
therefore it intentionally imports only from the standard library so it can be
shared without introducing cross-boundary dependencies.
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from glom import glom

from backend.genomic_databases import EnsemblGenomicDatabase, GenomicEntity, NCBIGenomicDatabase


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(UTC)


def retrieve_genomic_data_from_region_form(region_form: dict[str, Any], cache_dir: Path):
    genomic_entity = GenomicEntity.from_region_form(region_form)

    # ---------------------------------------------
    # Determine which upstream (NCBI or Ensembl) we are caching from, then always run in custom mode
    # ---------------------------------------------
    source_val = region_form.get("source", "").lower()
    if source_val == "ensembl":
        # Ensembl second-line cache
        cache_info = EnsemblGenomicDatabase(cache_dir=cache_dir).fetch_genomic_entity(genomic_entity)
        files_source = "Ensembl"
    else:
        # Default to NCBI second-line cache
        cache_info = NCBIGenomicDatabase(cache_dir=cache_dir).fetch_genomic_entity(genomic_entity)
        files_source = "NCBI"

    return cache_info, files_source


def get_gene_ids(form_data: dict[str, Any]) -> str:
    return glom(form_data, "target_probe.oligo_generation.file_region_ids")


def get_channel_name(user_id: str, *args):
    return ":".join([user_id, *args])
