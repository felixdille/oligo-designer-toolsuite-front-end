from pathlib import Path

from gtf_polars import parse_gtf

from backend.cache import generic_cache_region


def get_genes(annotation_file: str) -> list[str]:
    lf = parse_gtf(annotation_file, attributes_to_extract=["gene_id"])
    gene_ids = lf.select(["gene_id"]).collect()["gene_id"]

    return list(set(gene_ids))


@generic_cache_region.cache_on_arguments()
def build_autocomplete_options(annotation_file: Path) -> list[str]:
    """Builds and returns a list of genes, that are suggested by our autocompletion frontend

    Args:
        annotation_file (Path): The path to the annotation file including the genes

    Returns:
        list[str]: A list of genes
    """
    return get_genes(str(annotation_file))
