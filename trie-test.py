import json

from oligo_designer_toolsuite.utils import GffParser

type TrieNode = list[bool, dict[str, TrieNode]]


class Trie:
    def __init__(self, values: list[str]):
        self.dict = self._build_trie_dict(values)

    def _create_empty_node(self):
        return [False, {}]

    def _get_children(self, node: TrieNode, char: str):
        return self._get_children_dict(node).get(char)

    def _get_children_dict(self, node: TrieNode):
        return node[1]

    def _is_end(self, node: TrieNode):
        return node[0]

    def _set_is_end(self, node: TrieNode):
        node[0] = True

    def _add_children(self, node: TrieNode, char: str, children: TrieNode):
        self._get_children_dict(node)[char] = children

    def _build_trie_dict(self, values: list[str]):
        trie_dict: TrieNode = self._create_empty_node()

        for value in values:
            current_dict = trie_dict
            for char in value:
                if not self._get_children(current_dict, char):
                    self._add_children(current_dict, char, self._create_empty_node())

                current_dict = self._get_children(current_dict, char)

            self._set_is_end(current_dict)
        return trie_dict

    def get_all_with_prefix(self, prefix: str):
        matched_values = []

        prefix_matching_node = self._find_prefix_matching_node(prefix)

        if prefix_matching_node is None:
            return []

        return self._collect_all_with_prefix(prefix, matched_values, prefix_matching_node, prefix)

    def _find_prefix_matching_node(self, prefix: str):
        current_node: TrieNode = self.dict

        for char in prefix:
            if next_node := self._get_children(current_node, char):
                current_node = next_node
            else:
                return None

        return current_node

    def _collect_all_with_prefix(
        self,
        prefix: str,
        matched: list[str],
        current_node: TrieNode,
        current_string: str,
    ):
        if self._is_end(current_node):
            matched.append(current_string)

        for char in self._get_children_dict(current_node).keys():
            self._collect_all_with_prefix(
                prefix,
                matched,
                self._get_children(current_node, char),
                current_string + char,
            )

        return matched

    def toJSON(self):
        return json.dumps(self.dict)


if __name__ == "__main__":
    GTF_FILE_PATH = "/home/felixd/Schreibtisch/odt-cloud/frontend-ba/backend/cache/ncbi/2af7f736f8fc2a32bd1a49cfe35353ef-GCF_009428885.1_ASM942888v1_genomic.gtf"

    parser = GffParser()
    annotation = parser.parse_annotation_from_gff(GTF_FILE_PATH)

    genes = list(set(annotation["gene_id"]))

    with open("genes_test.txt", "w+") as f:
        f.write(str(genes))

    alphabet = set()
    for gene in genes:
        for char in gene:
            if char not in alphabet:
                alphabet.add(char)
    alphabet = list(alphabet)

    trie = Trie(genes)

    # print(trie.dict)

    matches = trie.get_all_with_prefix("GFB69_RS14")

    print(matches)
    # print(trie.toJSON())
