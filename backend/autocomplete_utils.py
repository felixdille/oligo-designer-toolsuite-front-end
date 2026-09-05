from typing import Any

from glom import glom

from backend.genomic_databases import EnsemblGenomicDatabase, GenomicEntity, NCBIGenomicDatabase


def get_gene_ids(form_data: dict[str, Any]) -> str:
    return glom(form_data, "target_probe.oligo_generation.file_region_ids")


def get_autocomplete_cache_key(
    genomic_entity: GenomicEntity,
    genomic_database: EnsemblGenomicDatabase | NCBIGenomicDatabase,
):
    cache_key = (
        f"{genomic_entity.taxon}{genomic_entity.species}{genomic_entity.release}{genomic_database.name}"
    )

    return cache_key


def get_channel_name(user_id: str, *args):
    return ":".join([user_id, *args])


def get_channel_id(session_id: str):
    return get_channel_name(session_id, "autocomplete-options")
