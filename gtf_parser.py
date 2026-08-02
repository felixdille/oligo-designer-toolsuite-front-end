import abc
import multiprocessing
import pathlib
import time
from multiprocessing import Pool
from multiprocessing.pool import ApplyResult
from typing import Literal

import pandas as pd
from gtfreader import read_gtf
from oligo_designer_toolsuite.utils import GffParser

type GTF_PARSING_METHOD = Literal["ODT", "GTFREADER"]


class GeneExtractor(abc.ABC):
    """Interface for extracting gene names/ids from a gtf file"""

    @abc.abstractmethod
    def get_genes(self, annotation_file: str) -> list[str]:
        pass

    @abc.abstractmethod
    def get_name(self) -> str:
        pass


class OwnGeneExtractor(GeneExtractor):
    def __init__(self):
        self.gff_parser = GffParser()
        self.MEM_LIMIT = 1000000000

        self.LINE_BUFFER_SIZE = int(self.MEM_LIMIT / multiprocessing.cpu_count())

    def parse_gtf_lines(self, lines: list[str]):
        genes = []

        for line in lines:
            split_line = line.split("\t")

            fields = split_line[:8]

            if len(fields) >= 3:
                entry_type = fields[2]
                if entry_type != "gene":
                    continue

            attributes = "\t".join(split_line[8:])

            fields = self.gff_parser._split_fields(attributes)

            for i, field in enumerate(fields):
                key, value = self.gff_parser._parse_field(field, i)
                if key == "gene_id" and value:
                    genes.append(value)
                    break

        return genes

    def _get_genes_multi(self, annotation_file: str) -> list[str]:
        with open(annotation_file) as f:
            for line in f:
                if not line.startswith("#"):
                    break

            results: list[ApplyResult] = []

            with Pool(processes=multiprocessing.cpu_count()) as p:
                tasks = []
                while True:
                    lines = f.readlines(self.LINE_BUFFER_SIZE)
                    if not line or len(lines) == 0:
                        break

                    tasks.append(p.apply_async(self.parse_gtf_lines, [lines]))

                results = [task.get() for task in tasks]

        genes: list[str] = []

        for result in results:
            genes.extend(result)

        return genes

    def _get_genes_single(self, annotation_file: str) -> list[str]:
        genes = []
        with open(annotation_file) as f:
            for line in f:
                if not line.startswith("#"):
                    break

            while True:
                lines = f.readlines(self.LINE_BUFFER_SIZE)
                if not line or len(lines) == 0:
                    break

                genes_part = self.parse_gtf_lines(lines)
                genes.extend(genes_part)

        return genes

    def get_genes(self, annotation_file: str) -> list[str]:
        return self._get_genes_multi(annotation_file)

    def get_name(self) -> str:
        return "Own Parser"


class ODTGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        parser = GffParser()

        annotation = parser.parse_annotation_from_gff(annotation_file)

        # parse_annotation_from_gff could return a string if file_pickle is set
        genes = list(set(annotation["gene_id"]))  # type: ignore

        return genes

    def get_name(self):
        return "Oligo Designer Toolsuite GffParser"


class GtfReaderGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        annotation = read_gtf(annotation_file)

        genes = list(set(annotation["gene_id"]))

        return genes

    def get_name(self):
        return "gtfreader library Gtf Parser"


class GTFParser:
    def __init__(self, parsing_method: GTF_PARSING_METHOD):
        self._parsing_method_to_parser: dict[GTF_PARSING_METHOD, GeneExtractor] = {
            "ODT": ODTGeneExtractor(),
            "GTFREADER": GtfReaderGeneExtractor(),
        }

        self.gtf_parser = self._parsing_method_to_parser[parsing_method]

    def get_genes(file_path: pathlib.Path | str):
        file_path = str(file_path)


def run_gene_extractor(gene_extractor: GeneExtractor, annotation_file_path: str):
    time_start = time.perf_counter()

    gene_extractor.get_genes(annotation_file_path)

    return time.perf_counter() - time_start


def benchmark():
    RUNS = 5

    annotation_file_paths: list[str] = [
        # "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/1ea60503ae9cef3329d5900ff17d5af7-GCF_046534395.1_ASM4653439v1_genomic.gtf",
        # "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/2af7f736f8fc2a32bd1a49cfe35353ef-GCF_009428885.1_ASM942888v1_genomic.gtf",
        "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/81295d4fc9c4f759773d70b1a408a6fd-GCF_000001405.40_GRCh38.p14_genomic.gtf"
    ]

    gene_extractors: list[GeneExtractor] = [
        ODTGeneExtractor(),
        GtfReaderGeneExtractor(),
    ]

    results = {}

    for annotation_file_path in annotation_file_paths:
        results[annotation_file_path] = {}

        for gene_extractor in gene_extractors:
            gene_extractor_name = gene_extractor.get_name()
            results[annotation_file_path][gene_extractor_name] = []

            for i in range(RUNS):
                results[annotation_file_path][gene_extractor_name].append(
                    run_gene_extractor(gene_extractor, annotation_file_path)
                )

    for file_path in annotation_file_paths:
        print(pd.DataFrame.from_dict(results[file_path]))


def test():
    start = time.perf_counter()
    path = "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/81295d4fc9c4f759773d70b1a408a6fd-GCF_000001405.40_GRCh38.p14_genomic.gtf"

    # print("ODT")
    # extractor = ODTGeneExtractor()
    # extractor.get_genes(path)

    print("mine")
    extractor = OwnGeneExtractor()
    genes = extractor.get_genes(path)
    print(len(set(genes)))
    print(f"Time: {time.perf_counter() - start}")


if __name__ == "__main__":
    test()
