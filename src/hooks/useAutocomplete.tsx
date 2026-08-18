import { createContext, useContext } from "react";
import type { GenomicForm } from "../components/fastaGenerateForm/types";
import type { Trie } from "data-structure-typed";

interface AutocompleteContextType {
    autoCompleteOptions: Trie;
    addAutocompleteRegion: (genomicRegionGeneratorForm: GenomicForm) => void;
    removeAutoCompleteRegion: (genomicRegionGeneratorForm: GenomicForm) => void;
}

export const AutocompleteContext = createContext<AutocompleteContextType>(
    {} as AutocompleteContextType
);

export const useAutoComplete = () => useContext(AutocompleteContext);
