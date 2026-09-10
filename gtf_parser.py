import os

os.environ["TQDM_DISABLE"] = "1"

import abc
import datetime
import multiprocessing
import time
from math import ceil
from multiprocessing.pool import ApplyResult
from multiprocessing.shared_memory import SharedMemory
from typing import Literal

import eccLib
import gtfparse
import pandas as pd
import plotly.express as px
import plotly.io as pio
import polars_bio
from gene_extractor import extract_genes_detached
from gtf_polars import parse_gtf
from gtfreader import read_gtf
from oligo_designer_toolsuite.utils import GffParser

type GTF_PARSING_METHOD = Literal["ODT", "GTFREADER"]


pio.get_chrome()


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
        return list(
            set(
                parse_gtf(annotation_file, attributes_to_extract=["gene_id"])
                .select(["gene_id"])
                .collect()["gene_id"]
            )
        )

    def get_name(self) -> str:
        return "gtf-polars"


class PolarsBioGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        return list(
            set(
                polars_bio.scan_gtf(annotation_file, attr_fields=["gene_id"])
                .select(["gene_id"])
                .collect()["gene_id"]
            )
        )
        print()

    def get_name(self) -> str:
        return "polars-bio"


class GtfParseGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        return list(set(gtfparse.read_gtf(annotation_file)["gene_id"]))

    def get_name(self) -> str:
        return "gtfparse"


class EccLibGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        with open(annotation_file) as f:
            return list(set(eccLib.parseGTF(f).column("gene_id")))

    def get_name(self) -> str:
        return "eccLib"


class OwnRustGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        return list(set(extract_genes_detached(annotation_file)))

    def get_name(self) -> str:
        return "own rust parser"


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
                    genes.append(value.split('"')[1])
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
            break_line = None
            for line in f:
                if not line.startswith("#"):
                    break_line = line
                    break

            results: list[ApplyResult] = []

            sh_texts = self._prepare_message_buffers(annotation_file)

            with multiprocessing.Pool(processes=self.WORKERS) as p:
                tasks = []
                last_bit = break_line

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
        return list(set(self._get_genes_multi(annotation_file)))

    def get_name(self) -> str:
        return "Own Parser"


class ODTGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        return list(set(GffParser().parse_annotation_from_gff(annotation_file)["gene_id"]))  # type: ignore

    def get_name(self):
        return "ODT GffParser"


class GtfReaderGeneExtractor(GeneExtractor):
    def get_genes(self, annotation_file: str) -> list[str]:
        return list(set(read_gtf(annotation_file)["gene_id"]))

    def get_name(self):
        return "gtfreader"


class ReferenceGeneList:
    def __init__(self, parser, annotation_file):
        self.parser = parser
        self.gene_ids = set(self.parser.get_genes(annotation_file))

    def check(self, gene_ids: list[str]):
        return


class Benchmark:
    def __init__(self, name: str | None = None, runs: int = 1, file_path: str | None = None):
        self.annotation_file_dir = "/home/felix/Dokumente/gtf-benchmark/"

        self.annotation_file_paths: list[str] = self._collect_gtf_files(self.annotation_file_dir)

        self.reference_file_dir = f"{self.annotation_file_dir}reference_genes/"

        self.reference_parser = ODTGeneExtractor()

        self.gene_extractors: list[GeneExtractor] = [
            self.reference_parser,
            GtfReaderGeneExtractor(),
            PolarsGtfGeneExtractor(),
            OwnGeneExtractor(),
            OwnRustGeneExtractor(),
            EccLibGeneExtractor(),
            GtfParseGeneExtractor(),
            PolarsBioGeneExtractor(),
        ]
        self.runs = runs
        self.name = name

        self.file_path = file_path
        self.df = None if self.file_path is None else pd.read_csv(file_path)

    def _collect_gtf_files(self, dir_path: str):
        return [dir_path + file_name for file_name in os.listdir(dir_path) if file_name.endswith(".gtf")]

    def run(self):
        if self.file_path:
            return

        results = []
        for i in range(self.runs):
            for annotation_file_path in self.annotation_file_paths:
                print(f"Running benchmark on file: {annotation_file_path}")
                for gene_extractor in self.gene_extractors:
                    results.append(
                        {
                            **self._run_single(
                                gene_extractor,
                                annotation_file_path,
                            ),
                            "Run": i,
                        }
                    )

        df = pd.DataFrame.from_records(results)
        self.df = df

    def _run_single(self, parser: GeneExtractor, annotation_file: str):

        time_start = time.perf_counter_ns()

        _genes = parser.get_genes(annotation_file)

        time_end = time.perf_counter_ns()

        duration = time_end - time_start

        duration_s = duration / 10**3

        print(f"Ran Benchmark for: {parser.get_name()}")

        annotation_file_name = annotation_file.rsplit("/", 1)[-1]

        with open(f"{self.reference_file_dir}{annotation_file_name}.genes.txt") as f:
            reference_gene_ids = f.read().splitlines()

        if set(_genes) != set(reference_gene_ids):
            print(f"Differences: {set(_genes) ^ set(reference_gene_ids)}")

        return {
            "Duration": duration_s,
            "Annotation File": annotation_file.rsplit("/", 1)[-1],
            "Parser": parser.get_name(),
        }

    def _sort(self):
        self.df = self.df.sort_values("mean_duration")

    def visualize_benchmark(self, show=True):
        self._sort()
        fig = px.histogram(
            self.df,
            x="Annotation File",
            y="mean_duration",
            color="Parser",
            barmode="group",
            height=400,
        )

        if show:
            fig.show()
        else:
            return fig

    def aggregate_runs(self):
        self.df = self.df.groupby(["Parser", "Annotation File"], as_index=False).aggregate(
            mean_duration=("Duration", "mean"),
            std_deviation_duration=("Duration", "std"),
        )

    def _get_save_file_name(self):
        return f"{self.name if self.name else datetime.now(datetime.UTC)}"

    def save_visualization(self):
        fig = self.visualize_benchmark(False)
        fig.write_image(f"{self._get_save_file_name()}.pdf")

    def save(self):
        with open(f"{self.name if self.name else datetime.now(datetime.UTC)}.csv", "w+") as f:
            self.df.to_csv(f)


def main_benchmark():
    benchmark = Benchmark("full-run")
    benchmark.run()
    benchmark.aggregate_runs()
    benchmark.save()
    benchmark.visualize_benchmark()


def build_gene_list():
    files = Benchmark("")._collect_gtf_files("/home/felix/Dokumente/gtf-benchmark/")

    for file in files:
        genes = list(set(GffParser().parse_annotation_from_gff(file)["gene_id"]))
        with open(f"{file}.genes.txt", "w+") as f:
            f.write("\n".join(genes))


def test():
    annotation_file = "/home/felix/Dokumente/gtf-benchmark/GCF_003935025.1_Abrus_2018_genomic.gtf"

    genes = OwnGeneExtractor().get_genes(annotation_file)

    print(len(genes))

    genes_reference = ODTGeneExtractor().get_genes(annotation_file)

    print(len(genes_reference))

    differences = set(genes) ^ set(genes_reference)

    print(differences)

    with open("genes.txt", "w+") as f:
        f.write("\n".join(genes))

    with open("genes_reference.txt", "w+") as f:
        f.write("\n".join(genes_reference))


if __name__ == "__main__":
    main_benchmark()
