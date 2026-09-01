from typing import Any

from glom import glom


def get_gene_ids(form_data: dict[str, Any]) -> str:
    return glom(form_data, "target_probe.oligo_generation.file_region_ids")


def get_channel_name(user_id: str, *args):
    return ":".join([user_id, *args])
