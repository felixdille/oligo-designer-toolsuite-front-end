import abc
import multiprocessing
import os
import pathlib
import time
from math import ceil
from multiprocessing.pool import ApplyResult
from multiprocessing.shared_memory import SharedMemory
from typing import Literal

import pandas as pd
from gene_extractor import extract_genes_detached
from gtf_polars import parse_gtf
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


class PolarsGtfGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        lf = parse_gtf(annotation_file, attributes_to_extract=["gene_id"])
        gene_ids = lf.select(["gene_id"]).collect()["gene_id"]

        return list(set(gene_ids))

    def get_name(self) -> str:
        return "Gtf Polars Gene Extractor"


class OwnRustGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        return extract_genes_detached(annotation_file)

    def get_name(self) -> str:
        return "Own Rust Parser"


class OwnGeneExtractor(GeneExtractor):
    def __init__(self):
        self.gff_parser = GffParser()
        self.MEM_LIMIT = 1000000000
        self.WORKERS = multiprocessing.cpu_count()

        self.LINE_BUFFER_SIZE = int(self.MEM_LIMIT / self.WORKERS)

    def parse_gtf_lines(self, message_buffer: SharedMemory):
        # print(message_buffer.buf)
        text = self._get_message_from_message_buffer(message_buffer)

        genes = []

        lines = text.splitlines()

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

            message_buffer.close()

        return list(genes)

    def get_last_linebreak(self, text: str) -> tuple[str, str]:
        last_linebreak = text.rfind("\n")
        last_bit = ""

        if last_linebreak < len(text) - 2:
            last_bit = text[last_linebreak + 2 : len(text)]
            text = text[: last_linebreak + 1]

        return text, last_bit

    def _prepare_message_buffers(self, annotation_file: str) -> list[SharedMemory]:
        file_size = os.path.getsize(annotation_file)

        num_buffers = ceil(file_size / self.LINE_BUFFER_SIZE)

        return [SharedMemory(create=True, size=self.LINE_BUFFER_SIZE + 1) for i in range(num_buffers)]

    def _fill_message_buffer(self, message: str, message_buffer: SharedMemory):
        encoded = message.encode()
        message_buffer.buf[: len(encoded)] = encoded
        message_buffer.buf[len(encoded)] = 0

    def _get_message_from_message_buffer(self, message_buffer: SharedMemory):
        raw = bytes(message_buffer.buf)
        return raw.split(b"\0", 1)[0].decode()

    def _get_genes_multi(self, annotation_file: str) -> list[str]:
        with open(annotation_file) as f:
            for line in f:
                if not line.startswith("#"):
                    break

            results: list[ApplyResult] = []

            sh_texts = self._prepare_message_buffers(annotation_file)

            with multiprocessing.Pool(processes=self.WORKERS) as p:
                tasks = []
                last_bit = ""

                index = 0
                while True:
                    text = f.read(self.LINE_BUFFER_SIZE - len(last_bit))
                    text = last_bit + text
                    text, last_bit_found = self.get_last_linebreak(text)
                    last_bit = last_bit_found

                    if not line or len(text) == 0:
                        break

                    self._fill_message_buffer(text, sh_texts[index])

                    tasks.append(p.apply_async(self.parse_gtf_lines, [sh_texts[index]]))

                    index += 1

                results = [task.get() for task in tasks]

        genes = []
        for result in results:
            genes.extend(result)

        for sh_text in sh_texts:
            sh_text.close()
            sh_text.unlink()

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
        "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/1ea60503ae9cef3329d5900ff17d5af7-GCF_046534395.1_ASM4653439v1_genomic.gtf",
        "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/2af7f736f8fc2a32bd1a49cfe35353ef-GCF_009428885.1_ASM942888v1_genomic.gtf",
        "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/81295d4fc9c4f759773d70b1a408a6fd-GCF_000001405.40_GRCh38.p14_genomic.gtf",
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
    path = "/home/felixd/Downloads/GCF_000001405.40_GRCh38.p14_genomic.gtf"

    # print("ODT")
    # extractor = ODTGeneExtractor()
    # extractor.get_genes(path)

    print("mine")
    extractor = PolarsGtfGeneExtractor()
    genes = extractor.get_genes(path)
    print(len(set(genes)))
    print(f"Time: {time.perf_counter() - start}")


if __name__ == "__main__":
    test()
