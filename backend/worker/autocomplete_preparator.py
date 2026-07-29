from pathlib import Path

from oligo_designer_toolsuite.utils import GffParser

from backend.cache import generic_cache_region


@generic_cache_region.cache_on_arguments()
def build_autocomplete_options(annotation_file: Path):
    parser = GffParser()

    annotation = parser.parse_annotation_from_gff(str(annotation_file))

    # parse_annotation_from_gff could return a string if file_pickle is set
    genes = list(set(annotation["gene_id"]))  # type: ignore

    return genes
