import { createContext, useContext } from "react";
import type { GenomicForm } from "../components/fastaGenerateForm/types";

interface AutocompleteContextType {
    autoCompleteOptions: string[];
    addAutocompleteRegion: (genomicRegionGeneratorForm: GenomicForm) => void;
    removeAutoCompleteRegion: (genomicRegionGeneratorForm: GenomicForm) => void;
}

export const AutocompleteContext = createContext<AutocompleteContextType>(
    {} as AutocompleteContextType
);

export const useAutoComplete = () => useContext(AutocompleteContext);
